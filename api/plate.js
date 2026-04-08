export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Plaque manquante' });

  // Normalisation des deux formats (SIV avec tirets et Raw sans tirets)
  const plateRaw = q.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  let plateSIV = plateRaw;
  if (plateRaw.length === 7) {
    plateSIV = plateRaw.slice(0, 2) + '-' + plateRaw.slice(2, 5) + '-' + plateRaw.slice(5);
  }

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  ];
  const ua = userAgents[Math.floor(Math.random() * userAgents.length)];

  // Helper pour tenter une source avec les deux formats
  const fetchSource = async (name, operation) => {
    try {
      // Tentative avec SIV (ex: AA-123-AA)
      let result = await operation(plateSIV);
      if (!result) {
        // Tentative avec Raw (ex: AA123AA)
        result = await operation(plateRaw);
      }
      
      if (result && result.length > 5 && !result.toLowerCase().includes('erreur') && !result.toLowerCase().includes('404')) {
        return { model: result, source: name };
      }
      throw new Error('No result');
    } catch (e) {
      throw e;
    }
  };

  // --- DEFINITION DES SOURCES ---
  const sources = [
    // Source 1 : PiecesAuto.fr (AJAX direct)
    fetchSource('pieces-auto', async (p) => {
      const paRes = await fetch(`https://www.piecesauto.fr/ajax/plate-number?plate=${p}`, { 
        headers: { 
          'User-Agent': ua, 
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': 'https://www.piecesauto.fr/'
        } 
      });
      if (!paRes.ok) return null;
      const data = await paRes.json();
      return data && data.car_name ? data.car_name : null;
    }),

    // Source 2 : Carter-Cash
    fetchSource('carter-cash', async (p) => {
      const ccRes = await fetch(`https://www.carter-cash.com/recherche/plaque/${p}`, { 
        headers: { 'User-Agent': ua, 'Referer': 'https://www.carter-cash.com/' } 
      });
      if (!ccRes.ok) return null;
      const html = await ccRes.text();
      const match = html.match(/<title>([^<]+)<\/title>/i);
      if (match && match[1] && match[1].toLowerCase().includes('pour')) {
        return match[1].replace(/Pièces auto pour votre | | Pièces détachées | Carter-Cash| |/gi, ' ').replace(/ - /g, ' ').replace(/ +/g, ' ').trim();
      }
      return null;
    }),

    // Source 3 : Autobacs (Souvent moins protégé)
    fetchSource('autobacs', async (p) => {
      const abRes = await fetch(`https://www.autobacs.fr/recherche-plaque/${p}`, { 
        headers: { 'User-Agent': ua, 'Referer': 'https://www.autobacs.fr/' } 
      });
      if (!abRes.ok) return null;
      const html = await abRes.text();
      const match = html.match(/<title>([^<]+)<\/title>/i);
      if (match && match[1] && !match[1].includes('Autobacs')) {
        return match[1].replace(/Pièces auto | - Autobacs|Détails du véhicule/gi, '').trim();
      }
      return null;
    }),

    // Source 4 : Mister-Auto
    fetchSource('mister-auto', async (p) => {
      const maRes = await fetch(`https://www.mister-auto.com/recherche-par-immatriculation/?plate=${p}`, { 
        headers: { 'User-Agent': ua, 'Referer': 'https://www.mister-auto.com/' } 
      });
      if (!maRes.ok) return null;
      const html = await maRes.text();
      const match = html.match(/<title>([^<]+)<\/title>/i);
      if (match && match[1] && !match[1].includes('immatriculation')) {
        return match[1].replace(/Pièces auto pour | - Mister-Auto|Mister Auto/gi, '').trim();
      }
      return null;
    }),

    // Source 5 : Vroomly
    fetchSource('vroomly', async (p) => {
      const vRes = await fetch(`https://www.vroomly.com/plaque/${p}/`, { 
        headers: { 'User-Agent': ua, 'Referer': 'https://www.vroomly.com/' } 
      });
      if (!vRes.ok) return null;
      const html = await vRes.text();
      const match = html.match(/<title>([^<]+)<\/title>/i);
      if (match && match[1] && !match[1].includes('404')) {
        return match[1].replace(/Entretien de votre | - Vroomly|Plaque |Immatriculation /gi, '').trim();
      }
      return null;
    }),

    // Source 6 : DuckDuckGo Multi-Proxy (Oscaro, Norauto, Feu Vert)
    fetchSource('search-multi', async (p) => {
      const query = `site:oscaro.com OR site:norauto.fr OR site:feuvert.fr "${p}"`;
      const ddgRes = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, { 
        headers: { 'User-Agent': ua, 'Referer': 'https://duckduckgo.com/' } 
      });
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
    // Si toutes les sources échouent
    return res.status(404).json({ error: 'identification_failed' });
  }
}
