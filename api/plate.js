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
  // ex: "rio_hatchback_iii_ub_1_1_crdi_55kw_d3fa_FawEcBPVK" → "Rio Hatchback III 1.1 CRDi 55kW"
  function extractTechData(slug) {
    const data = {};
    const kwMatch = slug.match(/_(\d+)kw(_|$)/i);
    if (kwMatch) data.kw = kwMatch[1];
    const engineMatch = slug.match(/_([a-z][0-9][a-z]{1,2})(_[A-Za-z0-9]{6,}|$)/i);
    if (engineMatch) data.engine_code = engineMatch[1].toUpperCase();
    return data;
  }

  function slugToModel(slug) {
    return slug
      .replace(/_[A-Za-z0-9]{6,}$/, '')
      .replace(/_/g, ' ')
      .replace(/\b([1-9])\s+([0-9])\b(?=\s*(diesel|essence|crdi|tdi|tfsi|tsi|fsi|gdi|jtd|dci|hdi|cdti|tce|vti|thp|e|d|i|t)|\s*$|\s+crdi|\s+dci|\s+tdi|\s+hdi|\s+cdi)/gi, '$1.$2')
      .replace(/\b([1-9])\s+([0-9])\b/g, '$1.$2')
      .replace(/\b(sb|sr|ql|qle|ub|pa|pa5|b9|zb|gd|nd|lb)\b/gi, '')
      .replace(/\b(i{1,3}|iv|v|vi|vii|viii)\b/gi, m => m.toUpperCase())
      .replace(/\b(crdi|tdi|tfsi|tsi|fsi|gdi|jtd|dci|hdi|cdti|tce|vti|thp|crd)\b/gi, m => m.toUpperCase())
      .replace(/\b(\d+)kw\b/gi, '$1kW')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace(/\s+/g, ' ')
      .trim();
  }


  const diag = {};
  const providerStatuses = [];

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
      providerStatuses.push({ plate, status: response.status });
      
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
            const tech = extractTechData(slug);
            const model = slugToModel(slug);
            return res.status(200).json({ model, tech, source: 'moovelub-redirect' });
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
            const tech = extractTechData(slugMatch2[1]);
            const model = slugToModel(slugMatch2[1]);
            return res.status(200).json({ model, tech, source: 'moovelub-html' });
          }
        }
        diag[`moove_${plate}_html_preview`] = html.slice(0, 300);
      }
    } catch (e) {
      diag[`moove_${plate}_exception`] = e.message;
    }
  }

  // ----- FALLBACK OPTIONNEL : APIFY (si token configuré) -----
  // Configurez APIFY_API_TOKEN dans Vercel pour activer ce fallback.
  const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
  if (APIFY_API_TOKEN) {
    try {
      const apifyRes = await fetch(
        `https://api.apify.com/v2/acts/freecamp008~french-license-plate-lookup/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_API_TOKEN)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ plate: pRaw }),
        }
      );

      diag.apify_status = apifyRes.status;
      if (apifyRes.ok) {
        const apifyData = await apifyRes.json();
        const item = Array.isArray(apifyData) ? apifyData[0] : apifyData;
        const vehicle = item?.vehicle || item?.data?.vehicle || null;
        const brand = vehicle?.brand || vehicle?.make || '';
        const model = vehicle?.model || '';
        const year = vehicle?.year || vehicle?.registrationYear || '';
        const fallbackModel = [brand, model, year].filter(Boolean).join(' ').trim();

        if (fallbackModel) {
          return res.status(200).json({ model: fallbackModel, tech: {}, source: 'apify-fallback' });
        }
      } else {
        const txt = await apifyRes.text();
        diag.apify_error = txt.slice(0, 200);
      }
    } catch (e) {
      diag.apify_exception = e.message;
    }
  }

  // ----- FALLBACK GROQ IA (Ultime recours) -----
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (GROQ_API_KEY) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0,
          max_tokens: 60,
          messages: [
            {
              role: 'system',
              content: 'Tu es un expert en plaques d\'immatriculation françaises (SIV et ancien format). Assigne la plaque à une marque et un modèle connu. Réponds UNIQUEMENT par la marque et le modèle (ex: "Peugeot 208", "BMW M3"). Si la plaque est invalide ou introuvable, réponds UNIQUEMENT "INCONNU". Ne rajoute aucune ponctuation ni texte.'
            },
            {
              role: 'user',
              content: `Identifie le véhicule pour la plaque : ${pRaw}`
            }
          ]
        })
      });

      if (groqRes.ok) {
        const data = await groqRes.json();
        const model = data.choices?.[0]?.message?.content?.trim();

        if (model && model !== 'INCONNU' && model.length > 3) {
          return res.status(200).json({ model, tech: {}, source: 'groq-ai' });
        }
      } else {
        diag.groq_error = await groqRes.text();
      }
    } catch (err) {
      diag.groq_exception = err.message;
    }
  }

  const allMooveRequestsReturned200 = providerStatuses.length > 0 && providerStatuses.every(s => s.status === 200);
  const shouldReturnServiceUnavailable = allMooveRequestsReturned200;
  if (shouldReturnServiceUnavailable) {
    return res.status(503).json({
      error: 'plate_provider_unavailable',
      message: 'Le service d\'identification plaque est temporairement indisponible.',
      diagnostics: diag
    });
  }

  // Aucune source n'a trouvé → retour détaillé
  return res.status(404).json({ error: 'identification_failed', diagnostics: diag });
}
