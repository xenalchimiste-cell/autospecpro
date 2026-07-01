import { sql, initDb } from "./_lib/db.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

export default async function handler(req, res) {
  // CORS Headers
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    return res.status(200).end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  const { action } = req.query;

  // ── Proxy IA (Groq) : fiches techniques, comparateur, Ask Expert ──
  if (action === "ai") return await handleAiProxy(req, res);

  // ── Extraction du modèle voiture depuis le texte d'une annonce ──
  if (action === "extract-ad") return await handleExtractAd(req, res);

  // ── Chat d'entraide communautaire (comportement par défaut) ──
  await initDb();
  if (req.method === "GET") return await handleGetMessages(req, res);
  if (req.method === "POST") return await handlePostMessage(req, res);

  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGetMessages(req, res) {
  try {
    const { rows: messages } = await sql`
      SELECT c.*, u.user_type, u.user_rank, u.avatar_url
      FROM chat_messages c
      LEFT JOIN users u ON c.user_id = u.id
      ORDER BY c.created_at DESC
      LIMIT 50
    `;
    // Return chronologically (oldest first among the last 50)
    return res.status(200).json(messages.reverse());
  } catch (err) {
    console.error("Chat GET error:", err);
    return res.status(500).json({ error: err.message });
  }
}

async function handlePostMessage(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer "))
    return res.status(401).json({ error: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    const { content } = req.body;
    if (!content || !content.trim())
      return res.status(400).json({ error: "Message empty" });

    // Get author name
    const { rows: users } =
      await sql`SELECT first_name, last_name FROM users WHERE id = ${userId}`;
    const authorName = users[0].first_name + " " + (users[0].last_name || "");

    const { rows: newMessage } = await sql`
      INSERT INTO chat_messages (user_id, author_name, content)
      VALUES (${userId}, ${authorName}, ${content.trim()})
      RETURNING *
    `;

    const msg = newMessage[0];

    const { rows: fullMsg } = await sql`
      SELECT c.*, u.user_type, u.user_rank, u.avatar_url
      FROM chat_messages c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = ${msg.id}
    `;

    return res.status(201).json(fullMsg[0]);
  } catch (err) {
    console.error("Chat POST error:", err);
    return res.status(401).json({ error: "Invalid token or server error" });
  }
}

// ── Proxy Groq générique : utilisé par callGroq() (fiches/comparateur) et askExpert() ──
async function handleAiProxy(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Méthode non autorisée" });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return res
      .status(500)
      .json({
        error:
          "Clé API non configurée — ajoutez GROQ_API_KEY dans les variables d'environnement Vercel.",
      });
  }

  let body;
  try {
    body = req.body;
    if (!body || !body.messages) throw new Error("Corps de requête invalide");
  } catch (e) {
    return res.status(400).json({ error: "Requête malformée : " + e.message });
  }

  async function requestGroq(payload) {
    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify(payload),
      },
    );

    const text = await groqRes.text();
    if (!text || text.trim() === "") {
      return {
        ok: false,
        status: 502,
        data: { error: { message: "Réponse vide reçue de Groq." } },
      };
    }

    try {
      const data = JSON.parse(text);
      return { ok: groqRes.ok, status: groqRes.status, data };
    } catch (_) {
      return {
        ok: false,
        status: 502,
        data: {
          error: {
            message: "Réponse non-JSON de Groq : " + text.slice(0, 200),
          },
        },
      };
    }
  }

  function isFailedGeneration(err) {
    const e = err || {};
    const msg = String(e.message || "").toLowerCase();
    const code = String(e.code || "").toLowerCase();
    return (
      code === "failed_generation" ||
      msg.includes("failed to generate json") ||
      msg.includes("failed_generation")
    );
  }

  try {
    const useJson = body.json !== false;

    const basePayload = {
      model: body.model || "llama-3.3-70b-versatile",
      max_tokens: body.max_tokens || 1000,
      messages: body.messages,
      temperature: 0.2,
      top_p: 0.1,
    };

    if (!useJson) {
      const attempt = await requestGroq(basePayload);
      return res.status(attempt.status).json(attempt.data);
    }

    const firstAttempt = await requestGroq({
      ...basePayload,
      response_format: { type: "json_object" },
    });

    if (firstAttempt.ok) {
      return res.status(200).json(firstAttempt.data);
    }

    const firstError = firstAttempt.data?.error || {};
    const shouldRetryWithoutJsonFormat = isFailedGeneration(firstError);

    if (shouldRetryWithoutJsonFormat) {
      // Fallback: certains prompts/modèles échouent avec response_format strict.
      const retryAttempt = await requestGroq(basePayload);
      if (retryAttempt.ok) {
        return res.status(200).json(retryAttempt.data);
      }

      const retryError = retryAttempt.data?.error || {};
      if (isFailedGeneration(retryError)) {
        // Dernier fallback: modèle plus stable + rappel explicite JSON.
        const fallbackMessages = [
          {
            role: "system",
            content:
              "Réponds uniquement avec un objet JSON valide. Aucun texte hors JSON.",
          },
          ...basePayload.messages,
        ];
        const finalAttempt = await requestGroq({
          ...basePayload,
          model: "llama-3.3-70b-versatile",
          messages: fallbackMessages,
        });
        if (finalAttempt.ok) {
          return res.status(200).json(finalAttempt.data);
        }
        return res.status(finalAttempt.status).json({
          error:
            finalAttempt.data?.error?.message ||
            "Échec de génération JSON après plusieurs tentatives",
        });
      }

      return res
        .status(retryAttempt.status)
        .json({ error: retryError.message || "Erreur Groq inconnue" });
    }

    return res
      .status(firstAttempt.status)
      .json({ error: firstError.message || "Erreur Groq inconnue" });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Erreur réseau vers Groq : " + err.message });
  }
}

// ── Extraction du modèle d'un véhicule depuis le texte d'une annonce ──
async function handleExtractAd(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Méthode non autorisée" });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return res
      .status(500)
      .json({
        error:
          "Clé API non configurée — ajoutez GROQ_API_KEY dans les variables d'environnement Vercel.",
      });
  }

  try {
    const { adText } = req.body;
    if (!adText || adText.trim() === "")
      return res.status(400).json({ error: "Aucun texte fourni." });

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                'Tu es un expert automobile. Ton but est d\'extraire uniquement le nom du véhicule depuis une annonce. Renvoie UNIQUEMENT la Marque, le Modèle exact et l\'Année (si trouvée). Ne dis ni bonjour, ni aucune autre phrase. Exemple de réponse attendue: "Peugeot 308 GT 2021" ou "BMW M3 Competition 2023". Si tu ne trouves pas de voiture, réponds "INCONNU".',
            },
            {
              role: "user",
              content: adText.substring(0, 3000), // Limit to 3000 chars to avoid huge payloads
            },
          ],
        }),
      },
    );

    const data = await groqRes.json();
    if (!groqRes.ok) {
      throw new Error(data.error?.message || "Erreur lors de la requête Groq");
    }

    let content = data.choices?.[0]?.message?.content?.trim();
    if (!content || content.toUpperCase().includes("INCONNU")) {
      return res
        .status(404)
        .json({ error: "Impossible de détecter un véhicule dans ce texte." });
    }

    // Remove quotes if AI puts them
    content = content.replace(/^["'](.*)["']$/, "$1").trim();

    return res.status(200).json({ model: content });
  } catch (error) {
    console.error("Extraction API Error:", error);
    return res
      .status(500)
      .json({ error: "Erreur lors de l'analyse : " + error.message });
  }
}
