// ═══════════════════════════════════════════════════════════════════
// APERO Onboarding v2 — SPA Frontend
// ═══════════════════════════════════════════════════════════════════
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const fmt = s => s ? new Date(s).toLocaleDateString('vi-VN') : '';
const fmtDT = s => s ? new Date(s).toLocaleString('vi-VN') : '';
const todayStr = () => new Date().toISOString().slice(0,10);
const initials = n => (n||'?').trim().split(/\s+/).slice(-2).map(w=>w[0]).join('').toUpperCase();
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const msClass = m => 'ms-' + (m||'').replace('+','p').replace(/\s/g,'');
const handle = async r => {
  if (r.status === 401) {
    // Session hết hạn → về login
    location.href = '/login?redirect=' + encodeURIComponent(location.pathname);
    throw new Error('Unauthorized');
  }
  return r.json();
};
const api = {
  get: u => fetch(u).then(handle),
  post: (u,b) => fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})}).then(handle),
  put:  (u,b) => fetch(u,{method:'PUT', headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})}).then(handle),
  del:  u => fetch(u,{method:'DELETE'}).then(handle)
};
// Helper: disable button khi đang chạy async, re-enable sau khi xong
// Usage: btn.onclick = withLoading(async () => { ... });
const withLoading = (fn, loadingText = 'Đang xử lý...') => async function (e) {
  const btn = (e && e.currentTarget) || this;
  if (!btn || btn.disabled) return;
  const originalHTML = btn.innerHTML;
  const originalDisabled = btn.disabled;
  btn.disabled = true;
  btn.style.opacity = '0.6';
  btn.style.cursor = 'wait';
  btn.innerHTML = `<span class="inline-block">⏳</span> ${loadingText}`;
  try {
    return await fn.call(btn, e);
  } catch (err) {
    console.error('Action error:', err);
    toast('❌ ' + (err.message || 'Lỗi'), 'error');
  } finally {
    btn.disabled = originalDisabled;
    btn.style.opacity = '';
    btn.style.cursor = '';
    btn.innerHTML = originalHTML;
  }
};
// Check session khi load, redirect /login nếu chưa đăng nhập
(async () => {
  try {
    const r = await fetch('/api/auth/me');
    if (r.status === 401) {
      location.href = '/login?redirect=' + encodeURIComponent(location.pathname);
      return;
    }
    const data = await r.json();
    if (data.user) {
      window.__currentUser = data.user;
      // Render user info trong sidebar
      const userBox = document.getElementById('userBox');
      if (userBox) {
        userBox.classList.remove('hidden');
        document.getElementById('userName').textContent = data.user.name || data.user.email;
        document.getElementById('userEmail').textContent = data.user.email;
        if (data.user.picture) document.getElementById('userAvatar').src = data.user.picture;
      }
    }
  } catch (e) { /* network error — sẽ retry khi API call */ }
})();
// Logout button
document.addEventListener('click', async e => {
  if (e.target.closest('#logoutBtn')) {
    e.preventDefault();
    await fetch('/api/auth/logout', { method: 'POST' });
    location.href = '/login';
  }
});
const toast = (msg, type='') => {
  const el = document.createElement('div');
  el.className = 'toast '+type; el.textContent = msg;
  $('#toastRoot').appendChild(el);
  setTimeout(() => el.remove(), 2800);
};
const candidateStatus = sd => {
  const diff = Math.round((new Date(todayStr()) - new Date(sd))/86400000);
  if (diff < 0) return { label:'Sắp onboard', cls:'bg-blue-100 text-blue-700' };
  if (diff <= 60) return { label:'Đang onboard', cls:'bg-purple-100 text-purple-700' };
  return { label:'Hoàn thành', cls:'bg-green-100 text-green-700' };
};

// ═══════════ ROUTER (History API — không dùng hash) ═══════════
const routes = {};
const navigate = (route, params={}) => {
  const url = '/' + route + (params.id?'/'+params.id:'') + (params.tab?'/'+params.tab:'');
  if (location.pathname !== url) {
    history.pushState({}, '', url);
    render();
  } else render();
};
const render = async () => {
  const path = location.pathname.replace(/^\/+/, '') || 'dashboard';
  const [route, id, tab] = path.split('/');
  $$('.menu-item').forEach(m => m.classList.toggle('active', m.dataset.route === route));
  $('#topActions').innerHTML = '';
  $('#content').innerHTML = '<div class="text-center text-slate-400 py-10">Đang tải…</div>';
  try { await (routes[route] || routes.dashboard)(id, tab); }
  catch (e) { console.error(e); $('#content').innerHTML = `<div class="text-center text-red-600 py-10">Lỗi: ${escapeHtml(e.message)}</div>`; }
};
window.addEventListener('popstate', render);
// SPA navigation cho mọi element có [data-route]
document.addEventListener('click', e => {
  const el = e.target.closest('[data-route]');
  if (el && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    navigate(el.dataset.route);
  }
});
$('#todayLabel').textContent = new Date().toLocaleDateString('vi-VN');

