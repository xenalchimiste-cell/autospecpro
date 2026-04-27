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

  function slugToModel(slug) {
    if (!slug) return '';
    try {
      let s = slug.split('?')[0].split('#')[0];
      if (s.endsWith('/')) s = s.slice(0, -1);
      const base = s.split('/').pop().replace(/_[A-Za-z0-9]{6,}$/, '').replace(/_/g, ' ').trim();
      return base.replace(/\b\w/g, c => c.toUpperCase());
    } catch (e) { return ''; }
  }

  const diag = { sources: {}, keys: {} };

  // Diagnostic des clés
  diag.keys.GROQ = !!process.env.GROQ_API_KEY;
  diag.keys.RAPID = !!process.env.RAPIDAPI_KEY;

  const earlwebMirrors = [
    'moove-france.ewp.earlweb.net',
    'motul-france.ewp.earlweb.net',
    'wolfoil-france.ewp.earlweb.net',
    'castrol-france.ewp.earlweb.net'
  ];

  const types = ['fre:vrm:chatham', 'fre:vrm:motul', 'fre:vrm:total'];
  const plates = [pSIV, pRaw];

  for (const domain of earlwebMirrors) {
    for (const type of types) {
      for (const p of plates) {
        try {
          const resE = await fetch(`https://${domain}/fr/vrm_search?vrm_type=${type}&q=${p}`, {
            redirect: 'manual',
            headers: { 'User-Agent': ua, 'Referer': `https://${domain}/` }
          });
          diag.sources[`${domain}_${type}`] = resE.status;

          if (resE.status >= 300 && resE.status < 400) {
            const loc = resE.headers.get('location');
            if (loc && loc.includes('/equipment/')) {
              const model = slugToModel(loc);
              if (model) return res.status(200).json({ model, source: domain });
            }
          }

          if (resE.status === 200) {
            const html = await resE.text();
            // Chercher le modèle dans le titre ou les metas
            const og = html.match(/<meta property="og:title" content="([^"]+)"/i);
            if (og && og[1] && !og[1].includes('Site') && og[1].length > 5) {
              return res.status(200).json({ model: og[1].split('-')[0].trim(), source: domain + '-og' });
            }
            const h1 = html.match(/<h1>([^<]+)<\/h1>/i);
            if (h1 && h1[1] && h1[1].length > 5 && !h1[1].includes('Recherche')) {
              return res.status(200).json({ model: h1[1].trim(), source: domain + '-h1' });
            }
          }
        } catch (e) { diag.sources[`${domain}_err`] = e.message; }
      }
    }
  }

  // IA FALLBACK
  const key = process.env.GROQ_API_KEY;
  if (key) {
    try {
      const groq = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0,
          messages: [
            { role: 'system', content: 'Tu es un expert SIV français. Pour une plaque, identifie MARQUE MODELE ANNEE. Sinon "ERR".' },
            { role: 'user', content: pRaw }
          ]
        })
      });
      const data = await groq.json();
      const resIA = data.choices?.[0]?.message?.content?.trim();
      if (resIA && resIA !== 'ERR' && resIA.length > 5) {
        return res.status(200).json({ model: resIA, source: 'ai-fallback' });
      }
    } catch (e) { diag.ai_err = e.message; }
  }

  return res.status(404).json({ error: 'identification_failed', diagnostics: diag });
}
