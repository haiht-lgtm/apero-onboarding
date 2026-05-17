// ═══════════════════════════════════════════════════════════════════
// Auth — 1 password chung cho cả team (đơn giản nhất, không cần dịch vụ ngoài)
//
// Env vars:
//   SITE_PASSWORD    — password HR gõ vào để vào app
//   SESSION_SECRET   — random string để ký session cookie (32+ ký tự)
//
// Cookie format: <expiryTimestamp>.<hmacSignature>
// Dùng Node built-in crypto — KHÔNG cần npm dep ngoài
// ═══════════════════════════════════════════════════════════════════
const crypto = require('crypto');

const COOKIE_NAME = 'apero_session';
const SESSION_DAYS = 14;
const SESSION_MS = SESSION_DAYS * 24 * 3600 * 1000;

function getSecret() {
  return process.env.SESSION_SECRET || 'dev-only-insecure-change-me';
}

function getPassword() {
  return process.env.SITE_PASSWORD || '';
}

function hasAuthConfig() {
  return !!getPassword();
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

function createSessionToken() {
  const exp = Date.now() + SESSION_MS;
  const payload = String(exp);
  return `${payload}.${sign(payload)}`;
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
  const exp = Number(payload);
  if (isNaN(exp) || exp < Date.now()) return null;
  return { exp };
}

// So sánh password theo constant-time tránh timing attack
function checkPassword(input) {
  const expected = getPassword();
  if (!expected) return false;
  const a = Buffer.from(input || '', 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

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
  if (!hasAuthConfig()) return true; // chưa set SITE_PASSWORD → app open (dev mode)
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

module.exports = {
  COOKIE_NAME,
  hasAuthConfig,
  checkPassword,
  createSessionToken,
  verifySessionToken,
  getCurrentUser,
  isAuthenticated,
  setSessionCookie,
  clearSessionCookie
};
