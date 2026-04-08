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

    // --- SOURCE 1 : CARTER-CASH (Stable, souvent le modèle est dans le titre) ---
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
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1] && titleMatch[1].toLowerCase().includes('pour')) {
          let model = titleMatch[1]
            .replace(/Pièces auto pour votre | | Pièces détachées | Carter-Cash| |/gi, ' ')
            .replace(/ - /g, ' ')
            .replace(/ +/g, ' ')
            .trim();
          if (model.length > 5 && !model.includes('404')) return res.status(200).json({ model, source: 'carter-cash' });
        }
      }
    } catch (e) { console.error('Echec CarterCash'); }

    // --- SOURCE 2 : Mister-Auto (Excellent complément) ---
    try {
      const maUrl = `https://www.mister-auto.com/recherche-par-immatriculation/?plate=${plate}`;
      const maRes = await fetch(maUrl, { headers: { 'User-Agent': ua } });
      if (maRes.ok) {
        const html = await maRes.text();
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1] && !titleMatch[1].includes('immatriculation')) {
          let model = titleMatch[1].replace(/Pièces auto pour | - Mister-Auto|Mister Auto/gi, '').trim();
          if (model.length > 5) return res.status(200).json({ model, source: 'mister-auto' });
        }
      }
    } catch (e) { console.error('Echec MisterAuto'); }

    // --- SOURCE 3 : Vroomly (Extraction directe) ---
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

    // --- SOURCE 4 : PiecesAuto.fr (Très fiable) ---
    try {
      const paUrl = `https://www.piecesauto.fr/ajax/plate-number?plate=${plate}`;
      const paRes = await fetch(paUrl, { headers: { 'User-Agent': ua, 'X-Requested-With': 'XMLHttpRequest' } });
      if (paRes.ok) {
        const data = await paRes.json();
        if (data && data.car_name) return res.status(200).json({ model: data.car_name, source: 'pieces-auto' });
      }
    } catch (e) { console.error('Echec PiecesAuto'); }

    // --- SOURCE 5 : Eurorepar (Maintenance Stellantis) ---
    try {
      const erUrl = `https://www.eurorepar.fr/recherche/plaque/${plate}`;
      const erRes = await fetch(erUrl, { headers: { 'User-Agent': ua } });
      if (erRes.ok) {
        const html = await erRes.text();
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1] && !titleMatch[1].includes('Eurorepar')) {
          let model = titleMatch[1].replace(/Pièces auto | - Eurorepar/gi, '').trim();
          if (model.length > 5) return res.status(200).json({ model, source: 'eurorepar' });
        }
      }
    } catch (e) { console.error('Echec Eurorepar'); }

    // --- SOURCE 6 : DuckDuckGo Lite (Recherche Multi-Domaines) ---
    try {
      // On cherche sur plusieurs sites à la fois pour maximiser la chance de trouver le modèle dans un titre
      const query = `site:oscaro.com OR site:norauto.fr OR site:feuvert.fr "${plate}"`;
      const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
      const ddgRes = await fetch(ddgUrl, { headers: { 'User-Agent': ua } });
      if (ddgRes.ok) {
        const html = await ddgRes.text();
        const match = html.match(/class='result-link'[^>]*>([^<]+)/i);
        if (match && match[1]) {
          let detected = match[1].replace(/Oscaro.com|Norauto|Feu Vert|Plaque|Pièces auto|en ligne/gi, '').trim();
          if (detected.length > 5) return res.status(200).json({ model: detected, source: 'search-multi' });
        }
      }
    } catch (e) { console.error('Echec DDG Multi'); }

    return res.status(404).json({ error: 'identification_failed' });

  } catch (err) {
    return res.status(500).json({ error: 'Erreur technique : ' + err.message });
  }
}
