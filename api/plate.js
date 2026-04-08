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
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
    ];
    const ua = userAgents[Math.floor(Math.random() * userAgents.length)];

    // --- SOURCE 1 : CARTER-CASH (Très stable, souvent le modèle est dans le titre) ---
    try {
      const ccUrl = `https://www.carter-cash.com/recherche/plaque/${plate}`;
      const ccRes = await fetch(ccUrl, { 
        headers: { 
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9'
        }
      });
      if (ccRes.ok) {
        const html = await ccRes.text();
        // Extraction du titre qui contient souvent le véhicule
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1] && titleMatch[1].toLowerCase().includes('pièces auto pour')) {
          let model = titleMatch[1]
            .replace(/Pièces auto pour votre | | Pièces détachées | Carter-Cash/gi, ' ')
            .replace(/ - /g, ' ')
            .trim();
          if (model.length > 5) return res.status(200).json({ model, source: 'carter-cash' });
        }
      }
    } catch (e) { console.error('Echec CarterCash'); }

    // --- SOURCE 2 : Vroomly (Extraction directe) ---
    try {
      const vroomlyUrl = `https://www.vroomly.com/plaque/${plate}/`;
      const vRes = await fetch(vroomlyUrl, { headers: { 'User-Agent': ua } });
      if (vRes.ok) {
        const html = await vRes.text();
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1] && !titleMatch[1].includes('404')) {
          let model = titleMatch[1].replace(/Entretien de votre | - Vroomly|Plaque |Immatriculation /gi, '').trim();
          if (model.length > 5) return res.status(200).json({ model, source: 'vroomly' });
        }
      }
    } catch (e) { console.error('Echec Vroomly'); }

    // --- SOURCE 3 : DuckDuckGo Lite (Recherche de secours) ---
    try {
      const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${plate}+"carte+grise"`;
      const ddgRes = await fetch(ddgUrl, { headers: { 'User-Agent': ua } });
      const html = await ddgRes.text();
      const match = html.match(/class='result-link'[^>]*>([^<]+)/i);
      if (match && match[1]) {
        let detected = match[1].replace(/plaque d'immatriculation|vroomly|oscaro|pièces auto/gi, '').trim();
        if (detected.length > 5) return res.status(200).json({ model: detected, source: 'search' });
      }
    } catch (e) { console.error('Echec DDG'); }

    return res.status(404).json({ error: 'identification_failed' });

  } catch (err) {
    return res.status(500).json({ error: 'Erreur technique : ' + err.message });
  }
}
