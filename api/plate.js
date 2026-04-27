export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const vin = (req.query.vin || '').trim().toUpperCase();
  if (!vin || vin.length !== 17) {
    return res.status(400).json({ error: 'Le VIN doit contenir exactement 17 caractères.' });
  }

  const INVALID_CHARS = /[IOQ]/;
  if (INVALID_CHARS.test(vin)) {
    return res.status(400).json({ error: 'Un VIN ne peut pas contenir les lettres I, O ou Q.' });
  }

  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`;
    const nhtsaRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
    
    if (!nhtsaRes.ok) {
      return res.status(502).json({ error: 'Erreur lors de la consultation de la base NHTSA.' });
    }

    const data = await nhtsaRes.json();
    const results = data?.Results || [];

    const get = (variable) => {
      const found = results.find(r => r.Variable === variable);
      return (found?.Value && found.Value !== 'Not Applicable' && found.Value !== 'null' && found.Value !== null)
        ? found.Value
        : null;
    };

    const make = get('Make');
    const model = get('Model');
    const year = get('Model Year');
    const trim = get('Trim');
    const body = get('Body Class');
    const fuel = get('Fuel Type - Primary');
    const engine = get('Engine Displacement (L)');
    const cylinders = get('Engine Number of Cylinders');
    const power = get('Engine Brake (hp) From');
    const doors = get('Number of Doors');
    const drive = get('Drive Type');
    const transmission = get('Transmission Style');
    const country = get('Plant Country');
    const errors = get('Error Text');

    if (!make || !model) {
      return res.status(404).json({
        error: 'VIN inconnu ou invalide. Vérifiez les 17 caractères et réessayez.',
        vin_details: errors || null
      });
    }

    const modelString = [make, model, trim, year].filter(Boolean).join(' ');

    return res.status(200).json({
      model: modelString,
      details: {
        make, model, year, trim,
        body, fuel, engine: engine ? `${engine}L` : null,
        cylinders: cylinders ? `${cylinders} cylindres` : null,
        power: power ? `${power} ch` : null,
        doors, drive, transmission, country
      }
    });

  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'La base de données NHTSA ne répond pas. Réessayez dans quelques instants.' });
    }
    return res.status(500).json({ error: 'Erreur interne : ' + err.message });
  }
}
