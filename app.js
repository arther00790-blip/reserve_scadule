import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://alobahjrrtxiiqbkjxyc.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsb2JhaGpycnR4aWlxYmtqeHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTcxMDcsImV4cCI6MjA5MDQ3MzEwN30.1hJqj-8-JTwHncZ5dwB3EuoVj5FNOPdl3hdRsZNH91w';

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

'use strict';

// ============================================================
// MAPPERS  (DB snake_case → JS camelCase)
// ============================================================

function mapUser(r) {
  return { id: r.id, name: r.name, email: r.email, password: r.password, role: r.role, createdAt: r.created_at };
}
function mapSlot(r) {
  return { id: r.id, title: r.title, theme: r.theme, date: r.date, startTime: r.start_time, endTime: r.end_time, capacity: r.capacity, notes: r.notes || '', status: r.status, method: r.method || '対面', createdBy: r.created_by, createdAt: r.created_at };
}
function mapReservation(r) {
  return { id: r.id, slotId: r.slot_id, userId: r.user_id, method: r.method, comment: r.comment || '', meetUrl: r.meet_url, status: r.status, createdAt: r.created_at };
}

// JS camelCase → DB snake_case
function toDbSlot(o) {
  return { id: o.id, title: o.title, theme: o.theme, date: o.date, start_time: o.startTime, end_time: o.endTime, capacity: o.capacity, notes: o.notes, status: o.status, method: o.method, created_by: o.createdBy, created_at: o.createdAt };
}
function toDbReservation(o) {
  return { id: o.id, slot_id: o.slotId, user_id: o.userId, method: o.method, comment: o.comment, meet_url: o.meetUrl, status: o.status, created_at: o.createdAt };
}
function toDbUser(o) {
  return { id: o.id, name: o.name, email: o.email, password: o.password, role: o.role, created_at: o.createdAt };
}

// ============================================================
// STATE
// ============================================================

const state = {
  currentUser: null,
  currentView: 'login',
  users: [],
  slots: [],
  reservations: [],
};

// ============================================================
// DB LOAD
// ============================================================

async function loadData() {
  const [{ data: users, error: e1 }, { data: slots, error: e2 }, { data: reservations, error: e3 }] = await Promise.all([
    db.from('users').select('*'),
    db.from('slots').select('*'),
    db.from('reservations').select('*'),
  ]);
  if (e1 || e2 || e3) {
    console.error('DB load error', e1, e2, e3);
    showToast('データの読み込みに失敗しました', 'error');
    return;
  }
  state.users        = (users        || []).map(mapUser);
  state.slots        = (slots        || []).map(mapSlot);
  state.reservations = (reservations || []).map(mapReservation);
}

// ============================================================
// AUTH（Supabase Auth版）
// ============================================================

async function login(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user) return false;

  // usersテーブルからrole等を取得
  const { data: userData } = await db.from('users').select('*').eq('email', email).single();
  if (!userData) return false;

  state.currentUser = mapUser(userData);
  return true;
}

async function logout() {
  await db.auth.signOut();
  state.currentUser = null;
  navigate('login');
}

async function restoreSession() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return false;

  const { data: userData } = await db.from('users').select('*').eq('email', session.user.email).single();
  if (!userData) return false;

  state.currentUser = mapUser(userData);
  return true;
}

// ============================================================
// NAVIGATION
// ============================================================

const NAV_ITEMS = {
  admin: [
    { view: 'dashboard',           label: 'ダッシュボード',   icon: '◉' },
    { view: 'slots',               label: '候補日程管理',     icon: '📋' },
    { view: 'reservation-status',  label: '予約状況',         icon: '📊' },
    { view: 'users',               label: 'ユーザー管理',     icon: '👥' },
  ],
  management: [
    { view: 'dashboard',           label: 'ダッシュボード',   icon: '◉' },
    { view: 'slots',               label: '候補日程管理',     icon: '📋' },
    { view: 'reservation-status',  label: '予約状況',         icon: '📊' },
  ],
  engineer: [
    { view: 'dashboard',           label: 'ダッシュボード',   icon: '◉' },
    { view: 'slot-list',           label: '候補日程一覧',     icon: '📅' },
    { view: 'my-reservations',     label: 'マイ予約',         icon: '🗓️' },
  ],
};

function navigate(view) {
  state.currentView = view;
  render();
}

function render() {
  if (state.currentView === 'login' || !state.currentUser) {
    document.getElementById('view-login').style.display = 'flex';
    document.getElementById('app-shell').style.display  = 'none';
    return;
  }

  document.getElementById('view-login').style.display = 'none';
  document.getElementById('app-shell').style.display  = 'flex';

  renderShell();

  const views = {
    dashboard:            renderDashboard,
    slots:                renderSlotManagement,
    'slot-list':          renderSlotList,
    'my-reservations':    renderMyReservations,
    'reservation-status': renderReservationStatus,
    users:                renderUserManagement,
  };

  const fn = views[state.currentView];
  if (fn) fn();
}

