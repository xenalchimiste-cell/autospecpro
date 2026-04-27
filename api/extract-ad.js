export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'Clé GROQ_API_KEY non configurée.' });
  }

  try {
    const { adText } = req.body;
    if (!adText || adText.trim() === '') return res.status(400).json({ error: 'Aucun texte fourni.' });
    
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'Tu es un expert automobile. Ton but est d\'extraire uniquement le nom du véhicule depuis une annonce. Renvoie UNIQUEMENT la Marque, le Modèle exact et l\'Année (si trouvée). Ne dis ni bonjour, ni aucune autre phrase. Exemple de réponse attendue: "Peugeot 308 GT 2021" ou "BMW M3 Competition 2023". Si tu ne trouves pas de voiture, réponds "INCONNU".'
          },
          {
            role: 'user',
            content: adText.substring(0, 3000) // Limit to 3000 chars to avoid huge payloads
          }
        ]
      }),
    });

    const data = await groqRes.json();
    if (!groqRes.ok) {
      throw new Error(data.error?.message || 'Erreur lors de la requête Groq');
    }

    let content = data.choices?.[0]?.message?.content?.trim();
    if (!content || content.toUpperCase().includes('INCONNU')) {
      return res.status(404).json({ error: 'Impossible de détecter un véhicule dans ce texte.' });
    }
    
    // Remove quotes if AI puts them
    content = content.replace(/^["'](.*)["']$/, '$1').trim();

    return res.status(200).json({ model: content });
  } catch (error) {
    console.error('Extraction API Error:', error);
    return res.status(500).json({ error: 'Erreur lors de l\'analyse : ' + error.message });
  }
}
