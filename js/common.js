/* ============================================================
 * 会议签到系统 - 公共数据层
 * 支持两种模式：
 *   方案A：localStorage 纯前端（默认）
 *   方案B：Node.js 后端（设置 window.API_BASE 启用）
 * ============================================================ */
const Store = (function () {
  // 后端地址：页面必须显式设置 window.API_BASE 才启用在线模式
  //   window.API_BASE = ''                    → 同源后端（Vercel/Netlify Serverless）
  //   window.API_BASE = 'https://api.xxx.com' → 跨域后端
  //   不设置 window.API_BASE                  → 纯 localStorage 模式
  const _explicit = typeof window !== 'undefined' && 'API_BASE' in window;
  const API_BASE = _explicit ? (window.API_BASE || '') : '';

  const useBackend = () => _explicit;

  const DEFAULT_ADMIN = { username: 'admin', password: 'admin123' };

  function defaultData() {
    return {
      meetings: [],
      admin: { ...DEFAULT_ADMIN },
      currentMeetingId: null
    };
  }

  /* ---------- 本地存储 ---------- */
  function loadLocal() {
    try {
      const raw = localStorage.getItem('meeting_checkin_data');
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    const d = defaultData();
    saveLocal(d);
    return d;
  }
  function saveLocal(data) {
    localStorage.setItem('meeting_checkin_data', JSON.stringify(data));
  }

  /* ---------- 通用读写 ---------- */
  async function getAll() {
    if (useBackend()) {
      const res = await fetch(API_BASE + '/api/data');
      return await res.json();
    }
    return loadLocal();
  }
  async function saveAll(data) {
    if (useBackend()) {
      const res = await fetch(API_BASE + '/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    }
    saveLocal(data);
    return { ok: true };
  }

  /* ---------- 会议操作 ---------- */
  async function listMeetings() {
    const data = await getAll();
    return data.meetings || [];
  }
  async function getMeeting(id) {
    const data = await getAll();
    return (data.meetings || []).find(m => m.id === id);
  }
  async function getCurrentMeeting() {
    const data = await getAll();
    if (!data.currentMeetingId) return null;
    return (data.meetings || []).find(m => m.id === data.currentMeetingId) || null;
  }
  async function setCurrentMeeting(id) {
    const data = await getAll();
    data.currentMeetingId = id;
    await saveAll(data);
  }
  function genId() {
    return 'm' + Date.now() + Math.floor(Math.random() * 1000);
  }
  async function createMeeting(meeting) {
    const data = await getAll();
    const m = {
      id: genId(),
      name: meeting.name || '未命名会议',
      date: meeting.date || '',
      location: meeting.location || '',
      rows: meeting.rows || 5,
      cols: meeting.cols || 8,
      seats: meeting.seats || [],
      createdAt: Date.now()
    };
    data.meetings.push(m);
    if (!data.currentMeetingId) data.currentMeetingId = m.id;
    await saveAll(data);
    return m;
  }
  async function updateMeeting(id, patch) {
    const data = await getAll();
    const m = data.meetings.find(x => x.id === id);
    if (!m) return null;
    Object.assign(m, patch);
    await saveAll(data);
    return m;
  }
  async function deleteMeeting(id) {
    const data = await getAll();
    data.meetings = data.meetings.filter(m => m.id !== id);
    if (data.currentMeetingId === id) {
      data.currentMeetingId = (data.meetings[0] && data.meetings[0].id) || null;
    }
    await saveAll(data);
  }

  /* ---------- 管理员账号 ---------- */
  async function getAdmin() {
    const data = await getAll();
    return data.admin || DEFAULT_ADMIN;
  }
  async function setAdmin(username, password) {
    const data = await getAll();
    data.admin = { username, password };
    await saveAll(data);
  }
  async function adminLogin(username, password) {
    const admin = await getAdmin();
    if (username === admin.username && password === admin.password) {
      const token = btoa(username + ':' + Date.now());
      sessionStorage.setItem('admin_token', token);
      sessionStorage.setItem('admin_user', username);
      return { ok: true, token };
    }
    return { ok: false, msg: '用户名或密码错误' };
  }
  function isAdminLogged() {
    return !!sessionStorage.getItem('admin_token');
  }
  function adminLogout() {
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_user');
  }

  /* ---------- 座位操作 ---------- */
  function buildEmptySeats(rows, cols) {
    const seats = [];
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        seats.push({
          row: r, col: c,
          name: '', unit: '', phone: '',
          checked: false, checkinTime: null
        });
      }
    }
    return seats;
  }
  async function setSeats(meetingId, seats) {
    const data = await getAll();
    const m = data.meetings.find(x => x.id === meetingId);
    if (!m) return;
    m.seats = seats;
    let maxR = 0, maxC = 0;
    seats.forEach(s => {
      if (s.row > maxR) maxR = s.row;
      if (s.col > maxC) maxC = s.col;
    });
    m.rows = maxR || m.rows;
    m.cols = maxC || m.cols;
    await saveAll(data);
  }

  /* ---------- 签到匹配（姓名+单位） ---------- */
  async function checkin(meetingId, name, unit) {
    const data = await getAll();
    const m = data.meetings.find(x => x.id === meetingId);
    if (!m) return { ok: false, msg: '会议不存在' };
    const seats = m.seats || [];
    const n = (name || '').trim();
    const u = (unit || '').trim();

    // 优先姓名+单位双重匹配
    let target = seats.find(s =>
      s.name && s.name.trim() === n &&
      s.unit && s.unit.trim() === u
    );
    // 兼容：未填单位时仅姓名匹配且唯一
    if (!target && !u) {
      const byName = seats.filter(s => s.name && s.name.trim() === n);
      if (byName.length === 1) target = byName[0];
    }
    if (!target) {
      return { ok: false, msg: '未匹配到对应座位，请联系会务人员' };
    }
    target.checked = true;
    target.checkinTime = new Date().toISOString();
    await saveAll(data);
    return { ok: true, seat: target, meeting: m };
  }

  /* ---------- 统计 ---------- */
  function stats(meeting) {
    const seats = (meeting && meeting.seats) || [];
    const assigned = seats.filter(s => s.name);
    const checked = seats.filter(s => s.checked);
    const unchecked = assigned.filter(s => !s.checked);
    const empty = seats.filter(s => !s.name);
    return {
      total: seats.length,
      assigned: assigned.length,
      checked: checked.length,
      unchecked: unchecked.length,
      empty: empty.length
    };
  }

  /* ---------- 导入解析（CSV / TSV） ---------- */
  function parseImport(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const seats = [];
    let startIdx = 0;
    const first = lines[0].split(/[,\t]/).map(p => (p || '').trim());
    const firstRow = parseInt(first[0], 10);
    const firstCol = parseInt(first[1], 10);
    if (isNaN(firstRow) || isNaN(firstCol)) startIdx = 1;
    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(/[,\t]/).map(p => (p || '').trim());
      if (parts.length < 3) continue;
      const row = parseInt(parts[0], 10);
      const col = parseInt(parts[1], 10);
      if (isNaN(row) || isNaN(col)) continue;
      seats.push({
        row, col,
        name: parts[2] || '',
        unit: parts[3] || '',
        phone: parts[4] || '',
        checked: false,
        checkinTime: null
      });
    }
    return seats;
  }

  /* ---------- 导出 CSV ---------- */
  function toCSV(meeting) {
    const seats = (meeting && meeting.seats) || [];
    const header = '排,列,姓名,单位,电话,签到状态,签到时间';
    const rows = seats.map(s => [
      s.row, s.col, s.name, s.unit, s.phone,
      s.checked ? '已签到' : '未签到',
      s.checkinTime || ''
    ].map(v => '"' + (v === undefined || v === null ? '' : v).toString().replace(/"/g, '""') + '"').join(','));
    return '\ufeff' + header + '\n' + rows.join('\n');
  }

  return {
    API_BASE, useBackend,
    listMeetings, getMeeting, getCurrentMeeting, setCurrentMeeting,
    createMeeting, updateMeeting, deleteMeeting,
    buildEmptySeats, setSeats,
    checkin,
    getAdmin, setAdmin,
    adminLogin, isAdminLogged, adminLogout,
    stats, parseImport, toCSV,
    getAll
  };
})();

// 暴露到全局
window.Store = Store;
