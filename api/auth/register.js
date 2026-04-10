import { sql } from '../_lib/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password, firstName, lastName, userType, referralCode, companyName, siret, proofUrl } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // Validate SIRET format and status if enterprise
  let officialCompanyName = companyName;
  if (userType === 'enterprise') {
    if (!siret) return res.status(400).json({ error: 'SIRET is required for enterprise accounts' });
    const cleanSiret = siret.replace(/\s/g, '');
    if (!/^\d{14}$/.test(cleanSiret)) {
      return res.status(400).json({ error: 'Invalid SIRET number (must be 14 digits)' });
    }

    try {
      const verifyRes = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${cleanSiret}&mtf_fields=siret,nom_complet,siege,etat_administratif`);
      const verifyData = await verifyRes.json();
      const match = (verifyData.results || []).find(r => r.siege && r.siege.siret === cleanSiret);
      
      if (!match || (match.etat_administratif && match.etat_administratif !== 'A')) {
        return res.status(400).json({ error: 'Invalid or inactive SIRET number' });
      }
      // Use the official company name from the registry
      officialCompanyName = match.nom_complet;
    } catch (err) {
      console.error('SIRET secondary check failed:', err);
      // Fallback to provided name if API is down, but ideally we'd want this to work
    }

    if (!proofUrl) {
      return res.status(400).json({ error: 'Proof of identity document is required for enterprise accounts' });
    }
  }

  try {
    // 1. Check if user exists
    const { rows: existingUsers } = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // 2. Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Handle referral code if provided
    let referredById = null;
    let finalUserType = userType || 'individual';
    
    const PRO_LIFETIME_KEYS = [
      'PRO-LIFETIME-A1X9',
      'PRO-LIFETIME-B2Y8',
      'PRO-LIFETIME-C3Z7',
      'PRO-LIFETIME-D4W6',
      'PRO-LIFETIME-E5V5'
    ];

    if (referralCode && PRO_LIFETIME_KEYS.includes(referralCode)) {
      finalUserType = 'pro';
    } else if (referralCode) {
      const { rows: referrers } = await sql`SELECT id FROM users WHERE referral_code = ${referralCode}`;
      if (referrers.length > 0) {
        referredById = referrers[0].id;
      }
    }

    // 4. Generate own referral code
    const myReferralCode = Math.random().toString(36).substring(2, 9).toUpperCase();

    // 5. Create user
    const cleanSiret = siret ? siret.replace(/\s/g, '') : null;
    const { rows: newUser } = await sql`
      INSERT INTO users (email, password_hash, first_name, last_name, user_type, referral_code, referred_by_id, company_name, siret, proof_url)
      VALUES (${email}, ${passwordHash}, ${firstName}, ${lastName}, ${finalUserType}, ${myReferralCode}, ${referredById}, ${officialCompanyName || null}, ${cleanSiret}, ${proofUrl || null})
      RETURNING id, email, first_name, last_name, user_type, referral_code, referred_by_id, company_name, siret, proof_url
    `;

    const user = newUser[0];

    // 6. Generate JWT
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'User created successfully',
      token,
      user
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration: ' + error.message });
  }
}
