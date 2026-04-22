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
      // Nettoyage URL
      let s = slug.split('?')[0].split('#')[0];
      if (s.endsWith('/')) s = s.slice(0, -1);
      const base = s.split('/').pop();
      if (!base) return '';
      
      return base
        .replace(/_[A-Za-z0-9]{6,}$/, '') // Suppression du hash final
        .replace(/_/g, ' ')
        .replace(/\b([1-9])\s+([0-9])\b/g, '$1.$2') // Correction 1 2 -> 1.2
        .replace(/\b(sb|sr|ql|qle|ub|pa|pa5|b9|zb|gd|nd|lb|fw|f5|f3|f1|g20|g30|f40)\b/gi, '')
        .replace(/\b(i{1,3}|iv|v|vi|vii|viii)\b/gi, m => m.toUpperCase())
        .replace(/\b(crdi|tdi|tfsi|tsi|fsi|gdi|jtd|dci|hdi|cdti|tce|vti|thp|crd|ivive|phev|mhev|ev)\b/gi, m => m.toUpperCase())
        .replace(/\b(\d+)kw\b/gi, '$1kW')
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/\s+/g, ' ')
        .trim();
    } catch (e) { return ''; }
  }

  const diag = { sources: {} };

  // 1. STRATÉGIE MULTI-EARLWEB (Moove, Motul, Wolf)
  const earlwebConfigs = [
    { domain: 'moove-france.ewp.earlweb.net', ref: 'https://moovelub.fr/' },
    { domain: 'motul-france.ewp.earlweb.net', ref: 'https://www.motul.com/' },
    { domain: 'wolfoil-france.ewp.earlweb.net', ref: 'https://www.wolfoil.com/' }
  ];

  const platesToTry = [pSIV, pRaw];

  for (const config of earlwebConfigs) {
    for (const plate of platesToTry) {
      try {
        const url = `https://${config.domain}/fr/vrm_search?vrm_type=fre:vrm:chatham&q=${plate}`;
        const response = await fetch(url, {
          redirect: 'manual',
          headers: {
            'User-Agent': ua,
            'Referer': config.ref,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        diag.sources[config.domain] = response.status;
        
        if (response.status >= 300 && response.status < 400) {
          const loc = response.headers.get('location') || response.headers.get('Location');
          if (loc && loc.includes('/equipment/')) {
            const model = slugToModel(loc);
            if (model && model.length > 3) {
              return res.status(200).json({ model, source: config.domain });
            }
          }
        }

        if (response.status === 200) {
          const html = await response.text();
          // Fallback og:title
          const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
          if (og && og[1] && !og[1].toLowerCase().includes('oil') && !og[1].toLowerCase().includes('lub')) {
             const m = og[1].split(' - ')[0].trim();
             if (m.length > 4) return res.status(200).json({ model: m, source: config.domain + '-og' });
          }
          // Fallback equipment link in HTML
          const equip = html.match(/href="([^"]*\/equipment\/[^"?#]+)/);
          if (equip && equip[1]) {
            const m = slugToModel(equip[1]);
            if (m.length > 4) return res.status(200).json({ model: m, source: config.domain + '-html' });
          }
        }
      } catch (e) {
        diag.sources[config.domain + '_err'] = e.message;
      }
    }
  }

  // 2. BACKUP OSCARO
  try {
    const oscaro = await fetch(`https://www.oscaro.com/recherche-vehicule?q=${pRaw}`, {
      redirect: 'manual',
      headers: { 'User-Agent': ua }
    });
    diag.sources.oscaro = oscaro.status;
    if (oscaro.status >= 300 && oscaro.status < 400) {
      const loc = oscaro.headers.get('location');
      if (loc && loc.includes('/vehicule/')) {
        const model = loc.split('/vehicule/')[1].split('-').filter(p => !/^\d{4,}$/.test(p)).join(' ').replace(/\b\w/g, c => c.toUpperCase());
        if (model.length > 4) return res.status(200).json({ model, source: 'oscaro' });
      }
    }
  } catch (e) { diag.sources.oscaro_err = e.message; }

  // 3. SOURCE DE SECOURS : RAPIDAPI (Si configuré)
  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  if (RAPIDAPI_KEY) {
    try {
      const rapidRes = await fetch(`https://french-license-plate.p.rapidapi.com/siv/plate/${pRaw}`, {
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'french-license-plate.p.rapidapi.com'
        }
      });
      if (rapidRes.ok) {
        const data = await rapidRes.json();
        const model = [data.marque, data.modele, data.annee].filter(Boolean).join(' ');
        if (model) return res.status(200).json({ model, source: 'rapidapi' });
      }
    } catch (e) { diag.rapid_err = e.message; }
  }

  // 4. ULTIME RECOURS : IA Extraction
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (GROQ_API_KEY) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0,
          messages: [{ role: 'system', content: 'Identifie ce véhicule par sa plaque FR. Réponds UNIQUEMENT "Marque Modèle Année". Sinon réponds "ERR".' }, { role: 'user', content: pRaw }]
        })
      });
      const data = await groqRes.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content && content !== 'ERR') return res.status(200).json({ model: content, source: 'ai' });
    } catch (e) { diag.ai_err = e.message; }
  }

  return res.status(404).json({ error: 'identification_failed', diagnostics: diag });
}