// ═══════════ DASHBOARD ═══════════
let dashSort = { field: 'start_date', dir: 'asc' };
let dashSearch = '';
let dashDeptFilter = 'all';
let dashProgressFilter = 'all'; // all | none | low | high
routes.dashboard = async () => {
  $('#pageTitle').textContent = 'Dashboard';
  const s = await api.get('/api/dashboard/stats');

  // Cảnh báo urgent (banner đỏ trên đầu)
  const alerts = [];
  if (s.overdueChecks > 0) alerts.push({ icon: '🔴', text: `<strong>${s.overdueChecks}</strong> checklist QUÁ HẠN cần xử lý ngay`, route: 'checklist', bg: 'bg-red-50 border-red-500 text-red-900', hover: 'hover:bg-red-100' });
  if (s.todayEmails > 0) alerts.push({ icon: '⏰', text: `<strong>${s.todayEmails}</strong> email cần gửi HÔM NAY`, route: 'emails', bg: 'bg-amber-50 border-amber-500 text-amber-900', hover: 'hover:bg-amber-100' });
  if (s.pendingOrders > 0) alerts.push({ icon: '📦', text: `<strong>${s.pendingOrders}</strong> order bộ phận đang CHỜ XỬ LÝ`, route: 'orders', bg: 'bg-orange-50 border-orange-500 text-orange-900', hover: 'hover:bg-orange-100' });
  const alertHtml = alerts.length === 0 ? '' : `
    <div class="mb-5 space-y-2">
      ${alerts.map(a => `<button data-route="${a.route}" class="w-full text-left ${a.bg} border-l-4 px-4 py-3 rounded-lg flex items-center gap-3 ${a.hover} transition cursor-pointer">
        <span class="text-2xl">${a.icon}</span>
        <span class="flex-1">${a.text}</span>
        <span>→</span>
      </button>`).join('')}
    </div>`;

  // Stat card clickable - bấm vào navigate đến page tương ứng
  const stat = (icon, label, value, color, route) => `
    <button data-route="${route}" class="text-left bg-white rounded-xl p-5 border border-slate-200 flex items-center gap-4 shadow-sm hover:shadow-md hover:border-indigo-300 transition cursor-pointer w-full">
      <div class="w-12 h-12 rounded-xl grid place-items-center text-2xl ${color}">${icon}</div>
      <div class="flex-1">
        <div class="text-[11px] text-slate-500 uppercase tracking-wide font-semibold">${label}</div>
        <div class="text-2xl font-bold text-slate-900">${value}</div>
      </div>
      <div class="text-slate-400">→</div>
    </button>`;
  $('#content').innerHTML = `
    ${alertHtml}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${stat('👥','Tổng ứng viên', s.totalCandidates, 'bg-blue-100 text-blue-600', 'candidates')}
      ${stat('✉️','Email cần gửi hôm nay', s.todayEmails, 'bg-green-100 text-green-600', 'emails')}
      ${stat('📦','Order chờ xử lý', s.pendingOrders, 'bg-amber-100 text-amber-600', 'orders')}
      ${stat('⚠️','Checklist quá hạn', s.overdueChecks, 'bg-red-100 text-red-600', 'checklist')}
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-3 border-b border-slate-200">
        <div class="flex justify-between items-center gap-3 flex-wrap mb-2">
          <h2 class="font-bold text-slate-900 m-0">Sắp onboard 7 ngày tới</h2>
          <span class="text-xs text-slate-500">${s.upcoming.length} ứng viên</span>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <input id="dashSearch" type="text" class="field-input flex-1 min-w-[180px] max-w-xs" placeholder="🔍 Tên / đơn vị / vị trí..." value="${escapeHtml(dashSearch)}"/>
          <select id="dashDept" class="field-input" style="max-width:180px">
            <option value="all">Tất cả đơn vị</option>
            ${[...new Set(s.upcoming.map(c => c.department).filter(Boolean))].sort().map(d => `<option value="${escapeHtml(d)}" ${dashDeptFilter===d?'selected':''}>${escapeHtml(d)}</option>`).join('')}
          </select>
          <select id="dashProg" class="field-input" style="max-width:180px">
            <option value="all" ${dashProgressFilter==='all'?'selected':''}>Mọi tiến độ</option>
            <option value="none" ${dashProgressFilter==='none'?'selected':''}>0% (chưa làm)</option>
            <option value="low" ${dashProgressFilter==='low'?'selected':''}>1-49%</option>
            <option value="mid" ${dashProgressFilter==='mid'?'selected':''}>50-99%</option>
            <option value="high" ${dashProgressFilter==='high'?'selected':''}>100% (xong)</option>
          </select>
        </div>
      </div>
      ${(() => {
        let items = s.upcoming;
        // Search
        if (dashSearch) {
          const q = dashSearch.toLowerCase();
          items = items.filter(c => (c.full_name+' '+(c.job_title||'')+' '+(c.department||'')).toLowerCase().includes(q));
        }
        // Department filter
        if (dashDeptFilter !== 'all') {
          items = items.filter(c => c.department === dashDeptFilter);
        }
        // Progress filter
        if (dashProgressFilter !== 'all') {
          items = items.filter(c => {
            const pct = c.total_tasks ? (c.done_tasks/c.total_tasks*100) : 0;
            if (dashProgressFilter === 'none') return pct === 0;
            if (dashProgressFilter === 'low') return pct > 0 && pct < 50;
            if (dashProgressFilter === 'mid') return pct >= 50 && pct < 100;
            if (dashProgressFilter === 'high') return pct === 100;
            return true;
          });
        }
        // Sort
        items = [...items].sort((a, b) => {
          let av = a[dashSort.field], bv = b[dashSort.field];
          if (typeof av === 'string') { av = (av||'').toLowerCase(); bv = (bv||'').toLowerCase(); }
          if (av < bv) return dashSort.dir === 'asc' ? -1 : 1;
          if (av > bv) return dashSort.dir === 'asc' ? 1 : -1;
          return 0;
        });
        const ico = f => dashSort.field !== f ? '<span class="opacity-30">↕</span>' : dashSort.dir==='asc' ? '<span class="text-indigo-600">↑</span>' : '<span class="text-indigo-600">↓</span>';
        const th = (f, l) => `<th class="text-left px-5 py-3 cursor-pointer hover:bg-slate-100 select-none" data-dsort="${f}">${l} ${ico(f)}</th>`;
        if (items.length === 0) return '<div class="p-8 text-center text-slate-400">Không có ứng viên</div>';
        return `<table class="w-full text-sm">
          <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
            <tr>${th('full_name','Họ tên')}${th('department','Đơn vị')}${th('start_date','Ngày đi làm')}${th('done_tasks','Tiến độ')}<th></th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">${items.map(c => {
            const pct = c.total_tasks ? Math.round(c.done_tasks/c.total_tasks*100) : 0;
            return `<tr>
              <td class="px-5 py-3"><div class="flex items-center gap-3"><div class="avatar">${initials(c.full_name)}</div><div><div class="font-semibold text-slate-900">${escapeHtml(c.full_name)}</div><div class="text-xs text-slate-500">${escapeHtml(c.job_title||'')}</div></div></div></td>
              <td class="px-5 py-3">${escapeHtml(c.department||'-')}</td>
              <td class="px-5 py-3 font-semibold">${fmt(c.start_date)}</td>
              <td class="px-5 py-3" style="min-width:160px"><div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div><div class="text-xs text-slate-500 mt-1">${c.done_tasks}/${c.total_tasks} (${pct}%)</div></td>
              <td class="px-5 py-3"><button class="btn btn-secondary btn-sm" data-cid="${c.id}">Xem</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table>`;
      })()}
    </div>
  `;
  // Dashboard search + filter + sort handlers
  let dashTimer;
  $('#dashSearch') && ($('#dashSearch').oninput = e => {
    clearTimeout(dashTimer);
    dashTimer = setTimeout(() => { dashSearch = e.target.value; render(); }, 200);
  });
  $('#dashDept') && ($('#dashDept').onchange = e => { dashDeptFilter = e.target.value; render(); });
  $('#dashProg') && ($('#dashProg').onchange = e => { dashProgressFilter = e.target.value; render(); });
  $$('th[data-dsort]').forEach(h => h.onclick = () => {
    const f = h.dataset.dsort;
    if (dashSort.field === f) dashSort.dir = dashSort.dir === 'asc' ? 'desc' : 'asc';
    else { dashSort.field = f; dashSort.dir = 'asc'; }
    render();
  });
  $$('[data-cid]').forEach(b => b.onclick = () => navigate('candidates', { id:b.dataset.cid }));
};

// ═══════════ CANDIDATES ═══════════
let candidatesFilter = { search: '', status: 'all', department: 'all' };
let candidatesSort = { field: 'start_date', dir: 'desc' };
routes.candidates = async (id, tab) => {
  if (id) return renderCandidateDetail(id, tab);
  $('#pageTitle').textContent = 'Quản lý Ứng Viên';
  $('#topActions').innerHTML = `<button class="btn btn-primary" id="btnAdd">+ Thêm Ứng Viên</button>`;
  $('#btnAdd').onclick = () => openCandidateModal();
  const all = await api.get('/api/candidates');
  const today = todayStr();

  // Count theo status
  const counts = { all: all.length, upcoming: 0, active: 0, done: 0 };
  for (const c of all) {
    const diff = Math.round((new Date(today) - new Date(c.start_date))/86400000);
    if (diff < 0) counts.upcoming++;
    else if (diff <= 60) counts.active++;
    else counts.done++;
  }
  // List unique departments
  const departments = [...new Set(all.map(c => c.department).filter(Boolean))].sort();

  // Filter
  let filtered = all.filter(c => {
    if (candidatesFilter.search) {
      const q = candidatesFilter.search.toLowerCase();
      const fields = [c.full_name, c.personal_email, c.job_title, c.department, c.manager_name].join(' ').toLowerCase();
      if (!fields.includes(q)) return false;
    }
    if (candidatesFilter.status !== 'all') {
      const diff = Math.round((new Date(today) - new Date(c.start_date))/86400000);
      if (candidatesFilter.status === 'upcoming' && diff >= 0) return false;
      if (candidatesFilter.status === 'active' && (diff < 0 || diff > 60)) return false;
      if (candidatesFilter.status === 'done' && diff <= 60) return false;
    }
    if (candidatesFilter.department !== 'all' && c.department !== candidatesFilter.department) return false;
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    const fld = candidatesSort.field;
    let av = a[fld], bv = b[fld];
    if (typeof av === 'string') { av = (av || '').toLowerCase(); bv = (bv || '').toLowerCase(); }
    if (av < bv) return candidatesSort.dir === 'asc' ? -1 : 1;
    if (av > bv) return candidatesSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const chip = (key, label, count, color = 'bg-slate-100 text-slate-700') => {
    const active = candidatesFilter.status === key;
    const cls = active ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : color + ' border-transparent';
    return `<button class="status-chip border-2 px-3 py-1 rounded-full text-xs font-semibold cursor-pointer ${cls}" data-status="${key}">${label} <span class="ml-1 ${active?'opacity-100':'opacity-60'}">${count}</span></button>`;
  };

  // Sortable header helper
  const sortIcon = (field) => {
    if (candidatesSort.field !== field) return '<span class="opacity-30">↕</span>';
    return candidatesSort.dir === 'asc' ? '<span class="text-indigo-600">↑</span>' : '<span class="text-indigo-600">↓</span>';
  };
  const th = (field, label) => `<th class="text-left px-4 py-3 cursor-pointer hover:bg-slate-100 select-none" data-sort="${field}">${label} ${sortIcon(field)}</th>`;

  $('#content').innerHTML = `
    <div class="bg-white rounded-xl border border-slate-200 p-3 mb-4 flex gap-3 flex-wrap items-center">
      <div class="relative flex-1 min-w-[220px] max-w-md">
        <input id="searchInput" type="text" placeholder="🔍 Tìm theo tên, email, vị trí, đơn vị..." class="field-input pl-3" value="${escapeHtml(candidatesFilter.search)}"/>
      </div>
      <select id="deptSelect" class="field-input" style="max-width:200px">
        <option value="all">Tất cả đơn vị</option>
        ${departments.map(d => `<option value="${escapeHtml(d)}" ${candidatesFilter.department===d?'selected':''}>${escapeHtml(d)}</option>`).join('')}
      </select>
      <div class="flex gap-2 flex-wrap">
        ${chip('all','Tất cả', counts.all)}
        ${chip('upcoming','Sắp onboard', counts.upcoming, 'bg-blue-50 text-blue-700')}
        ${chip('active','Đang onboard', counts.active, 'bg-purple-50 text-purple-700')}
        ${chip('done','Hoàn thành', counts.done, 'bg-green-50 text-green-700')}
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      ${filtered.length === 0 ? `<div class="p-10 text-center text-slate-400">${all.length === 0 ? 'Chưa có ứng viên nào' : 'Không có ứng viên khớp filter'}</div>` : `
      <div class="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">Hiển thị <b>${filtered.length}</b> / ${all.length} ứng viên</div>
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
          <tr>
            ${th('full_name','Họ tên')}
            ${th('job_title','Vị trí')}
            ${th('department','Đơn vị')}
            ${th('start_date','Ngày đi làm')}
            <th class="text-left px-4 py-3">Trạng thái</th>
            ${th('sent_emails','Email gửi')}
            ${th('done_tasks','Checklist')}
            <th></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">${filtered.map(c => {
          const pct = c.total_tasks ? Math.round(c.done_tasks/c.total_tasks*100) : 0;
          const emailPct = c.total_emails ? Math.round(c.sent_emails/c.total_emails*100) : 0;
          const emailColor = c.sent_emails === c.total_emails ? 'text-green-600' : c.sent_emails > 0 ? 'text-amber-600' : 'text-slate-500';
          const st = candidateStatus(c.start_date);
          return `<tr class="hover:bg-slate-50">
            <td class="px-4 py-3"><div class="flex items-center gap-3"><div class="avatar">${initials(c.full_name)}</div><div><div class="font-semibold">${escapeHtml(c.full_name)}</div><div class="text-xs text-slate-500">${escapeHtml(c.personal_email)}</div></div></div></td>
            <td class="px-4 py-3"><div class="text-sm">${escapeHtml(c.job_title||'-')}</div><div class="text-xs text-slate-500">${escapeHtml(c.level||'')}</div></td>
            <td class="px-4 py-3">${escapeHtml(c.department||'-')}</td>
            <td class="px-4 py-3 font-semibold">${fmt(c.start_date)}</td>
            <td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-xs font-semibold ${st.cls}">${st.label}</span></td>
            <td class="px-4 py-3"><div class="flex items-center gap-2"><span class="font-bold ${emailColor}">${c.sent_emails}/${c.total_emails}</span><div class="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden min-w-[40px]"><div class="h-full bg-green-500" style="width:${emailPct}%"></div></div></div></td>
            <td class="px-4 py-3" style="min-width:120px"><div class="flex items-center gap-2"><span class="font-bold text-slate-700">${c.done_tasks}/${c.total_tasks}</span><div class="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden min-w-[40px]"><div class="h-full bg-indigo-500" style="width:${pct}%"></div></div></div></td>
            <td class="px-4 py-3 text-right whitespace-nowrap"><button class="btn btn-secondary btn-sm" data-view="${c.id}">Xem</button> <button class="btn btn-danger btn-sm" data-del="${c.id}">Xoá</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`}
    </div>
  `;

  // Search input (debounce 200ms)
  let searchTimer;
  $('#searchInput').oninput = e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      candidatesFilter.search = e.target.value;
      render();
    }, 200);
  };
  // Status chips
  $$('.status-chip').forEach(ch => ch.onclick = () => {
    candidatesFilter.status = ch.dataset.status;
    render();
  });
  // Department select
  $('#deptSelect').onchange = e => {
    candidatesFilter.department = e.target.value;
    render();
  };
  // Sortable headers
  $$('th[data-sort]').forEach(h => h.onclick = () => {
    const f = h.dataset.sort;
    if (candidatesSort.field === f) {
      candidatesSort.dir = candidatesSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      candidatesSort.field = f;
      candidatesSort.dir = 'asc';
    }
    render();
  });

  $$('[data-view]').forEach(b => b.onclick = () => navigate('candidates', { id:b.dataset.view }));
  $$('[data-del]').forEach(b => b.onclick = withLoading(async function () {
    const ok = await showConfirm({
      title: 'Xoá ứng viên?',
      message: 'Xoá ứng viên này sẽ xoá kèm theo: 8 email, 5 order, 44 checklist và 25 câu follow-up.\n\nHành động này KHÔNG thể hoàn tác.',
      icon: '🗑️',
      okLabel: 'Xoá ứng viên',
      danger: true
    });
    if (!ok) return;
    await api.del('/api/candidates/'+this.dataset.del);
    toast('Đã xoá','success'); render();
  }, 'Đang xoá...'));
};

