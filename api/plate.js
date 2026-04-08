export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Plaque manquante' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  const pRaw = q.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  let pSIV = pRaw;
  if (pRaw.length === 7) pSIV = pRaw.slice(0, 2) + '-' + pRaw.slice(2, 5) + '-' + pRaw.slice(5);

  const diag = {};

  // ----- ÉTAPE 1 : GROQ IA (priorité max, jamais bloqué) -----
  if (GROQ_API_KEY) {
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
          max_tokens: 80,
          messages: [
            {
              role: 'system',
              content: `Tu es un expert en immatriculations françaises SIV. 
Pour chaque plaque d'immatriculation française donnée, tu dois identifier le véhicule correspondant.
Les plaques françaises SIV (format AA-123-AA créé depuis 2009) sont attribuées séquentiellement sans lien direct avec la région, mais correspondent à un véhicule précis dans les bases de données.
Réponds UNIQUEMENT avec : "MARQUE MODELE CYLINDREE ANNEE" (exemple: "Kia Rio 1.1 CRDi 2013" ou "Renault Clio 1.5 dCi 2016").
Si tu ne sais vraiment pas, réponds exactement: INCONNU`
            },
            {
              role: 'user',
              content: `Plaque française SIV: ${pSIV}\nQuel est le véhicule?`
            }
          ]
        })
      });

      diag.groq_status = groqRes.status;
      
      if (groqRes.ok) {
        const data = await groqRes.json();
        const model = data.choices?.[0]?.message?.content?.trim();
        diag.groq_answer = model;

        if (model && model !== 'INCONNU' && model.length > 3 && !model.toLowerCase().includes('inconnu')) {
          return res.status(200).json({ model, source: 'groq-ai' });
        }
      } else {
        const errText = await groqRes.text();
        diag.groq_error = errText.slice(0, 200);
      }
    } catch (e) {
      diag.groq_exception = e.message;
    }
  } else {
    diag.groq_key = 'missing';
  }

  // ----- ÉTAPE 2 : MOOVELUB (scraping Earlweb) -----
  try {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36';
    const mooveRes = await fetch(
      `https://moove-france.ewp.earlweb.net/fr/vrm_search?vrm_type=fre:vrm:chatham&q=${pSIV}`,
      { headers: { 'User-Agent': ua, 'Referer': 'https://moovelub.fr/', 'Accept-Language': 'fr-FR,fr;q=0.9' } }
    );
    diag.moove_status = mooveRes.status;
    if (mooveRes.ok) {
      const html = await mooveRes.text();
      const m = html.match(/<title>([^<]+)<\/title>/i);
      const title = m?.[1] || '';
      diag.moove_title = title.slice(0, 80);
      if (title && !title.toLowerCase().includes('recherche') && !title.toLowerCase().includes('moove france') && title.length > 5) {
        const model = title.replace(/ - Moove|Moove/gi, '').trim();
        return res.status(200).json({ model, source: 'moovelub' });
      }
    }
  } catch (e) {
    diag.moove_exception = e.message;
  }

  // Aucune source n'a trouvé → retour détaillé pour diagnostic
  return res.status(404).json({ error: 'identification_failed', diagnostics: diag });
}
