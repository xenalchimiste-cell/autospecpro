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

  async function tryRapidApiSiv(plateParam) {
    const rapidKey = (process.env.RAPIDAPI_KEY || '').trim();
    if (!rapidKey) return null;
    const host = process.env.RAPIDAPI_PLATE_HOST || 'api-siv-systeme-d-immatriculation-des-vehicules.p.rapidapi.com';
    const hostClean = host.replace(/^https?:\/\//, '');
    const path = process.env.RAPIDAPI_PLATE_PATH || '/';
    const base = `https://${hostClean}${path.startsWith('/') ? path : '/' + path}`;
    const url = `${base}?${new URLSearchParams({ plaque: plateParam }).toString()}`;
    
    try {
      const r = await fetch(url, {
        headers: {
          'X-RapidAPI-Key': rapidKey,
          'X-RapidAPI-Host': hostClean,
          Accept: 'application/json',
        },
      });
      if (!r.ok) return null;
      const data = await r.json();
      if (!data) return null;
      
      const marque = data.marque || data.AWN_marque || '';
      const modele = data.modele || data.AWN_modele || '';
      if (marque && modele) {
        return { model: `${marque} ${modele}`.trim(), source: 'rapidapi' };
      }
      return null;
    } catch (e) {
      diag.rapidapi_exception = e.message;
      return null;
    }
  }

  // ----- PRIORITÉ : RapidAPI si clé présente -----
  if (process.env.RAPIDAPI_KEY) {
    for (const p of plates) {
      const rapid = await tryRapidApiSiv(p);
      if (rapid) return res.status(200).json(rapid);
    }
  }

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

  return res.status(503).json({ 
    error: 'plate_provider_unavailable', 
    message: 'Le service gratuit d\'identification par plaque (Moove) ne répond plus. Pour restaurer ce service, ajoutez la clé RAPIDAPI_KEY dans vos variables d\'environnement Vercel (API SIV Autoways sur RapidAPI).',
    diagnostics: diag 
  });
}