const openCandidateModal = (existing) => {
  const c = existing || {};
  showModal({
    title: existing?'Sửa Ứng Viên':'Thêm Ứng Viên',
    body: `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label class="field-label">Họ và tên *</label><input id="f_full_name" class="field-input" value="${escapeHtml(c.full_name||'')}"/></div>
        <div><label class="field-label">Email cá nhân *</label><input id="f_personal_email" type="email" class="field-input" value="${escapeHtml(c.personal_email||'')}"/></div>
        <div><label class="field-label">SĐT</label><input id="f_phone" class="field-input" value="${escapeHtml(c.phone||'')}"/></div>
        <div><label class="field-label">Ngày đi làm *</label><input id="f_start_date" type="date" class="field-input" value="${c.start_date||todayStr()}"/></div>
        <div><label class="field-label">Chức danh</label><input id="f_job_title" class="field-input" placeholder="VD: Android Developer" value="${escapeHtml(c.job_title||'')}"/></div>
        <div><label class="field-label">Cấp bậc</label><input id="f_level" class="field-input" placeholder="VD: LX2, PM1, OX2..." value="${escapeHtml(c.level||'')}"/></div>
        <div><label class="field-label">Đơn vị / Venture</label><input id="f_department" class="field-input" placeholder="VD: Apero Headquarters" value="${escapeHtml(c.department||'')}"/></div>
        <div><label class="field-label">Quản lý trực tiếp</label><input id="f_manager_name" class="field-input" value="${escapeHtml(c.manager_name||'')}"/></div>
        <div class="md:col-span-2"><label class="field-label">Email quản lý (CC)</label><input id="f_manager_email" type="email" class="field-input" value="${escapeHtml(c.manager_email||'')}"/></div>
      </div>
    `,
    okLabel: existing?'Cập nhật':'Tạo & sinh lịch',
    onOk: async () => {
      const data = {};
      ['full_name','personal_email','phone','start_date','job_title','level','department','manager_name','manager_email'].forEach(k => data[k] = $('#f_'+k).value.trim());
      if (!data.full_name || !data.personal_email || !data.start_date) { toast('Nhập đủ trường bắt buộc','error'); return false; }
      const r = existing ? await api.put('/api/candidates/'+existing.id, data) : await api.post('/api/candidates', data);
      if (r.error) { toast(r.error,'error'); return false; }
      toast(existing?'Đã cập nhật':'Đã tạo & sinh lịch (7 email + 5 order + 43 checklist + 25 follow-up)','success');
      render(); return true;
    }
  });
};

// ═══════════ CANDIDATE DETAIL (5 tabs) ═══════════
const renderCandidateDetail = async (id, tab='emails') => {
  $('#pageTitle').textContent = 'Chi tiết Ứng Viên';
  $('#topActions').innerHTML = `<button class="btn btn-secondary" id="btnBack">← Danh sách</button>`;
  $('#btnBack').onclick = () => navigate('candidates');

  const c = await api.get('/api/candidates/'+id);
  const checks = await api.get(`/api/candidates/${id}/checklist`);
  const total = checks.length, done = checks.filter(x=>x.is_done).length;
  const pct = total ? Math.round(done/total*100) : 0;
  const st = candidateStatus(c.start_date);

  $('#content').innerHTML = `
    <div class="bg-white rounded-xl border border-slate-200 p-5 mb-5">
      <div class="flex flex-wrap gap-4 items-center">
        <div class="avatar avatar-lg">${initials(c.full_name)}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-3 flex-wrap"><h2 class="text-xl font-bold text-slate-900">${escapeHtml(c.full_name)}</h2><span class="px-2 py-0.5 rounded-full text-xs font-semibold ${st.cls}">${st.label}</span></div>
          <div class="text-sm text-slate-500">${escapeHtml(c.job_title||'-')} · ${escapeHtml(c.level||'-')} · ${escapeHtml(c.department||'-')} · ${fmt(c.start_date)}</div>
          <div class="text-xs text-slate-500 mt-1">📧 ${escapeHtml(c.personal_email)} · ☎️ ${escapeHtml(c.phone||'-')} · 👔 ${escapeHtml(c.manager_name||'-')}</div>
        </div>
        <div class="text-right">
          <div class="text-xs text-slate-500">Tiến độ checklist</div>
          <div class="text-2xl font-bold">${pct}%</div>
          <div class="progress" style="width:160px"><div class="progress-bar" style="width:${pct}%"></div></div>
        </div>
      </div>
    </div>

    <div class="tabs">
      <div class="tab ${tab==='emails'?'active':''}" data-tab="emails">📧 Email</div>
      <div class="tab ${tab==='orders'?'active':''}" data-tab="orders">📦 Order Bộ Phận</div>
      <div class="tab ${tab==='checklist'?'active':''}" data-tab="checklist">✅ Checklist (${done}/${total})</div>
      <div class="tab ${tab==='followup'?'active':''}" data-tab="followup">❓ Follow-up</div>
      <div class="tab ${tab==='info'?'active':''}" data-tab="info">ℹ️ Sửa thông tin</div>
    </div>
    <div id="tabBody"></div>
  `;
  $$('.tab').forEach(t => t.onclick = () => navigate('candidates', { id, tab:t.dataset.tab }));

  if (tab === 'emails') renderEmailsTab(id);
  else if (tab === 'orders') renderOrdersTab(id);
  else if (tab === 'checklist') renderChecklistTab(id, checks);
  else if (tab === 'followup') renderFollowupTab(id);
  else renderInfoTab(c);
};

const renderEmailsTab = async (cid) => {
  const emails = await api.get(`/api/candidates/${cid}/emails`);
  $('#tabBody').innerHTML = `<div class="bg-white rounded-xl border border-slate-200 p-5">
    <div class="timeline">${emails.map(e => `
      <div class="tl-item">
        <div class="tl-dot ${e.status}"></div>
        <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div class="flex justify-between items-start gap-2 flex-wrap">
            <div>
              <span class="ms-badge ${msClass(e.milestone)}">${e.milestone}</span>
              <span class="ml-2 text-xs font-semibold ${e.email_type==='department'?'text-amber-700':'text-blue-700'}">${e.email_type==='department'?'🏢 '+escapeHtml(e.receiver_label||'Bộ phận'):'👤 Ứng viên'}</span>
            </div>
            <span class="ms-badge st-${e.status}">${e.status}</span>
          </div>
          <div class="font-semibold mt-1">${escapeHtml(e.subject)}</div>
          <div class="text-xs text-slate-500 mt-1">📧 Tới: ${escapeHtml(e.receiver || '(chưa cấu hình)')} · 📅 ${fmt(e.scheduled_date)} ${e.sent_date?'· Đã gửi: '+fmtDT(e.sent_date):''}</div>
          ${e.error?`<div class="text-xs text-red-600 mt-1">❌ ${escapeHtml(e.error)}</div>`:''}
          <div class="flex gap-2 mt-2">
            <button class="btn btn-secondary btn-sm" data-prev="${e.id}">Preview</button>
            ${e.sent?'':'<button class="btn btn-primary btn-sm" data-send="'+e.id+'">Gửi ngay</button>'}
            <label class="flex items-center gap-1 text-xs text-slate-600 ml-2"><input type="checkbox" data-toggle="${e.id}" ${e.sent?'checked':''}/> Đã gửi (manual)</label>
          </div>
        </div>
      </div>`).join('')}</div></div>`;

  $$('[data-prev]').forEach(b => b.onclick = () => previewEmail(b.dataset.prev));
  $$('[data-send]').forEach(b => b.onclick = withLoading(async function () {
    const ok = await showConfirm({
      title: 'Gửi email ngay?',
      message: 'Email sẽ được gửi qua SMTP đã cấu hình. Bạn có chắc?',
      icon: '✉️',
      okLabel: 'Gửi ngay'
    });
    if (!ok) return;
    const r = await api.post(`/api/emails/${this.dataset.send}/send`);
    if (r.error) toast('❌ '+r.error,'error'); else { toast('✅ Đã gửi','success'); renderEmailsTab(cid); }
  }, 'Đang gửi...'));
  $$('[data-toggle]').forEach(cb => cb.onchange = async () => {
    await api.put('/api/emails/'+cb.dataset.toggle, { sent: cb.checked?1:0 });
    toast('💾 Đã lưu','success');
  });
};