function renderShell() {
  const u = state.currentUser;
  document.getElementById('user-avatar').textContent    = u.name[0];
  document.getElementById('user-name').textContent      = u.name;
  document.getElementById('user-role-label').textContent = roleLabel(u.role);

  const nav   = document.getElementById('sidebar-nav');
  const items = NAV_ITEMS[u.role] || NAV_ITEMS.engineer;

  nav.innerHTML = items.map(item => `
    <a class="nav-item ${state.currentView === item.view ? 'active' : ''}"
       data-view="${item.view}" href="#">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
    </a>
  `).join('');

  nav.querySelectorAll('.nav-item').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      navigate(a.dataset.view);
    });
  });
}

// ============================================================
// VIEWS
// ============================================================

// ----- DASHBOARD -----
function renderDashboard() {
  setPageTitle('ダッシュボード');
  document.getElementById('header-actions').innerHTML = '';

  const u       = state.currentUser;
  const isManager = u.role === 'management' || u.role === 'admin';
  const today   = new Date();
  today.setHours(0, 0, 0, 0);
  const main    = document.getElementById('main-content');

  if (isManager) {
    const pubSlots    = state.slots.filter(s => s.status === 'published');
    const activeRes   = state.reservations.filter(r => r.status !== 'cancelled');
    const pendingRes  = state.reservations.filter(r => r.status === 'pending');
    const upcoming    = pubSlots
      .filter(s => new Date(s.date) >= today)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 6);

    main.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${pubSlots.length}</div>
          <div class="stat-label">公開中スロット</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${activeRes.length}</div>
          <div class="stat-label">総予約数</div>
        </div>
        <div class="stat-card ${pendingRes.length > 0 ? 'stat-alert' : ''}">
          <div class="stat-value">${pendingRes.length}</div>
          <div class="stat-label">未承認の予約</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${state.users.filter(u => u.role === 'engineer').length}</div>
          <div class="stat-label">エンジニア数</div>
        </div>
      </div>
      <div class="section-card">
        <h3 class="section-title">直近の打ち合わせ</h3>
        ${upcoming.length === 0
          ? '<p class="empty">公開中の予定はありません</p>'
          : `<div class="table-scroll"><table class="data-table">
              <thead><tr>
                <th>日程</th><th>タイトル / テーマ</th><th>定員 / 予約数</th><th>ステータス</th>
              </tr></thead>
              <tbody>
                ${upcoming.map(s => {
                  const cnt = activeCount(s.id);
                  const pct = Math.min(100, cnt / s.capacity * 100);
                  return `<tr>
                    <td>${formatDate(s.date)}<br><small>${s.startTime}〜${s.endTime}</small></td>
                    <td><strong>${s.title}</strong><br><small>${s.theme}</small></td>
                    <td>
                      <div class="capacity-bar-wrap">
                        <div class="capacity-bar-track">
                          <div class="capacity-bar-fill ${pct >= 100 ? 'full' : pct >= 70 ? 'warn' : ''}" style="width:${pct}%"></div>
                        </div>
                        <span class="capacity-text">${cnt}/${s.capacity}名</span>
                      </div>
                    </td>
                    <td><span class="badge ${s.status === 'published' ? 'badge-green' : 'badge-gray'}">${s.status === 'published' ? '公開中' : '下書き'}</span></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table></div>`
        }
      </div>
    `;
  } else {
    // Engineer dashboard
    const myRes   = state.reservations.filter(r => r.userId === u.id && r.status !== 'cancelled');
    const week    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newSlots = state.slots.filter(s => s.status === 'published' && new Date(s.createdAt) >= week);
    const upcoming = myRes
      .map(r => ({ ...r, slot: state.slots.find(s => s.id === r.slotId) }))
      .filter(r => r.slot && new Date(r.slot.date) >= today)
      .sort((a, b) => new Date(a.slot.date) - new Date(b.slot.date));

    main.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${myRes.length}</div>
          <div class="stat-label">予約済み件数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${upcoming.length}</div>
          <div class="stat-label">今後の打ち合わせ</div>
        </div>
        <div class="stat-card ${newSlots.length > 0 ? 'stat-info' : ''}">
          <div class="stat-value">${newSlots.length}</div>
          <div class="stat-label">新着スロット</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${state.slots.filter(s => s.status === 'published').length}</div>
          <div class="stat-label">公開中スロット</div>
        </div>
      </div>

      <div class="section-card">
        <h3 class="section-title">予約済みの打ち合わせ（直近）</h3>
        ${upcoming.length === 0
          ? '<p class="empty">予約済みの打ち合わせはありません</p>'
          : `<div class="card-list">
              ${upcoming.slice(0, 4).map(r => `
                <div class="reservation-item">
                  <div class="reservation-date">${formatDateShort(r.slot.date)}</div>
                  <div class="reservation-info" style="flex:1">
                    <div class="reservation-title">${r.slot.title}</div>
                    <div class="reservation-meta">${r.slot.startTime}〜${r.slot.endTime} ／ ${r.slot.theme}</div>
                    <div class="reservation-method">
                      ${r.method === 'web'
                        ? `<span class="badge badge-blue">Web</span>${r.meetUrl ? ` <a href="${r.meetUrl}" target="_blank" class="meet-link">Google Meet</a>` : ''}`
                        : `<span class="badge badge-green">対面</span>`}
                      <span class="badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>`
        }
      </div>

      ${newSlots.length > 0 ? `
        <div class="section-card">
          <h3 class="section-title">新着の候補日程</h3>
          <div class="new-slots">
            ${newSlots.slice(0, 3).map(s => `
              <div class="slot-chip">
                <strong>${s.title}</strong>
                <span>${formatDate(s.date)} ${s.startTime}〜${s.endTime}</span>
                <button class="btn btn-sm btn-primary" onclick="openReservationModal('${s.id}')">予約する</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }
}

// ----- SLOT MANAGEMENT (management / admin) -----
function renderSlotManagement() {
  setPageTitle('候補日程管理', '打ち合わせスロットの登録・編集・削除');
  document.getElementById('header-actions').innerHTML = `
    <button class="btn btn-primary" id="add-slot-btn">＋ 新規スロット登録</button>
  `;
  document.getElementById('add-slot-btn').addEventListener('click', () => openSlotModal());

  const slots = [...state.slots].sort((a, b) => new Date(a.date) - new Date(b.date));
  document.getElementById('main-content').innerHTML = `
    <div class="section-card">
      <div class="filter-bar">
        <select id="filter-status" class="filter-select">
          <option value="all">すべて表示</option>
          <option value="published">公開中のみ</option>
          <option value="draft">下書きのみ</option>
        </select>
      </div>
      <div class="table-scroll"><table class="data-table table-slots">
        <thead><tr>
          <th>日程</th>
          <th>タイトル / テーマ</th>
          <th>定員 / 予約</th>
          <th>ステータス</th>
          <th>操作</th>
        </tr></thead>
        <tbody id="slots-tbody">${renderSlotRows(slots)}</tbody>
      </table></div>
    </div>
  `;

  document.getElementById('filter-status').addEventListener('change', e => {
    const v = e.target.value;
    const filtered = v === 'all' ? slots : slots.filter(s => s.status === v);
    document.getElementById('slots-tbody').innerHTML = renderSlotRows(filtered);
    attachSlotActions();
  });

  attachSlotActions();
}

function renderSlotRows(slots) {
  if (!slots.length) return '<tr><td colspan="5" class="empty-cell">スロットがありません</td></tr>';
  return slots.map(s => {
    const cnt = activeCount(s.id);
    const pct = Math.min(100, cnt / s.capacity * 100);
    return `
      <tr>
        <td>${formatDate(s.date)}<br><small>${s.startTime}〜${s.endTime}</small></td>
        <td><strong>${s.title}</strong><br><small>${s.theme}</small></td>
        <td>
          <div class="capacity-bar-wrap">
            <div class="capacity-bar-track">
              <div class="capacity-bar-fill ${pct >= 100 ? 'full' : pct >= 70 ? 'warn' : ''}" style="width:${pct}%"></div>
            </div>
            <span class="capacity-text">${cnt}/${s.capacity}名</span>
          </div>
        </td>
        <td>
          <span class="badge ${s.status === 'published' ? 'badge-green' : 'badge-gray'}">
            ${s.status === 'published' ? '公開中' : '下書き'}
          </span>
        </td>
        <td class="action-cell">
          <button class="btn btn-sm btn-outline slot-toggle" data-id="${s.id}">
            ${s.status === 'published' ? '非公開' : '公開'}
          </button>
          <button class="btn btn-sm btn-outline slot-edit" data-id="${s.id}">編集</button>
          <button class="btn btn-sm btn-outline slot-duplicate" data-id="${s.id}">複製</button>
          <button class="btn btn-sm btn-danger slot-delete" data-id="${s.id}">削除</button>
        </td>
      </tr>
    `;
  }).join('');
}

function attachSlotActions() {
  document.querySelectorAll('.slot-edit').forEach(btn => {
    btn.addEventListener('click', () => openSlotModal(btn.dataset.id));
  });
  document.querySelectorAll('.slot-delete').forEach(btn => {
    btn.addEventListener('click', () => confirmDeleteSlot(btn.dataset.id));
  });
  document.querySelectorAll('.slot-duplicate').forEach(btn => {
    btn.addEventListener('click', () => duplicateSlot(btn.dataset.id));
  });
  document.querySelectorAll('.slot-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const slot = state.slots.find(s => s.id === btn.dataset.id);
      if (!slot) return;
      const newStatus = slot.status === 'published' ? 'draft' : 'published';
      const { error } = await db.from('slots').update({ status: newStatus }).eq('id', slot.id);
      if (error) { showToast('エラーが発生しました', 'error'); return; }
      slot.status = newStatus;
      showToast(`スロットを${newStatus === 'published' ? '公開' : '非公開に'}しました`);
      renderSlotManagement();
    });
  });
}

