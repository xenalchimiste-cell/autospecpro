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
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'Aucune image fournie.' });
    
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.2-90b-vision-preview',
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyse cette image et renvoie uniquement la marque, le modèle et l\'année estimée (si possible) du véhicule visible. Ne rajoute aucune autre phrase, ni explication, ni ponctuation inutile. Réponds juste le nom de la voiture de la façon la plus précise (exemple: "Porsche 911 GT3 RS 2023" ou "Peugeot 308 2018"). Si tu ne vois pas clairement de voiture, ou si c\'est une image de mauvaise qualité, réponds "INCONNU".'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64
                }
              }
            ]
          }
        ]
      }),
    });

    const data = await groqRes.json();
    if (!groqRes.ok) {
      throw new Error(data.error?.message || 'Erreur lors de la requête Groq Vision');
    }

    let content = data.choices?.[0]?.message?.content?.trim();
    if (!content || content.toUpperCase().includes('INCONNU')) {
      return res.status(404).json({ error: 'Impossible d\'identifier le véhicule sur cette photo.' });
    }
    
    // Remove quotes if AI puts them
    content = content.replace(/^["'](.*)["']$/, '$1').trim();

    return res.status(200).json({ model: content });
  } catch (error) {
    console.error('Vision API Error:', error);
    return res.status(500).json({ error: 'Erreur lors de l\'analyse de l\'image : ' + error.message });
  }
}
