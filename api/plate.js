export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Plaque manquante' });

  const pRaw = q.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  let pSIV = pRaw;
  if (pRaw.length === 7) pSIV = pRaw.slice(0, 2) + '-' + pRaw.slice(2, 5) + '-' + pRaw.slice(5);

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  function extractTechData(slug) {
    const data = {};
    const kwMatch = slug.match(/_(\d+)(kw|cv)(_|$)/i);
    if (kwMatch) data.kw = kwMatch[1];
    const engineMatch = slug.match(/_([a-z][0-9][a-z]{1,2})(_[A-Za-z0-9]{6,}|$)/i);
    if (engineMatch) data.engine_code = engineMatch[1].toUpperCase();
    return data;
  }

  function slugToModel(slug) {
    return slug
      .replace(/_[A-Za-z0-9]{6,}$/, '') // Remove hash
      .replace(/_/g, ' ')
      .replace(/\b([1-9])\s+([0-9])\b/g, '$1.$2')
      .replace(/\b(sb|sr|ql|qle|ub|pa|pa5|b9|zb|gd|nd|lb|fw|f5|f3|f1|g20|g30|f40)\b/gi, '')
      .replace(/\b(i{1,3}|iv|v|vi|vii|viii)\b/gi, m => m.toUpperCase())
      .replace(/\b(crdi|tdi|tfsi|tsi|fsi|gdi|jtd|dci|hdi|cdti|tce|vti|thp|crd|ivive|phev)\b/gi, m => m.toUpperCase())
      .replace(/\b(\d+)kw\b/gi, '$1kW')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace(/\s+/g, ' ')
      .trim();
  }

  const diag = {};
  const providerStatuses = [];

  // Sources Earlweb (Les plus fiables pour le FR)
  const earlwebDomains = [
    'moove-france.ewp.earlweb.net',
    'motul-france.ewp.earlweb.net',
    'wolfoil-france.ewp.earlweb.net'
  ];

  const platesToTry = [pSIV, pRaw];

  for (const domain of earlwebDomains) {
    for (const plate of platesToTry) {
      try {
        const url = `https://${domain}/fr/vrm_search?vrm_type=fre:vrm:chatham&q=${plate}`;
        const response = await fetch(url, {
          redirect: 'manual',
          headers: {
            'User-Agent': ua,
            'Referer': `https://${domain.split('.')[0]}.fr/`,
            'Accept': 'text/html,application/xhtml+xml',
          }
        });

        diag[`${domain}_${plate}_status`] = response.status;
        
        if (response.status >= 300 && response.status < 400) {
          const loc = response.headers.get('location') || response.headers.get('Location');
          if (loc && loc.includes('/equipment/')) {
            const slugMatch = loc.match(/\/equipment\/([^?#/]+)/);
            if (slugMatch && slugMatch[1]) {
              const slug = slugMatch[1];
              const tech = extractTechData(slug);
              const model = slugToModel(slug);
              return res.status(200).json({ model, tech, source: domain });
            }
          }
        }

        if (response.status === 200) {
          const html = await response.text();
          // OG Title fallback
          const ogMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
          if (ogMatch && ogMatch[1] && !ogMatch[1].toLowerCase().includes('site')) {
             let model = ogMatch[1].split('-')[0].trim();
             if (model.length > 5) return res.status(200).json({ model, source: domain + '-og' });
          }
          // Equip Match fallback
          const equipMatch = html.match(/href="([^"]*\/equipment\/[^"?#]+)/);
          if (equipMatch && equipMatch[1]) {
             const m = equipMatch[1].match(/\/equipment\/([^?#/]+)/);
             if (m && m[1]) return res.status(200).json({ model: slugToModel(m[1]), tech: extractTechData(m[1]), source: domain + '-html' });
          }
        }
      } catch (e) {
        diag[`${domain}_err`] = e.message;
      }
    }
  }

  // Final Recourse: IA Extraction (llama-3.3-70b-versatile)
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (GROQ_API_KEY) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0,
          messages: [
            { role: 'system', content: 'Tu es un expert SIV français. Pour une plaque donnée, IDENTIFIE le véhicule (Marque Modèle Année Motorisation). SI ET SEULEMENT SI tu as une certitude raisonnable. Sinon réponds "ERREUR". Réponds UNIQUEMENT le texte du véhicule.' },
            { role: 'user', content: `Plaque : ${pRaw}` }
          ]
        })
      });
      if (groqRes.ok) {
        const data = await groqRes.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content && content !== 'ERREUR' && content.length > 5) {
          return res.status(200).json({ model: content, source: 'ai-fallback' });
        }
      }
    } catch (e) { diag.ai_err = e.message; }
  }

  return res.status(404).json({ error: 'identification_failed', diagnostics: diag });
}