// ----- SLOT LIST (engineer) -----
function renderSlotList() {
  setPageTitle('候補日程一覧', '予約可能な打ち合わせスロット');
  document.getElementById('header-actions').innerHTML = '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const slots = state.slots
    .filter(s => s.status === 'published' && new Date(s.date) >= today)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const myRes = state.reservations.filter(r => r.userId === state.currentUser.id);
  const main  = document.getElementById('main-content');

  if (!slots.length) {
    main.innerHTML = '<div class="section-card"><p class="empty">現在、予約可能なスロットはありません</p></div>';
    return;
  }

  main.innerHTML = `<div class="slot-cards">${slots.map(s => {
    const cnt   = activeCount(s.id);
    const isFull = cnt >= s.capacity;
    const myR   = myRes.find(r => r.slotId === s.id && r.status !== 'cancelled');
    const pct   = Math.min(100, cnt / s.capacity * 100);
    return `
      <div class="slot-card ${isFull && !myR ? 'slot-card-full' : ''}">
        <div class="slot-card-header">
          <div>
            <div class="slot-date">${formatDate(s.date)}</div>
            <div class="slot-time">${s.startTime} 〜 ${s.endTime}</div>
          </div>
          ${isFull
            ? '<span class="badge badge-red">満員</span>'
            : '<span class="badge badge-green">空きあり</span>'}
        </div>
        <h3 class="slot-title">${s.title}</h3>
        <p class="slot-theme">${s.theme}</p>
        <p class="slot-theme"><span class="badge ${s.method === 'Web面談（GoogleMeet）' ? 'badge-blue' : 'badge-green'}">${s.method}</span></p>
        ${s.notes ? `<p class="slot-notes">${s.notes}</p>` : ''}
        <div class="slot-capacity">
          <div class="progress-bar">
            <div class="progress-fill ${pct >= 100 ? 'full' : pct >= 70 ? 'warn' : ''}" style="width:${pct}%"></div>
          </div>
          <span class="capacity-text">残り${s.capacity - cnt}名（${cnt}/${s.capacity}名）</span>
        </div>
        <div class="slot-card-footer">
          ${myR
            ? `<span class="badge badge-blue">予約済み</span>
               <span class="badge ${statusBadgeClass(myR.status)}">${statusLabel(myR.status)}</span>
               ${myR.method === 'web' && myR.meetUrl
                 ? `<a href="${myR.meetUrl}" target="_blank" class="btn btn-sm btn-outline">Meet</a>`
                 : ''}`
            : isFull
              ? `<button class="btn btn-sm btn-disabled" disabled>満員</button>`
              : `<button class="btn btn-sm btn-primary reserve-btn" data-slot-id="${s.id}">予約する</button>`}
        </div>
      </div>
    `;
  }).join('')}</div>`;

  document.querySelectorAll('.reserve-btn').forEach(btn => {
    btn.addEventListener('click', () => openReservationModal(btn.dataset.slotId));
  });
}

