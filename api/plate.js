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
    return slug
      .split('?')[0]
      .split('#')[0]
      .split('/')
      .pop()
      .replace(/_[A-Za-z0-9]{6,}$/, '')
      .replace(/_/g, ' ')
      .replace(/\b([1-9])\s+([0-9])\b/g, '$1.$2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const diag = {};

  // 1. SOURCE PRINCIPALE : MOOVELUB (Earlweb)
  const moovePlates = [pSIV, pRaw];
  for (const plate of moovePlates) {
    try {
      const mooveUrl = `https://moove-france.ewp.earlweb.net/fr/vrm_search?vrm_type=fre:vrm:chatham&q=${plate}`;
      const response = await fetch(mooveUrl, {
        redirect: 'manual',
        headers: {
          'User-Agent': ua,
          'Referer': 'https://moove-france.ewp.earlweb.net/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9',
        }
      });

      diag[`moove_${plate}`] = response.status;
      if (response.status >= 300 && response.status < 400) {
        const loc = response.headers.get('location');
        if (loc && loc.includes('/equipment/')) {
          const model = slugToModel(loc);
          if (model) return res.status(200).json({ model, source: 'moovelub' });
        }
      }
      
      if (response.status === 200) {
        const html = await response.text();
        const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
        if (og && og[1] && !og[1].includes('Moove')) {
           return res.status(200).json({ model: og[1].split(' - ')[0], source: 'moovelub-og' });
        }
      }
    } catch (e) { diag.moove_err = e.message; }
  }

  // 2. SOURCE SECONDAIRE : OSCARO (Redirection)
  try {
    const oscaroRes = await fetch(`https://www.oscaro.com/recherche-vehicule?q=${pRaw}`, {
      redirect: 'manual',
      headers: { 'User-Agent': ua }
    });
    diag.oscaro_status = oscaroRes.status;
    if (oscaroRes.status >= 300 && oscaroRes.status < 400) {
      const loc = oscaroRes.headers.get('location');
      if (loc && loc.includes('/vehicule/')) {
        // Ex: /vehicule/peugeot-208-ii-1-2-puretech-75cv-3510-10022-0-f
        const parts = loc.split('/vehicule/')[1].split('-');
        // On enlève les IDs à la fin (ex: 3510-10022-0-f)
        const modelParts = [];
        for (const p of parts) {
          if (/^\d{4,}$/.test(p)) break;
          modelParts.push(p);
        }
        const model = modelParts.join(' ').replace(/\b\w/g, c => c.toUpperCase());
        if (model) return res.status(200).json({ model, source: 'oscaro' });
      }
    }
  } catch (e) { diag.oscaro_err = e.message; }

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
