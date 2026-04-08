export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Plaque manquante' });

  const pRaw = q.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  let pSIV = pRaw;
  if (pRaw.length === 7) pSIV = pRaw.slice(0, 2) + '-' + pRaw.slice(2, 5) + '-' + pRaw.slice(5);

  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  ];
  const ua = uas[Math.floor(Math.random() * uas.length)];
  
  const commonHeaders = {
    'User-Agent': ua,
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'sec-ch-ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Upgrade-Insecure-Requests': '1'
  };

  const logs = [];
  const fetchSource = async (name, op) => {
    try {
      let r = await op(pSIV);
      if (!r) r = await op(pRaw);
      if (r && r.length > 5 && !r.toLowerCase().includes('erreur') && !r.toLowerCase().includes('404')) {
        return { model: r, source: name };
      }
      throw new Error(`Invalid result from ${name}`);
    } catch (e) {
      logs.push(`${name}: ${e.message}`);
      throw e;
    }
  };

  const sources = [
    // --- SOURCE 1 : VROOMLY (Très permissif) ---
    fetchSource('vroomly', async (p) => {
      const res = await fetch(`https://www.vroomly.com/plaque/${p}/`, { headers: { ...commonHeaders, 'Referer': 'https://www.vroomly.com/' } });
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/<title>([^<]+)<\/title>/i);
      return (m && m[1] && !m[1].includes('404')) ? m[1].replace(/Entretien de votre | - Vroomly|Plaque |Immatriculation /gi, '').trim() : null;
    }),

    // --- SOURCE 2 : MOOVELUB (EARLWEB) ---
    fetchSource('moovelub', async (p) => {
      const res = await fetch(`https://moove-france.ewp.earlweb.net/fr/vrm_search?vrm_type=fre:vrm:chatham&q=${p}`, { 
        headers: { ...commonHeaders, 'Referer': 'https://moovelub.fr/' } 
      });
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/<title>([^<]+)<\/title>/i);
      return (m && m[1] && !m[1].toLowerCase().includes('recherche')) ? m[1].replace(/ - Moove|Moove/gi, '').trim() : null;
    }),

    // --- SOURCE 3 : ALLOPNEUS ---
    fetchSource('allopneus', async (p) => {
      const res = await fetch(`https://www.allopneus.com/recherche-par-plaque/${p}`, { headers: { ...commonHeaders, 'Referer': 'https://www.allopneus.com/' } });
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/<title>([^<]+)<\/title>/i);
      return (m && m[1] && m[1].includes('|')) ? m[1].split('|')[0].replace(/Pneus pour |Dimensions de /gi, '').trim() : null;
    }),

    // --- SOURCE 4 : PIECESAUTO (AJAX) ---
    fetchSource('pieces-auto', async (p) => {
      const res = await fetch(`https://www.piecesauto.fr/ajax/plate-number?plate=${p}`, { 
        headers: { ...commonHeaders, 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://www.piecesauto.fr/' } 
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.car_name ? data.car_name : null;
    }),

    // --- SOURCE 5 : AUTOBACS ---
    fetchSource('autobacs', async (p) => {
      const res = await fetch(`https://www.autobacs.fr/recherche-plaque/${p}`, { headers: { ...commonHeaders, 'Referer': 'https://www.autobacs.fr/' } });
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/<title>([^<]+)<\/title>/i);
      return (m && m[1] && !m[1].includes('Autobacs')) ? m[1].replace(/Pièces auto | - Autobacs|Détails du véhicule/gi, '').trim() : null;
    }),

    // --- SOURCE 6 : CARTER-CASH ---
    fetchSource('carter-cash', async (p) => {
      const res = await fetch(`https://www.carter-cash.com/recherche/plaque/${p}`, { headers: { ...commonHeaders, 'Referer': 'https://www.carter-cash.com/' } });
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/<title>([^<]+)<\/title>/i);
      return (m && m[1] && m[1].toLowerCase().includes('pour')) ? m[1].replace(/Pièces auto pour votre | | Pièces détachées | Carter-Cash/gi, ' ').trim() : null;
    }),

    // --- SOURCE 7 : PIECESAUTO24 ---
    fetchSource('piecesauto24', async (p) => {
      const res = await fetch(`https://www.piecesauto24.com/recherche?plate=${p}`, { headers: { ...commonHeaders, 'Referer': 'https://www.piecesauto24.com/' } });
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/<title>([^<]+)<\/title>/i);
      return (m && m[1] && m[1].toLowerCase().includes('pièces')) ? m[1].replace(/Pièces auto pour | - Piècesauto24.com/gi, '').trim() : null;
    }),

    // --- SOURCE 8 : DDG SEMANTIC (Indétectable) ---
    fetchSource('ddg', async (p) => {
      const query = `"${p}" site:oscaro.com OR site:norauto.fr OR site:mister-auto.com`;
      const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': ua, 'Referer': 'https://duckduckgo.com/' } });
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/class='result-link'[^>]*>([^<]+)/i);
      return m ? m[1].replace(/Oscaro.com|Norauto|Mister Auto|Pièces auto|en ligne/gi, '').trim() : null;
    })
  ];

  try {
    const winner = await Promise.any(sources);
    return res.status(200).json(winner);
  } catch (err) {
    return res.status(404).json({ error: 'identification_failed', diagnostics: logs });
  }
}