// ----- MY RESERVATIONS (engineer) -----
function renderMyReservations() {
  setPageTitle('マイ予約', '自分の予約一覧・キャンセル');
  document.getElementById('header-actions').innerHTML = '';

  const reservations = state.reservations
    .filter(r => r.userId === state.currentUser.id)
    .map(r => ({ ...r, slot: state.slots.find(s => s.id === r.slotId) }))
    .filter(r => r.slot)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const main = document.getElementById('main-content');

  if (!reservations.length) {
    main.innerHTML = `
      <div class="section-card">
        <p class="empty">予約がありません。
          <a href="#" onclick="event.preventDefault(); navigate('slot-list')">候補日程一覧</a>から予約してください。
        </p>
      </div>
    `;
    return;
  }

  main.innerHTML = `
    <div class="section-card">
      <div class="table-scroll"><table class="data-table">
        <thead><tr>
          <th>日程</th>
          <th>タイトル / テーマ</th>
          <th>面談方法</th>
          <th>コメント</th>
          <th>ステータス</th>
          <th>操作</th>
        </tr></thead>
        <tbody>
          ${reservations.map(r => `
            <tr class="${r.status === 'cancelled' ? 'row-cancelled' : ''}">
              <td>${formatDate(r.slot.date)}<br><small>${r.slot.startTime}〜${r.slot.endTime}</small></td>
              <td><strong>${r.slot.title}</strong><br><small>${r.slot.theme}</small></td>
              <td>
                ${r.method === 'web'
                  ? `<span class="badge badge-blue">Web</span>
                     ${r.meetUrl ? `<br><a href="${r.meetUrl}" target="_blank" class="meet-link-small">Meet URL</a>` : ''}`
                  : `<span class="badge badge-green">対面</span>`}
              </td>
              <td style="max-width:180px;word-break:break-word">${r.comment || '—'}</td>
              <td><span class="badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span></td>
              <td>
                ${r.status !== 'cancelled'
                  ? `<button class="btn btn-sm btn-danger cancel-res-btn" data-id="${r.id}">キャンセル</button>`
                  : '—'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    </div>
  `;

  document.querySelectorAll('.cancel-res-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmCancelReservation(btn.dataset.id));
  });
}

// ----- RESERVATION STATUS (management / admin) -----
function renderReservationStatus() {
  setPageTitle('予約状況', '各スロットの予約者一覧・承認管理');
  document.getElementById('header-actions').innerHTML = '';

  const slots = [...state.slots].sort((a, b) => new Date(a.date) - new Date(b.date));
  const main  = document.getElementById('main-content');

  main.innerHTML = slots.map(s => {
    const ress = state.reservations
      .filter(r => r.slotId === s.id)
      .map(r => ({ ...r, user: state.users.find(u => u.id === r.userId) }))
      .filter(r => r.user)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const cnt = activeCount(s.id);

    return `
      <div class="section-card">
        <div class="slot-header-row">
          <div>
            <h3 class="slot-section-title">${s.title}</h3>
            <p class="slot-section-meta">${formatDate(s.date)} ${s.startTime}〜${s.endTime} ／ ${s.theme}</p>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <span class="badge ${s.status === 'published' ? 'badge-green' : 'badge-gray'}">
              ${s.status === 'published' ? '公開中' : '下書き'}
            </span>
            <span class="badge badge-blue">${cnt}/${s.capacity}名</span>
          </div>
        </div>
        ${!ress.length
          ? '<p class="empty">予約はありません</p>'
          : `<div class="table-scroll"><table class="data-table">
              <thead><tr>
                <th>氏名</th>
                <th>面談方法</th>
                <th>コメント</th>
                <th>予約日時</th>
                <th>ステータス</th>
                <th>操作</th>
              </tr></thead>
              <tbody>
                ${ress.map(r => `
                  <tr class="${r.status === 'cancelled' ? 'row-cancelled' : ''}">
                    <td><strong>${r.user.name}</strong></td>
                    <td>
                      ${r.method === 'web'
                        ? `<span class="badge badge-blue">Web</span>${r.meetUrl ? `<br><a href="${r.meetUrl}" target="_blank" class="meet-link-small">Meet URL</a>` : ''}`
                        : `<span class="badge badge-green">対面</span>`}
                    </td>
                    <td style="max-width:160px;word-break:break-word">${r.comment || '—'}</td>
                    <td style="white-space:nowrap">${formatDateTime(r.createdAt)}</td>
                    <td><span class="badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span></td>
                    <td class="action-cell">
                      ${r.status === 'pending'
                        ? `<button class="btn btn-sm btn-primary approve-btn" data-id="${r.id}">承認</button>
                           <button class="btn btn-sm btn-danger reject-btn" data-id="${r.id}">却下</button>`
                        : r.status === 'confirmed'
                          ? `<button class="btn btn-sm btn-danger reject-btn" data-id="${r.id}">却下</button>`
                          : '—'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table></div>`}
      </div>
    `;
  }).join('');

  document.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await setReservationStatus(btn.dataset.id, 'confirmed');
      showToast('予約を承認しました', 'success');
      renderReservationStatus();
    });
  });

  document.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await setReservationStatus(btn.dataset.id, 'cancelled');
      showToast('予約を却下しました', 'warning');
      renderReservationStatus();
    });
  });
}

