export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { siret } = req.query;

  if (!siret) return res.status(400).json({ error: 'SIRET is required' });

  const cleanSiret = siret.replace(/\s/g, '');
  if (!/^\d{14}$/.test(cleanSiret)) {
    return res.status(400).json({ error: 'Invalid SIRET format (must be 14 digits)' });
  }

  try {
    const response = await fetch(
      `https://recherche-entreprises.api.gouv.fr/search?q=${cleanSiret}&mtf_fields=siret,nom_complet,siege,etat_administratif`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      return res.status(502).json({ error: 'Unable to contact the SIRENE API' });
    }

    const data = await response.json();

    // Find a result whose SIRET matches exactly
    const match = (data.results || []).find(r =>
      r.siege && r.siege.siret === cleanSiret
    );

    if (!match) {
      return res.status(404).json({ error: 'SIRET not found in the official register', valid: false });
    }

    // Check if the company is still active
    if (match.etat_administratif && match.etat_administratif !== 'A') {
      return res.status(422).json({
        error: 'This company is no longer active (closed)',
        valid: false,
        company: match.nom_complet
      });
    }

    return res.status(200).json({
      valid: true,
      company: match.nom_complet,
      siret: cleanSiret
    });

  } catch (error) {
    console.error('SIRET verification error:', error);
    return res.status(500).json({ error: 'Server error during SIRET verification: ' + error.message });
  }
}
