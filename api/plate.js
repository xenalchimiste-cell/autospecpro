export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Plaque manquante' });

  const pRaw = q.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  let pSIV = pRaw;
  if (pRaw.length === 7) pSIV = pRaw.slice(0, 2) + '-' + pRaw.slice(2, 5) + '-' + pRaw.slice(5);

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

  function slugToModel(slug) {
    if (!slug) return '';
    try {
      let s = slug.split('?')[0].split('#')[0];
      if (s.endsWith('/')) s = s.slice(0, -1);
      const base = s.split('/').pop();
      return base.replace(/_[A-Za-z0-9]{6,}$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    } catch (e) { return ''; }
  }

  const diag = { sources: {} };

  // 1. STRATÉGIE MULTI-EARLWEB (Extrêmement complet)
  const earlwebMirrors = [
    'moove-france.ewp.earlweb.net',
    'motul-france.ewp.earlweb.net',
    'wolfoil-france.ewp.earlweb.net',
    'auto-repair-lubes.ewp.earlweb.net',
    'castrol-france.ewp.earlweb.net',
    'oil-selector.lubricants.totalenergies.com'
  ];

  const platesToTry = [pSIV, pRaw];

  for (const domain of earlwebMirrors) {
    for (const plate of platesToTry) {
      try {
        const response = await fetch(`https://${domain}/fr/vrm_search?vrm_type=fre:vrm:chatham&q=${plate}`, {
          redirect: 'manual',
          headers: { 'User-Agent': ua, 'Referer': `https://${domain}/` }
        });

        diag.sources[domain] = response.status;
        
        if (response.status >= 300 && response.status < 400) {
          const loc = response.headers.get('location');
          if (loc && (loc.includes('/equipment/') || loc.includes('/find/'))) {
            const model = slugToModel(loc);
            if (model && model.length > 3) return res.status(200).json({ model, source: domain });
          }
        }
      } catch (e) { diag.sources[domain + '_err'] = e.message; }
    }
  }

  // 2. BACKUP OSCARO
  try {
    const oscaro = await fetch(`https://www.oscaro.com/recherche-vehicule?q=${pRaw}`, { redirect: 'manual', headers: { 'User-Agent': ua } });
    if (oscaro.status >= 300 && oscaro.status < 400) {
      const loc = oscaro.headers.get('location');
      if (loc && loc.includes('/vehicule/')) {
        const model = loc.split('/vehicule/')[1].split('-').filter(p => !/^\d{4,}$/.test(p)).join(' ').replace(/\b\w/g, c => c.toUpperCase());
        return res.status(200).json({ model, source: 'oscaro' });
      }
    }
  } catch (e) { diag.sources.oscaro_err = e.message; }

  // 3. ULTIME RECOURS : IA Extraction (Plus aggressive)
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (GROQ_API_KEY) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0,
          messages: [{ role: 'system', content: 'Identifie la voiture FR par sa plaque (Ex: Kia Rio 2012). Réponds UNIQUEMENT "Marque Modèle Année". Si inconnu, "ERR".' }, { role: 'user', content: pRaw }]
        })
      });
      const data = await groqRes.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content && content !== 'ERR') return res.status(200).json({ model: content, source: 'ai' });
    } catch (e) { diag.ai_err = e.message; }
  }

  return res.status(404).json({ error: 'identification_failed', diagnostics: diag });
}
 });
}