// ----- USER MANAGEMENT (admin) -----
function renderUserManagement() {
  setPageTitle('ユーザー管理', 'システム利用者の追加・編集・削除');
  document.getElementById('header-actions').innerHTML = `
    <button class="btn btn-primary" id="add-user-btn">＋ ユーザー追加</button>
  `;
  document.getElementById('add-user-btn').addEventListener('click', () => openUserModal());

  document.getElementById('main-content').innerHTML = `
    <div class="section-card">
      <div class="table-scroll"><table class="data-table">
        <thead><tr>
          <th>氏名</th>
          <th>メールアドレス</th>
          <th>ロール</th>
          <th>登録日</th>
          <th>操作</th>
        </tr></thead>
        <tbody>
          ${state.users.map(u => `
            <tr>
              <td><strong>${u.name}</strong></td>
              <td>${u.email}</td>
              <td><span class="badge ${roleBadgeClass(u.role)}">${roleLabel(u.role)}</span></td>
              <td>${u.createdAt || '—'}</td>
              <td class="action-cell">
                <button class="btn btn-sm btn-outline user-edit-btn" data-id="${u.id}">編集</button>
                ${u.id !== state.currentUser.id
                  ? `<button class="btn btn-sm btn-danger user-delete-btn" data-id="${u.id}">削除</button>`
                  : '<span class="text-muted">（自分）</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    </div>
  `;

  document.querySelectorAll('.user-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openUserModal(btn.dataset.id));
  });
  document.querySelectorAll('.user-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDeleteUser(btn.dataset.id));
  });
}

// ============================================================
// MODALS
// ============================================================

function openModal(title, bodyHTML) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML    = bodyHTML;
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

// ----- SLOT MODAL -----
function openSlotModal(slotId = null) {
  const slot  = slotId ? state.slots.find(s => s.id === slotId) : null;
  const title = slot ? 'スロットを編集' : '新規スロット登録';

  openModal(title, `
    <form id="slot-form" novalidate>
      <div class="form-grid">
        <div class="form-field">
          <label>タイトル <span class="required">*</span></label>
          <input type="text" id="sf-title" value="${slot ? esc(slot.title) : ''}" placeholder="月次定例打ち合わせ" required>
        </div>
        <div class="form-field">
          <label>テーマ <span class="required">*</span></label>
          <input type="text" id="sf-theme" value="${slot ? esc(slot.theme) : ''}" placeholder="第1四半期レビュー" required>
        </div>
        <div class="form-field">
          <label>日付 <span class="required">*</span></label>
          <input type="date" id="sf-date" value="${slot ? slot.date : ''}" required>
        </div>
        <div class="form-field">
          <label>開始時刻 <span class="required">*</span></label>
          <input type="time" id="sf-start" value="${slot ? slot.startTime : '10:00'}" required>
        </div>
        <div class="form-field">
          <label>終了時刻 <span class="required">*</span></label>
          <input type="time" id="sf-end" value="${slot ? slot.endTime : '11:00'}" required>
        </div>
        <div class="form-field">
          <label>定員（名） <span class="required">*</span></label>
          <input type="number" id="sf-capacity" value="${slot ? slot.capacity : 1}" min="1" max="100" required>
        </div>
        <div class="form-field full-width">
          <label>備考</label>
          <textarea id="sf-notes" rows="3" placeholder="補足説明など">${slot ? esc(slot.notes) : ''}</textarea>
        </div>
        <div class="form-field">
          <label>面談方法 <span class="required">*</span></label>
          <select id="sf-method">
            <option value="対面"              ${!slot || slot.method === '対面'              ? 'selected' : ''}>対面</option>
            <option value="Web面談（GoogleMeet）" ${slot && slot.method === 'Web面談（GoogleMeet）' ? 'selected' : ''}>Web面談（GoogleMeet）</option>
          </select>
        </div>
        <div class="form-field">
          <label>ステータス</label>
          <select id="sf-status">
            <option value="draft"     ${slot && slot.status === 'draft'      ? 'selected' : ''}>下書き（非公開）</option>
            <option value="published" ${!slot || slot.status === 'published' ? 'selected' : ''}>公開</option>
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">キャンセル</button>
        <button type="submit" class="btn btn-primary">${slot ? '更新する' : '登録する'}</button>
      </div>
    </form>
  `);

  document.getElementById('slot-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      title:     document.getElementById('sf-title').value.trim(),
      theme:     document.getElementById('sf-theme').value.trim(),
      date:      document.getElementById('sf-date').value,
      startTime: document.getElementById('sf-start').value,
      endTime:   document.getElementById('sf-end').value,
      capacity:  parseInt(document.getElementById('sf-capacity').value, 10),
      notes:     document.getElementById('sf-notes').value.trim(),
      status:    document.getElementById('sf-status').value,
      method:    document.getElementById('sf-method').value,
    };

    if (!data.title || !data.theme || !data.date || !data.startTime || !data.endTime) {
      showToast('必須項目を入力してください', 'error');
      return;
    }

    if (slot) {
      const { error } = await db.from('slots').update({
        title: data.title, theme: data.theme, date: data.date,
        start_time: data.startTime, end_time: data.endTime,
        capacity: data.capacity, notes: data.notes, status: data.status,
        method: data.method,
      }).eq('id', slot.id);
      if (error) { showToast('エラーが発生しました', 'error'); return; }
      Object.assign(slot, data);
      showToast('スロットを更新しました', 'success');
    } else {
      const newSlot = {
        id: 's' + Date.now(),
        ...data,
        createdBy: state.currentUser.id,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      const { error } = await db.from('slots').insert(toDbSlot(newSlot));
      if (error) { showToast('エラーが発生しました', 'error'); return; }
      state.slots.push(newSlot);
      showToast('スロットを登録しました', 'success');
    }

    closeModal();
    renderSlotManagement();
  });
}

// ----- RESERVATION MODAL -----
function openReservationModal(slotId) {
  const slot = state.slots.find(s => s.id === slotId);
  if (!slot) return;

  openModal('打ち合わせを予約する', `
    <div class="reservation-slot-info">
      <h3>${slot.title}</h3>
      <p>${formatDate(slot.date)}　${slot.startTime}〜${slot.endTime}</p>
      <p>${slot.theme}</p>
    </div>
    <form id="reservation-form" novalidate>
      <div class="form-field">
        <label>面談方法 <span class="required">*</span></label>
        <div class="radio-group">
          <label class="radio-option">
            <input type="radio" name="method" value="face" checked>
            <span class="radio-label">
              <strong>対面</strong>
              <small>社内会議室での実施</small>
            </span>
          </label>
          <label class="radio-option">
            <input type="radio" name="method" value="web">
            <span class="radio-label">
              <strong>Web（Google Meet）</strong>
              <small>予約確定時にGoogle Meet URLを自動発行します</small>
            </span>
          </label>
        </div>
      </div>
      <div class="form-field">
        <label>コメント（任意）</label>
        <textarea id="rf-comment" rows="3" placeholder="議題・質問事項などを入力してください"></textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">キャンセル</button>
        <button type="submit" class="btn btn-primary">予約を確定する</button>
      </div>
    </form>
  `);

  document.getElementById('reservation-form').addEventListener('submit', async e => {
    e.preventDefault();

    const cnt = activeCount(slotId);
    if (cnt >= slot.capacity) {
      showToast('このスロットは満員です', 'error');
      closeModal();
      return;
    }

    const dup = state.reservations.find(
      r => r.slotId === slotId && r.userId === state.currentUser.id && r.status !== 'cancelled'
    );
    if (dup) {
      showToast('このスロットには既に予約済みです', 'error');
      closeModal();
      return;
    }

    const method  = document.querySelector('input[name="method"]:checked').value;
    const comment = document.getElementById('rf-comment').value.trim();
    const meetUrl = method === 'web' ? generateMeetUrl() : null;

    const newRes = {
      id:        'r' + Date.now(),
      slotId,
      userId:    state.currentUser.id,
      method,
      comment,
      meetUrl,
      status:    'pending',
      createdAt: new Date().toISOString(),
    };

    const { error } = await db.from('reservations').insert(toDbReservation(newRes));
    if (error) { showToast('エラーが発生しました', 'error'); return; }
    state.reservations.push(newRes);
    closeModal();

    const msg = method === 'web'
      ? `予約しました。Google Meet URLを発行しました（承認後に有効です）。`
      : `予約しました（対面）。承認をお待ちください。`;
    showToast(msg, 'success');

    if (state.currentView === 'slot-list') renderSlotList();
    else if (state.currentView === 'dashboard') renderDashboard();
  });
}

// ----- USER MODAL -----
function openUserModal(userId = null) {
  const user  = userId ? state.users.find(u => u.id === userId) : null;
  const title = user ? 'ユーザーを編集' : 'ユーザーを追加';

  openModal(title, `
    <form id="user-form" novalidate>
      <div class="form-field">
        <label>氏名 <span class="required">*</span></label>
        <input type="text" id="uf-name" value="${user ? esc(user.name) : ''}" placeholder="山田 太郎" required>
      </div>
      <div class="form-field">
        <label>メールアドレス <span class="required">*</span></label>
        <input type="email" id="uf-email" value="${user ? esc(user.email) : ''}" placeholder="user@company.com" required>
      </div>
      <div class="form-field">
        <label>パスワード ${user ? '（変更する場合のみ入力）' : '<span class="required">*</span>'}</label>
        <input type="password" id="uf-password" placeholder="${user ? '空欄の場合は変更なし' : 'パスワードを入力'}">
      </div>
      <div class="form-field">
        <label>ロール <span class="required">*</span></label>
        <select id="uf-role">
          <option value="engineer"   ${user && user.role === 'engineer'   ? 'selected' : ''}>エンジニア</option>
          <option value="management" ${user && user.role === 'management' ? 'selected' : ''}>マネジメント部</option>
          <option value="admin"      ${user && user.role === 'admin'      ? 'selected' : ''}>管理者</option>
        </select>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">キャンセル</button>
        <button type="submit" class="btn btn-primary">${user ? '更新する' : '追加する'}</button>
      </div>
    </form>
  `);

  document.getElementById('user-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name     = document.getElementById('uf-name').value.trim();
    const email    = document.getElementById('uf-email').value.trim();
    const password = document.getElementById('uf-password').value;
    const role     = document.getElementById('uf-role').value;

    if (!name || !email) { showToast('必須項目を入力してください', 'error'); return; }

    const dup = state.users.find(u => u.email === email && u.id !== userId);
    if (dup) { showToast('このメールアドレスは既に使用されています', 'error'); return; }

    if (user) {
      const updateData = { name, email, role };
      if (password) updateData.password = password;
      const { error } = await db.from('users').update(updateData).eq('id', user.id);
      if (error) { showToast('エラーが発生しました', 'error'); return; }
      user.name  = name;
      user.email = email;
      user.role  = role;
      if (password) user.password = password;
      showToast('ユーザーを更新しました', 'success');
    } else {
      if (!password) { showToast('パスワードを入力してください', 'error'); return; }
      const newUser = {
        id: 'u' + Date.now(),
        name, email, password, role,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      const { error } = await db.from('users').insert(toDbUser(newUser));
      if (error) { showToast('エラーが発生しました', 'error'); return; }
      state.users.push(newUser);
      showToast('ユーザーを追加しました', 'success');
    }

    closeModal();
    renderUserManagement();
  });
}

// ============================================================
// CONFIRM DIALOGS
// ============================================================

function confirmDeleteSlot(slotId) {
  const slot = state.slots.find(s => s.id === slotId);
  if (!slot) return;
  const hasRes = state.reservations.some(r => r.slotId === slotId && r.status !== 'cancelled');

  openModal('スロットを削除', `
    <p>「<strong>${slot.title}</strong>」を削除しますか？</p>
    ${hasRes ? '<p class="warning-text">このスロットには有効な予約があります。削除すると予約もすべてキャンセルされます。</p>' : ''}
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-danger" id="confirm-del-slot">削除する</button>
    </div>
  `);

  document.getElementById('confirm-del-slot').addEventListener('click', async () => {
    const { error: e1 } = await db.from('reservations').delete().eq('slot_id', slotId);
    const { error: e2 } = await db.from('slots').delete().eq('id', slotId);
    if (e1 || e2) { showToast('エラーが発生しました', 'error'); return; }
    state.slots        = state.slots.filter(s => s.id !== slotId);
    state.reservations = state.reservations.filter(r => r.slotId !== slotId);
    showToast('スロットを削除しました', 'warning');
    closeModal();
    renderSlotManagement();
  });
}

function confirmCancelReservation(resId) {
  openModal('予約をキャンセル', `
    <p>この予約をキャンセルしますか？キャンセル後は元に戻せません。</p>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">戻る</button>
      <button class="btn btn-danger" id="confirm-cancel-res">キャンセルする</button>
    </div>
  `);

  document.getElementById('confirm-cancel-res').addEventListener('click', async () => {
    await setReservationStatus(resId, 'cancelled');
    showToast('予約をキャンセルしました', 'warning');
    closeModal();
    renderMyReservations();
  });
}

function confirmDeleteUser(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;

  openModal('ユーザーを削除', `
    <p>「<strong>${user.name}</strong>」を削除しますか？</p>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-danger" id="confirm-del-user">削除する</button>
    </div>
  `);

  document.getElementById('confirm-del-user').addEventListener('click', async () => {
    const { error } = await db.from('users').delete().eq('id', userId);
    if (error) { showToast('エラーが発生しました', 'error'); return; }
    state.users = state.users.filter(u => u.id !== userId);
    showToast('ユーザーを削除しました', 'warning');
    closeModal();
    renderUserManagement();
  });
}

// ============================================================
// DATA HELPERS
// ============================================================

async function duplicateSlot(slotId) {
  const original = state.slots.find(s => s.id === slotId);
  if (!original) return;

  const newSlot = {
    ...original,
    id:        's' + Date.now(),
    title:     original.title + '（複製）',
    status:    'draft',
    createdAt: new Date().toISOString().slice(0, 10),
  };

  const { error } = await db.from('slots').insert(toDbSlot(newSlot));
  if (error) { showToast('エラーが発生しました', 'error'); return; }
  state.slots.push(newSlot);
  showToast('スロットを複製しました', 'success');
  renderSlotManagement();
}

function activeCount(slotId) {
  return state.reservations.filter(r => r.slotId === slotId && r.status !== 'cancelled').length;
}

async function setReservationStatus(resId, status) {
  const res = state.reservations.find(r => r.id === resId);
  if (!res) return;
  const { error } = await db.from('reservations').update({ status }).eq('id', resId);
  if (error) { showToast('エラーが発生しました', 'error'); return; }
  res.status = status;
}

function generateMeetUrl() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const rand  = n => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `https://meet.google.com/${rand(3)}-${rand(4)}-${rand(3)}`;
}

// ============================================================
// UI HELPERS
// ============================================================

function setPageTitle(title, subtitle = '') {
  document.getElementById('page-title').textContent    = title;
  document.getElementById('page-subtitle').textContent = subtitle;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast     = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-show'));
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================
// FORMAT & LABEL HELPERS
// ============================================================

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${DAYS[d.getDay()]}）`;
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}\n（${DAYS[d.getDay()]}）`;
}

function formatDateTime(isoStr) {
  const d = new Date(isoStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function roleLabel(role) {
  return { admin: '管理者', management: 'マネジメント部', engineer: 'エンジニア' }[role] || role;
}

function roleBadgeClass(role) {
  return { admin: 'badge-red', management: 'badge-purple', engineer: 'badge-blue' }[role] || 'badge-gray';
}

function statusLabel(status) {
  return { pending: '承認待ち', confirmed: '確定', cancelled: 'キャンセル' }[status] || status;
}

function statusBadgeClass(status) {
  return { pending: 'badge-orange', confirmed: 'badge-green', cancelled: 'badge-gray' }[status] || 'badge-gray';
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// INIT
// ============================================================

async function init() {
  await loadData();

  // Login form
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('login-error');

    if (await login(email, password)) {
      errEl.style.display = 'none';
      navigate('dashboard');
    } else {
      errEl.textContent   = 'メールアドレスまたはパスワードが正しくありません';
      errEl.style.display = 'block';
    }
  });

  // Demo account buttons
  document.querySelectorAll('.demo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('login-email').value    = btn.dataset.email;
      document.getElementById('login-password').value = btn.dataset.pass;
      document.getElementById('login-form').requestSubmit();
    });
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Modal close
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Restore session or show login
  if (await restoreSession()) navigate('dashboard');
  else navigate('login');
}

document.addEventListener('DOMContentLoaded', init);