const previewEmail = async (id) => {
  const e = await api.get(`/api/emails/${id}/preview`);
  showModal({
    title: 'Preview Email',
    lg: true,
    body: `
      <div class="text-xs text-slate-500 mb-1">Tới: <b>${escapeHtml(e.receiver_label||'')}</b> · ${escapeHtml(e.receiver||'(chưa có email)')}</div>
      <div class="font-semibold mb-3">${escapeHtml(e.subject)}</div>
      <pre class="bg-slate-50 border border-slate-200 p-3 rounded-lg text-sm whitespace-pre-wrap font-sans">${escapeHtml(e.body)}</pre>
    `,
    okLabel: null
  });
};

const renderOrdersTab = async (cid) => {
  const orders = await api.get(`/api/candidates/${cid}/orders`);
  $('#tabBody').innerHTML = `<div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
    <table class="w-full text-sm">
      <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
        <tr><th class="text-left px-5 py-3">Mốc</th><th class="text-left px-5 py-3">Order</th><th class="text-left px-5 py-3">Người phụ trách</th><th class="text-left px-5 py-3">Hạn</th><th class="text-left px-5 py-3">Đã gửi email</th><th class="text-left px-5 py-3">Đã xử lý</th><th class="text-left px-5 py-3">Ghi chú</th></tr>
      </thead>
      <tbody class="divide-y divide-slate-100">${orders.map(o => `
        <tr>
          <td class="px-5 py-3"><span class="ms-badge ${msClass(o.milestone)}">${o.milestone}</span></td>
          <td class="px-5 py-3"><div class="font-semibold">${escapeHtml(o.order_type)}</div><div class="text-xs text-slate-500">${escapeHtml(o.content||'')}</div></td>
          <td class="px-5 py-3">${escapeHtml(o.receiver)}</td>
          <td class="px-5 py-3 ${o.deadline<todayStr() && !o.processed ?'text-red-600 font-semibold':''}">${fmt(o.deadline)}</td>
          <td class="px-5 py-3"><label class="inline-flex items-center gap-2"><input type="checkbox" data-email="${o.id}" ${o.email_sent?'checked':''}/> ${o.email_sent_date?'<span class="text-xs text-slate-500">'+fmtDT(o.email_sent_date)+'</span>':''}</label></td>
          <td class="px-5 py-3"><label class="inline-flex items-center gap-2"><input type="checkbox" data-process="${o.id}" ${o.processed?'checked':''}/> ${o.processed_date?'<span class="text-xs text-slate-500">'+fmtDT(o.processed_date)+'</span>':''}</label></td>
          <td class="px-5 py-3"><input class="field-input text-xs" data-note="${o.id}" value="${escapeHtml(o.note||'')}" placeholder="Note..."/></td>
        </tr>`).join('')}</tbody>
    </table>
  </div>`;
  const upd = (id, body) => api.put('/api/orders/'+id, body);
  $$('[data-email]').forEach(cb => cb.onchange = async () => { await upd(cb.dataset.email, { email_sent: cb.checked?1:0 }); toast('💾','success'); renderOrdersTab(cid); });
  $$('[data-process]').forEach(cb => cb.onchange = async () => { await upd(cb.dataset.process, { processed: cb.checked?1:0 }); toast('💾','success'); renderOrdersTab(cid); });
  $$('[data-note]').forEach(inp => {
    let timer;
    inp.oninput = () => { clearTimeout(timer); timer = setTimeout(() => upd(inp.dataset.note, { note: inp.value }).then(()=>toast('💾','success')), 600); };
  });
};

const renderChecklistTab = (cid, checks) => {
  const order = ['D-7','D-5','D-3','D-2','D-1','D0','D+1','D+2','D+3','D+7','D+30','D+60'];
  const groups = {};
  for (const it of checks) (groups[it.milestone] = groups[it.milestone] || []).push(it);
  const assignees = Array.from(new Set(checks.map(c => c.assignee))).sort();

  $('#tabBody').innerHTML = `
    <div class="flex gap-2 mb-4 flex-wrap items-center bg-white rounded-xl border border-slate-200 p-3">
      <span class="text-xs font-semibold text-slate-500 mr-1">Lọc người phụ trách:</span>
      <span class="filter-chip active px-3 py-1 rounded-full text-xs font-semibold cursor-pointer bg-indigo-100 text-indigo-700 border border-indigo-300" data-asg="">Tất cả</span>
      ${assignees.map(a => `<span class="filter-chip px-3 py-1 rounded-full text-xs font-semibold cursor-pointer bg-slate-100 text-slate-700" data-asg="${escapeHtml(a)}">${escapeHtml(a)}</span>`).join('')}
    </div>
    ${order.filter(m => groups[m]).map(m => `
      <div class="bg-white rounded-xl border border-slate-200 mb-4 overflow-hidden">
        <div class="px-5 py-2 border-b border-slate-200 flex items-center gap-2"><span class="ms-badge ${msClass(m)}">${m}</span><span class="text-xs text-slate-500">${groups[m].length} đầu việc</span></div>
        <div class="p-3 space-y-2">${groups[m].map(it => {
          const overdue = !it.is_done && it.deadline < todayStr();
          return `<div class="cl-item flex items-center gap-3 p-3 border border-slate-200 rounded-lg ${it.is_done?'bg-green-50 border-green-200':''}" data-asg="${escapeHtml(it.assignee)}">
            <input type="checkbox" ${it.is_done?'checked':''} data-cid="${it.id}" class="w-4 h-4 accent-indigo-600 cursor-pointer"/>
            <div class="flex-1">
              <div class="font-medium ${it.is_done?'line-through text-slate-500':''}">${escapeHtml(it.task_name)}</div>
              <div class="text-xs text-slate-500">👤 ${escapeHtml(it.assignee)} · 📅 <span class="${overdue?'text-red-600 font-semibold':''}">${fmt(it.deadline)}${overdue?' (quá hạn)':''}</span></div>
            </div>
          </div>`;
        }).join('')}</div>
      </div>`).join('')}
  `;
  $$('input[type=checkbox][data-cid]').forEach(cb => cb.onchange = async () => {
    await api.put('/api/checklist/'+cb.dataset.cid, { is_done: cb.checked?1:0 });
    toast(cb.checked?'✅':'↺','success');
    renderCandidateDetail(cid, 'checklist');
  });
  $$('.filter-chip').forEach(ch => ch.onclick = () => {
    $$('.filter-chip').forEach(c => { c.classList.remove('active','bg-indigo-100','text-indigo-700','border-indigo-300'); c.classList.add('bg-slate-100','text-slate-700'); });
    ch.classList.add('active','bg-indigo-100','text-indigo-700','border-indigo-300'); ch.classList.remove('bg-slate-100','text-slate-700');
    const f = ch.dataset.asg;
    $$('.cl-item').forEach(it => it.style.display = (!f || it.dataset.asg === f) ? '' : 'none');
  });
};

const renderFollowupTab = async (cid) => {
  const items = await api.get(`/api/candidates/${cid}/followups`);
  const order = ['D+1','D+2','D+3','D+7','D+30','D+60'];
  const groups = {};
  for (const it of items) (groups[it.milestone] = groups[it.milestone] || []).push(it);

  $('#tabBody').innerHTML = order.filter(m => groups[m]).map(m => {
    const askedCount = groups[m].filter(x => x.asked).length;
    return `<div class="bg-white rounded-xl border border-slate-200 mb-4 overflow-hidden">
      <div class="px-5 py-2 border-b border-slate-200 flex items-center gap-2"><span class="ms-badge ${msClass(m)}">${m}</span><span class="text-xs text-slate-500">${askedCount}/${groups[m].length} đã hỏi</span></div>
      <div class="p-4 space-y-4">${groups[m].map((q,i) => `
        <div class="border-b border-slate-100 last:border-b-0 pb-4 last:pb-0">
          <div class="flex gap-2 items-start mb-2">
            <input type="checkbox" data-asked="${q.id}" ${q.asked?'checked':''} class="w-4 h-4 mt-1 accent-indigo-600 cursor-pointer" title="Đánh dấu đã hỏi"/>
            <div class="font-medium ${q.asked?'text-slate-500':''}"><b>${i+1}.</b> ${escapeHtml(q.question)}</div>
          </div>
          <textarea data-resp="${q.id}" placeholder="Phản hồi của ứng viên / ghi chú từ buổi check-in..." class="field-input text-sm" style="min-height:70px;font-family:inherit">${escapeHtml(q.response||'')}</textarea>
          ${q.asked_date?`<div class="text-xs text-slate-500 mt-1">✓ Đã hỏi lúc ${fmtDT(q.asked_date)}</div>`:''}
        </div>`).join('')}</div>
    </div>`;
  }).join('');

  $$('[data-asked]').forEach(cb => cb.onchange = async () => {
    await api.put('/api/followups/'+cb.dataset.asked, { asked: cb.checked?1:0 });
    toast('💾','success'); renderFollowupTab(cid);
  });
  $$('[data-resp]').forEach(ta => {
    let timer;
    ta.oninput = () => { clearTimeout(timer); timer = setTimeout(async () => { await api.put('/api/followups/'+ta.dataset.resp, { response: ta.value }); toast('💾 Đã lưu','success'); }, 700); };
  });
};

