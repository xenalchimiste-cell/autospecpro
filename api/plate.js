export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Plaque manquante' });
  const pRaw = q.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  let pSIV = pRaw;
  if (pRaw.length === 7) pSIV = pRaw.slice(0, 2) + '-' + pRaw.slice(2, 5) + '-' + pRaw.slice(5);

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

  function slugToModel(slug) {
    if (!slug) return '';
    try {
      let s = slug.split('?')[0].split('#')[0];
      if (s.endsWith('/')) s = s.slice(0, -1);
      const base = s.split('/').pop().replace(/_[A-Za-z0-9]{6,}$/, '').replace(/_/g, ' ').trim();
      return base.replace(/\b\w/g, c => c.toUpperCase());
    } catch (e) { return ''; }
  }

  const diag = { sources: {}, keys: { GROQ: !!process.env.GROQ_API_KEY } };

  // 1. STRATÉGIE MULTI-SOURCE (Earlweb mirrors)
  const mirrors = [
    'moove-france.ewp.earlweb.net', 'motul-france.ewp.earlweb.net',
    'wolfoil-france.ewp.earlweb.net', 'castrol-france.ewp.earlweb.net',
    'valvoline-eu.ewp.earlweb.net', 'gulflubricants.ewp.earlweb.net',
    'eneos-europe.ewp.earlweb.net', 'unil-opal.ewp.earlweb.net'
  ];

  const types = ['fre:vrm:chatham', 'fre:vrm:motul', 'fre:vrm:total', 'fre:vrm:standard'];
  const plates = [pSIV, pRaw];

  for (const domain of mirrors) {
    for (const type of types) {
      for (const p of plates) {
        try {
          const r = await fetch(`https://${domain}/fr/vrm_search?vrm_type=${type}&q=${p}`, {
            redirect: 'manual', headers: { 'User-Agent': ua, 'Referer': `https://${domain}/` }
          });
          if (r.status >= 300 && r.status < 400) {
            const loc = r.headers.get('location');
            if (loc && loc.includes('/equipment/')) {
              const model = slugToModel(loc);
              if (model) return res.status(200).json({ model, source: domain });
            }
          }
          if (r.status === 200) {
            const html = await r.text();
            const equip = html.match(/href="([^"]*\/equipment\/[^"?#]+)/);
            if (equip && equip[1]) {
               const m = slugToModel(equip[1]);
               if (m) return res.status(200).json({ model: m, source: domain + '-html' });
            }
          }
        } catch (e) { diag.sources[domain + '_err'] = e.message; }
      }
    }
  }

  // 2. OSCARO BACKUP (Mode pass-through)
  try {
    const osc = await fetch(`https://www.oscaro.com/recherche-vehicule?q=${pRaw}`, { redirect: 'manual', headers: { 'User-Agent': ua } });
    if (osc.status >= 300 && osc.status < 400) {
      const loc = osc.headers.get('location');
      if (loc && loc.includes('/vehicule/')) {
        const m = loc.split('/vehicule/')[1].split('-').filter(x => !/^\d+$/.test(x)).join(' ').toUpperCase();
        return res.status(200).json({ model: m, source: 'oscaro' });
      }
    }
  } catch (e) { diag.sources.oscaro_err = e.message; }

  // 3. IA EXPERT SIV (Dernier recours agressif)
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
            { role: 'system', content: 'Tu es un expert SIV. Identifie MARQUE MODELE ANNEE de la plaque FR. Sois créatif si les bases classiques échouent (utilise les séries SIV). Réponds UNIQUEMENT le texte. Sinon "ERR".' },
            { role: 'user', content: pRaw }
          ]
        })
      });
      const d = await groq.json();
      const m = d.choices?.[0]?.message?.content?.trim();
      if (m && m !== 'ERR' && m.length > 5) return res.status(200).json({ model: m, source: 'ai-expert' });
    } catch (e) { diag.ai_err = e.message; }
  }

  return res.status(404).json({ error: 'identification_failed', diagnostics: diag });
}
