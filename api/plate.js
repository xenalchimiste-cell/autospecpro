export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Plaque manquante' });

  const plate = q.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  ];
  const ua = userAgents[Math.floor(Math.random() * userAgents.length)];

  // Helper pour tenter une source
  const fetchSource = async (name, operation) => {
    try {
      const result = await operation();
      if (result) return { model: result, source: name };
      throw new Error('No result');
    } catch (e) {
      throw new Error(`Source ${name} failed`);
    }
  };

  // --- DEFINITION DES SOURCES ---
  const sources = [
    // Source 1 : PiecesAuto.fr (AJAX direct, très rapide)
    fetchSource('pieces-auto', async () => {
      const paRes = await fetch(`https://www.piecesauto.fr/ajax/plate-number?plate=${plate}`, { 
        headers: { 'User-Agent': ua, 'X-Requested-With': 'XMLHttpRequest' } 
      });
      if (!paRes.ok) return null;
      const data = await paRes.json();
      return data && data.car_name ? data.car_name : null;
    }),

    // Source 2 : Carter-Cash (Scraping titre)
    fetchSource('carter-cash', async () => {
      const ccRes = await fetch(`https://www.carter-cash.com/recherche/plaque/${plate}`, { headers: { 'User-Agent': ua } });
      if (!ccRes.ok) return null;
      const html = await ccRes.text();
      const match = html.match(/<title>([^<]+)<\/title>/i);
      if (match && match[1] && match[1].toLowerCase().includes('pour')) {
        return match[1].replace(/Pièces auto pour votre | | Pièces détachées | Carter-Cash| |/gi, ' ').replace(/ - /g, ' ').replace(/ +/g, ' ').trim();
      }
      return null;
    }),

    // Source 3 : Mister-Auto (Scraping titre)
    fetchSource('mister-auto', async () => {
      const maRes = await fetch(`https://www.mister-auto.com/recherche-par-immatriculation/?plate=${plate}`, { headers: { 'User-Agent': ua } });
      if (!maRes.ok) return null;
      const html = await maRes.text();
      const match = html.match(/<title>([^<]+)<\/title>/i);
      if (match && match[1] && !match[1].includes('immatriculation')) {
        return match[1].replace(/Pièces auto pour | - Mister-Auto|Mister Auto/gi, '').trim();
      }
      return null;
    }),

    // Source 4 : Vroomly
    fetchSource('vroomly', async () => {
      const vRes = await fetch(`https://www.vroomly.com/plaque/${plate}/`, { headers: { 'User-Agent': ua } });
      if (!vRes.ok) return null;
      const html = await vRes.text();
      const match = html.match(/<title>([^<]+)<\/title>/i);
      if (match && match[1] && !match[1].includes('404')) {
        return match[1].replace(/Entretien de votre | - Vroomly|Plaque |Immatriculation /gi, '').trim();
      }
      return null;
    }),

    // Source 5 : Eurorepar
    fetchSource('eurorepar', async () => {
      const erRes = await fetch(`https://www.eurorepar.fr/recherche/plaque/${plate}`, { headers: { 'User-Agent': ua } });
      if (!erRes.ok) return null;
      const html = await erRes.text();
      const match = html.match(/<title>([^<]+)<\/title>/i);
      if (match && match[1] && !match[1].includes('Eurorepar')) {
        return match[1].replace(/Pièces auto | - Eurorepar/gi, '').trim();
      }
      return null;
    }),

    // Source 6 : DuckDuckGo Multi-Proxy (Oscaro, Norauto, Feu Vert)
    fetchSource('search-multi', async () => {
      const query = `site:oscaro.com OR site:norauto.fr OR site:feuvert.fr "${plate}"`;
      const ddgRes = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': ua } });
      if (!ddgRes.ok) return null;
      const html = await ddgRes.text();
      const match = html.match(/class='result-link'[^>]*>([^<]+)/i);
      if (match && match[1]) {
        return match[1].replace(/Oscaro.com|Norauto|Feu Vert|Plaque|Pièces auto|en ligne/gi, '').trim();
      }
      return null;
    })
  ];

  try {
    // Exécute toutes les sources en parallèle et prend la PREMIERE réussite
    const winner = await Promise.any(sources);
    return res.status(200).json(winner);
  } catch (err) {
    // Si toutes les sources échouent (tous les promises sont rejected)
    return res.status(404).json({ error: 'identification_failed' });
  }
}
