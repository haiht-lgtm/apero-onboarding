// ═══════════════════════════════════════════════════════════════════
// Store — high-level data layer
// Lưu vào KV (cloud) hoặc local file (.kv-local.json) cho dev
//
// Schema KV:
//   data:candidates       → array of candidates [{id, full_name, ...}]
//   data:next_id          → number (auto-increment id)
//   data:settings         → object { smtp_host, dept_emails, ... }
//   data:state:<id>       → object { 'email:E1': {sent: true, ...}, 'checklist:5': {done: true}, ... }
// ═══════════════════════════════════════════════════════════════════
const kv = require('./kv');

const K_CANDIDATES = 'data:candidates';
const K_NEXT_ID = 'data:next_id';
const K_SETTINGS = 'data:settings';
const K_STATE = id => `data:state:${id}`;
const K_TEMPLATE_OVERRIDES = 'data:template_overrides';

// ─── CANDIDATES ───
async function listCandidates() {
  return (await kv.get(K_CANDIDATES)) || [];
}

async function getCandidate(id) {
  const list = await listCandidates();
  return list.find(c => c.id === Number(id)) || null;
}

async function addCandidate(data) {
  const list = await listCandidates();
  let nextId = (await kv.get(K_NEXT_ID)) || 1;
  const candidate = {
    id: Number(nextId),
    full_name: data.full_name || '',
    job_title: data.job_title || '',
    department: data.department || '',
    manager_name: data.manager_name || '',
    manager_email: data.manager_email || '',
    level: data.level || '',
    start_date: data.start_date || '',
    personal_email: data.personal_email || '',
    phone: data.phone || '',
    status: data.status || 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  list.push(candidate);
  await kv.set(K_CANDIDATES, list);
  await kv.set(K_NEXT_ID, Number(nextId) + 1);
  return candidate;
}

async function updateCandidate(id, patch) {
  const list = await listCandidates();
  const idx = list.findIndex(c => c.id === Number(id));
  if (idx === -1) return null;
  list[idx] = {
    ...list[idx],
    ...patch,
    id: list[idx].id, // không cho phép đổi id
    updated_at: new Date().toISOString()
  };
  await kv.set(K_CANDIDATES, list);
  return list[idx];
}

async function deleteCandidate(id) {
  const list = await listCandidates();
  const filtered = list.filter(c => c.id !== Number(id));
  await kv.set(K_CANDIDATES, filtered);
  await kv.del(K_STATE(id));
  return filtered.length < list.length;
}

// ─── STATE (per candidate) ───
async function getState(candidateId) {
  return (await kv.get(K_STATE(candidateId))) || {};
}

async function setStateItem(candidateId, itemType, itemKey, value) {
  const state = await getState(candidateId);
  const k = `${itemType}:${itemKey}`;
  state[k] = { ...value, updated_at: new Date().toISOString() };
  await kv.set(K_STATE(candidateId), state);
  return state[k];
}

async function getStateItem(candidateId, itemType, itemKey) {
  const state = await getState(candidateId);
  return state[`${itemType}:${itemKey}`] || null;
}

// ─── SETTINGS ───
const DEFAULT_SETTINGS = {
  company_name: 'APERO Technologies Group',
  smtp_host: '',
  smtp_port: '465',
  smtp_user: '',
  smtp_pass: '',
  smtp_from_name: 'APERO HR',
  smtp_from_email: '',
  email_signature: 'Trân trọng,\nTeam HR — APERO Technologies Group',
  dept_hcns_email: '',
  dept_it_mynth_email: '',
  dept_it_hungnx_email: '',
  dept_cb_phuongth_email: ''
};

async function getSettings() {
  const stored = (await kv.get(K_SETTINGS)) || {};
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function updateSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '••••••••') continue;
    // SMTP password: xóa hết space (Google copy App Password có space)
    if (k === 'smtp_pass' && typeof v === 'string') {
      next[k] = v.replace(/\s+/g, '');
    } else {
      next[k] = v;
    }
  }
  await kv.set(K_SETTINGS, next);
  return next;
}

// Đọc setting đơn lẻ — fallback to env var nếu chưa có trong KV
async function getSetting(key) {
  const settings = await getSettings();
  if (settings[key]) return settings[key];
  const envKey = key.toUpperCase().replace(/[.-]/g, '_');
  return process.env[envKey] || '';
}

// ─── TEMPLATE OVERRIDES — user customize qua web ───
async function getTemplateOverrides() {
  return (await kv.get(K_TEMPLATE_OVERRIDES)) || {};
}

async function setTemplateOverride(key, patch) {
  const all = await getTemplateOverrides();
  all[key] = { ...(all[key] || {}), ...patch, updated_at: new Date().toISOString() };
  await kv.set(K_TEMPLATE_OVERRIDES, all);
  return all[key];
}

async function deleteTemplateOverride(key) {
  const all = await getTemplateOverrides();
  delete all[key];
  await kv.set(K_TEMPLATE_OVERRIDES, all);
}

async function clearAllOverrides() {
  await kv.set(K_TEMPLATE_OVERRIDES, {});
}

// Merge code defaults + KV overrides → final templates dùng để generate
async function getEffectiveTemplates() {
  const { EMAIL_TEMPLATES } = require('./templates');
  const overrides = await getTemplateOverrides();
  return EMAIL_TEMPLATES.map(t => {
    const o = overrides[t.key];
    if (!o) return t;
    return {
      ...t,
      subject: o.subject ?? t.subject,
      body: o.body ?? t.body,
      day_offset: o.day_offset ?? t.day_offset,
      _customized: true,
      _updated_at: o.updated_at
    };
  });
}

// ─── SEED (chạy nếu chưa có data) ───
async function seedIfEmpty() {
  const list = await listCandidates();
  if (list.length > 0) return false;

  const today = new Date();
  const inDays = n => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  await addCandidate({
    full_name: 'Nguyễn Thu Hiền', job_title: 'UI/UX Designer',
    department: 'Apero Headquarters', manager_name: 'Trần Quốc Hùng',
    manager_email: 'hung.tran@apero.vn', level: 'OX2',
    start_date: inDays(5), personal_email: 'thuhien.nguyen@example.com',
    phone: '0901234567'
  });
  await addCandidate({
    full_name: 'Lê Thanh Tùng', job_title: 'Mobile Developer',
    department: 'Apero Software', manager_name: 'Phạm Văn Đức',
    manager_email: 'duc.pham@apero.vn', level: 'LX2',
    start_date: inDays(-10), personal_email: 'tung.le@example.com',
    phone: '0912345678'
  });
  return true;
}

module.exports = {
  listCandidates, getCandidate, addCandidate, updateCandidate, deleteCandidate,
  getState, setStateItem, getStateItem,
  getSettings, updateSettings, getSetting,
  getTemplateOverrides, setTemplateOverride, deleteTemplateOverride, clearAllOverrides,
  getEffectiveTemplates,
  seedIfEmpty
};
