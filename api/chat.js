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
  
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: body.model || 'llama-3.1-8b-instant',
          max_tokens: body.max_tokens || 800,
          messages: body.messages,
          response_format: { type: "json_object" },
          temperature: 0.1,
          top_p: 0.2,
        }),
      });
  
      const text = await groqRes.text();
      if (!text || text.trim() === '') {
        return res.status(502).json({ error: 'Réponse vide reçue de Groq.' });
      }
  
      let data;
      try { data = JSON.parse(text); }
      catch(_) { return res.status(502).json({ error: 'Réponse non-JSON de Groq : ' + text.slice(0, 200) }); }
  
      if (!groqRes.ok) {
        return res.status(groqRes.status).json({ error: data.error?.message || 'Erreur Groq inconnue' });
      }
  
      return res.status(200).json(data);
  
    } catch (err) {
      return res.status(500).json({ error: 'Erreur réseau vers Groq : ' + err.message });
    }
  }