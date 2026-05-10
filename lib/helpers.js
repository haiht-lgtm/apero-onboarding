// ═══════════════════════════════════════════════════════════════════
// Helpers — date manipulation, template rendering, variable building
// ═══════════════════════════════════════════════════════════════════

const addDays = (s, n) => {
  const d = new Date(s);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const renderTemplate = (tpl, vars) =>
  String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);

const buildVars = (c) => ({
  full_name: c.full_name || '',
  job_title: c.job_title || '',
  department: c.department || '',
  manager_name: c.manager_name || '',
  level: c.level || '',
  email: c.personal_email || '',
  phone: c.phone || '',
  start_date: c.start_date || '',
  start_date_minus_1: c.start_date ? addDays(c.start_date, -1) : '',
  start_date_minus_3: c.start_date ? addDays(c.start_date, -3) : '',
  start_date_minus_5: c.start_date ? addDays(c.start_date, -5) : ''
});

// Convert Vietnamese date "12/07" hoặc "12/07/2026" → ISO "2026-07-12"
function parseVNDate(s, fallbackYear = new Date().getFullYear()) {
  if (!s) return null;
  s = String(s).trim();
  // Đã là ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/yyyy
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // dd/mm (giả định năm hiện tại)
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${fallbackYear}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // dd-mm-yyyy
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

module.exports = { addDays, todayStr, renderTemplate, buildVars, parseVNDate };