const renderInfoTab = (c) => {
  $('#tabBody').innerHTML = `<div class="bg-white rounded-xl border border-slate-200 p-5">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div><label class="field-label">Họ và tên</label><input id="i_full_name" class="field-input" value="${escapeHtml(c.full_name||'')}"/></div>
      <div><label class="field-label">Email cá nhân</label><input id="i_personal_email" class="field-input" value="${escapeHtml(c.personal_email||'')}"/></div>
      <div><label class="field-label">SĐT</label><input id="i_phone" class="field-input" value="${escapeHtml(c.phone||'')}"/></div>
      <div><label class="field-label">Ngày đi làm</label><input id="i_start_date" type="date" class="field-input" value="${c.start_date||''}"/></div>
      <div><label class="field-label">Chức danh</label><input id="i_job_title" class="field-input" value="${escapeHtml(c.job_title||'')}"/></div>
      <div><label class="field-label">Cấp bậc</label><input id="i_level" class="field-input" value="${escapeHtml(c.level||'')}"/></div>
      <div><label class="field-label">Đơn vị</label><input id="i_department" class="field-input" value="${escapeHtml(c.department||'')}"/></div>
      <div><label class="field-label">Quản lý</label><input id="i_manager_name" class="field-input" value="${escapeHtml(c.manager_name||'')}"/></div>
      <div class="md:col-span-2"><label class="field-label">Email quản lý (CC)</label><input id="i_manager_email" class="field-input" value="${escapeHtml(c.manager_email||'')}"/></div>
    </div>
    <div class="mt-5 flex gap-2"><button class="btn btn-primary" id="iSave">💾 Lưu</button></div>
  </div>`;
  $('#iSave').onclick = withLoading(async () => {
    const data = {};
    ['full_name','personal_email','phone','start_date','job_title','level','department','manager_name','manager_email'].forEach(k => data[k] = $('#i_'+k).value.trim());
    const r = await api.put('/api/candidates/'+c.id, data);
    if (r.error) toast(r.error,'error'); else { toast('✅ Đã lưu','success'); render(); }
  }, 'Đang lưu...');
};

