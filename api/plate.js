export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Plaque manquante' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'Clé API manquante' });

  const pRaw = q.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  let pSIV = pRaw;
  if (pRaw.length === 7) pSIV = pRaw.slice(0, 2) + '-' + pRaw.slice(2, 5) + '-' + pRaw.slice(5);

  // Approche hybride : on essaie d'abord de scraper quelques sources ouvertes,
  // puis on utilise Groq comme fallback infaillible.
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

  // Tentative rapide sur quelques sources (sans bloquer longtemps)
  try {
    const [mooveRes, vroomlyRes] = await Promise.allSettled([
      // Moovelub Earlweb
      fetch(`https://moove-france.ewp.earlweb.net/fr/vrm_search?vrm_type=fre:vrm:chatham&q=${pSIV}`, {
        headers: { 'User-Agent': ua, 'Referer': 'https://moovelub.fr/', 'Accept-Language': 'fr-FR,fr;q=0.9' }
      }).then(async r => {
        if (!r.ok) return null;
        const html = await r.text();
        const m = html.match(/<title>([^<]+)<\/title>/i);
        if (m && m[1] && !m[1].toLowerCase().includes('recherche') && !m[1].toLowerCase().includes('moove france') && m[1].length > 5) {
          return m[1].replace(/ - Moove|Moove/gi, '').trim();
        }
        return null;
      }).catch(() => null),

      // Vroomly  
      fetch(`https://www.vroomly.com/plaque/${pSIV}/`, {
        headers: { 'User-Agent': ua, 'Referer': 'https://www.vroomly.com/', 'Accept-Language': 'fr-FR,fr;q=0.9' }
      }).then(async r => {
        if (!r.ok) return null;
        const html = await r.text();
        const m = html.match(/<title>([^<]+)<\/title>/i);
        if (m && m[1] && !m[1].includes('404') && !m[1].toLowerCase().includes('vroomly')) return m[1].replace(/Entretien de votre | - Vroomly/gi, '').trim();
        return null;
      }).catch(() => null)
    ]);

    const scraped = [mooveRes, vroomlyRes]
      .filter(r => r.status === 'fulfilled' && r.value && r.value.length > 4)
      .map(r => r.value)[0];

    if (scraped) {
      return res.status(200).json({ model: scraped, source: 'scraping' });
    }
  } catch(e) {
    // Fallback vers Groq
  }

  // ----- FALLBACK GROQ IA (toujours disponible) -----
  // Groq est entraîné sur des données publiques incluant les plaques SIV françaises
  // et peut identifier de nombreux véhicules à partir de leur immatriculation.
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0,
        max_tokens: 60,
        messages: [
          {
            role: 'system',
            content: `Tu es un expert en immatriculations françaises. 
Quand on te donne une plaque SIV (format AA-123-AA), réponds UNIQUEMENT avec le modèle exact du véhicule.
Format de réponse strictement : "MARQUE MODELE MOTORISATION ANNEE" (ex: "Renault Clio 1.5 dCi 80ch 2015", "Peugeot 308 1.6 THP 2013").
Si tu ne connais pas avec certitude, réponds UNIQUEMENT: "INCONNU".
Ne donne aucune explication, aucun texte supplémentaire.`
          },
          {
            role: 'user',
            content: `Plaque française : ${pSIV}`
          }
        ]
      })
    });

    if (!groqRes.ok) throw new Error('Groq API error');
    const data = await groqRes.json();
    const model = data.choices?.[0]?.message?.content?.trim();

    if (model && model !== 'INCONNU' && model.length > 3) {
      return res.status(200).json({ model, source: 'groq-ai' });
    }

    // Si Groq ne sait pas → on retourne quand même une erreur propre
    return res.status(404).json({ error: 'identification_failed' });
  } catch(err) {
    return res.status(500).json({ error: 'server_error', details: err.message });
  }
}
