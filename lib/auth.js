// ═══════════════════════════════════════════════════════════════════
// Auth — Google OAuth (Sign-In with Google) restricted to @apero.vn
//
// Flow:
//   1. Frontend: Google Sign-In button → user pick account → trả về ID token (JWT)
//   2. Frontend POST ID token → /api/auth/google
//   3. Backend: verify token với Google public keys, check email domain
//   4. Backend: set session cookie chứa email + name (HMAC signed)
//   5. Middleware: check session cookie cho mọi request
//
// Env vars:
//   GOOGLE_CLIENT_ID   — Client ID từ Google Cloud Console (web app type)
//   SESSION_SECRET     — random string để ký session cookie
//   ALLOWED_DOMAINS    — domains được phép, comma-separated (default: apero.vn)
// ═══════════════════════════════════════════════════════════════════
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const COOKIE_NAME = 'apero_session';
const SESSION_DAYS = 14;
const SESSION_MS = SESSION_DAYS * 24 * 3600 * 1000;

function getSecret() {
  return process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me';
}

function getClientId() {
  return process.env.GOOGLE_CLIENT_ID || '';
}

function getAllowedDomains() {
  return (process.env.ALLOWED_DOMAINS || 'apero.vn')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function hasAuthConfig() {
  return !!getClientId();
}

// ─── Sign / Verify Session Cookie ───
function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

// Token: base64({email,name,exp}).<hmac>
function createSessionToken(user) {
  const payload = {
    email: user.email,
    name: user.name || '',
    picture: user.picture || '',
    exp: Date.now() + SESSION_MS
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!obj.email || !obj.exp || obj.exp < Date.now()) return null;
    return obj;
  } catch {
    return null;
  }
}

// ─── Verify Google ID Token ───
let _oauthClient = null;
function getOAuthClient() {
  if (_oauthClient) return _oauthClient;
  _oauthClient = new OAuth2Client(getClientId());
  return _oauthClient;
}

async function verifyGoogleIdToken(idToken) {
  if (!getClientId()) {
    throw new Error('GOOGLE_CLIENT_ID chưa cấu hình');
  }
  const ticket = await getOAuthClient().verifyIdToken({
    idToken,
    audience: getClientId()
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new Error('Token không hợp lệ');
  }
  // Kiểm tra domain
  const email = payload.email.toLowerCase();
  const domain = email.split('@')[1];
  const allowed = getAllowedDomains();
  // hd (hosted domain) cho Workspace email — chính xác hơn vì Google verify
  const hd = (payload.hd || '').toLowerCase();
  const isAllowed = allowed.includes(domain) || (hd && allowed.includes(hd));
  if (!isAllowed) {
    throw new Error(`Email "${payload.email}" không thuộc domain cho phép. Chỉ chấp nhận: ${allowed.join(', ')}`);
  }
  return {
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    domain: hd || domain
  };
}

// ─── Cookie Helpers ───
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i < 0) return;
    const k = p.slice(0, i).trim();
    const v = decodeURIComponent(p.slice(i + 1).trim());
    if (k) out[k] = v;
  });
  return out;
}

function getSessionToken(req) {
  return parseCookies(req)[COOKIE_NAME] || null;
}

function getCurrentUser(req) {
  return verifySessionToken(getSessionToken(req));
}

function isAuthenticated(req) {
  if (!hasAuthConfig()) return true; // chưa cấu hình GOOGLE_CLIENT_ID → app open (dev mode)
  return !!getCurrentUser(req);
}

function setSessionCookie(res, token) {
  const isProd = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=/`,
    `Max-Age=${SESSION_MS / 1000}`,
    `HttpOnly`,
    `SameSite=Lax`
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  const isProd = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=`,
    `Path=/`,
    `Max-Age=0`,
    `HttpOnly`,
    `SameSite=Lax`
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

// ─── Express Middleware ───
function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized', login: '/login' });
  }
  // HTML page → redirect /login
  if (req.path === '/login' || req.path === '/login.html') return next();
  return res.redirect('/login');
}

module.exports = {
  COOKIE_NAME,
  hasAuthConfig,
  getClientId,
  getAllowedDomains,
  verifyGoogleIdToken,
  createSessionToken,
  verifySessionToken,
  getCurrentUser,
  isAuthenticated,
  setSessionCookie,
  clearSessionCookie,
  requireAuth
};