// ═══════════ EMAILS PAGE (toàn hệ thống) ═══════════
let emailFilters = { status:'', email_type:'' };
routes.emails = async () => {
  $('#pageTitle').textContent = 'Lịch Email';
  const params = new URLSearchParams();
  if (emailFilters.status) params.set('status', emailFilters.status);
  if (emailFilters.email_type) params.set('email_type', emailFilters.email_type);
  const list = await api.get('/api/emails' + (params.toString()?'?'+params:''));

  const chip = (k, v, label) => `<span class="filter-chip px-3 py-1 rounded-full text-xs font-semibold cursor-pointer ${emailFilters[k]===v?'bg-indigo-100 text-indigo-700 border border-indigo-300':'bg-slate-100 text-slate-700'}" data-${k}="${v}">${label}</span>`;

  $('#content').innerHTML = `
    <div class="bg-white rounded-xl border border-slate-200 p-3 mb-4 flex gap-2 flex-wrap items-center">
      <span class="text-xs font-semibold text-slate-500">Trạng thái:</span>
      ${chip('status','','Tất cả')} ${chip('status','pending','Pending')} ${chip('status','sent','Sent')} ${chip('status','failed','Failed')}
      <span class="w-3"></span>
      <span class="text-xs font-semibold text-slate-500">Loại:</span>
      ${chip('email_type','','Tất cả')} ${chip('email_type','candidate','👤 Ứng viên')} ${chip('email_type','department','🏢 Bộ phận')}
    </div>
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      ${list.length===0?'<div class="p-10 text-center text-slate-400">Không có email</div>':`
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
          <tr><th class="text-left px-5 py-3 whitespace-nowrap" style="min-width:90px">Mốc</th><th class="text-left px-5 py-3 whitespace-nowrap" style="min-width:140px">Loại</th><th class="text-left px-5 py-3">Gửi tới</th><th class="text-left px-5 py-3">Liên quan UV</th><th class="text-left px-5 py-3">Tiêu đề</th><th class="text-left px-5 py-3 whitespace-nowrap">Lịch gửi</th><th class="text-left px-5 py-3 whitespace-nowrap">Trạng thái</th><th></th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">${list.map(e => `
          <tr>
            <td class="px-5 py-3 whitespace-nowrap"><span class="ms-badge ${msClass(e.milestone)}">${e.milestone}</span></td>
            <td class="px-5 py-3 whitespace-nowrap">${e.email_type==='department'?'🏢 Bộ phận':'👤 Ứng viên'}</td>
            <td class="px-5 py-3"><div class="font-medium">${escapeHtml(e.receiver_label||'')}</div><div class="text-xs text-slate-500">${escapeHtml(e.receiver||'(chưa có email)')}</div></td>
            <td class="px-5 py-3">${escapeHtml(e.full_name)}</td>
            <td class="px-5 py-3">${escapeHtml(e.subject)}</td>
            <td class="px-5 py-3">${fmt(e.scheduled_date)}${e.sent_date?'<div class="text-xs text-slate-500">'+fmtDT(e.sent_date)+'</div>':''}</td>
            <td class="px-5 py-3"><span class="ms-badge st-${e.status}">${e.status}</span>${e.error?'<div class="text-xs text-red-600 mt-1">'+escapeHtml(e.error)+'</div>':''}</td>
            <td class="px-5 py-3 text-right"><button class="btn btn-secondary btn-sm" data-prev="${e.id}">Preview</button> ${e.sent?'':'<button class="btn btn-primary btn-sm" data-send="'+e.id+'">Gửi ngay</button>'}</td>
          </tr>`).join('')}</tbody>
      </table>`}
    </div>
  `;
  $$('[data-status]').forEach(c => c.onclick = () => { emailFilters.status = c.dataset.status; render(); });
  $$('[data-email_type]').forEach(c => c.onclick = () => { emailFilters.email_type = c.dataset.email_type; render(); });
  $$('[data-prev]').forEach(b => b.onclick = () => previewEmail(b.dataset.prev));
  $$('[data-send]').forEach(b => b.onclick = withLoading(async function () {
    const ok = await showConfirm({
      title: 'Gửi email ngay?',
      message: 'Email sẽ được gửi qua SMTP đã cấu hình. Bạn có chắc?',
      icon: '✉️',
      okLabel: 'Gửi ngay'
    });
    if (!ok) return;
    const r = await api.post(`/api/emails/${this.dataset.send}/send`);
    if (r.error) toast('❌ '+r.error,'error'); else { toast('✅ Đã gửi','success'); render(); }
  }, 'Đang gửi...'));
};

// ═══════════ ORDERS PAGE (toàn hệ thống) ═══════════
let orderFilter = { receiver:'', status:'pending' };
routes.orders = async () => {
  $('#pageTitle').textContent = 'Order Bộ Phận';
  const params = new URLSearchParams();
  if (orderFilter.receiver) params.set('receiver', orderFilter.receiver);
  if (orderFilter.status) params.set('status', orderFilter.status);
  const list = await api.get('/api/orders' + (params.toString()?'?'+params:''));
  const chip = (k, v, label) => `<span class="filter-chip px-3 py-1 rounded-full text-xs font-semibold cursor-pointer ${orderFilter[k]===v?'bg-indigo-100 text-indigo-700 border border-indigo-300':'bg-slate-100 text-slate-700'}" data-${k}="${v}">${label}</span>`;

  $('#content').innerHTML = `
    <div class="bg-white rounded-xl border border-slate-200 p-3 mb-4 flex gap-2 flex-wrap items-center">
      <span class="text-xs font-semibold text-slate-500">Bộ phận:</span>
      ${chip('receiver','','Tất cả')} ${chip('receiver','HCNS','HCNS')} ${chip('receiver','MyNTH','MyNTH (IT)')} ${chip('receiver','HùngNX','HùngNX (IT)')} ${chip('receiver','PhươngHT','PhươngHT (C&B)')}
      <span class="w-3"></span>
      <span class="text-xs font-semibold text-slate-500">Trạng thái:</span>
      ${chip('status','','Tất cả')} ${chip('status','pending','⏳ Chờ xử lý')} ${chip('status','processed','✅ Đã xử lý')}
    </div>
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      ${list.length===0?'<div class="p-10 text-center text-slate-400">Không có order</div>':`
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
          <tr><th class="text-left px-5 py-3">Mốc</th><th class="text-left px-5 py-3">Order</th><th class="text-left px-5 py-3">Người phụ trách</th><th class="text-left px-5 py-3">Ứng viên</th><th class="text-left px-5 py-3">Hạn</th><th class="text-left px-5 py-3">Email gửi</th><th class="text-left px-5 py-3">Đã xử lý</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">${list.map(o => `
          <tr>
            <td class="px-5 py-3"><span class="ms-badge ${msClass(o.milestone)}">${o.milestone}</span></td>
            <td class="px-5 py-3"><div class="font-semibold">${escapeHtml(o.order_type)}</div><div class="text-xs text-slate-500">${escapeHtml(o.content||'')}</div></td>
            <td class="px-5 py-3">${escapeHtml(o.receiver)}</td>
            <td class="px-5 py-3"><a class="text-indigo-600 hover:underline" data-cid="${o.candidate_id}">${escapeHtml(o.full_name)}</a></td>
            <td class="px-5 py-3 ${o.deadline<todayStr() && !o.processed ?'text-red-600 font-semibold':''}">${fmt(o.deadline)}</td>
            <td class="px-5 py-3"><label class="inline-flex items-center gap-2"><input type="checkbox" data-email="${o.id}" ${o.email_sent?'checked':''}/> ${o.email_sent_date?'<span class="text-xs text-slate-500">'+fmtDT(o.email_sent_date)+'</span>':''}</label></td>
            <td class="px-5 py-3"><label class="inline-flex items-center gap-2"><input type="checkbox" data-process="${o.id}" ${o.processed?'checked':''}/> ${o.processed_date?'<span class="text-xs text-slate-500">'+fmtDT(o.processed_date)+'</span>':''}</label></td>
          </tr>`).join('')}</tbody>
      </table>`}
    </div>
  `;
  $$('[data-receiver]').forEach(c => c.onclick = () => { orderFilter.receiver = c.dataset.receiver; render(); });
  $$('[data-status]').forEach(c => c.onclick = () => { orderFilter.status = c.dataset.status; render(); });
  $$('[data-cid]').forEach(b => b.onclick = () => navigate('candidates', { id:b.dataset.cid, tab:'orders' }));
  $$('[data-email]').forEach(cb => cb.onchange = async () => { await api.put('/api/orders/'+cb.dataset.email, { email_sent: cb.checked?1:0 }); toast('💾','success'); render(); });
  $$('[data-process]').forEach(cb => cb.onchange = async () => { await api.put('/api/orders/'+cb.dataset.process, { processed: cb.checked?1:0 }); toast('💾','success'); render(); });
};

// ═══════════ CHECKLIST PAGE (overview) ═══════════
let checklistFilter = 'pending'; // 'all' | 'overdue' | 'today' | 'pending' | 'done' | 'skipped'
routes.checklist = async () => {
  $('#pageTitle').textContent = 'Checklist tổng hợp';
  const cands = await api.get('/api/candidates');
  const today = todayStr();
  const all = [];
  for (const c of cands) {
    const cs = await api.get('/api/candidates/'+c.id+'/checklist');
    for (const it of cs) all.push({ ...it, candidate: c });
  }
  // Phân loại
  const counts = { all: all.length, overdue: 0, today: 0, pending: 0, done: 0, skipped: 0 };
  for (const it of all) {
    if (it.is_skipped) counts.skipped++;
    else if (it.is_done) counts.done++;
    else {
      counts.pending++;
      if (it.deadline < today) counts.overdue++;
      else if (it.deadline === today) counts.today++;
    }
  }
  // Lọc theo filter
  const items = all.filter(it => {
    if (checklistFilter === 'all') return true;
    if (checklistFilter === 'skipped') return it.is_skipped;
    if (it.is_skipped) return false;
    if (checklistFilter === 'done') return it.is_done;
    if (it.is_done) return false; // còn lại chỉ là pending
    if (checklistFilter === 'pending') return true;
    if (checklistFilter === 'overdue') return it.deadline < today;
    if (checklistFilter === 'today') return it.deadline === today;
    return false;
  });
  // Sort theo deadline
  items.sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));

  const chip = (key, label, count, color = 'bg-slate-100 text-slate-700') => {
    const active = checklistFilter === key;
    const cls = active ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : color + ' border-transparent';
    return `<button class="filter-chip border-2 px-3 py-1 rounded-full text-xs font-semibold cursor-pointer ${cls}" data-filter="${key}">${label} <span class="ml-1 ${active?'opacity-100':'opacity-60'}">${count}</span></button>`;
  };

  const renderRow = it => `<tr class="${it.is_skipped?'opacity-40 line-through':''}">
    <td class="px-3 py-3 w-10"><input type="checkbox" class="row-check w-4 h-4 cursor-pointer" data-id="${it.id}" ${it.is_done||it.is_skipped?'disabled':''}/></td>
    <td class="px-3 py-3"><a class="text-indigo-600 hover:underline cursor-pointer" data-cid="${it.candidate.id}">${escapeHtml(it.candidate.full_name)}</a><div class="text-xs text-slate-500">${escapeHtml(it.candidate.department||'')}</div></td>
    <td class="px-3 py-3"><span class="ms-badge ${msClass(it.milestone)}">${it.milestone}</span></td>
    <td class="px-3 py-3">${escapeHtml(it.task_name)}</td>
    <td class="px-3 py-3">${escapeHtml(it.assignee)}</td>
    <td class="px-3 py-3 ${it.deadline<today&&!it.is_done&&!it.is_skipped?'text-red-600 font-semibold':''}">${fmt(it.deadline)}</td>
    <td class="px-3 py-3">${it.is_skipped?'<span class="text-slate-400">Đã xóa</span>':it.is_done?'<span class="text-green-600">✓ Done</span>':it.deadline<today?'<span class="text-red-600">Quá hạn</span>':it.deadline===today?'<span class="text-amber-600">Hôm nay</span>':'<span class="text-slate-500">Sắp tới</span>'}</td>
  </tr>`;

  $('#content').innerHTML = `
    <div class="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex gap-2 flex-wrap items-center">
      <span class="text-xs font-semibold text-slate-500 mr-2">Lọc:</span>
      ${chip('all','Tất cả', counts.all)}
      ${chip('pending','Chưa làm', counts.pending, 'bg-blue-50 text-blue-700')}
      ${chip('overdue','Quá hạn', counts.overdue, 'bg-red-50 text-red-700')}
      ${chip('today','Hôm nay', counts.today, 'bg-amber-50 text-amber-700')}
      ${chip('done','Đã xong', counts.done, 'bg-green-50 text-green-700')}
      ${chip('skipped','Đã xóa', counts.skipped, 'bg-slate-50 text-slate-500')}
    </div>

    <div id="bulkBar" class="hidden bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4 flex items-center gap-3">
      <span class="text-sm font-semibold text-indigo-900">Đã chọn <span id="selCount">0</span> items</span>
      <div class="flex-1"></div>
      <button id="bulkDone" class="btn btn-sm bg-green-600 hover:bg-green-700 text-white">✓ Đánh dấu Done</button>
      ${checklistFilter==='skipped'
        ? `<button id="bulkRestore" class="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white">↺ Khôi phục</button>`
        : `<button id="bulkDelete" class="btn btn-sm bg-red-600 hover:bg-red-700 text-white">🗑️ Xóa</button>`}
      <button id="bulkCancel" class="btn btn-sm btn-secondary">Hủy chọn</button>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      ${items.length === 0
        ? '<div class="p-12 text-center text-slate-400">Không có item nào</div>'
        : `<table class="w-full text-sm">
            <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-3 py-3 w-10"><input type="checkbox" id="checkAll" class="w-4 h-4 cursor-pointer"/></th>
                <th class="text-left px-3 py-3">Ứng viên</th>
                <th class="text-left px-3 py-3">Mốc</th>
                <th class="text-left px-3 py-3">Việc</th>
                <th class="text-left px-3 py-3">Phụ trách</th>
                <th class="text-left px-3 py-3">Hạn</th>
                <th class="text-left px-3 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">${items.map(renderRow).join('')}</tbody>
          </table>`}
    </div>
  `;

  // Filter chip click
  $$('.filter-chip').forEach(ch => ch.onclick = () => {
    checklistFilter = ch.dataset.filter;
    render();
  });

  // Navigate to candidate
  $$('[data-cid]').forEach(b => b.onclick = () => navigate('candidates', { id:b.dataset.cid, tab:'checklist' }));

  // Bulk selection
  const updateBulkBar = () => {
    const checked = $$('.row-check:checked');
    $('#selCount').textContent = checked.length;
    $('#bulkBar').classList.toggle('hidden', checked.length === 0);
  };
  $$('.row-check').forEach(cb => cb.onchange = updateBulkBar);
  const ckAll = $('#checkAll');
  if (ckAll) ckAll.onchange = () => {
    $$('.row-check:not(:disabled)').forEach(cb => cb.checked = ckAll.checked);
    updateBulkBar();
  };
  $('#bulkCancel') && ($('#bulkCancel').onclick = () => {
    $$('.row-check').forEach(cb => cb.checked = false);
    if (ckAll) ckAll.checked = false;
    updateBulkBar();
  });

  const getSelected = () => $$('.row-check:checked').map(c => c.dataset.id);

  $('#bulkDelete') && ($('#bulkDelete').onclick = withLoading(async () => {
    const ids = getSelected();
    if (ids.length === 0) return;
    const ok = await showConfirm({
      title: `Xóa ${ids.length} item?`,
      message: 'Các item này sẽ bị ẩn khỏi danh sách. Có thể khôi phục ở tab "Đã xóa".',
      icon: '🗑️',
      okLabel: `Xóa ${ids.length} item`,
      danger: true
    });
    if (!ok) return;
    await api.post('/api/checklist/bulk', { ids, action: 'skip' });
    toast(`✅ Đã xóa ${ids.length} item`, 'success');
    render();
  }, 'Đang xóa...'));

  $('#bulkDone') && ($('#bulkDone').onclick = withLoading(async () => {
    const ids = getSelected();
    if (ids.length === 0) return;
    await api.post('/api/checklist/bulk', { ids, action: 'done' });
    toast(`✅ Đã đánh dấu ${ids.length} item là Done`, 'success');
    render();
  }, 'Đang xử lý...'));

  $('#bulkRestore') && ($('#bulkRestore').onclick = withLoading(async () => {
    const ids = getSelected();
    if (ids.length === 0) return;
    await api.post('/api/checklist/bulk', { ids, action: 'restore' });
    toast(`✅ Đã khôi phục ${ids.length} item`, 'success');
    render();
  }, 'Đang xử lý...'));
};

// ═══════════ FOLLOW-UP PAGE (overview) ═══════════
routes.followup = async () => {
  $('#pageTitle').textContent = 'Câu hỏi Follow-up';
  const cands = await api.get('/api/candidates');
  const order = ['D+1','D+2','D+3','D+7','D+30','D+60'];
  // template structure (same for all candidates), show count
  const QUESTION_COUNTS = { 'D+1':5, 'D+2':3, 'D+3':3, 'D+7':5, 'D+30':4, 'D+60':5 };
  $('#content').innerHTML = `
    <div class="bg-white rounded-xl border border-slate-200 p-5 mb-5">
      <p class="text-sm text-slate-600 m-0">25 câu hỏi follow-up được tự động sinh cho mỗi ứng viên ở 6 mốc thời gian. Để chỉnh sửa câu trả lời cho 1 ứng viên cụ thể, vào trang chi tiết ứng viên → tab <b>Follow-up</b>.</p>
      <div class="grid grid-cols-2 md:grid-cols-6 gap-3 mt-4">
        ${order.map(m => `<div class="bg-slate-50 rounded-lg p-3 text-center"><span class="ms-badge ${msClass(m)}">${m}</span><div class="text-2xl font-bold mt-2">${QUESTION_COUNTS[m]}</div><div class="text-xs text-slate-500">câu hỏi</div></div>`).join('')}
      </div>
    </div>
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-3 border-b border-slate-200 font-bold">Tiến độ follow-up theo ứng viên</div>
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
          <tr><th class="text-left px-5 py-3">Ứng viên</th><th class="text-left px-5 py-3">Ngày đi làm</th><th class="text-left px-5 py-3">Trạng thái</th><th></th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">${cands.map(c => {
          const st = candidateStatus(c.start_date);
          return `<tr>
            <td class="px-5 py-3"><div class="flex items-center gap-3"><div class="avatar">${initials(c.full_name)}</div><div><div class="font-semibold">${escapeHtml(c.full_name)}</div><div class="text-xs text-slate-500">${escapeHtml(c.job_title||'')}</div></div></div></td>
            <td class="px-5 py-3">${fmt(c.start_date)}</td>
            <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-xs font-semibold ${st.cls}">${st.label}</span></td>
            <td class="px-5 py-3 text-right"><button class="btn btn-secondary btn-sm" data-cid="${c.id}">Mở Follow-up →</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  `;
  $$('[data-cid]').forEach(b => b.onclick = () => navigate('candidates', { id:b.dataset.cid, tab:'followup' }));
};

