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

  const fetchSource = async (name, op) => {
    try {
      let r = await op(pSIV);
      if (!r) r = await op(pRaw);
      if (r && r.length > 5 && !r.toLowerCase().includes('erreur')) return { model: r, source: name };
      throw new Error('no_res');
    } catch (e) { throw e; }
  };

  const sources = [
    // --- SOURCE 1 : MOOVELUB (EARLWEB) ---
    fetchSource('moovelub', async (p) => {
      const res = await fetch(`https://moove-france.ewp.earlweb.net/fr/vrm_search?vrm_type=fre:vrm:chatham&q=${p}`, {
        headers: { 'User-Agent': ua, 'Referer': 'https://moovelub.fr/' }
      });
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/<title>([^<]+)<\/title>/i);
      return (m && m[1] && !m[1].toLowerCase().includes('recherche')) ? m[1].replace(/ - Moove|Moove/gi, '').trim() : null;
    }),

    // --- SOURCE 2 : DUCKDUGGO LITE (EXTRACTION SÉMANTIQUE) ---
    // Cette source est "indétectable" car elle utilise l'index de DDG
    fetchSource('ddg-semantic', async (p) => {
      const query = `"${p}" site:oscaro.com OR site:norauto.fr OR site:mister-auto.com OR site:vroomly.com`;
      const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': ua, 'Referer': 'https://duckduckgo.com/' }
      });
      if (!res.ok) return null;
      const html = await res.text();
      // On cherche les titres des résultats qui contiennent souvent "Marque Modèle - Pièces auto..."
      const matches = html.match(/class='result-link'[^>]*>([^<]+)/gi);
      if (matches) {
        for (const m of matches) {
          let t = m.replace(/class='result-link'[^>]*>/i, '').replace(/Oscaro.com|Norauto|Mister Auto|Vroomly|Pièces auto|en ligne/gi, '').trim();
          if (t.length > 10) return t;
        }
      }
      return null;
    }),

    // --- SOURCE 3 : PIECESAUTO24 ---
    fetchSource('piecesauto24', async (p) => {
      const res = await fetch(`https://www.piecesauto24.com/recherche?plate=${p}`, {
        headers: { 'User-Agent': ua, 'Referer': 'https://www.piecesauto24.com/' }
      });
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/<title>([^<]+)<\/title>/i);
      if (m && m[1] && m[1].toLowerCase().includes('pièces')) {
        return m[1].replace(/Pièces auto pour | - Piècesauto24.com/gi, '').trim();
      }
      return null;
    }),

    // --- SOURCE 4 : PIECES ET PNEUS ---
    fetchSource('pieces-et-pneus', async (p) => {
      const res = await fetch(`https://www.piecesetpneus.com/IdentificationPlate?Plate=${p}`, {
        headers: { 'User-Agent': ua, 'Referer': 'https://www.piecesetpneus.com/' }
      });
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/<title>([^<]+)<\/title>/i);
      return (m && m[1] && !m[1].includes('Identification')) ? m[1].replace(/Pièces auto | - Pieces et Pneus/gi, '').trim() : null;
    })
  ];

  try {
    const winner = await Promise.any(sources);
    return res.status(200).json(winner);
  } catch (err) {
    return res.status(404).json({ error: 'identification_failed' });
  }
}
