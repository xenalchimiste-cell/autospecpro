export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Plaque manquante' });

  const plate = q.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  try {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
    ];
    const ua = userAgents[Math.floor(Math.random() * userAgents.length)];

    // --- SOURCE 1 : Vroomly (Souvent le plus simple à scraper via URL directe) ---
    try {
      const vroomlyUrl = `https://www.vroomly.com/plaque/${plate}/`;
      const vRes = await fetch(vroomlyUrl, { headers: { 'User-Agent': ua } });
      if (vRes.ok) {
        const html = await vRes.text();
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1] && !titleMatch[1].includes('404')) {
          let model = titleMatch[1]
            .replace(/Entretien de votre | - Vroomly|Plaque |Immatriculation /gi, '')
            .trim();
          if (model.length > 5) return res.status(200).json({ model, source: 'vroomly' });
        }
      }
    } catch (e) { console.error('Echec Vroomly'); }

    // --- SOURCE 2 : Mister-Auto (Via redirection vers catalogue) ---
    try {
      const maUrl = `https://www.mister-auto.com/r/${plate}`;
      const maRes = await fetch(maUrl, { 
        headers: { 'User-Agent': ua },
        redirect: 'manual' 
      });
      const location = maRes.headers.get('location');
      if (location && location.includes('/pieces-auto/')) {
        // Ex: /pieces-auto/peugeot/208/208-1-2-puretech-82cv/
        const match = location.match(/\/pieces-auto\/([^\/]+)\/([^\/]+)\/([^\/]+)/i);
        if (match) {
          const model = `${match[1]} ${match[2]} ${match[3].replace(/-/g, ' ')}`.toUpperCase();
          return res.status(200).json({ model, source: 'mister-auto' });
        }
      }
    } catch (e) { console.error('Echec MisterAuto'); }

    // --- SOURCE 3 : DuckDuckGo Lite (Recherche globale) ---
    try {
      const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${plate}+voiture+osc`;
      const ddgRes = await fetch(ddgUrl, { headers: { 'User-Agent': ua } });
      const html = await ddgRes.text();
      const match = html.match(/class='result-link'[^>]*>([^<]+)/i);
      if (match && match[1]) {
        let detected = match[1].replace(/plaque d'immatriculation|vroomly|oscaro|pièces auto/gi, '').trim();
        if (detected.length > 5) return res.status(200).json({ model: detected, source: 'search' });
      }
    } catch (e) { console.error('Echec DDG'); }

    return res.status(404).json({ error: 'Véhicule non identifié (Sources épuisées). Essayez le mode Manuel.' });

  } catch (err) {
    return res.status(500).json({ error: 'Erreur technique : ' + err.message });
  }
}
