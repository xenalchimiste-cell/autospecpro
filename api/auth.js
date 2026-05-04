import { sql, initDb } from './_lib/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "548892582580-mh5isg91gtg86hjn7rb11vd5e8dton4f.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export default async function handler(req, res) {
  // CORS Headers
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { action } = req.query;

  try {
    if (action === 'register') return await handleRegister(req, res);
    if (action === 'login') return await handleLogin(req, res);
    if (action === 'google') return await handleGoogle(req, res);
    if (action === 'me') return await handleMe(req, res);

    return res.status(404).json({ error: 'Action not found' });
  } catch (error) {
    console.error(`Auth Action [${action}] Error:`, error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

async function handleRegister(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  await initDb();
  const { email, password, firstName, lastName, userType, referralCode, companyName, siret, proofUrl } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  let officialCompanyName = companyName;
  if (userType === 'enterprise') {
    if (!siret) return res.status(400).json({ error: 'SIRET is required for enterprise accounts' });
    const cleanSiret = siret.replace(/\s/g, '');
    if (!/^\d{14}$/.test(cleanSiret)) return res.status(400).json({ error: 'Invalid SIRET number' });
    
    try {
      const verifyRes = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${cleanSiret}&mtf_fields=siret,nom_complet,siege,etat_administratif`);
      const verifyData = await verifyRes.json();
      const match = (verifyData.results || []).find(r => r.siege && r.siege.siret === cleanSiret);
      if (!match || (match.etat_administratif && match.etat_administratif !== 'A')) {
        return res.status(400).json({ error: 'Invalid or inactive SIRET number' });
      }
      officialCompanyName = match.nom_complet;
    } catch (err) {
      console.error('SIRET check failed:', err);
    }
    if (!proofUrl) return res.status(400).json({ error: 'Proof of identity is required' });
  }

  const { rows: existingUsers } = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existingUsers.length > 0) return res.status(400).json({ error: 'Email already registered' });

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  let referredById = null;
  let finalUserType = userType || 'individual';
  const PRO_LIFETIME_KEYS = ['PRO-LIFETIME-A1X9', 'PRO-LIFETIME-B2Y8', 'PRO-LIFETIME-C3Z7', 'PRO-LIFETIME-D4W6', 'PRO-LIFETIME-E5V5'];

  if (referralCode && PRO_LIFETIME_KEYS.includes(referralCode)) {
    finalUserType = 'pro';
  } else if (referralCode) {
    const { rows: referrers } = await sql`SELECT id FROM users WHERE referral_code = ${referralCode}`;
    if (referrers.length > 0) referredById = referrers[0].id;
  }

  const myReferralCode = Math.random().toString(36).substring(2, 9).toUpperCase();
  const cleanSiret = siret ? siret.replace(/\s/g, '') : null;

  const { rows: newUser } = await sql`
    INSERT INTO users (email, password_hash, first_name, last_name, user_type, referral_code, referred_by_id, company_name, siret, proof_url)
    VALUES (${email}, ${passwordHash}, ${firstName}, ${lastName}, ${finalUserType}, ${myReferralCode}, ${referredById}, ${officialCompanyName || null}, ${cleanSiret}, ${proofUrl || null})
    RETURNING id, email, first_name, last_name, user_type, referral_code, referred_by_id, company_name, siret, proof_url
  `;

  const user = newUser[0];
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  return res.status(201).json({ message: 'User created successfully', token, user });
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const { rows } = await sql`SELECT * FROM users WHERE email = ${email}`;
  if (rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

  const user = rows[0];
  if (user.email.toLowerCase() === 'andreasgiacomello23@gmail.com' && user.user_type !== 'admin') {
    await sql`UPDATE users SET user_type = 'admin' WHERE id = ${user.id}`;
    user.user_type = 'admin';
  }

  if (!user.password_hash) return res.status(401).json({ error: 'Please use Google Login for this account' });

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  delete user.password_hash;
  return res.status(200).json({ message: 'Login successful', token, user });
}

async function handleGoogle(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { idToken, referralCode } = req.body;
  if (!idToken) return res.status(400).json({ error: 'No ID token provided' });

  const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  const { email, given_name, family_name } = payload;

  const { rows } = await sql`SELECT * FROM users WHERE email = ${email}`;
  let user;

  if (rows.length > 0) {
    user = rows[0];
    if (user.first_name !== given_name || user.last_name !== family_name) {
      const { rows: updated } = await sql`
        UPDATE users SET first_name = ${given_name}, last_name = ${family_name} WHERE id = ${user.id} RETURNING *
      `;
      user = updated[0];
    }
  } else {
    const { rows: newUser } = await sql`
      INSERT INTO users (email, first_name, last_name, user_type, referral_code)
      VALUES (${email}, ${given_name}, ${family_name}, 'individual', ${referralCode || null})
      RETURNING *
    `;
    user = newUser[0];
  }

  if (user.email.toLowerCase() === 'andreasgiacomello23@gmail.com' && user.user_type !== 'admin') {
    await sql`UPDATE users SET user_type = 'admin' WHERE id = ${user.id}`;
    user.user_type = 'admin';
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  delete user.password_hash;
  return res.status(200).json({ message: 'Login successful', token, user });
}

async function handleMe(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await sql`SELECT * FROM users WHERE id = ${decoded.userId}`;
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = rows[0];
    delete user.password_hash;
    return res.status(200).json({ user });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