// ═══════════ EMAIL TEMPLATES PAGE ═══════════
routes.templates = async () => {
  $('#pageTitle').textContent = 'Mẫu Email';
  $('#topActions').innerHTML = `<button class="btn btn-secondary" id="btnResetAll">↺ Reset tất cả về mặc định</button>`;
  $('#btnResetAll').onclick = withLoading(async () => {
    const ok = await showConfirm({
      title: 'Reset tất cả templates?',
      message: 'Khôi phục TẤT CẢ 8 mẫu email về mặc định.\n\nMọi chỉnh sửa custom của bạn sẽ bị mất.',
      icon: '↺',
      okLabel: 'Reset tất cả',
      danger: true
    });
    if (!ok) return;
    await api.post('/api/email-templates/reset-all');
    toast('✅ Đã reset 7 templates','success'); render();
  }, 'Đang reset...');

  const list = await api.get('/api/email-templates');
  $('#content').innerHTML = `
    <div class="bg-white rounded-xl border border-slate-200 p-5 mb-5">
      <p class="text-sm text-slate-600 m-0">Quản lý 7 mẫu email tự động (E1-E7). Sửa subject / body bất kỳ → bấm <b>Lưu</b> → hệ thống hỏi có muốn áp dụng cho email <b>pending</b> hay không.</p>
      <p class="text-sm text-slate-600 mt-3 m-0"><b>Placeholder ứng viên:</b>
        <code>{{full_name}}</code> <code>{{job_title}}</code> <code>{{department}}</code> <code>{{manager_name}}</code> <code>{{level}}</code> <code>{{email}}</code> <code>{{phone}}</code>
      </p>
      <p class="text-sm text-slate-600 mt-2 m-0"><b>Placeholder ngày:</b>
        <code>{{start_date}}</code> <code>{{start_date_minus_1}}</code> <code>{{start_date_minus_5}}</code>
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${list.map(t => `
        <div class="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3 hover:border-indigo-300 hover:shadow-md transition">
          <div class="flex justify-between items-center">
            <div class="flex items-center gap-2">
              <span class="ms-badge ${msClass(t.milestone)}">${t.milestone}</span>
              <span class="text-xs text-slate-500">${t.email_type==='department'?'🏢 '+escapeHtml(t.receiver_label||'Bộ phận'):'👤 Ứng viên'}</span>
            </div>
            <span class="text-xs text-slate-400">${t.template_key} · offset ${t.day_offset>=0?'+':''}${t.day_offset}</span>
          </div>
          <div class="font-semibold text-slate-900 text-sm">${escapeHtml(t.subject)}</div>
          <div class="text-xs text-slate-600 line-clamp-3 whitespace-pre-line" style="display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(t.body.slice(0,260))}${t.body.length>260?'…':''}</div>
          <div class="flex justify-between items-center pt-2 border-t border-slate-100 mt-auto">
            <span class="text-xs text-slate-400">Cập nhật: ${fmtDT(t.updated_at)}</span>
            <button class="btn btn-primary btn-sm" data-edit="${t.template_key}">✏️ Sửa</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  $$('[data-edit]').forEach(b => b.onclick = () => openTemplateEditor(b.dataset.edit));
};

const openTemplateEditor = async (key) => {
  const t = await api.get('/api/email-templates/'+key);
  showModal({
    title: `Sửa Mẫu Email · ${t.template_key} (${t.milestone})`,
    lg: true,
    body: `
      <div><label class="field-label">Tiêu đề</label><input id="t_subject" class="field-input" value="${escapeHtml(t.subject)}"/></div>
      <div class="mt-3"><label class="field-label">Nội dung — placeholder: <code>{{full_name}}</code> <code>{{job_title}}</code> <code>{{department}}</code> <code>{{manager_name}}</code> <code>{{level}}</code> <code>{{email}}</code> <code>{{phone}}</code> <code>{{start_date}}</code> <code>{{start_date_minus_1}}</code> <code>{{start_date_minus_5}}</code></label>
        <textarea id="t_body" class="field-input" style="min-height:340px;font-family:'Consolas',monospace;font-size:12.5px">${escapeHtml(t.body)}</textarea>
      </div>
      <div class="mt-3" style="max-width:200px"><label class="field-label">Offset (ngày so với start_date)</label><input id="t_offset" type="number" class="field-input" value="${t.day_offset}"/></div>

      <hr class="my-4"/>
      <div class="flex gap-2 mb-2">
        <button class="btn btn-secondary btn-sm" id="t_preview">👁 Preview với data mẫu</button>
        <div class="flex-1"></div>
        <button class="btn btn-secondary btn-sm" id="t_reset" style="color:#dc2626">↺ Khôi phục mặc định</button>
      </div>
      <div id="t_preview_box" style="display:none">
        <div><label class="field-label">Tiêu đề (preview)</label><input id="t_preview_subject" class="field-input bg-slate-50" readonly/></div>
        <div class="mt-2"><label class="field-label">Nội dung (preview)</label>
          <pre id="t_preview_body" class="bg-slate-50 border border-slate-200 p-3 rounded-lg text-sm whitespace-pre-wrap font-sans" style="max-height:240px;overflow:auto"></pre>
        </div>
      </div>
    `,
    okLabel: 'Lưu',
    onOk: async () => {
      const data = {
        subject: $('#t_subject').value.trim(),
        body: $('#t_body').value,
        day_offset: Number($('#t_offset').value)
      };
      if (!data.subject || !data.body) { toast('Nhập đủ subject + body','error'); return false; }
      const r = await api.put('/api/email-templates/'+key, data);
      if (r.error) { toast(r.error,'error'); return false; }
      const apply = await showConfirm({
        title: `Đã lưu ${key} ✅`,
        message: `Áp dụng template mới cho TẤT CẢ email pending của ${key}?\n(không ảnh hưởng email đã gửi)`,
        icon: '🔄',
        okLabel: 'Áp dụng pending',
        cancelLabel: 'Chỉ áp dụng ứng viên mới'
      });
      if (apply) {
        const ar = await api.post('/api/email-templates/'+key+'/apply-pending');
        if (ar.ok) toast(`✅ Đã update ${ar.updated} email pending`,'success');
        else toast('Lỗi: '+(ar.error||''),'error');
      } else {
        toast('✅ Đã lưu (chỉ áp dụng ứng viên tạo mới)','success');
      }
      render(); return true;
    }
  });

  $('#t_preview').onclick = withLoading(async () => {
    const r = await api.post('/api/email-templates/'+key+'/preview', { subject:$('#t_subject').value, body:$('#t_body').value });
    $('#t_preview_subject').value = r.subject;
    $('#t_preview_body').textContent = r.body;
    $('#t_preview_box').style.display = '';
  }, 'Đang preview...');
  $('#t_reset').onclick = withLoading(async () => {
    const ok = await showConfirm({
      title: `Reset template ${key}?`,
      message: `Khôi phục về nội dung gốc của ${key}. Mọi chỉnh sửa custom sẽ mất.`,
      icon: '↺',
      okLabel: 'Reset',
      danger: true
    });
    if (!ok) return;
    const r = await api.post('/api/email-templates/'+key+'/reset');
    $('#t_subject').value = r.subject;
    $('#t_body').value = r.body;
    $('#t_offset').value = r.day_offset;
    toast('↺ Đã khôi phục mặc định','success');
  }, 'Đang reset...');
};

