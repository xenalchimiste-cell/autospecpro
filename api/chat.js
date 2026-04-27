export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'Clé API non configurée — ajoutez GROQ_API_KEY dans les variables d\'environnement Vercel.' });
    }
  
    let body;
    try {
      body = req.body;
      if (!body || !body.messages) throw new Error('Corps de requête invalide');
    } catch(e) {
      return res.status(400).json({ error: 'Requête malformée : ' + e.message });
    }
  
  async function requestGroq(payload) {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await groqRes.text();
    if (!text || text.trim() === '') {
      return { ok: false, status: 502, data: { error: { message: 'Réponse vide reçue de Groq.' } } };
    }

    try {
      const data = JSON.parse(text);
      return { ok: groqRes.ok, status: groqRes.status, data };
    } catch (_) {
      return {
        ok: false,
        status: 502,
        data: { error: { message: 'Réponse non-JSON de Groq : ' + text.slice(0, 200) } }
      };
    }
  }

  function isFailedGeneration(err) {
    const e = err || {};
    const msg = String(e.message || '').toLowerCase();
    const code = String(e.code || '').toLowerCase();
    return code === 'failed_generation' || msg.includes('failed to generate json') || msg.includes('failed_generation');
  }

  try {
      const basePayload = {
        model: body.model || 'llama-3.3-70b-versatile',
        max_tokens: body.max_tokens || 800,
        messages: body.messages,
        temperature: 0.1,
        top_p: 0.1,
      };

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
            { role: 'system', content: 'Réponds uniquement avec un objet JSON valide. Aucun texte hors JSON.' },
            ...basePayload.messages
          ];
          const finalAttempt = await requestGroq({
            ...basePayload,
            model: 'llama-3.3-70b-versatile',
            messages: fallbackMessages,
          });
          if (finalAttempt.ok) {
            return res.status(200).json(finalAttempt.data);
          }
          return res.status(finalAttempt.status).json({
            error: finalAttempt.data?.error?.message || 'Échec de génération JSON après plusieurs tentatives'
          });
        }

        return res.status(retryAttempt.status).json({ error: retryError.message || 'Erreur Groq inconnue' });
      }

      return res.status(firstAttempt.status).json({ error: firstError.message || 'Erreur Groq inconnue' });
  
    } catch (err) {
      return res.status(500).json({ error: 'Erreur réseau vers Groq : ' + err.message });
    }
  }