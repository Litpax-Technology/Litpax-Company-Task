'use strict';
/* =================================================================
   Litpax Task Manager — frontend logic
   ================================================================= */

/* ---------------- State & constants ---------------- */
const S = {
  token: null, me: null, team: [], cfg: null, users: [], userMap: {}, projects: [], projMap: {},
  view: null, silent: false, taskCache: {}, pending: 0,
  board: null, tf: null, mw: null, apprTab: 'Pending', draft: null,
  cacheOnly: false, fresh: false, mutGen: 0, revalidating: {}, inflight: {},
  notifs: [], unread: 0, notifsLoaded: false, notifTimer: null
};
const DONE = 'Done';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ALL = ['Admin', 'Manager', 'Member'];
const MGR = ['Admin', 'Manager'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isAdmin = () => S.me && S.me.role === 'Admin';
const isMgr = () => S.me && MGR.includes(S.me.role);
const newReqId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('lt_' + k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('lt_' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('lt_' + k); } catch (e) {} }
};

/* ---------------- Speed: view cache (show saved data instantly, refresh in background) ---------------- */
const VC = { mem: {}, uid: '' };
const vcKey = (action, params) => action + '|' + JSON.stringify(params || {});
const vcLsKey = key => 'vc_' + VC.uid + '_' + key;
function vcGet(key) { return VC.mem[key] || null; }
function vcSet(key, val) { VC.mem[key] = val; store.set(vcLsKey(key), val); }
function vcLoadAll(uid) {
  VC.uid = uid; VC.mem = {};
  try {
    const pre = 'lt_vc_' + uid + '_';
    Object.keys(localStorage).filter(k => k.startsWith(pre)).forEach(k => {
      try { VC.mem[k.slice(pre.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) {}
    });
  } catch (e) {}
}
function vcClear() {
  VC.mem = {};
  try { Object.keys(localStorage).filter(k => k.startsWith('lt_vc_')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
}
/** Put an updated task into every cached task list, so all screens agree without a reload. */
function patchTask(t) {
  S.taskCache[t.TaskID] = t;
  Object.keys(VC.mem).forEach(k => {
    if (k.indexOf('listTasks|') !== 0) return;
    const r = VC.mem[k], i = r && r.rows ? r.rows.findIndex(x => x.TaskID === t.TaskID) : -1;
    if (i >= 0) { r.rows[i] = t; vcSet(k, r); }
  });
}

/* ---------------- Icons ---------------- */
const IC = {
  my: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
  board: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/></svg>',
  tasks: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  approvals: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 15l2 2 4-4"/></svg>',
  meeting: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
  templates: '<svg viewBox="0 0 24 24"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  projects: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
  screen: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>'
};

const NAV = [
  { id: 'my', label: 'My Tasks', roles: ALL },
  { id: 'board', label: 'Board', roles: ALL },
  { id: 'tasks', label: 'All Tasks', roles: MGR },
  { id: 'approvals', label: 'Approvals', roles: ALL },
  { id: 'meeting', label: 'Weekly Meeting', memberLabel: 'My Score', roles: ALL },
  { sec: 'Manage', roles: MGR },
  { id: 'templates', label: 'Recurring Tasks', roles: MGR },
  { id: 'projects', label: 'Projects', roles: MGR },
  { id: 'users', label: 'Employees', roles: ['Admin'] },
  { id: 'settings', label: 'Settings', roles: ['Admin'] }
];

/* =================================================================
   Dates (string based, local device time)
   ================================================================= */
const pad = n => String(n).padStart(2, '0');
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function ymd(s) { const p = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
function iso(d) { return d.toISOString().slice(0, 10); }
function addDays(s, n) { const d = ymd(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function mondayOf(s) { const d = ymd(s); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); }
function daysBetween(a, b) { return Math.round((ymd(b) - ymd(a)) / 86400000); }
function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function niceDate(s, withYear) {
  if (!s || !isDate(String(s).slice(0, 10))) return '—';
  const d = ymd(s);
  const y = withYear || d.getUTCFullYear() !== new Date().getFullYear() ? ' ' + d.getUTCFullYear() : '';
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + y;
}
function niceDateTime(s) { if (!s) return '—'; return niceDate(s) + ' ' + String(s).slice(11, 16); }
function weekLabel(ws) { return niceDate(ws) + ' – ' + niceDate(addDays(ws, 6), true); }
function dueText(t) {
  const today = todayStr();
  if (t.Status === DONE) return 'Done ' + niceDate(String(t.CompletedAt).slice(0, 10));
  if (t.DueDate === today) return 'Due today';
  if (t.DueDate === addDays(today, 1)) return 'Due tomorrow';
  if (t.DueDate < today) return 'Overdue · ' + daysBetween(t.DueDate, today) + 'd';
  return 'Due ' + niceDate(t.DueDate);
}

/* =================================================================
   API (JSONP)
   ================================================================= */
function api(action, params = {}) {
  return new Promise((resolve, reject) => {
    const cb = 'jp_' + newReqId();
    const s = document.createElement('script');
    let done = false;
    const timer = setTimeout(() => { finish(); reject(new Error('Request timed out. Please check your connection and try again.')); }, CONFIG.TIMEOUT_MS);
    function finish() {
      done = true; clearTimeout(timer); s.remove();
      window[cb] = () => {};                         // swallow late responses
      setTimeout(() => { delete window[cb]; }, 60000);
    }
    window[cb] = res => {
      if (done) return;
      finish();
      if (res && res.error === 'AUTH' && action !== 'login') { logout(true); reject(new Error(res.message)); return; }
      resolve(res || { ok: false, message: 'Empty response.' });
    };
    const q = new URLSearchParams();
    q.set('action', action); q.set('callback', cb);
    if (S.token) q.set('token', S.token);
    Object.keys(params).forEach(k => { if (params[k] !== undefined && params[k] !== null && params[k] !== '') q.set(k, params[k]); });
    s.src = CONFIG.API_URL + '?' + q.toString();
    s.onerror = () => { if (done) return; finish(); reject(new Error('Network error. Please try again.')); };
    document.body.appendChild(s);
  });
}
/** call() = api() that throws on ok:false */
async function call(action, params) {
  const r = await api(action, params);
  if (!r.ok) throw new Error(r.message || 'Something went wrong.');
  return r;
}

/* =================================================================
   UI helpers
   ================================================================= */
let toastTimer;
function toast(msg, ok = true) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast show ' + (ok ? 'ok' : 'bad');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, ok ? 2400 : 4200);
}

async function busy(btn, fn) {
  if (!btn || btn.dataset.busy) return;
  btn.dataset.busy = '1'; btn.disabled = true;
  const html = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span>';
  try { return await fn(); }
  finally { delete btn.dataset.busy; btn.disabled = false; btn.innerHTML = html; }
}

function modal({ title, body, foot = '', wide = false }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-x aria-label="Close">${IC.close}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  $('#modalRoot').appendChild(back);
  const onKey = e => { if (e.key === 'Escape') close(); };
  function close() {
    document.removeEventListener('keydown', onKey);
    const m = $('.modal', back);
    m.classList.add('closing');
    setTimeout(() => back.remove(), 170);
  }
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  $('[data-x]', back).onclick = close;
  document.addEventListener('keydown', onKey);
  const first = $('input:not([type=hidden]), textarea, select', back);
  if (first && window.innerWidth > 600) setTimeout(() => first.focus(), 60);
  return { el: back, close, q: s => $(s, back), qa: s => $$(s, back) };
}

function confirmBox(title, text, okLabel = 'Confirm', danger = true) {
  return new Promise(resolve => {
    const m = modal({
      title, body: `<p style="margin:0">${esc(text)}</p>`,
      foot: `<button class="btn btn-ghost" data-no>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(okLabel)}</button>`
    });
    let answered = false;
    m.q('[data-no]').onclick = () => { answered = true; m.close(); resolve(false); };
    m.q('[data-yes]').onclick = () => { answered = true; m.close(); resolve(true); };
    const obs = new MutationObserver(() => { if (!m.el.isConnected) { obs.disconnect(); if (!answered) resolve(false); } });
    obs.observe($('#modalRoot'), { childList: true });
  });
}

function skel(n = 6) { if (!S.silent) $('#page').innerHTML = '<div class="skeleton"></div>'.repeat(n); }

/**
 * Speed: returns saved data instantly when available and refreshes it in the background
 * (re-renders only if something changed). First visit shows a skeleton and waits.
 * opts.raw = caller handles skeleton + errors (throws on failure).
 */
async function fetchSWR(view, action, params, retry, opts = {}) {
  const key = vcKey(action, params);
  const hit = (S.fresh || opts.noCache) ? null : vcGet(key);
  if (hit) {
    if (!S.cacheOnly) revalidate(view, key, action, params);
    return hit;
  }
  if (opts.raw) { const r = await call(action, params); vcSet(key, r); return r; }
  skel(opts.skel);
  const r = await load(() => call(action, params), retry);
  if (r) vcSet(key, r);
  return r;
}
function revalidate(view, key, action, params) {
  if (S.revalidating[key]) return;
  S.revalidating[key] = true;
  const gen = S.mutGen;
  call(action, params).then(r => {
    if (gen !== S.mutGen) return;                      // a change happened meanwhile; this answer may be old
    const changed = JSON.stringify(r) !== JSON.stringify(vcGet(key));
    vcSet(key, r);
    if (changed && S.view === view) rerender();
  }).catch(() => {}).finally(() => { delete S.revalidating[key]; });
}
/** Re-draw the current screen from saved data only (no network). */
function rerender() {
  if (!S.me || !S.view) return;
  S.cacheOnly = true; S.silent = true;
  try { VIEWS[S.view](); } finally { S.cacheOnly = false; setTimeout(() => { S.silent = false; }, 0); }
}
function prefetch() {
  const jobs = [['listTasks', boardParams()], ['weeklyScores', meetingParams()], ['listRevisions', { status: 'Pending' }]];
  if (isMgr()) jobs.push(['listTemplates', {}]);
  const gen = S.mutGen;
  jobs.forEach(([a, p]) => call(a, p).then(r => { if (gen === S.mutGen) vcSet(vcKey(a, p), r); }).catch(() => {}));
}
function nowStamp() {
  const d = new Date();
  return todayStr() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

/** Runs a loader; on failure shows a retry screen. Returns result or null. */
async function load(fn, retry) {
  try { return await fn(); }
  catch (e) {
    if (!S.token) return null;
    $('#page').innerHTML = `<div class="card load-err fade-in"><div class="empty-ico">!</div>
      <p><b>Could not load data.</b></p><p class="muted">${esc(e.message)}</p>
      <button class="btn btn-primary" id="retryBtn">${IC.refresh} Try again</button></div>`;
    $('#retryBtn').onclick = () => retry();
    return null;
  }
}

function setTop(title, actionsHtml = '') {
  $('#pageTitle').textContent = title;
  $('#topActions').innerHTML = actionsHtml;
}
const newTaskBtn = () => isMgr() ? `<button class="btn btn-primary" id="newTaskBtn">${IC.plus}<span class="lbl">New Task</span></button>` : '';
function bindNewTask() { const b = $('#newTaskBtn'); if (b) b.onclick = () => taskForm(); }

function opts(list, sel, blank) {
  return (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') +
    list.map(o => {
      const v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o;
      return `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('');
}
function field(label, input, { req = false, full = false, hint = '' } = {}) {
  return `<div class="field ${full ? 'full' : ''}"><label>${esc(label)}${req ? ' <span class="req">*</span>' : ''}</label>${input}
    ${hint ? `<span class="faint small">${esc(hint)}</span>` : ''}<span class="field-err"></span></div>`;
}
function formData(form) { const o = {}; new FormData(form).forEach((v, k) => o[k] = String(v).trim()); return o; }
function showErrors(form, errs) {
  $$('.invalid', form).forEach(x => x.classList.remove('invalid'));
  $$('.field-err', form).forEach(x => x.textContent = '');
  Object.keys(errs).forEach(k => {
    const el = form.elements[k];
    if (!el) return;
    el.classList.add('invalid');
    const fe = el.closest('.field') && $('.field-err', el.closest('.field'));
    if (fe) fe.textContent = errs[k];
  });
  const firstKey = Object.keys(errs)[0];
  if (firstKey && form.elements[firstKey]) form.elements[firstKey].focus();
  return Object.keys(errs).length === 0;
}

const userName = id => (S.userMap[id] && S.userMap[id].Name) || (id ? id : '—');
const projName = id => (S.projMap[id] && S.projMap[id].Name) || '';
const initials = n => String(n || '?').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
function prioCls(p) {
  const i = (S.cfg.priorities || []).findIndex(x => x.name === p);
  return i === 0 ? 'p-hi' : i === 1 ? 'p-mid' : '';
}
function statusBadge(s) {
  const cls = s === DONE ? 'st-done' : s === S.cfg.statuses[0] ? '' : 'st-open';
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}
function assignable() { return isAdmin() ? S.users : S.users.filter(u => S.team.includes(u.UserID)); }
function canStatus(t) { return t.AssignedTo === S.me.id || canManage(t); }
function canManage(t) {
  if (isAdmin()) return true;
  return S.me.role === 'Manager' && (S.team.includes(t.AssignedTo) || t.AssignedBy === S.me.id);
}
function cacheTasks(rows) { rows.forEach(t => S.taskCache[t.TaskID] = t); }

function exportCSV(name, cols, rows) {
  const cell = v => {
    let s = String(v ?? '');
    if (typeof v !== 'number' && /^[=+\-@]/.test(s) && isNaN(Number(s))) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const csv = '﻿' + [cols.map(c => cell(c.l)).join(',')]
    .concat(rows.map(r => cols.map(c => cell(typeof c.k === 'function' ? c.k(r) : r[c.k])).join(','))).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name + '_' + todayStr() + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* =================================================================
   Auth & bootstrap
   ================================================================= */
async function doLogin(e) {
  e.preventDefault();
  const pin = $('#pin').value.trim(), err = $('#loginErr');
  err.textContent = '';
  if (!/^\d{4}$/.test(pin)) { loginError('Enter your 4-digit PIN.', false); return; }
  await busy($('#loginBtn'), async () => {
    try {
      const r = await api('login', { pin });
      if (!r.ok) { loginError(r.message || 'Login failed.', true); return; }
      S.token = r.token;
      store.set('session', { token: r.token });
      $('#pin').value = ''; renderPinSlots();
      startApp(r);                     // login already carries all startup data: no extra calls
    } catch (ex) { loginError(ex.message, false); }
  });
}

/* ---------------- Login screen: PIN boxes, keypad, greeting ---------------- */
const TOUCH = window.matchMedia && matchMedia('(pointer: coarse)').matches;
const PIN_LEN = 4;
function renderPinSlots() {
  const inp = $('#pin'), v = inp.value.replace(/\D/g, '').slice(0, PIN_LEN);
  if (inp.value !== v) inp.value = v;
  const focused = document.activeElement === inp || TOUCH;
  $$('#pinSlots .slot').forEach((s, i) => {
    s.classList.toggle('filled', i < v.length);
    s.classList.toggle('active', focused && i === v.length && v.length < PIN_LEN);
  });
}
/** 4th digit entered → sign in automatically */
function autoSubmitPin() {
  if ($('#pin').value.length === PIN_LEN && !$('#loginBtn').dataset.busy) setTimeout(() => $('#loginForm').requestSubmit(), 120);
}
function loginError(msg, wrongPin) {
  $('#loginErr').textContent = msg;
  const card = $('#loginCard'), field = $('.pin-field');
  card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
  field.classList.add('error');
  if (wrongPin) { $('#pin').value = ''; renderPinSlots(); }
  if (!TOUCH) $('#pin').focus();
}
function setGreeting() {
  const h = new Date().getHours();
  $('#loginGreet').textContent = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('.login-hint').textContent = 'Enter your 4-digit PIN';
}
(function initLoginUI() {
  const inp = $('#pin');
  if (TOUCH) inp.readOnly = true;                  // on phones the keypad is used, so the system keyboard stays closed
  const clearErr = () => { $('#loginErr').textContent = ''; $('.pin-field').classList.remove('error'); };
  inp.addEventListener('input', () => { clearErr(); renderPinSlots(); autoSubmitPin(); });
  inp.addEventListener('focus', renderPinSlots);
  inp.addEventListener('blur', renderPinSlots);
  $('#keypad').addEventListener('click', e => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    const k = b.dataset.k;
    if (k === 'back') inp.value = inp.value.slice(0, -1);
    else if (k === 'clear') inp.value = '';
    else if (inp.value.length < PIN_LEN) inp.value += k;
    clearErr(); renderPinSlots();
    if (k !== 'back' && k !== 'clear') autoSubmitPin();
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (x) {} }
  });
  setGreeting();
  renderPinSlots();
})();

/** Show the app from startup data (from login, init, or the last session's saved copy). */
function startApp(b) {
  applyBoot(b);
  vcLoadAll(S.me.id);
  if (b.my) vcSet(vcKey('listTasks', myParams()), b.my);
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  paintShell();
  setPending(b.pending || 0);
  setNotifs(b);
  startNotifPoll();
  S.cacheOnly = true;                  // data is fresh (or about to be refreshed by init): no duplicate fetch
  try { route(); } finally { S.cacheOnly = false; }
  setTimeout(prefetch, 400);
}

function paintShell() {
  $('#meName').textContent = S.me.name;
  $('#meRole').textContent = S.me.role + (S.me.dept ? ' · ' + S.me.dept : '');
  $('#meAvatar').textContent = initials(S.me.name);
  buildNav();
  setPending(S.pending);
}

function applyBoot(r) {
  S.me = r.me; S.team = r.team; S.cfg = r.config; S.users = r.users; S.projects = r.projects;
  S.userMap = {}; r.users.forEach(u => S.userMap[u.UserID] = u);
  S.projMap = {}; r.projects.forEach(p => S.projMap[p.ProjectID] = p);
  store.set('boot', { me: r.me, team: r.team, config: r.config, users: r.users, projects: r.projects, pending: S.pending });
}
async function reloadBoot() { applyBoot(await call('bootstrap')); }

function setPending(n) {
  S.pending = n;
  const b = $('#nav [data-id="approvals"] .nav-badge');
  if (b) { b.textContent = n; b.classList.toggle('hidden', !n); }
}

function logout(expired) {
  S.token = null; S.me = null;
  store.del('session'); store.del('boot');
  vcClear(); S.taskCache = {}; S.board = S.tf = S.mw = null;
  stopNotifPoll(); S.notifs = []; S.notifsLoaded = false; setUnread(0); $('#bellPanel').classList.add('hidden');
  $('#appView').classList.add('hidden');
  $('#loginView').classList.remove('hidden');
  $('#modalRoot').innerHTML = '';
  document.body.classList.remove('present');
  if (expired) $('#loginErr').textContent = 'Session expired. Please log in again.';
  setTimeout(() => $('#pin').focus(), 50);
}

/* =================================================================
   Navigation
   ================================================================= */
function buildNav() {
  $('#nav').innerHTML = NAV.filter(n => n.roles.includes(S.me.role)).map(n => n.sec
    ? `<div class="nav-sec">${esc(n.sec)}</div>`
    : `<a class="nav-item" data-id="${n.id}" href="#${n.id}">${IC[n.id]}<span>${esc(S.me.role === 'Member' && n.memberLabel ? n.memberLabel : n.label)}</span>
       ${n.id === 'approvals' ? '<span class="nav-badge hidden">0</span>' : ''}</a>`).join('');
}

const VIEWS = {
  my: viewMy, board: viewBoard, tasks: viewTasks, approvals: viewApprovals, meeting: viewMeeting,
  templates: viewTemplates, projects: viewProjects, users: viewUsers, settings: viewSettings
};

function route() {
  if (!S.me) return;
  let id = location.hash.replace('#', '') || 'my';
  const n = NAV.find(x => x.id === id);
  if (!n || !n.roles.includes(S.me.role)) id = 'my';
  S.view = id;
  $$('#nav .nav-item').forEach(a => a.classList.toggle('active', a.dataset.id === id));
  closeSidebar();
  const page = $('#page');
  page.style.animation = 'none'; void page.offsetWidth; page.style.animation = '';
  S.silent = false;
  VIEWS[id]();
}
/** After a save: fetch fresh data for the current screen, keeping it on screen meanwhile (no skeleton flash). */
function refresh() {
  if (!S.me) return Promise.resolve();
  S.mutGen++; S.silent = true; S.fresh = true;
  let p;
  try { p = VIEWS[S.view](); } finally { S.fresh = false; setTimeout(() => { S.silent = false; }, 0); }
  return Promise.resolve(p);
}

/** Refresh button: fresh data for this screen + badge/users in parallel. */
async function manualRefresh() {
  const b = $('#refreshBtn');
  if (!S.me || b.classList.contains('spin')) return;
  b.classList.add('spin');
  try {
    await Promise.all([
      refresh(),
      call('init').then(r => { applyBoot(r); vcSet(vcKey('listTasks', myParams()), r.my); setPending(r.pending || 0); setNotifs(r); }).catch(() => {})
    ]);
    toast('Updated');
  } finally { b.classList.remove('spin'); }
}

function closeSidebar() { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); }

/* =================================================================
   VIEW: My Tasks
   ================================================================= */
const myParams = () => ({ scope: 'my', active: '1', pageSize: 1000 });
async function viewMy() {
  setTop('My Tasks', newTaskBtn()); bindNewTask();
  const r = await fetchSWR('my', 'listTasks', myParams(), viewMy);
  if (!r || S.view !== 'my') return;
  cacheTasks(r.rows);
  const today = todayStr(), ws = mondayOf(today), we = addDays(ws, 6);
  const rows = r.rows, open = rows.filter(t => t.Status !== DONE);
  const overdue = open.filter(t => t.DueDate < today);
  const dueToday = open.filter(t => t.DueDate === today);
  const week = open.filter(t => t.DueDate > today && t.DueDate <= we);
  const later = open.filter(t => t.DueDate > we);
  const doneWk = rows.filter(t => t.Status === DONE);
  const sc = quickScore(rows.filter(t => t.DueDate >= ws && (t.DueDate < today || (t.DueDate === today && t.Status === DONE))));

  const section = (title, list, emptyText) => `
    <div class="sec-title">${esc(title)} <span class="count">${list.length}</span></div>
    ${list.length ? `<div class="tlist">${list.map(t => taskRow(t)).join('')}</div>`
                  : emptyText ? `<div class="card empty small">${esc(emptyText)}</div>` : ''}`;

  $('#page').innerHTML = `
    <div class="kpis">
      <div class="card kpi ${overdue.length ? 'alert' : ''}"><div class="kpi-label">Overdue</div><div class="kpi-value">${overdue.length}</div></div>
      <div class="card kpi"><div class="kpi-label">Due Today</div><div class="kpi-value">${dueToday.length}</div></div>
      <div class="card kpi"><div class="kpi-label">Rest of Week</div><div class="kpi-value">${week.length}</div></div>
      <div class="card kpi"><div class="kpi-label">Done This Week</div><div class="kpi-value">${doneWk.length}</div></div>
      <div class="card kpi accent"><div class="kpi-label">Week Score (to date)</div>
        <div class="kpi-value">${fmtPct(sc.nd)} <span class="small muted">/ ${fmtPct(sc.late)}</span></div>
        <div class="kpi-sub">Not done / Not on time · ${sc.P} planned</div></div>
    </div>
    ${!rows.length ? `<div class="card empty mt"><div class="empty-ico">✓</div>You have no tasks right now.</div>` : `
    ${overdue.length ? section('Overdue', overdue) : ''}
    ${section('Today', dueToday, 'Nothing due today.')}
    ${week.length ? section('This Week', week) : ''}
    ${later.length ? section('Later', later) : ''}
    ${doneWk.length ? section('Completed This Week', doneWk.slice().sort((a, b) => String(b.CompletedAt).localeCompare(String(a.CompletedAt)))) : ''}`}`;
}

/** Same formulas as the server, for a quick personal view */
function quickScore(list) {
  const P = list.length;
  const D = list.filter(t => t.Status === DONE).length;
  const O = list.filter(t => t.Status === DONE && String(t.CompletedAt).slice(0, 10) <= t.DueDate).length;
  return { P, nd: P ? -Math.round((P - D) / P * 1000) / 10 : 0, late: P ? -Math.round((P - O) / P * 1000) / 10 : 0 };
}
function fmtPct(v) { if (v === '' || v === null || v === undefined) return '—'; const n = Number(v); return (n === 0 ? '0' : n.toFixed(1).replace(/\.0$/, '')) + '%'; }

function taskRow(t, { showAssignee = false } = {}) {
  const done = t.Status === DONE, od = !done && t.DueDate < todayStr();
  return `<div class="trow ${od ? 'is-overdue' : ''} ${done ? 'is-done' : ''}" data-open="${esc(t.TaskID)}">
    ${canStatus(t) ? `<button class="check ${done ? 'on' : ''}" data-tick="${esc(t.TaskID)}" title="${done ? 'Reopen' : 'Mark as done'}" aria-label="Toggle done"></button>` : ''}
    <div class="trow-main">
      <div class="trow-title">${esc(t.Title)}</div>
      <div class="trow-meta">
        <span class="prio ${prioCls(t.Priority)}">${esc(t.Priority)}</span>
        <span class="${od ? 'txt-bad' : ''}">${esc(dueText(t))}</span>
        ${showAssignee ? `<span>${esc(userName(t.AssignedTo))}</span>` : ''}
        ${t.ProjectID ? `<span>${esc(projName(t.ProjectID))}</span>` : ''}
        ${t.Type && t.Type !== 'One-time' ? `<span class="tag">${esc(t.Type)}</span>` : ''}
        ${Number(t.Revisions) > 0 ? `<span class="tag">Revised ×${esc(t.Revisions)}</span>` : ''}
      </div>
    </div>
    ${statusBadge(t.Status)}
  </div>`;
}

function toggleDone(id) {
  const t = S.taskCache[id];
  if (!t) return;
  const next = t.Status === DONE ? S.cfg.statuses[0] : DONE;
  setStatus(t, next, next === DONE ? 'Marked as done' : 'Task reopened');
}

/** Speed: update the screen instantly, save in the background, undo on failure. */
async function setStatus(t, next, okMsg) {
  if (S.inflight[t.TaskID] || t.Status === next) return;
  const prev = Object.assign({}, t);
  S.inflight[t.TaskID] = true;
  S.mutGen++;
  patchTask(Object.assign({}, t, {
    Status: next,
    CompletedAt: next === DONE ? nowStamp() : (t.Status === DONE ? '' : t.CompletedAt)
  }));
  rerender();
  try {
    const r = await call('updateStatus', { id: t.TaskID, status: next, reqId: newReqId() });
    patchTask(r.task);
    toast(okMsg || 'Status updated');
  } catch (e) {
    patchTask(prev);
    toast(e.message + ' Change undone.', false);
  } finally {
    delete S.inflight[t.TaskID];
    S.mutGen++;
    rerender();
  }
}

/* =================================================================
   VIEW: Board (Kanban)
   ================================================================= */
function boardParams() {
  const f = S.board || (S.board = { scope: isMgr() ? 'team' : 'my', projectId: '', assignee: '' });
  return { scope: f.scope === 'all' ? '' : f.scope, projectId: f.projectId, assignee: f.assignee, active: '1', pageSize: 2000 };
}
async function viewBoard() {
  const params = boardParams(), f = S.board;
  setTop('Board', newTaskBtn()); bindNewTask();
  const r = await fetchSWR('board', 'listTasks', params, viewBoard, { skel: 4 });
  if (!r || S.view !== 'board') return;
  cacheTasks(r.rows);

  const scopeOpts = [{ v: 'my', l: 'My tasks' }];
  if (isMgr()) scopeOpts.push({ v: 'team', l: 'My team' });
  if (isAdmin()) scopeOpts.push({ v: 'all', l: 'Everyone' });
  const cols = S.cfg.statuses.map(st => {
    const list = r.rows.filter(t => t.Status === st);
    return `<div class="col" data-status="${esc(st)}">
      <div class="col-head"><span>${esc(st)}</span><span class="badge">${list.length}</span></div>
      <div class="col-body">${list.map(boardCard).join('') || '<div class="faint small center" style="padding:16px 0">No tasks</div>'}</div></div>`;
  }).join('');

  $('#page').innerHTML = `
    <div class="filters">
      ${scopeOpts.length > 1 ? `<select class="select" id="bScope">${opts(scopeOpts, f.scope)}</select>` : ''}
      <select class="select" id="bProject">${opts(S.projects.map(p => ({ v: p.ProjectID, l: p.Name })), f.projectId, 'All projects')}</select>
      ${isMgr() ? `<select class="select" id="bAssignee">${opts(assignable().map(u => ({ v: u.UserID, l: u.Name })), f.assignee, 'All employees')}</select>` : ''}
      <span class="faint small">Drag cards between columns to change status. Done shows this week only.</span>
    </div>
    <div class="board">${cols}</div>`;

  const onF = () => {
    f.scope = $('#bScope') ? $('#bScope').value : f.scope;
    f.projectId = $('#bProject').value;
    f.assignee = $('#bAssignee') ? $('#bAssignee').value : '';
    viewBoard();
  };
  ['#bScope', '#bProject', '#bAssignee'].forEach(s => { const el = $(s); if (el) el.onchange = onF; });
  bindDrag();
}

function boardCard(t) {
  const od = t.Status !== DONE && t.DueDate < todayStr();
  return `<div class="tcard ${od ? 'is-overdue' : ''}" data-open="${esc(t.TaskID)}" data-id="${esc(t.TaskID)}" draggable="${canStatus(t)}">
    <div class="tcard-top"><span class="prio ${prioCls(t.Priority)}">${esc(t.Priority)}</span>
      ${t.Type && t.Type !== 'One-time' ? `<span class="tag">${esc(t.Type)}</span>` : ''}</div>
    <div class="tcard-title">${esc(t.Title)}</div>
    <div class="tcard-meta"><span>${esc(userName(t.AssignedTo))}</span><span class="${od ? 'txt-bad' : ''}">${esc(dueText(t))}</span></div>
  </div>`;
}

function bindDrag() {
  let dragId = null;
  $$('.tcard[draggable="true"]').forEach(c => {
    c.addEventListener('dragstart', e => { dragId = c.dataset.id; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
    c.addEventListener('dragend', () => { c.classList.remove('dragging'); $$('.col').forEach(x => x.classList.remove('drag-over')); });
  });
  $$('.col').forEach(col => {
    col.addEventListener('dragover', e => { if (dragId) { e.preventDefault(); col.classList.add('drag-over'); } });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
    col.addEventListener('drop', async e => {
      e.preventDefault(); col.classList.remove('drag-over');
      const id = dragId; dragId = null;
      const t = S.taskCache[id], st = col.dataset.status;
      if (!t || t.Status === st) return;
      setStatus(t, st, 'Moved to ' + st);
    });
  });
}

/* =================================================================
   VIEW: All Tasks (table, filters, export)
   ================================================================= */
async function viewTasks() {
  const f = S.tf || (S.tf = { q: '', status: '', projectId: '', assignee: '', priority: '', from: '', to: '', overdue: '', page: 1 });
  setTop('All Tasks', `<button class="btn btn-ghost" id="expBtn">${IC.download}<span class="lbl">Export CSV</span></button>${newTaskBtn()}`);
  bindNewTask();
  $('#expBtn').onclick = e => busy(e.currentTarget, async () => {
    try {
      const r = await call('listTasks', { ...filterParams(f), page: 1, pageSize: 2000 });
      exportCSV('Tasks', [
        { l: 'Task ID', k: 'TaskID' }, { l: 'Title', k: 'Title' }, { l: 'Description', k: 'Description' },
        { l: 'Project', k: t => projName(t.ProjectID) }, { l: 'Assigned To', k: t => userName(t.AssignedTo) },
        { l: 'Assigned By', k: t => userName(t.AssignedBy) }, { l: 'Priority', k: 'Priority' }, { l: 'Status', k: 'Status' },
        { l: 'Type', k: 'Type' }, { l: 'Due Date', k: 'DueDate' }, { l: 'Original Due', k: 'OriginalDueDate' },
        { l: 'Completed At', k: 'CompletedAt' }, { l: 'Revisions', k: 'Revisions' }, { l: 'Created At', k: 'CreatedAt' }
      ], r.rows);
      toast('Exported ' + r.rows.length + ' tasks');
    } catch (ex) { toast(ex.message, false); }
  });

  if (!$('#tFilters')) {
    $('#page').innerHTML = `
      <div class="filters" id="tFilters">
        <input class="input search" id="tQ" placeholder="Search title, description or ID…" value="${esc(f.q)}" />
        <select class="select" id="tStatus">${opts(S.cfg.statuses, f.status, 'All statuses')}</select>
        <select class="select" id="tProject">${opts(S.projects.map(p => ({ v: p.ProjectID, l: p.Name })), f.projectId, 'All projects')}</select>
        <select class="select" id="tAssignee">${opts(assignable().map(u => ({ v: u.UserID, l: u.Name })), f.assignee, 'All employees')}</select>
        <select class="select" id="tPriority">${opts(S.cfg.priorities.map(p => p.name), f.priority, 'All priorities')}</select>
        <input class="input" type="date" id="tFrom" value="${esc(f.from)}" title="Due from" />
        <input class="input" type="date" id="tTo" value="${esc(f.to)}" title="Due to" />
        <label class="row small"><input type="checkbox" id="tOverdue" ${f.overdue ? 'checked' : ''}/> Overdue only</label>
      </div>
      <div id="tResult"></div>`;
    let timer;
    $('#tQ').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { f.q = e.target.value.trim(); f.page = 1; loadTaskTable(); }, 350); });
    const map = { tStatus: 'status', tProject: 'projectId', tAssignee: 'assignee', tPriority: 'priority', tFrom: 'from', tTo: 'to' };
    Object.keys(map).forEach(id => $('#' + id).onchange = e => { f[map[id]] = e.target.value; f.page = 1; loadTaskTable(); });
    $('#tOverdue').onchange = e => { f.overdue = e.target.checked ? '1' : ''; f.page = 1; loadTaskTable(); };
  }
  return loadTaskTable();
}

function filterParams(f) {
  return { q: f.q, status: f.status, projectId: f.projectId, assignee: f.assignee, priority: f.priority, from: f.from, to: f.to, overdue: f.overdue };
}

async function loadTaskTable() {
  const f = S.tf, box = $('#tResult');
  if (!box) return;
  const params = { ...filterParams(f), page: f.page, pageSize: CONFIG.PAGE_SIZE };
  if (!S.silent && (S.fresh || !vcGet(vcKey('listTasks', params)))) box.innerHTML = '<div class="skeleton"></div>'.repeat(6);
  let r;
  try { r = await fetchSWR('tasks', 'listTasks', params, loadTaskTable, { raw: true }); }
  catch (e) {
    box.innerHTML = `<div class="card load-err"><p class="muted">${esc(e.message)}</p><button class="btn btn-primary" id="tRetry">Try again</button></div>`;
    $('#tRetry').onclick = loadTaskTable; return;
  }
  if (S.view !== 'tasks') return;
  cacheTasks(r.rows);
  const pages = Math.max(1, Math.ceil(r.total / r.pageSize));
  const today = todayStr();
  box.innerHTML = `<div class="card fade-in"><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Task</th><th>Assigned To</th><th>Project</th><th>Priority</th><th>Status</th><th>Due</th><th class="num">Rev.</th></tr></thead>
    <tbody>${r.rows.map(t => {
      const od = t.Status !== DONE && t.DueDate < today;
      return `<tr class="click" data-open="${esc(t.TaskID)}">
        <td><div style="font-weight:500">${esc(t.Title)}</div><div class="faint small">${esc(t.TaskID)}${t.Type !== 'One-time' ? ' · ' + esc(t.Type) : ''}</div></td>
        <td>${esc(userName(t.AssignedTo))}</td><td>${esc(projName(t.ProjectID) || '—')}</td>
        <td><span class="prio ${prioCls(t.Priority)}">${esc(t.Priority)}</span></td>
        <td>${statusBadge(t.Status)}</td>
        <td class="${od ? 'txt-bad' : ''}">${esc(niceDate(t.DueDate))}${od ? ' · ' + daysBetween(t.DueDate, today) + 'd' : ''}</td>
        <td class="num">${Number(t.Revisions) || ''}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">No tasks match these filters.</td></tr>'}</tbody></table></div>
    <div class="pager"><button class="btn btn-ghost btn-sm" id="pPrev" ${f.page <= 1 ? 'disabled' : ''}>${IC.left} Prev</button>
      <span class="muted small">Page ${f.page} of ${pages} · ${r.total} tasks</span>
      <button class="btn btn-ghost btn-sm" id="pNext" ${f.page >= pages ? 'disabled' : ''}>Next ${IC.right}</button></div></div>`;
  $('#pPrev').onclick = () => { f.page--; loadTaskTable(); };
  $('#pNext').onclick = () => { f.page++; loadTaskTable(); };
}

/* =================================================================
   VIEW: Approvals (due date revisions)
   ================================================================= */
async function viewApprovals() {
  setTop(isMgr() ? 'Date Change Approvals' : 'My Date Change Requests');
  const tab = S.apprTab;
  const r = await fetchSWR('approvals', 'listRevisions', { status: tab }, viewApprovals, { skel: 4 });
  if (!r || S.view !== 'approvals') return;
  const rows = r.rows;
  if (tab === 'Pending' && isMgr()) setPending(rows.filter(x => x.canReview).length);
  $('#page').innerHTML = `
    <div class="tabs"><button class="tab ${tab === 'Pending' ? 'active' : ''}" data-tab="Pending">Pending</button>
      <button class="tab ${tab === 'History' ? 'active' : ''}" data-tab="History">History</button></div>
    <div class="card">${rows.length ? rows.map(rv => `
      <div class="rev">
        <div class="rev-main">
          <div style="font-weight:600;cursor:pointer" data-open="${esc(rv.TaskID)}">${esc(rv.TaskTitle)}</div>
          <div class="rev-dates"><span class="old">${esc(niceDate(rv.OldDate))}</span> → <span>${esc(niceDate(rv.NewDate))}</span>
            <span class="faint small">(+${daysBetween(rv.OldDate, rv.NewDate)}d)</span></div>
          <div class="small muted">${esc(userName(rv.RequestedBy))} · ${esc(niceDateTime(rv.CreatedAt))}</div>
          <div class="small" style="margin-top:4px">“${esc(rv.Reason)}”</div>
          ${rv.Status !== 'Pending' ? `<div class="small faint" style="margin-top:4px">${esc(rv.Status)} by ${esc(userName(rv.ReviewedBy))} · ${esc(niceDateTime(rv.ReviewedAt))}</div>` : ''}
        </div>
        ${rv.canReview ? `<div class="row"><button class="btn btn-danger btn-sm" data-rev="${esc(rv.RevisionID)}" data-d="Rejected">Reject</button>
            <button class="btn btn-ok btn-sm" data-rev="${esc(rv.RevisionID)}" data-d="Approved">Approve</button></div>`
          : `<span class="badge ${rv.Status === 'Approved' ? 'st-done' : rv.Status === 'Rejected' ? 'st-bad' : 'st-pending'}">${esc(rv.Status === 'Pending' ? 'Awaiting approval' : rv.Status)}</span>`}
      </div>`).join('') : `<div class="empty"><div class="empty-ico">✓</div>${tab === 'Pending' ? 'No pending requests.' : 'No history yet.'}</div>`}
    </div>
    <p class="legend">Only an approved request changes the due date. Every approved change is counted as a revision in the weekly score.</p>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { S.apprTab = b.dataset.tab; viewApprovals(); });
  $$('[data-rev]').forEach(b => b.onclick = () => busy(b, async () => {
    try {
      await call('reviewRevision', { id: b.dataset.rev, decision: b.dataset.d, reqId: newReqId() });
      toast('Request ' + b.dataset.d.toLowerCase());
      refresh();
    } catch (e) { toast(e.message, false); }
  }));
}

/* =================================================================
   VIEW: Weekly Meeting / Scores
   ================================================================= */
function meetingParams() {
  if (!S.mw) S.mw = { week: addDays(mondayOf(todayStr()), -7), dept: '' };
  return { week: S.mw.week };
}
async function viewMeeting() {
  const params = meetingParams(), w = S.mw;
  setTop(isMgr() ? 'Weekly Meeting' : 'My Weekly Score');
  const r = await fetchSWR('meeting', 'weeklyScores', params, viewMeeting);
  if (!r || S.view !== 'meeting') return;
  S.mData = r;

  let rows = r.rows.slice();
  if (w.dept) rows = rows.filter(x => x.Department === w.dept);
  rows.sort((a, b) => (b.LatePct - a.LatePct) || (b.NotDonePct - a.NotDonePct) || String(a.Name).localeCompare(String(b.Name)));

  const sum = k => rows.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const P = sum('Planned'), D = sum('Done'), O = sum('OnTime');
  const teamNd = P ? -Math.round((P - D) / P * 1000) / 10 : 0;
  const teamLate = P ? -Math.round((P - O) / P * 1000) / 10 : 0;
  const teamScore = P ? Math.round(O / P * 1000) / 10 : '';
  const delayed = rows.filter(x => Number(x.AvgDelayDays) > 0);
  const avgDelay = delayed.length ? (delayed.reduce((s, x) => s + Number(x.AvgDelayDays), 0) / delayed.length).toFixed(1) : '0';
  const isCur = r.week === mondayOf(todayStr());
  const state = r.frozen ? `<span class="badge st-done">${IC.lock.replace('<svg', '<svg width="12" height="12" style="stroke:currentColor;fill:none;stroke-width:2"')} Frozen</span>`
    : r.live ? '<span class="badge st-open">Live · to date</span>' : '<span class="badge st-pending">Not frozen</span>';
  const depts = [...new Set(r.rows.map(x => x.Department).filter(Boolean))];

  $('#page').innerHTML = `
    <div class="week-bar">
      <button class="icon-btn" id="wPrev" aria-label="Previous week">${IC.left}</button>
      <div class="week-label">${esc(weekLabel(r.week))}</div>
      <button class="icon-btn" id="wNext" aria-label="Next week">${IC.right}</button>
      ${state}
      ${!isCur ? '<button class="btn btn-ghost btn-sm" id="wCur">This week</button>' : '<button class="btn btn-ghost btn-sm" id="wLast">Last week</button>'}
      <span class="grow"></span>
      ${isMgr() && depts.length > 1 ? `<select class="select" id="wDept" style="width:auto">${opts(depts, w.dept, 'All departments')}</select>` : ''}
      ${isMgr() ? `<button class="btn btn-ghost btn-sm" id="wTargets">${IC.target} Set commitments</button>` : ''}
      ${r.canFreeze ? `<button class="btn btn-ghost btn-sm" id="wFreeze">${IC.lock} ${r.frozen ? 'Re-freeze' : 'Freeze week'}</button>` : ''}
      <button class="btn btn-ghost btn-sm" id="wExport">${IC.download} CSV</button>
      ${isMgr() ? `<button class="btn btn-primary btn-sm" id="wPresent">${IC.screen} Present</button>` : ''}
    </div>

    <div class="kpis">
      <div class="card kpi accent"><div class="kpi-label">Score</div><div class="kpi-value">${fmtPct(teamScore)}</div><div class="kpi-sub">${isMgr() ? 'Team' : 'You'} · ${O}/${P} on time</div></div>
      <div class="card kpi"><div class="kpi-label">% Work Not Done</div><div class="kpi-value">${fmtPct(teamNd)}</div><div class="kpi-sub">${D}/${P} done</div></div>
      <div class="card kpi"><div class="kpi-label">% Not Done On Time</div><div class="kpi-value">${fmtPct(teamLate)}</div><div class="kpi-sub">${P} planned</div></div>
      <div class="card kpi"><div class="kpi-label">Avg Delay</div><div class="kpi-value">${avgDelay}<span class="small muted"> days</span></div></div>
      <div class="card kpi ${r.overdue.length ? 'alert' : ''}"><div class="kpi-label">Open Overdue</div><div class="kpi-value">${r.overdue.length}</div></div>
    </div>

    <div class="card fade-in">
      <div class="tbl-wrap"><table class="tbl scores">
        <thead><tr><th>Employee</th><th class="num">Score</th><th class="num">Committed</th><th>Result</th>
          <th class="num">Planned</th><th class="num">Done</th><th class="num">On Time</th>
          <th class="num">% Not Done</th><th class="num">% Not On Time</th><th class="num">Weighted</th>
          <th class="num">Avg Delay</th><th class="num">Revisions</th><th class="num">Recurring</th><th>Trend</th></tr></thead>
        <tbody>${rows.map(x => scoreRow(x, r.trend[x.UserID] || [])).join('') || '<tr><td colspan="14" class="empty">No data for this week.</td></tr>'}</tbody>
      </table></div>
    </div>

    ${r.overdue.length ? `<div class="card mt"><div class="card-head"><h3>Open overdue tasks</h3><span class="badge st-bad">${r.overdue.length}</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Task</th><th>Employee</th><th>Due</th><th class="num">Days late</th><th class="num">Rev.</th></tr></thead>
      <tbody>${r.overdue.map(t => `<tr class="click" data-open="${esc(t.TaskID)}"><td>${esc(t.Title)}</td><td>${esc(userName(t.AssignedTo))}</td>
        <td>${esc(niceDate(t.DueDate))}</td><td class="num txt-bad">${daysBetween(t.DueDate, todayStr())}</td><td class="num">${Number(t.Revisions) || ''}</td></tr>`).join('')}</tbody></table></div></div>` : ''}

    <div class="legend">
      <b>Score</b> = tasks done on time ÷ planned × 100 &nbsp;·&nbsp; <b>Committed</b> = score the employee promised in the previous meeting; <b>Met</b> when Score ≥ Committed &nbsp;·&nbsp;
      <b>% Not Done</b> = −(Planned − Done) ÷ Planned × 100 &nbsp;·&nbsp; <b>% Not On Time</b> = −(Planned − On-time) ÷ Planned × 100 &nbsp;·&nbsp;
      <b>Weighted</b> = % not done on time, weighted by priority (${S.cfg.priorities.map(p => esc(p.name) + ' ×' + p.weight).join(', ')}) &nbsp;·&nbsp;
      <b>Avg Delay</b> = average days late across late or pending tasks &nbsp;·&nbsp; <b>Recurring</b> = daily/weekly tasks done on time &nbsp;·&nbsp;
      Week runs Monday–Sunday and is frozen automatically on Monday at 00:00 IST.
      ${r.live ? ' Live view counts tasks due before today, plus today\'s tasks already done.' : ''}
    </div>`;

  $('#wPrev').onclick = () => { w.week = addDays(r.week, -7); viewMeeting(); };
  $('#wNext').onclick = () => { w.week = addDays(r.week, 7); viewMeeting(); };
  const cur = $('#wCur'), last = $('#wLast');
  if (cur) cur.onclick = () => { w.week = mondayOf(todayStr()); viewMeeting(); };
  if (last) last.onclick = () => { w.week = addDays(mondayOf(todayStr()), -7); viewMeeting(); };
  if ($('#wDept')) $('#wDept').onchange = e => { w.dept = e.target.value; viewMeeting(); };
  if ($('#wTargets')) $('#wTargets').onclick = () => targetsForm(r);
  if ($('#wFreeze')) $('#wFreeze').onclick = async e => {
    const btn = e.currentTarget;
    if (r.frozen && !(await confirmBox('Re-freeze week', 'This recalculates and replaces the frozen scores for ' + weekLabel(r.week) + '. Continue?', 'Re-freeze'))) return;
    busy(btn, async () => {
      try { await call('freezeWeek', { week: r.week, force: r.frozen ? '1' : '', reqId: newReqId() }); toast('Week frozen'); refresh(); }
      catch (ex) { toast(ex.message, false); }
    });
  };
  $('#wExport').onclick = () => exportCSV('Weekly_Score_' + r.week, [
    { l: 'Week Start', k: 'WeekStart' }, { l: 'Employee', k: 'Name' }, { l: 'Department', k: 'Department' },
    { l: 'Score %', k: scoreOf }, { l: 'Committed %', k: committedOf }, { l: 'Result', k: x => targetResult(x).label },
    { l: 'Planned', k: 'Planned' }, { l: 'Done', k: 'Done' }, { l: 'On Time', k: 'OnTime' },
    { l: '% Not Done', k: 'NotDonePct' }, { l: '% Not On Time', k: 'LatePct' }, { l: 'Weighted %', k: 'WeightedPct' },
    { l: 'Avg Delay (days)', k: 'AvgDelayDays' }, { l: 'Revisions', k: 'Revisions' }, { l: 'Recurring %', k: 'RecurringPct' }
  ], rows);
  const pres = $('#wPresent');
  if (pres) pres.onclick = togglePresent;
}

/** Score = % of planned tasks done on time (= 100 + "% Not On Time"). Blank when nothing was planned. */
function scoreOf(x) { return Number(x.Planned) ? Math.round((100 + Number(x.LatePct)) * 10) / 10 : ''; }
/** Committed score is saved as the allowed "% not on time" (score 70% is saved as 30). */
function committedOf(x) {
  return x.TargetLate === '' || x.TargetLate === undefined || x.TargetLate === null ? '' : 100 - Number(x.TargetLate);
}

function targetResult(x) {
  const c = committedOf(x), s = scoreOf(x);
  if (c === '' || s === '') return { label: '', cls: '' };
  return s >= c ? { label: 'Met', cls: 'st-done' } : { label: 'Missed', cls: 'st-bad' };
}

function scoreRow(x, trend) {
  const res = targetResult(x), score = scoreOf(x), committed = committedOf(x);
  const pts = trend.concat([{ week: x.WeekStart, late: x.LatePct, cur: true }]).slice(-5);
  const bars = pts.map(p => `<span class="${p.cur ? 'cur' : ''}" style="height:${Math.max(3, Math.round((100 + Number(p.late)) / 100 * 22))}px" title="${esc(niceDate(p.week))}: score ${esc(fmtPct(100 + Number(p.late)))}"></span>`).join('');
  const prev = trend.length ? Number(trend[trend.length - 1].late) : null;
  const arrow = prev === null ? '' : Number(x.LatePct) > prev ? '<span class="txt-ok small">▲</span>' : Number(x.LatePct) < prev ? '<span class="txt-bad small">▼</span>' : '<span class="faint small">=</span>';
  return `<tr>
    <td><div style="font-weight:600">${esc(x.Name)}</div><div class="faint small">${esc(x.Department || '')}</div></td>
    <td class="num score ${res.label === 'Met' ? 'good' : res.label === 'Missed' ? 'bad' : ''}">${fmtPct(score)}</td>
    <td class="num">${fmtPct(committed)}</td>
    <td>${res.label ? `<span class="badge ${res.cls}">${res.label}</span>` : '<span class="faint">—</span>'}</td>
    <td class="num">${x.Planned}</td><td class="num">${x.Done}</td><td class="num">${x.OnTime}</td>
    <td class="num">${fmtPct(x.NotDonePct)}</td>
    <td class="num">${fmtPct(x.LatePct)}</td>
    <td class="num">${fmtPct(x.WeightedPct)}</td>
    <td class="num">${Number(x.AvgDelayDays) ? esc(x.AvgDelayDays) + 'd' : '—'}</td>
    <td class="num">${Number(x.Revisions) || '—'}</td>
    <td class="num">${x.RecurringPct === '' ? '—' : fmtPct(x.RecurringPct)}</td>
    <td><span class="trend">${bars}</span> ${arrow}</td></tr>`;
}

function togglePresent() {
  const on = document.body.classList.toggle('present');
  try {
    if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    else if (!on && document.fullscreenElement) document.exitFullscreen();
  } catch (e) {}
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('present'); });

function targetsForm(r) {
  const list = r.rows.slice().sort((a, b) => String(a.Name).localeCompare(String(b.Name)));
  const draftKey = 'commit_' + r.nextWeek;
  const draft = store.get(draftKey) || {};
  const saved = uid => r.nextTargets[uid] && r.nextTargets[uid].late !== '' ? 100 - Number(r.nextTargets[uid].late) : '';
  const val = uid => draft[uid] !== undefined ? draft[uid] : saved(uid);
  const m = modal({
    title: 'Commitments for ' + weekLabel(r.nextWeek), wide: true,
    body: `<p class="muted small" style="margin-top:0">Ask each employee what score they will achieve next week (e.g. 70 = 70% of tasks done on time).
      It shows as <b>Committed</b> next to their actual score in the next meeting. Leave blank to skip.</p>
      <form id="tgForm"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Employee</th><th class="num">Score</th><th class="num">Had committed</th><th class="num">Next week commitment %</th></tr></thead>
      <tbody>${list.map(x => `<tr><td>${esc(x.Name)}<div class="faint small">${esc(x.Department || '')}</div></td>
        <td class="num"><b>${fmtPct(scoreOf(x))}</b></td>
        <td class="num small muted">${fmtPct(committedOf(x))}</td>
        <td class="num"><input class="input target-in" type="number" min="0" max="100" step="1" name="${esc(x.UserID)}" value="${esc(val(x.UserID))}" /></td></tr>`).join('')}</tbody></table></div></form>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save commitments</button>`
  });
  const form = m.q('#tgForm');
  const collect = () => { const out = {}; $$('input', form).forEach(i => { out[i.name] = i.value.trim(); }); return out; };
  form.addEventListener('input', () => store.set(draftKey, collect()));
  m.q('[data-cancel]').onclick = m.close;
  const reqId = newReqId();
  m.q('[data-save]').onclick = e => busy(e.currentTarget, async () => {
    const data = collect();
    const bad = $$('input', form).find(i => i.value !== '' && (isNaN(Number(i.value)) || Number(i.value) < 0 || Number(i.value) > 100));
    if (bad) { bad.classList.add('invalid'); bad.focus(); toast('Commitment must be between 0 and 100.', false); return; }
    // Saved as allowed "% not on time": score 70 → 30
    const items = Object.keys(data).map(uid => ({ UserID: uid, TargetNotDone: '', TargetLate: data[uid] === '' ? '' : String(100 - Number(data[uid])) }));
    try {
      await call('saveCommitments', { week: r.nextWeek, items: JSON.stringify(items), reqId });
      store.del(draftKey);
      toast('Commitments saved');
      m.close();
      refresh();
    } catch (ex) { toast(ex.message + ' Your entries are kept.', false); }
  });
}

/* =================================================================
   Task detail
   ================================================================= */
async function openTask(id) {
  const m = modal({ title: 'Task', wide: true, body: '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>' });
  let r;
  try { r = await call('getTask', { id }); }
  catch (e) { m.q('.modal-body').innerHTML = `<p class="txt-bad">${esc(e.message)}</p>`; return; }
  const t = r.task;
  S.taskCache[t.TaskID] = t;
  const pending = r.revisions.find(x => x.Status === 'Pending');
  const od = t.Status !== DONE && t.DueDate < todayStr();
  m.q('.modal-head h3').textContent = t.Title;

  const statusCtl = canStatus(t)
    ? `<select class="select status-sel" id="dStatus">${opts(S.cfg.statuses, t.Status)}</select>`
    : statusBadge(t.Status);

  m.q('.modal-body').innerHTML = `
    <div class="row" style="margin-bottom:14px">${statusCtl}<span class="prio ${prioCls(t.Priority)}">${esc(t.Priority)}</span>
      ${t.Type !== 'One-time' ? `<span class="tag">${esc(t.Type)}</span>` : ''}
      ${od ? `<span class="badge st-bad">Overdue ${daysBetween(t.DueDate, todayStr())}d</span>` : ''}
      ${pending ? `<span class="badge st-pending">Date change pending → ${esc(niceDate(pending.NewDate))}</span>` : ''}
      <span class="grow"></span><span class="faint small">${esc(t.TaskID)}</span></div>
    <div class="detail-grid">
      <div><div class="dl">Assigned to</div><div class="dv">${esc(userName(t.AssignedTo))}</div></div>
      <div><div class="dl">Assigned by</div><div class="dv">${esc(userName(t.AssignedBy))}</div></div>
      <div><div class="dl">Due date</div><div class="dv ${od ? 'txt-bad' : ''}">${esc(niceDate(t.DueDate, true))}</div></div>
      <div><div class="dl">Original due</div><div class="dv">${esc(niceDate(t.OriginalDueDate, true))}${Number(t.Revisions) ? ` <span class="tag">×${esc(t.Revisions)} revised</span>` : ''}</div></div>
      <div><div class="dl">Project</div><div class="dv">${esc(projName(t.ProjectID) || '—')}</div></div>
      <div><div class="dl">Completed</div><div class="dv">${esc(t.CompletedAt ? niceDateTime(t.CompletedAt) : '—')}</div></div>
    </div>
    ${t.Description ? `<div class="desc">${esc(t.Description)}</div>` : ''}
    <div class="row">
      ${t.AssignedTo === S.me.id && t.Status !== DONE && !pending ? `<button class="btn btn-ghost btn-sm" id="dRevise">Request date change</button>` : ''}
      ${canManage(t) ? `<button class="btn btn-ghost btn-sm" id="dEdit">Edit</button><button class="btn btn-danger btn-sm" id="dDelete">Delete</button>` : ''}
    </div>
    ${r.revisions.length ? `<div class="h-sec">Date change history</div><div class="small">${r.revisions.map(v => `
      <div style="padding:6px 0;border-bottom:1px solid var(--border)"><b>${esc(niceDate(v.OldDate))} → ${esc(niceDate(v.NewDate))}</b>
        <span class="badge ${v.Status === 'Approved' ? 'st-done' : v.Status === 'Rejected' ? 'st-bad' : 'st-pending'}">${esc(v.Status)}</span>
        <span class="muted"> · ${esc(userName(v.RequestedBy))} · ${esc(niceDateTime(v.CreatedAt))}</span><div class="muted">${esc(v.Reason)}</div></div>`).join('')}</div>` : ''}
    <div class="h-sec">Comments</div>
    <div class="comments" id="dComments">${r.comments.map(commentHtml).join('') || '<div class="faint small" id="noCmt">No comments yet.</div>'}</div>
    <form id="cForm" class="row" style="align-items:flex-end">
      <div class="cform-wrap">
        <textarea class="textarea" name="text" rows="2" maxlength="1000" placeholder="Write a comment… type @ to tag someone" style="min-height:44px"></textarea>
      </div>
      <button class="btn btn-primary" type="submit">Post</button>
    </form>`;

  const cBox = m.q('#dComments'); cBox.scrollTop = cBox.scrollHeight;
  const sel = m.q('#dStatus');
  if (sel) sel.onchange = async () => {
    const prevVal = t.Status, next = sel.value;
    await setStatus(S.taskCache[t.TaskID] || t, next, 'Status updated');
    const now = S.taskCache[t.TaskID];
    if (now) { t.Status = now.Status; sel.value = now.Status; } else sel.value = prevVal;
  };
  const rv = m.q('#dRevise'); if (rv) rv.onclick = () => { m.close(); revisionForm(t); };
  const ed = m.q('#dEdit'); if (ed) ed.onclick = () => { m.close(); taskForm(t); };
  const del = m.q('#dDelete');
  if (del) del.onclick = async () => {
    if (!(await confirmBox('Delete task', 'Delete "' + t.Title + '"? It will be removed from lists and scores.', 'Delete'))) return;
    busy(del, async () => {
      try { await call('deleteTask', { id: t.TaskID, reqId: newReqId() }); toast('Task deleted'); m.close(); refresh(); }
      catch (e) { toast(e.message, false); }
    });
  };
  const cForm = m.q('#cForm');
  attachMention(cForm.elements.text);
  const cReq = { id: newReqId() };
  cForm.onsubmit = e => {
    e.preventDefault();
    const ta = cForm.elements.text, text = ta.value.trim();
    if (!text) { ta.classList.add('invalid'); return; }
    busy($('button', cForm), async () => {
      try {
        const res = await call('addComment', { id: t.TaskID, text, reqId: cReq.id });
        cReq.id = newReqId();
        const nc = m.q('#noCmt'); if (nc) nc.remove();
        cBox.insertAdjacentHTML('beforeend', commentHtml(res.comment));
        cBox.scrollTop = cBox.scrollHeight;
        ta.value = ''; ta.classList.remove('invalid');
        if (res.tagged && res.tagged.length) toast('Comment posted · notified ' + res.tagged.map(userName).join(', '));
      } catch (ex) { toast(ex.message + ' Your comment is kept.', false); }
    });
  };
}

function commentHtml(c) {
  return `<div class="cmt"><div class="avatar">${esc(initials(userName(c.UserID)))}</div>
    <div class="cmt-body"><div class="cmt-head"><b>${esc(userName(c.UserID))}</b> · ${esc(niceDateTime(c.CreatedAt))}</div>${renderMentions(c.Text)}</div></div>`;
}

/* =================================================================
   Task form (create / edit)
   ================================================================= */
function taskForm(t) {
  const editing = !!t;
  const d = editing ? t : (S.draft || { Priority: (S.cfg.priorities[1] || S.cfg.priorities[0] || {}).name, DueDate: todayStr() });
  const m = modal({
    title: editing ? 'Edit Task' : 'New Task',
    body: `<form id="tkForm" novalidate><div class="form-grid">
      ${field('Title', `<input class="input" name="Title" maxlength="200" value="${esc(d.Title)}" placeholder="What needs to be done?" />`, { req: true, full: true })}
      ${field('Description', `<textarea class="textarea" name="Description" maxlength="1000" placeholder="Details, expected output…">${esc(d.Description)}</textarea>`, { full: true })}
      ${field('Assign to', `<select class="select" name="AssignedTo">${opts(assignable().map(u => ({ v: u.UserID, l: u.Name + (u.Department ? ' · ' + u.Department : '') })), d.AssignedTo, 'Select employee')}</select>`, { req: true })}
      ${field('Project', `<select class="select" name="ProjectID">${opts(S.projects.map(p => ({ v: p.ProjectID, l: p.Name })), d.ProjectID, 'No project')}</select>`)}
      ${field('Priority', `<select class="select" name="Priority">${opts(S.cfg.priorities.map(p => p.name), d.Priority)}</select>`, { req: true })}
      ${field('Due date', `<input class="input" type="date" name="DueDate" value="${esc(d.DueDate)}" ${editing ? '' : `min="${todayStr()}"`} />`, { req: true })}
      ${editing ? field('Reason for date change', `<input class="input" name="RevisionReason" maxlength="300" placeholder="Required only if due date changes" />`, { full: true, hint: 'Changing the due date is recorded as a revision.' }) : ''}
    </div></form>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Create task'}</button>`
  });
  const form = m.q('#tkForm');
  if (!editing) form.addEventListener('input', () => { S.draft = formData(form); });
  m.q('[data-cancel]').onclick = m.close;
  const reqId = newReqId();
  const save = e => busy(m.q('[data-save]'), async () => {
    if (e) e.preventDefault();
    const rec = formData(form);
    const errs = {};
    if (rec.Title.length < 3) errs.Title = 'Enter at least 3 characters.';
    if (!rec.AssignedTo) errs.AssignedTo = 'Select an employee.';
    if (!rec.Priority) errs.Priority = 'Select a priority.';
    if (!isDate(rec.DueDate)) errs.DueDate = 'Select a due date.';
    else if (rec.DueDate < todayStr() && (!editing || rec.DueDate !== t.DueDate)) errs.DueDate = 'Due date cannot be in the past.';
    if (editing && rec.DueDate !== t.DueDate && rec.RevisionReason.length < 3) errs.RevisionReason = 'Give a reason for the date change.';
    if (!showErrors(form, errs)) return;
    try {
      if (editing) {
        rec.TaskID = t.TaskID;
        await call('updateTask', { record: JSON.stringify(rec), reqId });
        toast('Task updated');
      } else {
        await call('createTask', { record: JSON.stringify(rec), reqId });
        S.draft = null;
        toast('Task created');
      }
      m.close();
      refresh();
    } catch (ex) { toast(ex.message + ' Your entries are kept.', false); }
  });
  m.q('[data-save]').onclick = save;
  form.onsubmit = save;
}

function revisionForm(t) {
  const m = modal({
    title: 'Request date change',
    body: `<p class="muted small" style="margin-top:0">${esc(t.Title)} · currently due <b>${esc(niceDate(t.DueDate, true))}</b>. Your manager must approve this change.</p>
      <form id="rvForm" novalidate><div class="form-grid">
      ${field('New due date', `<input class="input" type="date" name="newDate" min="${todayStr()}" value="${esc(addDays(t.DueDate < todayStr() ? todayStr() : t.DueDate, 1))}" />`, { req: true })}
      ${field('Reason', `<textarea class="textarea" name="reason" maxlength="300" placeholder="Why is more time needed?"></textarea>`, { req: true, full: true })}
      </div></form>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Send request</button>`
  });
  const form = m.q('#rvForm');
  m.q('[data-cancel]').onclick = m.close;
  const reqId = newReqId();
  m.q('[data-save]').onclick = e => busy(e.currentTarget, async () => {
    const d = formData(form), errs = {};
    if (!isDate(d.newDate) || d.newDate < todayStr()) errs.newDate = 'Select a valid future date.';
    else if (d.newDate === t.DueDate) errs.newDate = 'Choose a different date.';
    if (d.reason.length < 5) errs.reason = 'Please explain (min 5 characters).';
    if (!showErrors(form, errs)) return;
    try {
      await call('requestRevision', { id: t.TaskID, newDate: d.newDate, reason: d.reason, reqId });
      toast('Request sent for approval');
      m.close(); refresh();
    } catch (ex) { toast(ex.message, false); }
  });
}

/* =================================================================
   VIEW: Recurring templates
   ================================================================= */
async function viewTemplates() {
  setTop('Recurring Tasks', `${isAdmin() ? `<button class="btn btn-ghost" id="genBtn">${IC.refresh}<span class="lbl">Generate today</span></button>` : ''}
    <button class="btn btn-primary" id="newTplBtn">${IC.plus}<span class="lbl">New Recurring Task</span></button>`);
  $('#newTplBtn').onclick = () => templateForm();
  if ($('#genBtn')) $('#genBtn').onclick = e => busy(e.currentTarget, async () => {
    try { const r = await call('runGenerator', { reqId: newReqId() }); toast(r.generated + ' task(s) generated for today'); }
    catch (ex) { toast(ex.message, false); }
  });
  const r = await fetchSWR('templates', 'listTemplates', {}, viewTemplates, { skel: 5 });
  if (!r || S.view !== 'templates') return;
  S.tplCache = {}; r.rows.forEach(x => S.tplCache[x.TemplateID] = x);
  const rows = r.rows.sort((a, b) => userName(a.AssignedTo).localeCompare(userName(b.AssignedTo)));
  $('#page').innerHTML = `
    <div class="filters"><input class="input search" id="tplQ" placeholder="Search recurring tasks…" /></div>
    <div class="card fade-in"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Task</th><th>Assigned To</th><th>Repeats</th><th>Priority</th><th>Active period</th><th>Last created</th><th></th></tr></thead>
      <tbody id="tplBody">${rows.map(x => `<tr data-s="${esc((x.Title + ' ' + userName(x.AssignedTo)).toLowerCase())}">
        <td><div style="font-weight:500">${esc(x.Title)}</div><div class="faint small">${esc(projName(x.ProjectID))}</div></td>
        <td>${esc(userName(x.AssignedTo))}</td>
        <td>${x.Frequency === 'Weekly' ? 'Weekly · ' + esc(DAYS[Number(x.WeekDay)]) : 'Daily (working days)'}</td>
        <td><span class="prio ${prioCls(x.Priority)}">${esc(x.Priority)}</span></td>
        <td class="small">${esc(niceDate(x.StartDate))} – ${x.EndDate ? esc(niceDate(x.EndDate)) : 'No end'}</td>
        <td class="small muted">${esc(niceDate(x.LastGenerated))}</td>
        <td class="right"><button class="btn btn-ghost btn-sm" data-edit="${esc(x.TemplateID)}">Edit</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(x.TemplateID)}">Stop</button></td></tr>`).join('')
        || '<tr><td colspan="7" class="empty">No recurring tasks yet. Create one for daily or weekly routine work.</td></tr>'}</tbody></table></div></div>
    <p class="legend">Recurring tasks are created automatically every morning (around 5 AM) with that day as the due date, and count in the weekly score like any other task.
      Working days: ${esc(workingDays().map(d => DAYS[d]).join(', '))}.</p>`;
  $('#tplQ').oninput = e => { const q = e.target.value.toLowerCase(); $$('#tplBody tr[data-s]').forEach(tr => tr.classList.toggle('hidden', !tr.dataset.s.includes(q))); };
  $$('[data-edit]').forEach(b => b.onclick = () => templateForm(S.tplCache[b.dataset.edit]));
  $$('[data-del]').forEach(b => b.onclick = async () => {
    const x = S.tplCache[b.dataset.del];
    if (!(await confirmBox('Stop recurring task', 'Stop creating "' + x.Title + '"? Existing tasks stay as they are.', 'Stop'))) return;
    busy(b, async () => {
      try { await call('deleteTemplate', { id: x.TemplateID, reqId: newReqId() }); toast('Recurring task stopped'); refresh(); }
      catch (e) { toast(e.message, false); }
    });
  });
}
function workingDays() { return String(S.cfg.settings.WorkingDays || '1,2,3,4,5,6').split(',').map(Number).filter(n => !isNaN(n)); }

function templateForm(x) {
  const editing = !!x;
  const d = x || { Frequency: 'Daily', WeekDay: '1', StartDate: todayStr(), Priority: (S.cfg.priorities[1] || S.cfg.priorities[0] || {}).name };
  const m = modal({
    title: editing ? 'Edit Recurring Task' : 'New Recurring Task',
    body: `<form id="tpForm" novalidate><div class="form-grid">
      ${field('Title', `<input class="input" name="Title" maxlength="200" value="${esc(d.Title)}" placeholder="e.g. Send daily stock report" />`, { req: true, full: true })}
      ${field('Description', `<textarea class="textarea" name="Description" maxlength="1000">${esc(d.Description)}</textarea>`, { full: true })}
      ${field('Assign to', `<select class="select" name="AssignedTo">${opts(assignable().map(u => ({ v: u.UserID, l: u.Name })), d.AssignedTo, 'Select employee')}</select>`, { req: true })}
      ${field('Project', `<select class="select" name="ProjectID">${opts(S.projects.map(p => ({ v: p.ProjectID, l: p.Name })), d.ProjectID, 'No project')}</select>`)}
      ${field('Repeats', `<select class="select" name="Frequency">${opts([{ v: 'Daily', l: 'Daily (working days)' }, { v: 'Weekly', l: 'Weekly' }], d.Frequency)}</select>`, { req: true })}
      ${field('Day of week', `<select class="select" name="WeekDay">${opts(DAYS.map((n, i) => ({ v: String(i), l: n })), d.WeekDay)}</select>`)}
      ${field('Priority', `<select class="select" name="Priority">${opts(S.cfg.priorities.map(p => p.name), d.Priority)}</select>`, { req: true })}
      ${field('Start date', `<input class="input" type="date" name="StartDate" value="${esc(d.StartDate)}" />`, { req: true })}
      ${field('End date', `<input class="input" type="date" name="EndDate" value="${esc(d.EndDate)}" />`, { hint: 'Leave blank to repeat indefinitely.' })}
    </div></form>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Create'}</button>`
  });
  const form = m.q('#tpForm');
  const wdField = form.elements.WeekDay.closest('.field');
  const syncWd = () => wdField.classList.toggle('hidden', form.elements.Frequency.value !== 'Weekly');
  form.elements.Frequency.onchange = syncWd; syncWd();
  m.q('[data-cancel]').onclick = m.close;
  const reqId = newReqId();
  m.q('[data-save]').onclick = e => busy(e.currentTarget, async () => {
    const rec = formData(form), errs = {};
    if (rec.Title.length < 3) errs.Title = 'Enter at least 3 characters.';
    if (!rec.AssignedTo) errs.AssignedTo = 'Select an employee.';
    if (!isDate(rec.StartDate)) errs.StartDate = 'Select a start date.';
    if (rec.EndDate && rec.EndDate < rec.StartDate) errs.EndDate = 'End date must be after start date.';
    if (!showErrors(form, errs)) return;
    if (editing) rec.TemplateID = x.TemplateID;
    try {
      const r = await call('saveTemplate', { record: JSON.stringify(rec), reqId });
      toast(editing ? 'Recurring task updated' : 'Recurring task created' + (r.generated ? ' · today\'s task added' : ''));
      m.close(); refresh();
    } catch (ex) { toast(ex.message + ' Your entries are kept.', false); }
  });
}

/* =================================================================
   VIEW: Projects
   ================================================================= */
async function viewProjects() {
  setTop('Projects', `<button class="btn btn-primary" id="newProjBtn">${IC.plus}<span class="lbl">New Project</span></button>`);
  $('#newProjBtn').onclick = () => projectForm();
  const r = await fetchSWR('projects', 'bootstrap', {}, viewProjects, { skel: 4 });
  if (!r || S.view !== 'projects') return;
  applyBoot(r);
  const rows = S.projects.slice().sort((a, b) => String(a.Name).localeCompare(String(b.Name)));
  $('#page').innerHTML = `<div class="card fade-in"><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Project</th><th>Department</th><th>Owner</th><th>Created</th><th></th></tr></thead>
    <tbody>${rows.map(p => `<tr>
      <td><div style="font-weight:500">${esc(p.Name)}</div><div class="faint small">${esc(p.Description)}</div></td>
      <td>${esc(p.Department || '—')}</td><td>${esc(p.Owner ? userName(p.Owner) : '—')}</td><td class="small muted">${esc(niceDate(p.CreatedAt))}</td>
      <td class="right">${isAdmin() || p.CreatedBy === S.me.id || p.Owner === S.me.id ? `<button class="btn btn-ghost btn-sm" data-edit="${esc(p.ProjectID)}">Edit</button>` : ''}
        ${isAdmin() ? `<button class="btn btn-danger btn-sm" data-del="${esc(p.ProjectID)}">Archive</button>` : ''}</td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">No projects yet. Projects help group tasks, e.g. "AIS 156 Certification" or "Dealer Onboarding".</td></tr>'}</tbody></table></div></div>`;
  $$('[data-edit]').forEach(b => b.onclick = () => projectForm(S.projMap[b.dataset.edit]));
  $$('[data-del]').forEach(b => b.onclick = async () => {
    const p = S.projMap[b.dataset.del];
    if (!(await confirmBox('Archive project', 'Archive "' + p.Name + '"? Its tasks are kept.', 'Archive'))) return;
    busy(b, async () => {
      try { await call('deleteProject', { id: p.ProjectID, reqId: newReqId() }); toast('Project archived'); refresh(); }
      catch (e) { toast(e.message, false); }
    });
  });
}

function projectForm(p) {
  const d = p || {};
  const m = modal({
    title: p ? 'Edit Project' : 'New Project',
    body: `<form id="pjForm" novalidate><div class="form-grid">
      ${field('Name', `<input class="input" name="Name" maxlength="100" value="${esc(d.Name)}" />`, { req: true, full: true })}
      ${field('Department', `<select class="select" name="Department">${opts(S.cfg.departments, d.Department, 'Select')}</select>`)}
      ${field('Owner', `<select class="select" name="Owner">${opts(S.users.map(u => ({ v: u.UserID, l: u.Name })), d.Owner, 'Select')}</select>`)}
      ${field('Description', `<textarea class="textarea" name="Description" maxlength="500">${esc(d.Description)}</textarea>`, { full: true })}
    </div></form>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>`
  });
  const form = m.q('#pjForm');
  m.q('[data-cancel]').onclick = m.close;
  const reqId = newReqId();
  m.q('[data-save]').onclick = e => busy(e.currentTarget, async () => {
    const rec = formData(form);
    if (!showErrors(form, rec.Name.length < 2 ? { Name: 'Enter a project name.' } : {})) return;
    if (p) rec.ProjectID = p.ProjectID;
    try { await call('saveProject', { record: JSON.stringify(rec), reqId }); toast('Project saved'); m.close(); refresh(); }
    catch (ex) { toast(ex.message, false); }
  });
}

/* =================================================================
   VIEW: Employees (Admin)
   ================================================================= */
async function viewUsers() {
  setTop('Employees', `<button class="btn btn-primary" id="newUserBtn">${IC.plus}<span class="lbl">Add Employee</span></button>`);
  const r = await fetchSWR('users', 'listUsers', {}, viewUsers);
  if (!r || S.view !== 'users') return;
  const all = r.rows;
  S.allUsers = {}; all.forEach(u => S.allUsers[u.UserID] = u);
  $('#newUserBtn').onclick = () => userForm(null, all);
  const rows = all.slice().sort((a, b) => (b.Active - a.Active) || String(a.Name).localeCompare(String(b.Name)));
  const depts = [...new Set(all.map(u => u.Department).filter(Boolean))].sort();
  const status = u => !u.Active ? 'inactive' : u.HasAccess ? 'active' : 'noaccess';
  $('#page').innerHTML = `
    <div class="filters">
      <input class="input search" id="uQ" placeholder="Search name, ID, designation, phone…" />
      <select class="select" id="uDept">${opts(depts, '', 'All departments')}</select>
      <select class="select" id="uStatus">${opts([{ v: 'active', l: 'Active' }, { v: 'noaccess', l: 'No app access' }, { v: 'inactive', l: 'Inactive' }], '', 'All statuses')}</select>
      <button class="btn btn-ghost" id="uExport">${IC.download} CSV</button>
    </div>
    <div class="card fade-in"><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Employee</th><th>Emp ID</th><th>Department</th><th>Phone</th><th>Reports to</th><th>Role</th><th>Status</th><th></th></tr></thead>
    <tbody id="uBody">${rows.map(u => `<tr data-s="${esc([u.Name, u.UserID, u.Department, u.Designation, u.Phone, u.Email, u.Role].join(' ').toLowerCase())}" data-d="${esc(u.Department)}" data-st="${status(u)}">
      <td><div class="row"><div class="avatar">${esc(initials(u.Name))}</div><div><b>${esc(u.Name)}</b><div class="faint small">${esc(u.Designation || '')}</div></div></div></td>
      <td class="small muted">${esc(u.UserID)}</td><td>${esc(u.Department || '—')}</td>
      <td class="small">${esc(u.Phone || '—')}</td>
      <td>${esc(u.Manager ? (S.allUsers[u.Manager] || {}).Name || u.Manager : '—')}</td>
      <td>${esc(u.Role || '—')}</td>
      <td>${!u.Active ? '<span class="badge">Inactive</span>' : u.HasAccess ? '<span class="badge st-done">Active</span>' : '<span class="badge st-pending">No app access</span>'}</td>
      <td class="right"><button class="btn btn-ghost btn-sm" data-edit="${esc(u.UserID)}">${!u.Active ? 'Reactivate' : u.HasAccess ? 'Edit' : 'Give access'}</button>
        ${u.Active && u.UserID !== S.me.id ? `<button class="btn btn-danger btn-sm" data-del="${esc(u.UserID)}">Deactivate</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>
    <p class="legend">Employee details are saved in the common <b>Employee Master</b> sheet; PIN and role are saved in this app.
      Managers see and assign tasks for employees who report to them, and approve their date changes. Admins see everything.</p>`;
  const applyF = () => {
    const q = $('#uQ').value.toLowerCase(), d = $('#uDept').value, st = $('#uStatus').value;
    $$('#uBody tr').forEach(tr => tr.classList.toggle('hidden', !tr.dataset.s.includes(q) || (d && tr.dataset.d !== d) || (st && tr.dataset.st !== st)));
  };
  $('#uQ').oninput = applyF; $('#uDept').onchange = applyF; $('#uStatus').onchange = applyF;
  $('#uExport').onclick = () => exportCSV('Employees', [
    { l: 'Emp ID', k: 'UserID' }, { l: 'Name', k: 'Name' }, { l: 'Department', k: 'Department' }, { l: 'Designation', k: 'Designation' },
    { l: 'Phone', k: 'Phone' }, { l: 'Email', k: 'Email' }, { l: 'Reports To', k: x => x.Manager ? (S.allUsers[x.Manager] || {}).Name || x.Manager : '' },
    { l: 'Join Date', k: 'JoinDate' }, { l: 'Role', k: 'Role' }, { l: 'Status', k: x => ({ active: 'Active', noaccess: 'No app access', inactive: 'Inactive' })[status(x)] }
  ], rows);
  $$('[data-edit]').forEach(b => b.onclick = () => userForm(S.allUsers[b.dataset.edit], all));
  $$('[data-del]').forEach(b => b.onclick = async () => {
    const u = S.allUsers[b.dataset.del];
    if (!(await confirmBox('Deactivate employee', 'Deactivate ' + u.Name + '? They will not be able to log in. Their history is kept.', 'Deactivate'))) return;
    busy(b, async () => {
      try { await call('deleteUser', { id: u.UserID, reqId: newReqId() }); toast('Employee deactivated'); refresh(); reloadBoot().catch(() => {}); }
      catch (e) { toast(e.message, false); }
    });
  });
}

function userForm(u, all) {
  const d = u || { Role: 'Member' };
  const needPin = !u || !u.HasAccess;
  const mgrs = all.filter(x => x.Active && x.HasAccess && x.Role !== 'Member' && (!u || x.UserID !== u.UserID));
  const m = modal({
    title: !u ? 'Add Employee' : u.HasAccess ? 'Edit Employee · ' + u.UserID : 'Give App Access · ' + u.UserID, wide: true,
    body: `<form id="usForm" novalidate autocomplete="off">
      <div class="h-sec" style="margin-top:0">Employee details <span class="faint small">(saved in Employee Master)</span></div>
      <div class="form-grid">
      ${field('Name', `<input class="input" name="Name" maxlength="80" value="${esc(d.Name)}" />`, { req: true })}
      ${field('Designation', `<input class="input" name="Designation" maxlength="60" value="${esc(d.Designation)}" placeholder="e.g. Line Supervisor" />`)}
      ${field('Department', `<select class="select" name="Department">${opts(S.cfg.departments, d.Department, 'Select')}</select>`)}
      ${field('Reports to', `<select class="select" name="Manager">${opts(mgrs.map(x => ({ v: x.UserID, l: x.Name + ' · ' + x.Role })), d.Manager, 'No manager')}</select>`, { hint: 'This manager approves date changes and sees their tasks.' })}
      ${field('Phone', `<input class="input" name="Phone" inputmode="tel" maxlength="15" value="${esc(d.Phone)}" placeholder="10-digit mobile" />`)}
      ${field('Email', `<input class="input" name="Email" type="email" maxlength="80" value="${esc(d.Email)}" />`)}
      ${field('Join date', `<input class="input" name="JoinDate" type="date" value="${esc(d.JoinDate)}" />`)}
      </div>
      <div class="h-sec">Task app access</div>
      <div class="form-grid">
      ${field('Role', `<select class="select" name="Role">${opts(['Member', 'Manager', 'Admin'], d.Role || 'Member')}</select>`, { req: true })}
      ${field(needPin ? 'PIN' : 'New PIN', `<input class="input" name="PIN" inputmode="numeric" maxlength="6" placeholder="${needPin ? '4–6 digits' : 'Leave blank to keep current'}" />`, { req: needPin })}
      </div>
    </form>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>`
  });
  const form = m.q('#usForm');
  m.q('[data-cancel]').onclick = m.close;
  const reqId = newReqId();
  m.q('[data-save]').onclick = e => busy(e.currentTarget, async () => {
    const rec = formData(form), errs = {};
    if (rec.Name.length < 2) errs.Name = 'Enter a name.';
    if (rec.Phone && !/^[0-9+\-\s]{7,15}$/.test(rec.Phone)) errs.Phone = 'Enter a valid phone number.';
    if (rec.Email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rec.Email)) errs.Email = 'Enter a valid email address.';
    if ((needPin || rec.PIN) && !/^\d{4,6}$/.test(rec.PIN)) errs.PIN = 'PIN must be 4–6 digits.';
    if (!showErrors(form, errs)) return;
    if (u) rec.UserID = u.UserID;
    try { await call('saveUser', { record: JSON.stringify(rec), reqId }); toast('Employee saved'); m.close(); refresh(); reloadBoot().catch(() => {}); }
    catch (ex) { toast(ex.message, false); }
  });
}

/* =================================================================
   VIEW: Settings (Admin, UI-driven config)
   ================================================================= */
async function viewSettings() {
  setTop('Settings', `<button class="btn btn-primary" id="cfgSave">Save settings</button>`);
  const r = await fetchSWR('settings', 'bootstrap', {}, viewSettings, { skel: 5, noCache: true });
  if (!r || S.view !== 'settings') return;
  applyBoot(r);
  const items = S.cfg.items.filter(i => i.Type !== 'Setting');
  const wd = workingDays();
  const group = (type, title, valLabel, hint) => `
    <div class="card card-pad mt" data-group="${type}">
      <div class="row" style="justify-content:space-between;margin-bottom:10px"><div><b>${esc(title)}</b><div class="faint small">${esc(hint)}</div></div>
        <button class="btn btn-ghost btn-sm" data-add="${type}">${IC.plus} Add</button></div>
      <div class="cfg-row faint small" style="margin-bottom:4px"><span>Name</span><span>${esc(valLabel || '')}</span><span>Active</span><span></span></div>
      <div data-list>${items.filter(i => i.Type === type).map(i => cfgRow(type, i)).join('')}</div>
    </div>`;
  $('#page').innerHTML = `<div id="cfgWrap">
    ${group('Department', 'Departments', '', 'Used for employees, projects and the meeting filter.')}
    ${group('Priority', 'Priorities', 'Weight', 'Weight is used in the weighted score (higher = more important).')}
    ${group('Status', 'Statuses', 'Order', 'Workflow columns in order. "Done" is required and always last.')}
    <div class="card card-pad mt"><b>Working days</b><div class="faint small" style="margin-bottom:10px">Daily recurring tasks are created only on these days.</div>
      <div class="days" id="wdays">${[1, 2, 3, 4, 5, 6, 0].map(i => `<span class="day-chip ${wd.includes(i) ? 'on' : ''}" data-d="${i}">${DAYS[i]}</span>`).join('')}</div></div>
    </div>`;
  $$('#wdays .day-chip').forEach(c => c.onclick = () => c.classList.toggle('on'));
  $$('[data-add]').forEach(b => b.onclick = () => {
    const list = $(`[data-group="${b.dataset.add}"] [data-list]`);
    list.insertAdjacentHTML('beforeend', cfgRow(b.dataset.add, { Key: '', Value: b.dataset.add === 'Department' ? '' : '1', Active: true }));
    $('input', list.lastElementChild).focus();
  });
  $('#cfgWrap').addEventListener('click', e => { const x = e.target.closest('[data-rm]'); if (x) x.closest('.cfg-row').remove(); });
  $('#cfgSave').onclick = e => busy(e.currentTarget, async () => {
    const out = [];
    let bad = null;
    $$('[data-group]').forEach(g => {
      const type = g.dataset.group;
      $$('[data-list] .cfg-row', g).forEach(row => {
        const key = $('[data-k]', row).value.trim(), valEl = $('[data-v]', row);
        const val = valEl ? valEl.value.trim() : '';
        if (!key) return;
        if (type !== 'Department' && !(Number(val) > 0)) { bad = bad || valEl; valEl.classList.add('invalid'); }
        out.push({ Type: type, Key: key, Value: val, Active: $('[data-a]', row).checked });
      });
    });
    if (bad) { bad.focus(); toast('Weights and order must be numbers above 0.', false); return; }
    const days = $$('#wdays .day-chip.on').map(c => c.dataset.d);
    if (!days.length) { toast('Select at least one working day.', false); return; }
    out.push({ Type: 'Setting', Key: 'WorkingDays', Value: days.join(','), Active: true });
    S.cfg.items.filter(i => i.Type === 'Setting' && i.Key !== 'WorkingDays').forEach(i => out.push(i));
    try {
      const res = await call('saveConfig', { items: JSON.stringify(out), reqId: newReqId() });
      S.cfg = res.config; toast('Settings saved'); refresh();
    } catch (ex) { toast(ex.message, false); }
  });
}

function cfgRow(type, i) {
  const locked = type === 'Status' && i.Key === DONE;
  return `<div class="cfg-row">
    <input class="input" data-k maxlength="60" value="${esc(i.Key)}" ${locked ? 'readonly' : ''} placeholder="Name" />
    ${type === 'Department' ? '<span></span>' : `<input class="input" data-v type="number" min="1" step="1" value="${esc(i.Value)}" />`}
    <label class="switch"><input type="checkbox" data-a ${i.Active ? 'checked' : ''} ${locked ? 'disabled' : ''}/><span></span></label>
    ${locked ? '<span></span>' : `<button class="icon-btn" data-rm title="Remove" aria-label="Remove">${IC.close}</button>`}
  </div>`;
}

/* =================================================================
   @Tags + Notifications (bell)
   ================================================================= */
/** Comment text with "@Full Name" tags highlighted (longest names first). */
function renderMentions(text) {
  let html = esc(text);
  S.users.slice().sort((a, b) => String(b.Name).length - String(a.Name).length).forEach(u => {
    const tag = '@' + esc(u.Name);
    if (html.indexOf(tag) !== -1) html = html.split(tag).join('\u0001' + u.UserID + '\u0002');
  });
  return html.replace(/\u0001([^\u0002]*)\u0002/g, (m, id) => `<span class="mention">@${esc(userName(id))}</span>`);
}

/** Typing "@" in a textarea opens an employee list; pick with click, Enter or Tab. */
function attachMention(ta) {
  const box = document.createElement('div');
  box.className = 'mention-box hidden';
  ta.parentNode.appendChild(box);
  let list = [], idx = 0, start = -1;
  const close = () => { box.classList.add('hidden'); start = -1; list = []; };
  const draw = () => {
    box.innerHTML = list.map((u, i) => `<div class="mention-opt ${i === idx ? 'on' : ''}" data-i="${i}">
      <div class="avatar">${esc(initials(u.Name))}</div><div><div>${esc(u.Name)}</div><div class="faint small">${esc(u.Department || u.Role)}</div></div></div>`).join('');
    box.classList.toggle('hidden', !list.length);
  };
  const pick = u => {
    const caret = ta.selectionStart, ins = '@' + u.Name + ' ';
    ta.value = ta.value.slice(0, start) + ins + ta.value.slice(caret);
    const pos = start + ins.length;
    ta.focus(); ta.setSelectionRange(pos, pos);
    close();
  };
  ta.addEventListener('input', () => {
    const before = ta.value.slice(0, ta.selectionStart);
    const at = before.lastIndexOf('@');
    if (at === -1 || (at > 0 && !/\s/.test(before[at - 1]))) return close();
    const q = before.slice(at + 1).toLowerCase();
    if (q.length > 30 || q.indexOf('\n') !== -1) return close();
    list = S.users.filter(u => u.UserID !== S.me.id && String(u.Name).toLowerCase().indexOf(q) !== -1).slice(0, 8);
    start = at; idx = 0; draw();
  });
  ta.addEventListener('keydown', e => {
    if (box.classList.contains('hidden') || !list.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % list.length; draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + list.length) % list.length; draw(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(list[idx]); }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  box.addEventListener('mousedown', e => {
    const o = e.target.closest('[data-i]');
    if (o) { e.preventDefault(); pick(list[Number(o.dataset.i)]); }
  });
  ta.addEventListener('blur', () => setTimeout(close, 150));
}

const notifVerb = n => n.Type === 'assign' ? ' assigned you' : ' tagged you in';

function setUnread(n) {
  S.unread = n || 0;
  const b = $('#bellCount');
  b.textContent = S.unread > 9 ? '9+' : S.unread;
  b.classList.toggle('hidden', !S.unread);
}
/** Apply notifications from init / poll; toast when a new tag arrives. */
function setNotifs(r) {
  if (!r || r.notifs === undefined) return;
  const before = S.unread, wasLoaded = S.notifsLoaded;
  S.notifs = r.notifs || r.rows || [];
  S.notifsLoaded = true;
  setUnread(r.unread);
  if (wasLoaded && S.unread > before && S.notifs[0]) toast(userName(S.notifs[0].FromUser) + notifVerb(S.notifs[0]) + ' "' + S.notifs[0].TaskTitle + '"');
  if (!$('#bellPanel').classList.contains('hidden')) drawBell();
}
async function pollNotifs() {
  if (!S.me || document.hidden) return;
  try { const r = await call('listNotifs'); setNotifs({ notifs: r.rows, unread: r.unread }); } catch (e) {}
}
function startNotifPoll() { stopNotifPoll(); S.notifTimer = setInterval(pollNotifs, 60000); }
function stopNotifPoll() { if (S.notifTimer) clearInterval(S.notifTimer); S.notifTimer = null; }

function drawBell() {
  const rows = S.notifs || [];
  $('#bellPanel').innerHTML = `
    <div class="bell-head"><span>Notifications</span>${S.unread ? '<button class="link-btn" id="bellAll" type="button">Mark all read</button>' : ''}</div>
    <div class="bell-list">${rows.length ? rows.map(n => `
      <div class="notif ${String(n.Read).toUpperCase() === 'TRUE' ? '' : 'unread'}" data-n="${esc(n.NotifID)}" data-t="${esc(n.TaskID)}">
        <span class="notif-dot"></span>
        <div class="notif-body">
          <div><b>${esc(userName(n.FromUser))}</b>${esc(notifVerb(n))} <b>${esc(n.TaskTitle)}</b></div>
          <div class="notif-msg">${renderMentions(n.Message)}</div>
          <div class="notif-time">${esc(niceDateTime(n.CreatedAt))}</div>
        </div>
      </div>`).join('') : `<div class="empty small">${S.notifsLoaded ? 'No notifications yet. When someone tags you with @, it shows here.' : 'Loading…'}</div>`}
    </div>`;
}
function toggleBell(e) {
  e.stopPropagation();
  const p = $('#bellPanel');
  if (!p.classList.contains('hidden')) { p.classList.add('hidden'); return; }
  drawBell();
  p.classList.remove('hidden');
  pollNotifs();
}
async function markNotifs(ids) {
  let changed = 0;
  S.notifs.forEach(n => {
    if ((!ids || ids.indexOf(n.NotifID) !== -1) && String(n.Read).toUpperCase() !== 'TRUE') { n.Read = 'TRUE'; changed++; }
  });
  setUnread(ids ? Math.max(0, S.unread - changed) : 0);
  if (!$('#bellPanel').classList.contains('hidden')) drawBell();
  try {
    const r = await call('markNotifsRead', ids ? { ids: JSON.stringify(ids), reqId: newReqId() } : { reqId: newReqId() });
    setUnread(r.unread);
  } catch (e) {}
}
function onBellClick(e) {
  e.stopPropagation();
  if (e.target.closest('#bellAll')) { markNotifs(null); return; }
  const n = e.target.closest('.notif');
  if (!n) return;
  $('#bellPanel').classList.add('hidden');
  if (n.classList.contains('unread')) markNotifs([n.dataset.n]);
  openTask(n.dataset.t);
}

/* =================================================================
   Global wiring
   ================================================================= */
$('#loginForm').addEventListener('submit', doLogin);
$('#logoutBtn').onclick = () => logout(false);
$('#menuBtn').onclick = () => { $('#sidebar').classList.add('open'); $('#scrim').classList.add('show'); };
$('#scrim').onclick = closeSidebar;
window.addEventListener('hashchange', route);
$('#refreshBtn').onclick = manualRefresh;
$('#bellBtn').onclick = toggleBell;
$('#bellPanel').addEventListener('click', onBellClick);
document.addEventListener('click', e => { if (!e.target.closest('.bell-wrap')) $('#bellPanel').classList.add('hidden'); });

/* Auto refresh when the app comes back after more than a minute in the background */
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (S.me && hiddenAt && Date.now() - hiddenAt > 60000 && S.view !== 'settings' && !$('#modalRoot').children.length) manualRefresh();
});

/* Delegated: open task / tick done (works in every view and modal) */
document.addEventListener('click', e => {
  if (!S.me) return;
  const tick = e.target.closest('[data-tick]');
  if (tick) { e.stopPropagation(); toggleDone(tick.dataset.tick, tick); return; }
  const op = e.target.closest('[data-open]');
  if (op && !e.target.closest('button, select, a, input, textarea')) openTask(op.dataset.open);
});

/* Restore session */
/* Restore session: open instantly with the last saved data, then refresh with ONE call */
(async function init() {
  const sess = store.get('session'), snap = store.get('boot');
  if (!(sess && sess.token)) { $('#pin').focus(); return; }
  S.token = sess.token;
  $('#loginView').classList.add('hidden');
  const instant = !!(snap && snap.me);
  if (instant) startApp(snap);
  try {
    const r = await call('init');
    if (!instant) { startApp(r); return; }
    const roleChanged = S.me.id !== r.me.id || S.me.role !== r.me.role;
    applyBoot(r);
    vcSet(vcKey('listTasks', myParams()), r.my);
    if (roleChanged) {
      paintShell();
      S.cacheOnly = true;
      try { route(); } finally { S.cacheOnly = false; }
    } else {
      $('#meName').textContent = S.me.name;
      $('#meRole').textContent = S.me.role + (S.me.dept ? ' · ' + S.me.dept : '');
      rerender();
    }
    setPending(r.pending || 0);
    setNotifs(r);
  } catch (e) {
    if (!S.token) return;                              // session expired: login screen already shown
    if (instant) { toast('Could not connect. Showing last saved data.', false); return; }
    S.token = null; store.del('session');
    $('#appView').classList.add('hidden');
    $('#loginView').classList.remove('hidden');
    $('#loginErr').textContent = e.message;
  }
})();

/* PWA */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