// ═══════════ DOCS PAGE ═══════════
routes.docs = async () => {
  $('#pageTitle').textContent = 'Tài Liệu & Link';
  const d = await api.get('/api/docs');
  const section = (icon, title, items) => `
    <div class="bg-white rounded-xl border border-slate-200 mb-4 overflow-hidden">
      <div class="px-5 py-3 border-b border-slate-200 font-bold">${icon} ${title}</div>
      <div class="p-3 space-y-2">${items.map(i => `<a class="block px-4 py-2 rounded-lg hover:bg-slate-50 border border-slate-200" href="${escapeHtml(i.url)}" target="_blank"><div class="font-semibold text-indigo-700">${escapeHtml(i.label)}</div>${i.purpose?'<div class="text-xs text-slate-600 mt-0.5">'+escapeHtml(i.purpose)+'</div>':''}<div class="text-xs text-slate-500 break-all mt-1">${escapeHtml(i.url)}</div></a>`).join('')}</div>
    </div>`;
  $('#content').innerHTML = `
    ${section('📋','Forms', d.forms||[])}
    ${section('📁','Drive / Tài liệu', d.drive||[])}
    ${section('💬','Discord Groups', d.discord||[])}
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-3 border-b border-slate-200 font-bold">👥 Nhân sự liên quan trong quy trình</div>
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
          <tr><th class="text-left px-5 py-3">Vai trò</th><th class="text-left px-5 py-3">Tên / Bộ phận</th><th class="text-left px-5 py-3">Trách nhiệm</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">${(d.people||[]).map(p => `<tr><td class="px-5 py-3 font-semibold">${escapeHtml(p.role)}</td><td class="px-5 py-3">${escapeHtml(p.name)}</td><td class="px-5 py-3 text-slate-600">${escapeHtml(p.responsibility)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
  `;
};

// ═══════════ SETTINGS PAGE ═══════════
routes.settings = async () => {
  $('#pageTitle').textContent = 'Cài Đặt';
  const s = await api.get('/api/settings');
  const fld = (id, label, value, ph='', type='text') => `<div><label class="field-label">${label}</label><input id="${id}" type="${type}" class="field-input" value="${escapeHtml(value||'')}" placeholder="${escapeHtml(ph)}"/></div>`;
  const fldPwd = (id, label, value, ph='') => `<div><label class="field-label">${label}</label><div class="relative"><input id="${id}" type="password" class="field-input pr-10" value="${escapeHtml(value||'')}" placeholder="${escapeHtml(ph)}"/><button type="button" class="toggle-pwd absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700" data-target="${id}" tabindex="-1" title="Hiện/ẩn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>`;

  $('#content').innerHTML = `
    <div class="bg-white rounded-xl border border-slate-200 p-5 mb-5">
      <h2 class="font-bold text-slate-900 mb-4">SMTP / Email gửi đi</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${fld('smtp_host','SMTP Host', s.smtp_host, 'smtp.gmail.com')}
        ${fld('smtp_port','SMTP Port', s.smtp_port, '587')}
        ${fld('smtp_user','SMTP User', s.smtp_user, 'haiht@apero.vn')}
        ${fldPwd('smtp_pass','SMTP Password / App Password', s.smtp_pass, 'App Password 16 ký tự (có/không space đều OK)')}
        ${fld('smtp_from_name','From Name', s.smtp_from_name, 'APERO HR')}
        ${fld('smtp_from_email','From Email', s.smtp_from_email, 'haiht@apero.vn')}
      </div>
      <div class="mt-4 flex gap-2 flex-wrap items-center">
        <button class="btn btn-primary" id="btnSave1">💾 Lưu cấu hình</button>
        <div class="flex-1"></div>
        <input id="testTo" class="field-input" style="max-width:300px" placeholder="email nhận test"/>
        <button class="btn btn-secondary" id="btnTest">📨 Gửi test</button>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 p-5 mb-5">
      <h2 class="font-bold text-slate-900 mb-2">Email các bộ phận liên quan</h2>
      <p class="text-sm text-slate-500 mb-4">Cấu hình email các bộ phận để hệ thống tự gửi reminder mỗi khi có ứng viên mới onboard.</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${fld('dept_hcns_email','HCNS / Backoffice (D-7 thiết bị + vé xe)', s.dept_hcns_email, 'hcns@apero.vn')}
        ${fld('dept_it_mynth_email','MyNTH — IT (D-5 email công ty)', s.dept_it_mynth_email, 'mynth@apero.vn')}
        ${fld('dept_it_hungnx_email','HùngNX — IT (D-5 Confluence)', s.dept_it_hungnx_email, 'hungnx@apero.vn')}
        ${fld('dept_cb_phuongth_email','PhươngHT — C&B (D-5 MISA + Username)', s.dept_cb_phuongth_email, 'phuongth@apero.vn')}
      </div>
      <div class="mt-4"><button class="btn btn-primary" id="btnSave2">💾 Lưu email bộ phận</button></div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 p-5 mb-5">
      <h2 class="font-bold text-slate-900 mb-4">Email Signature & Công ty</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${fld('company_name','Tên công ty', s.company_name, 'APERO Technologies Group')}
      </div>
      <div class="mt-4"><label class="field-label">Email signature (chữ ký mặc định)</label>
        <textarea id="email_signature" class="field-input" style="min-height:90px;font-family:inherit">${escapeHtml(s.email_signature||'')}</textarea>
      </div>
      <div class="mt-4"><button class="btn btn-primary" id="btnSave3">💾 Lưu</button></div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 p-5">
      <h2 class="font-bold text-slate-900 mb-1">Quản lý nâng cao</h2>
      <p class="text-sm text-slate-500 mb-4">Truy cập nhanh các trang quản lý chi tiết</p>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        ${[
          { route:'emails',    icon:'✉️',  label:'Lịch Email',         desc:'Toàn bộ 8 email theo ứng viên' },
          { route:'orders',    icon:'📦',  label:'Order Bộ Phận',      desc:'Tracking 5 order/ứng viên' },
          { route:'checklist', icon:'✅',  label:'Checklist',           desc:'44 đầu việc HR phải làm' },
          { route:'followup',  icon:'❓',  label:'Câu hỏi Follow-up',   desc:'25 câu hỏi tracking sau onboard' },
          { route:'templates', icon:'📝',  label:'Mẫu Email',           desc:'Sửa subject/body 8 templates' },
          { route:'docs',      icon:'📁',  label:'Tài Liệu & Link',    desc:'Forms, Drive, Discord, nhân sự' }
        ].map(m => `<button data-route="${m.route}" class="text-left bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 border border-slate-200 rounded-lg p-4 flex items-center gap-3 transition cursor-pointer">
          <span class="text-2xl">${m.icon}</span>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-slate-900">${m.label}</div>
            <div class="text-xs text-slate-500">${m.desc}</div>
          </div>
          <span class="text-slate-400">→</span>
        </button>`).join('')}
      </div>
    </div>
  `;
  const save = async () => {
    const data = {};
    ['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from_name','smtp_from_email','company_name','email_signature','dept_hcns_email','dept_it_mynth_email','dept_it_hungnx_email','dept_cb_phuongth_email'].forEach(k => {
      const el = $('#'+k); if (el) data[k] = el.value;
    });
    await api.put('/api/settings', data);
    toast('✅ Đã lưu','success');
  };
  const saveWrapped = withLoading(save, 'Đang lưu...');
  $('#btnSave1').onclick = saveWrapped;
  $('#btnSave2').onclick = saveWrapped;
  $('#btnSave3').onclick = saveWrapped;
  // Toggle hiện/ẩn password
  $$('.toggle-pwd').forEach(btn => {
    btn.onclick = () => {
      const inp = $('#' + btn.dataset.target);
      if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
    };
  });
  $('#btnTest').onclick = withLoading(async () => {
    const to = $('#testTo').value.trim();
    if (!to) return toast('Nhập email nhận test','error');
    // Gửi SMTP từ form trực tiếp — không cần Lưu trước
    const body = { to };
    ['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from_name','smtp_from_email','email_signature'].forEach(k => {
      const el = $('#'+k); if (el && el.value) body[k] = el.value;
    });
    const r = await api.post('/api/settings/test-email', body);
    if (r.error) toast('❌ '+r.error,'error'); else toast('✅ Đã gửi test tới '+to,'success');
  }, 'Đang gửi mail...');
};

// ═══════════ MODAL ═══════════
// Modal confirm thay thế cho native confirm() — trả Promise<bool>
const showConfirm = ({ title = 'Xác nhận', message, icon = '⚠️', okLabel = 'Đồng ý', cancelLabel = 'Hủy', danger = false } = {}) => {
  return new Promise(resolve => {
    const root = $('#modalRoot');
    const okClass = danger
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-indigo-600 hover:bg-indigo-700 text-white';
    root.innerHTML = `
      <div class="modal-overlay">
        <div class="modal" style="max-width:440px">
          <div class="p-5">
            <div class="flex gap-4 items-start mb-4">
              <div class="w-12 h-12 rounded-full grid place-items-center text-2xl ${danger ? 'bg-red-100' : 'bg-amber-100'} flex-shrink-0">${icon}</div>
              <div class="flex-1">
                <h3 class="font-bold text-lg m-0 mb-1 text-slate-900">${escapeHtml(title)}</h3>
                <div class="text-sm text-slate-600 whitespace-pre-line">${escapeHtml(message)}</div>
              </div>
            </div>
          </div>
          <div class="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
            <button class="btn btn-secondary" id="confirmCancel">${escapeHtml(cancelLabel)}</button>
            <button class="btn px-4 py-2 rounded-lg font-semibold ${okClass}" id="confirmOk">${escapeHtml(okLabel)}</button>
          </div>
        </div>
      </div>`;
    const done = (val) => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); resolve(val); };
    const onKey = (e) => {
      if (e.key === 'Escape') done(false);
      if (e.key === 'Enter') done(true);
    };
    document.addEventListener('keydown', onKey);
    $('#confirmCancel').onclick = () => done(false);
    $('#confirmOk').onclick = () => done(true);
    // Click backdrop → cancel
    $('.modal-overlay').onclick = (e) => { if (e.target === e.currentTarget) done(false); };
    // Auto focus OK button
    setTimeout(() => $('#confirmOk')?.focus(), 50);
  });
};

const showModal = ({ title, body, okLabel='Lưu', onOk, lg }) => {
  const root = $('#modalRoot');
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal ${lg?'lg':''}">
        <div class="px-5 py-4 border-b border-slate-200 flex justify-between items-center"><h3 class="font-bold text-lg m-0">${escapeHtml(title)}</h3><span class="text-2xl text-slate-400 cursor-pointer hover:text-slate-700 leading-none px-2" id="mClose">×</span></div>
        <div class="p-5">${body}</div>
        <div class="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <button class="btn btn-secondary" id="mCancel">Đóng</button>
          ${okLabel ? `<button class="btn btn-primary" id="mOk">${escapeHtml(okLabel)}</button>` : ''}
        </div>
      </div>
    </div>`;
  const close = () => root.innerHTML = '';
  $('#mClose').onclick = close; $('#mCancel').onclick = close;
  if (okLabel) $('#mOk').onclick = withLoading(async () => { const ok = await onOk(); if (ok !== false) close(); }, 'Đang xử lý...');
};

// ═══════════ BOOT ═══════════
render();
