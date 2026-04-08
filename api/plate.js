export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Plaque manquante' });

  const plate = q.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  try {
    // Tentative via Oscaro (recherche de redirection)
    // On simule un navigateur pour éviter certains blocages simples
    const oscaroUrl = `https://www.oscaro.com/fr/search?q=${plate}`;
    const response = await fetch(oscaroUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'manual'
    });

    // Si Oscaro redirige, l'URL contient souvent les infos du véhicule
    const location = response.headers.get('location');
    if (location && location.includes('catalogue')) {
        // Extraction du modèle depuis l'URL : /fr/catalogue/v2/voitures/peugeot/208/1-2-puretech-82cv-61845-t
        const parts = location.split('/');
        const brand = parts[parts.indexOf('voitures') + 1];
        const model = parts[parts.indexOf('voitures') + 2];
        const engine = parts[parts.indexOf('voitures') + 3]?.split('-').slice(0, -2).join(' ');
        
        if (brand && model) {
            return res.status(200).json({ 
                model: `${brand.toUpperCase()} ${model.toUpperCase()} ${engine || ''}`.trim() 
            });
        }
    }

    // Fallback : Recherche via un moteur de recherche léger (DuckDuckGo Lite)
    // On cherche la plaque associée à un site de pièces
    const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${plate}+site:vroomly.com`;
    const ddgRes = await fetch(ddgUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await ddgRes.text();
    
    // Regex pour capturer le titre du premier résultat qui contient souvent le modèle
    // Exemple : <a class="result-link" href="...">...</a>
    const match = html.match(/class='result-link'[^>]*>([^<]+)/i);
    if (match && match[1]) {
        let detected = match[1].replace(/plaque d'immatriculation|vroomly|pièces auto/gi, '').trim();
        if (detected.length > 5) {
            return res.status(200).json({ model: detected });
        }
    }

    return res.status(404).json({ error: 'Véhicule non identifié pour cette plaque.' });

  } catch (err) {
    return res.status(500).json({ error: 'Erreur lors de la détection : ' + err.message });
  }
}
