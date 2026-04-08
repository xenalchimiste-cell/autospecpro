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

  // Fonction pour extraire un nom lisible depuis un slug Earlweb
  // ex: "rio_hatchback_iii_ub_1_1_crdi_55kw_d3fa" → "Rio Hatchback III 1.1 CRDi 55kW"
  function slugToModel(slug) {
    return slug
      .replace(/_[A-Z]{2,10}[A-Z0-9]{2,6}(_|$)/gi, ' ') // supprime codes moteur (ex: _d3fa, _FawEcBPVK)
      .replace(/_/g, ' ')
      .replace(/\b(\d+)\b\s+\b(\d+)\b/g, '$1.$2') // "1 1" → "1.1"
      .replace(/\b(\d+)\s*kw\b/gi, '$1kW')
      .replace(/\b(i|ii|iii|iv|v)\b/gi, m => m.toUpperCase())
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();
  }

  const diag = {};

  // ----- STRATÉGIE : MOOVELUB via redirection HTTP -----
  // La page vrm_search redirige vers /fr/equipment/<slug-du-vehicule>
  // Le slug contient directement la marque, le modèle et la motorisation
  // On catch la redirection AVANT qu'elle soit suivie pour lire le slug dans l'URL
  const platesWithFormats = [pSIV, pRaw];
  
  for (const plate of platesWithFormats) {
    try {
      const response = await fetch(
        `https://moove-france.ewp.earlweb.net/fr/vrm_search?vrm_type=fre:vrm:chatham&q=${plate}`,
        {
          redirect: 'manual', // Ne pas suivre la redirection automatiquement
          headers: {
            'User-Agent': ua,
            'Referer': 'https://moovelub.fr/',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'fr-FR,fr;q=0.9'
          }
        }
      );

      diag[`moove_${plate}_status`] = response.status;
      
      // On cherche la redirection : status 301, 302, 303, ou 307
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location') || response.headers.get('Location');
        diag[`moove_${plate}_location`] = location;
        
        if (location && location.includes('/equipment/')) {
          // Extrait le slug: "/fr/equipment/rio_hatchback_iii_ub_1_1_crdi_55kw_d3fa_FawEcBPVK?vrm=..."
          const slugMatch = location.match(/\/equipment\/([^?#/]+)/);
          if (slugMatch && slugMatch[1]) {
            const slug = slugMatch[1];
            diag.slug = slug;
            const model = slugToModel(slug);
            return res.status(200).json({ model, source: 'moovelub-redirect' });
          }
        }
      }

      // Cas 200 : parfois la page HTML elle-même contient un meta refresh ou og:title
      if (response.status === 200) {
        const html = await response.text();
        // Chercher og:title qui a souvent le modèle complet
        const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
        if (ogTitle && ogTitle[1] && !ogTitle[1].toLowerCase().includes('moove')) {
          return res.status(200).json({ model: ogTitle[1].replace(/ - Moove/gi, '').trim(), source: 'moovelub-ogtitle' });
        }
        // Chercher dans le HTML un lien /equipment/
        const equipMatch = html.match(/href="([^"]*\/equipment\/[^"?#]+)/);
        if (equipMatch && equipMatch[1]) {
          const slugMatch2 = equipMatch[1].match(/\/equipment\/([^?#/]+)/);
          if (slugMatch2 && slugMatch2[1]) {
            const model = slugToModel(slugMatch2[1]);
            return res.status(200).json({ model, source: 'moovelub-html' });
          }
        }
        diag[`moove_${plate}_html_preview`] = html.slice(0, 300);
      }
    } catch (e) {
      diag[`moove_${plate}_exception`] = e.message;
    }
  }

  // Aucune source n'a trouvé → retour détaillé
  return res.status(404).json({ error: 'identification_failed', diagnostics: diag });
}
