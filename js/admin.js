/* ============================================================
 * 会议签到系统 - 管理后台逻辑
 * ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  let currentTab = 'dashboard';
  let seatMode = 'name'; // 'name' | 'unit'
  let meetings = [];
  let currentMeeting = null;

  /* ---------- 工具 ---------- */
  function toast(msg, type = 'success') {
    const el = $('toast');
    const colors = {
      success: 'bg-emerald-600 text-white',
      error: 'bg-red-600 text-white',
      info: 'bg-gov-main text-white'
    };
    el.className = 'fixed top-6 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm ' + (colors[type] || colors.info);
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 2500);
  }

  function modal(title, html) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = html;
    $('modal').classList.remove('hidden');
  }
  function closeModal() { $('modal').classList.add('hidden'); }
  $('modalClose').onclick = closeModal;
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function escape(s) {
    return (s === undefined || s === null ? '' : s).toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- 登录 ---------- */
  if (Store.isAdminLogged()) {
    showApp();
  } else {
    $('loginView').classList.remove('hidden');
    $('appView').classList.add('hidden');
  }
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('loginUser').value.trim();
    const p = $('loginPass').value.trim();
    const r = await Store.adminLogin(u, p);
    if (r.ok) {
      toast('登录成功');
      showApp();
    } else {
      const el = $('loginMsg');
      el.textContent = r.msg || '登录失败';
      el.classList.remove('hidden');
    }
  });

  async function showApp() {
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    await refreshMeetings();
    renderMeetingSwitch();
    await loadTab(currentTab);
  }

  $('logoutBtn').addEventListener('click', () => {
    Store.adminLogout();
    location.reload();
  });

  /* ---------- 会议切换 ---------- */
  async function refreshMeetings() {
    meetings = await Store.listMeetings();
    currentMeeting = await Store.getCurrentMeeting();
  }
  function renderMeetingSwitch() {
    const box = $('meetingSwitch');
    if (!meetings.length) {
      box.innerHTML = '<span class="text-slate-300 text-xs">暂无会议</span>';
      return;
    }
    const opts = meetings.map(m =>
      `<option value="${m.id}" ${currentMeeting && m.id === currentMeeting.id ? 'selected' : ''}>${escape(m.name)}</option>`
    ).join('');
    box.innerHTML = `
      <span class="text-slate-300 hidden sm:inline">当前会议</span>
      <select id="meetingSelect" class="bg-gov-main border border-slate-600 rounded px-2 py-1 text-sm">${opts}</select>`;
    $('meetingSelect').addEventListener('change', async (e) => {
      await Store.setCurrentMeeting(e.target.value);
      currentMeeting = await Store.getCurrentMeeting();
      await loadTab(currentTab);
      toast('已切换会议', 'info');
    });
  }

  /* ---------- 导航 ---------- */
  document.querySelectorAll('.nav-item').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = a.dataset.tab;
      if (!tab) return;
      document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      currentTab = tab;
      loadTab(tab);
    });
  });
  $('menuToggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));

  async function loadTab(tab) {
    const c = $('tabContent');
    if (tab === 'dashboard') return renderDashboard(c);
    if (tab === 'seatmap') return renderSeatmap(c);
    if (tab === 'editor') return renderEditor(c);
    if (tab === 'meetings') return renderMeetings(c);
    if (tab === 'qrcode') return renderQrcode(c);
    if (tab === 'account') return renderAccount(c);
  }

  function needMeeting() {
    if (!currentMeeting) {
      $('tabContent').innerHTML = `
        <div class="text-center py-16 text-slate-400">
          <div class="text-5xl mb-3">📁</div>
          <p class="mb-3">暂无会议，请先在「会议管理」中创建会议</p>
          <button onclick="document.querySelector('[data-tab=meetings]').click()" class="bg-gov-main text-white px-4 py-2 rounded-lg">去创建</button>
        </div>`;
      return false;
    }
    return true;
  }

  /* ====================== 实时看板 ====================== */
  async function renderDashboard(c) {
    if (!needMeeting()) return;
    currentMeeting = await Store.getMeeting(currentMeeting.id);
    const s = Store.stats(currentMeeting);
    const seats = currentMeeting.seats || [];
    const rate = s.assigned ? Math.round(s.checked / s.assigned * 100) : 0;

    const checked = seats.filter(x => x.checked).sort((a, b) => (a.row - b.row) || (a.col - b.col));
    const unchecked = seats.filter(x => x.name && !x.checked).sort((a, b) => (a.row - b.row) || (a.col - b.col));

    c.innerHTML = `
      <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 class="text-lg font-semibold">${escape(currentMeeting.name)}</h2>
          <p class="text-sm text-slate-500">${escape(currentMeeting.date || '未设置日期')} · ${escape(currentMeeting.location || '未设置地点')}</p>
        </div>
        <button id="refreshBtn" class="text-sm bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1">🔄 刷新</button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        ${card('应到', s.assigned, 'bg-slate-700')}
        ${card('已签到', s.checked, 'bg-emerald-600')}
        ${card('未签到', s.unchecked, 'bg-orange-500')}
        ${card('签到率', rate + '%', 'bg-gov-accent')}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h3 class="font-semibold mb-2 flex items-center justify-between">
            <span>🟢 已签到列表（${checked.length}）</span>
            <button id="exportBtn" class="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg">📥 导出Excel</button>
          </h3>
          <div class="border rounded-lg overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-xs">
                <tr><th class="p-2 text-left">座位</th><th class="p-2 text-left">姓名</th><th class="p-2 text-left">单位</th><th class="p-2 text-left">签到时间</th></tr>
              </thead>
              <tbody>
                ${checked.length ? checked.map(x => `
                  <tr class="border-t"><td class="p-2">${x.row}排${x.col}座</td><td class="p-2">${escape(x.name)}</td><td class="p-2">${escape(x.unit)}</td><td class="p-2 text-xs text-slate-500">${fmtTime(x.checkinTime)}</td></tr>
                `).join('') : '<tr><td colspan="4" class="p-4 text-center text-slate-400">暂无签到</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 class="font-semibold mb-2">🟠 未签到列表（${unchecked.length}）<span class="text-xs text-slate-400 font-normal">· 用于电话催请</span></h3>
          <div class="border rounded-lg overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-xs">
                <tr><th class="p-2 text-left">座位</th><th class="p-2 text-left">姓名</th><th class="p-2 text-left">单位</th><th class="p-2 text-left">联系电话</th></tr>
              </thead>
              <tbody>
                ${unchecked.length ? unchecked.map(x => `
                  <tr class="border-t"><td class="p-2">${x.row}排${x.col}座</td><td class="p-2">${escape(x.name)}</td><td class="p-2">${escape(x.unit)}</td>
                    <td class="p-2"><a href="tel:${escape(x.phone)}" class="text-gov-accent hover:underline">${escape(x.phone) || '—'}</a></td></tr>
                `).join('') : '<tr><td colspan="4" class="p-4 text-center text-slate-400">全部已签到 🎉</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    $('refreshBtn').onclick = () => loadTab('dashboard');
    $('exportBtn').onclick = exportExcel;
  }

  function card(label, val, color) {
    return `<div class="rounded-lg p-4 text-white ${color}">
      <div class="text-2xl font-bold">${val}</div>
      <div class="text-xs opacity-90 mt-1">${label}</div>
    </div>`;
  }

  /* ====================== 座位图 ====================== */
  async function renderSeatmap(c) {
    if (!needMeeting()) return;
    currentMeeting = await Store.getMeeting(currentMeeting.id);
    const seats = currentMeeting.seats || [];
    const rows = currentMeeting.rows || 1;
    const cols = currentMeeting.cols || 1;

    // 按 row 分组
    const byRow = {};
    seats.forEach(s => {
      if (!byRow[s.row]) byRow[s.row] = {};
      byRow[s.row][s.col] = s;
    });

    function seatCell(s) {
      if (!s || !s.name) {
        return `<div class="seat seat-empty rounded-lg w-16 h-16 flex items-center justify-center text-[10px]" title="空座位">空</div>`;
      }
      const cls = s.checked ? 'seat-checked' : 'seat-uncheck';
      const label = seatMode === 'name' ? s.name : s.unit;
      const info = `${s.row}排${s.col}座 / ${s.name} / ${s.unit} / ${s.phone || '无电话'} / ${s.checked ? '已签到 ' + fmtTime(s.checkinTime) : '未签到'}`;
      return `<div class="seat ${cls} rounded-lg w-16 h-16 flex items-center justify-center text-center text-[11px] leading-tight p-1" title="${escape(info)}">${escape(label)}</div>`;
    }

    let table = '';
    for (let r = 1; r <= rows; r++) {
      let cells = '';
      for (let col = 1; col <= cols; col++) {
        cells += `<td class="p-1">${seatCell(byRow[r] && byRow[r][col])}</td>`;
      }
      table += `<tr><td class="text-center text-xs text-slate-400 pr-2">${r}排</td>${cells}</tr>`;
    }

    c.innerHTML = `
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 class="text-lg font-semibold">座位图</h2>
        <div class="flex items-center gap-2">
          <div class="inline-flex rounded-lg overflow-hidden border border-slate-300 text-sm">
            <button id="modeName" class="px-3 py-1.5 ${seatMode === 'name' ? 'bg-gov-main text-white' : 'bg-white'}">人名签</button>
            <button id="modeUnit" class="px-3 py-1.5 ${seatMode === 'unit' ? 'bg-gov-main text-white' : 'bg-white'}">单位签</button>
          </div>
          <button id="refreshSeat" class="text-sm bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg">🔄 刷新</button>
        </div>
      </div>
      <div class="flex gap-4 text-xs mb-4 flex-wrap">
        <span class="flex items-center gap-1"><span class="w-4 h-4 rounded seat-empty inline-block"></span>空座位</span>
        <span class="flex items-center gap-1"><span class="w-4 h-4 rounded seat-uncheck inline-block"></span>未签到</span>
        <span class="flex items-center gap-1"><span class="w-4 h-4 rounded seat-checked inline-block"></span>已签到</span>
      </div>
      <div class="overflow-x-auto pb-3">
        <table class="border-collapse"><tbody>${table}</tbody></table>
      </div>
      <p class="text-xs text-slate-400 mt-2">提示：悬浮座位可查看人员信息，已签到座位显示绿色。</p>`;
    $('modeName').onclick = () => { seatMode = 'name'; renderSeatmap(c); };
    $('modeUnit').onclick = () => { seatMode = 'unit'; renderSeatmap(c); };
    $('refreshSeat').onclick = () => renderSeatmap(c);
  }

  /* ====================== 座位编辑 ====================== */
  async function renderEditor(c) {
    if (!needMeeting()) return;
    currentMeeting = await Store.getMeeting(currentMeeting.id);

    c.innerHTML = `
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 class="text-lg font-semibold">座位编辑</h2>
        <div class="flex gap-2">
          <button id="resizeBtn" class="text-sm bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg">📐 设置行列</button>
          <button id="importBtn" class="text-sm bg-gov-accent hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg">📥 批量导入</button>
          <button id="clearBtn" class="text-sm bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg">🗑 清空签到</button>
        </div>
      </div>
      <div id="seatEditorGrid" class="overflow-x-auto pb-3"></div>
      <p class="text-xs text-slate-400 mt-2">点击任意格子可编辑该座位的人员信息（姓名/单位/电话）。</p>`;

    renderEditorGrid();
    $('resizeBtn').onclick = openResize;
    $('importBtn').onclick = openImport;
    $('clearBtn').onclick = async () => {
      if (!confirm('确认清空本场会议全部签到记录？（仅重置签到状态，不删除人员信息）')) return;
      const m = await Store.getMeeting(currentMeeting.id);
      (m.seats || []).forEach(s => { s.checked = false; s.checkinTime = null; });
      await Store.setSeats(currentMeeting.id, m.seats);
      toast('已清空签到记录');
      renderEditor(c);
    };
  }

  function renderEditorGrid() {
    const seats = currentMeeting.seats || [];
    const rows = currentMeeting.rows || 1;
    const cols = currentMeeting.cols || 1;
    const byRow = {};
    seats.forEach(s => {
      if (!byRow[s.row]) byRow[s.row] = {};
      byRow[s.row][s.col] = s;
    });
    let table = '';
    for (let r = 1; r <= rows; r++) {
      let cells = '';
      for (let col = 1; col <= cols; col++) {
        const s = byRow[r] && byRow[r][col];
        const cls = !s || !s.name ? 'seat-empty' : (s.checked ? 'seat-checked' : 'seat-uncheck');
        const label = s && s.name ? escape(s.name) : '＋';
        cells += `<td class="p-1"><div class="seat ${cls} rounded-lg w-16 h-16 flex items-center justify-center text-center text-[11px] p-1 cursor-pointer" data-row="${r}" data-col="${col}">${label}</div></td>`;
      }
      table += `<tr><td class="text-center text-xs text-slate-400 pr-2">${r}排</td>${cells}</tr>`;
    }
    const g = $('seatEditorGrid');
    g.innerHTML = `<table class="border-collapse"><tbody>${table}</tbody></table>`;
    g.querySelectorAll('.seat').forEach(el => {
      el.addEventListener('click', () => editSeat(parseInt(el.dataset.row), parseInt(el.dataset.col)));
    });
  }

  function editSeat(row, col) {
    const seats = currentMeeting.seats || [];
    let s = seats.find(x => x.row === row && x.col === col);
    if (!s) {
      s = { row, col, name: '', unit: '', phone: '', checked: false, checkinTime: null };
      seats.push(s);
      currentMeeting.seats = seats;
    }
    modal(`编辑座位 ${row}排${col}座`, `
      <form id="seatForm" class="space-y-3">
        <div><label class="block text-sm mb-1">姓名</label><input id="sf_name" value="${escape(s.name)}" class="w-full px-3 py-2 border rounded-lg" /></div>
        <div><label class="block text-sm mb-1">单位</label><input id="sf_unit" value="${escape(s.unit)}" class="w-full px-3 py-2 border rounded-lg" /></div>
        <div><label class="block text-sm mb-1">联系电话</label><input id="sf_phone" value="${escape(s.phone)}" class="w-full px-3 py-2 border rounded-lg" /></div>
        <div class="flex items-center gap-2"><input id="sf_checked" type="checkbox" ${s.checked ? 'checked' : ''} /><label class="text-sm">标记为已签到</label></div>
        <div class="flex gap-2 pt-2">
          <button type="submit" class="flex-1 bg-gov-main text-white py-2 rounded-lg">保存</button>
          ${s.name ? `<button type="button" id="sf_del" class="px-4 bg-red-50 text-red-600 rounded-lg border border-red-200">清空</button>` : ''}
        </div>
      </form>`);
    $('seatForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      s.name = $('sf_name').value.trim();
      s.unit = $('sf_unit').value.trim();
      s.phone = $('sf_phone').value.trim();
      s.checked = $('sf_checked').checked;
      s.checkinTime = s.checked ? (s.checkinTime || new Date().toISOString()) : null;
      await Store.setSeats(currentMeeting.id, currentMeeting.seats);
      closeModal();
      currentMeeting = await Store.getMeeting(currentMeeting.id);
      toast('已保存');
      renderEditorGrid();
    });
    const del = $('sf_del');
    if (del) del.onclick = async () => {
      s.name = ''; s.unit = ''; s.phone = ''; s.checked = false; s.checkinTime = null;
      await Store.setSeats(currentMeeting.id, currentMeeting.seats);
      closeModal();
      currentMeeting = await Store.getMeeting(currentMeeting.id);
      toast('已清空');
      renderEditorGrid();
    };
  }

  function openResize() {
    modal('设置座位矩阵', `
      <form id="resizeForm" class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-sm mb-1">排数</label><input id="rs_rows" type="number" min="1" value="${currentMeeting.rows}" class="w-full px-3 py-2 border rounded-lg" /></div>
          <div><label class="block text-sm mb-1">列数</label><input id="rs_cols" type="number" min="1" value="${currentMeeting.cols}" class="w-full px-3 py-2 border rounded-lg" /></div>
        </div>
        <p class="text-xs text-slate-500">调整后将保留原有座位数据，新增格子为空座位。</p>
        <button class="w-full bg-gov-main text-white py-2 rounded-lg">应用</button>
      </form>`);
    $('resizeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = parseInt($('rs_rows').value, 10);
      const col = parseInt($('rs_cols').value, 10);
      const old = currentMeeting.seats || [];
      const map = {};
      old.forEach(s => { map[s.row + '_' + s.col] = s; });
      const seats = [];
      for (let i = 1; i <= r; i++) {
        for (let j = 1; j <= col; j++) {
          seats.push(map[i + '_' + j] || { row: i, col: j, name: '', unit: '', phone: '', checked: false, checkinTime: null });
        }
      }
      currentMeeting.rows = r; currentMeeting.cols = col;
      currentMeeting.seats = seats;
      await Store.setSeats(currentMeeting.id, seats);
      await Store.updateMeeting(currentMeeting.id, { rows: r, cols: col });
      closeModal();
      currentMeeting = await Store.getMeeting(currentMeeting.id);
      toast('矩阵已更新');
      renderEditorGrid();
    });
  }

  function openImport() {
    modal('批量导入座席数据', `
      <div class="space-y-3">
        <div>
          <label class="block text-sm mb-1">粘贴数据（CSV 或 Tab 分隔）</label>
          <textarea id="imp_text" rows="8" class="w-full px-3 py-2 border rounded-lg font-mono text-xs" placeholder="排,列,姓名,单位,电话
1,1,张三,科技厅,13800138000
1,2,李四,财政厅,13900139000"></textarea>
        </div>
        <p class="text-xs text-slate-500">首行可为表头（含中文"排"字样自动识别）。逗号、Tab、空格均可分隔。也可上传 .csv 文件：</p>
        <input id="imp_file" type="file" accept=".csv,.txt" class="text-sm" />
        <div class="flex gap-2 pt-1">
          <button id="imp_ok" class="flex-1 bg-gov-main text-white py-2 rounded-lg">导入并替换</button>
          <button id="imp_merge" class="flex-1 bg-slate-100 py-2 rounded-lg">合并到现有</button>
        </div>
        <p class="text-xs text-slate-400">「导入并替换」会清空原座位；「合并到现有」按座位号覆盖同名格子。</p>
      </div>`);
    const ta = $('imp_text');
    $('imp_file').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { ta.value = rd.result; };
      rd.readAsText(f, 'utf-8');
    });
    async function doImport(merge) {
      const text = ta.value;
      const parsed = Store.parseImport(text);
      if (!parsed.length) { toast('未解析到有效数据', 'error'); return; }
      let seats = parsed;
      if (merge) {
        const old = currentMeeting.seats || [];
        const map = {};
        old.forEach(s => { map[s.row + '_' + s.col] = s; });
        parsed.forEach(s => { map[s.row + '_' + s.col] = Object.assign(map[s.row + '_' + s.col] || { row: s.row, col: s.col, checked: false, checkinTime: null }, { name: s.name, unit: s.unit, phone: s.phone }); });
        seats = Object.values(map);
      }
      await Store.setSeats(currentMeeting.id, seats);
      closeModal();
      currentMeeting = await Store.getMeeting(currentMeeting.id);
      toast('已导入 ' + parsed.length + ' 条');
      renderEditorGrid();
    }
    $('imp_ok').onclick = () => doImport(false);
    $('imp_merge').onclick = () => doImport(true);
  }

  /* ====================== 会议管理 ====================== */
  async function renderMeetings(c) {
    const list = await Store.listMeetings();
    c.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">会议管理</h2>
        <button id="newMeeting" class="bg-gov-accent hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-lg">＋ 新建会议</button>
      </div>
      <div class="space-y-2">
        ${list.length ? list.map(m => {
          const s = Store.stats(m);
          const cur = currentMeeting && m.id === currentMeeting.id;
          return `<div class="border rounded-lg p-3 flex items-center justify-between ${cur ? 'border-gov-accent bg-blue-50' : ''}">
            <div>
              <div class="font-medium flex items-center gap-2">${escape(m.name)} ${cur ? '<span class="text-xs bg-gov-main text-white px-2 py-0.5 rounded">当前</span>' : ''}</div>
              <div class="text-xs text-slate-500 mt-1">${escape(m.date || '未设置日期')} · ${escape(m.location || '未设置地点')} · ${m.rows}排×${m.cols}列 · 已签到${s.checked}/${s.assigned}</div>
            </div>
            <div class="flex gap-2 text-sm">
              ${cur ? '' : `<button class="set-cur text-gov-accent hover:underline" data-id="${m.id}">切换</button>`}
              <button class="edit-m text-slate-600 hover:underline" data-id="${m.id}">编辑</button>
              <button class="del-m text-red-600 hover:underline" data-id="${m.id}">删除</button>
            </div>
          </div>`;
        }).join('') : '<p class="text-center text-slate-400 py-10">暂无会议，请新建</p>'}
      </div>`;

    $('newMeeting').onclick = () => meetingForm();
    c.querySelectorAll('.set-cur').forEach(b => b.onclick = async () => {
      await Store.setCurrentMeeting(b.dataset.id);
      currentMeeting = await Store.getCurrentMeeting();
      renderMeetingSwitch();
      toast('已切换', 'info');
      renderMeetings(c);
    });
    c.querySelectorAll('.edit-m').forEach(b => b.onclick = () => {
      const m = list.find(x => x.id === b.dataset.id);
      meetingForm(m);
    });
    c.querySelectorAll('.del-m').forEach(b => b.onclick = async () => {
      if (!confirm('确认删除该会议？此操作不可恢复。')) return;
      await Store.deleteMeeting(b.dataset.id);
      await refreshMeetings();
      renderMeetingSwitch();
      toast('已删除');
      renderMeetings(c);
    });
  }

  function meetingForm(m) {
    const isEdit = !!m;
    modal(isEdit ? '编辑会议' : '新建会议', `
      <form id="mForm" class="space-y-3">
        <div><label class="block text-sm mb-1">会议名称</label><input id="mf_name" value="${m ? escape(m.name) : ''}" class="w-full px-3 py-2 border rounded-lg" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-sm mb-1">日期</label><input id="mf_date" type="date" value="${m ? escape(m.date) : ''}" class="w-full px-3 py-2 border rounded-lg" /></div>
          <div><label class="block text-sm mb-1">地点</label><input id="mf_loc" value="${m ? escape(m.location) : ''}" class="w-full px-3 py-2 border rounded-lg" /></div>
        </div>
        ${isEdit ? '' : `<div class="grid grid-cols-2 gap-3">
          <div><label class="block text-sm mb-1">排数</label><input id="mf_rows" type="number" min="1" value="5" class="w-full px-3 py-2 border rounded-lg" /></div>
          <div><label class="block text-sm mb-1">列数</label><input id="mf_cols" type="number" min="1" value="8" class="w-full px-3 py-2 border rounded-lg" /></div>
        </div>`}
        <button class="w-full bg-gov-main text-white py-2 rounded-lg">${isEdit ? '保存' : '创建'}</button>
      </form>`);
    $('mForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        name: $('mf_name').value.trim() || '未命名会议',
        date: $('mf_date').value,
        location: $('mf_loc').value.trim()
      };
      if (isEdit) {
        await Store.updateMeeting(m.id, data);
      } else {
        data.rows = parseInt($('mf_rows').value, 10) || 5;
        data.cols = parseInt($('mf_cols').value, 10) || 8;
        data.seats = Store.buildEmptySeats(data.rows, data.cols);
        await Store.createMeeting(data);
      }
      closeModal();
      await refreshMeetings();
      renderMeetingSwitch();
      toast(isEdit ? '已保存' : '已创建');
      renderMeetings(c0());
    });
  }
  function c0() { return $('tabContent'); }

  /* ====================== 二维码 ====================== */
  async function renderQrcode(c) {
    if (!needMeeting()) return;
    const autoBase = location.origin + location.pathname.replace(/admin\.html.*/, '');
    const savedBase = localStorage.getItem('checkin_base_url') || autoBase;
    const url = savedBase.replace(/\/$/, '') + '/checkin.html?m=' + currentMeeting.id;
    c.innerHTML = `
      <h2 class="text-lg font-semibold mb-4">签到二维码</h2>
      <div class="grid md:grid-cols-2 gap-6 items-start">
        <div class="bg-white border rounded-lg p-6 text-center">
          <div id="qrBox" class="flex justify-center mb-3"></div>
          <p class="font-medium">${escape(currentMeeting.name)}</p>
          <p class="text-xs text-slate-500 mt-1">扫码进入手机签到页</p>
          <button id="dlQr" class="mt-4 text-sm bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg">📥 下载二维码图片</button>
        </div>
        <div>
          <p class="text-sm font-medium mb-2">签到入口地址（手机可访问的地址）</p>
          <input id="ckBase" value="${escape(savedBase)}" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="如 http://192.168.1.10:3000" />
          <p class="text-xs text-slate-400 mt-1">默认自动识别当前地址；如需手机扫码，请改为手机可达的地址（如局域网IP或公网域名）。</p>
          <button id="applyBase" class="mt-2 text-sm bg-gov-accent text-white px-3 py-1.5 rounded-lg">应用并生成二维码</button>
          <p class="text-sm font-medium mt-4 mb-2">签到链接</p>
          <input id="ckUrl" value="${escape(url)}" readonly class="w-full px-3 py-2 border rounded-lg text-sm bg-slate-50" />
          <button id="copyUrl" class="mt-2 text-sm bg-gov-main text-white px-3 py-1.5 rounded-lg">复制链接</button>
          <div class="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600 leading-relaxed">
            <p class="font-medium mb-1">使用方法：</p>
            1. 将二维码打印或投屏至签到处；<br/>
            2. 参会人员手机扫码即可进入签到页；<br/>
            3. 无需登录，填写姓名+单位完成签到。
          </div>
        </div>
      </div>`;
    let qr = new QRCode($('qrBox'), { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
    function regen() {
      const base = $('ckBase').value.trim();
      const u = base.replace(/\/$/, '') + '/checkin.html?m=' + currentMeeting.id;
      $('ckUrl').value = u;
      $('qrBox').innerHTML = '';
      qr = new QRCode($('qrBox'), { text: u, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
      localStorage.setItem('checkin_base_url', base);
    }
    $('applyBase').onclick = () => { regen(); toast('已更新二维码'); };
    $('copyUrl').onclick = () => {
      $('ckUrl').select();
      document.execCommand('copy');
      toast('链接已复制');
    };
    $('dlQr').onclick = () => {
      const img = $('qrBox').querySelector('img') || $('qrBox').querySelector('canvas');
      if (!img) return;
      const a = document.createElement('a');
      a.download = (currentMeeting.name || 'qrcode') + '.png';
      if (img.tagName === 'CANVAS') {
        a.href = img.toDataURL('image/png');
      } else {
        a.href = img.src;
      }
      a.click();
    };
  }

  /* ====================== 账号设置 ====================== */
  async function renderAccount(c) {
    const admin = await Store.getAdmin();
    c.innerHTML = `
      <h2 class="text-lg font-semibold mb-4">账号设置</h2>
      <form id="accForm" class="max-w-md space-y-3">
        <div><label class="block text-sm mb-1">用户名</label><input id="ac_user" value="${escape(admin.username)}" class="w-full px-3 py-2 border rounded-lg" /></div>
        <div><label class="block text-sm mb-1">新密码</label><input id="ac_pass" type="password" placeholder="留空则不修改" class="w-full px-3 py-2 border rounded-lg" /></div>
        <button class="bg-gov-main text-white px-4 py-2 rounded-lg">保存</button>
      </form>
      <p class="text-xs text-slate-400 mt-3">修改后下次登录生效。当前登录会保留。</p>`;
    $('accForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = $('ac_user').value.trim();
      const p = $('ac_pass').value.trim();
      if (!u) { toast('用户名不能为空', 'error'); return; }
      const admin = await Store.getAdmin();
      await Store.setAdmin(u, p || admin.password);
      toast('已保存账号设置');
    });
  }

  /* ====================== 导出 Excel ====================== */
  async function exportExcel() {
    if (typeof XLSX === 'undefined') {
      // 降级 CSV
      const csv = Store.toCSV(currentMeeting);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (currentMeeting.name || '签到') + '.csv';
      a.click();
      toast('已导出CSV（未加载xlsx库）', 'info');
      return;
    }
    const seats = (currentMeeting.seats || []).slice().sort((a, b) => (a.row - b.row) || (a.col - b.col));
    const data = [['排', '列', '姓名', '单位', '联系电话', '签到状态', '签到时间']];
    seats.forEach(s => {
      data.push([s.row, s.col, s.name, s.unit, s.phone, s.checked ? '已签到' : '未签到', s.checkinTime ? fmtTime(s.checkinTime) : '']);
    });
    // 汇总表
    const summary = [['会议名称', currentMeeting.name], ['日期', currentMeeting.date], ['地点', currentMeeting.location], ['', ''], ['应到', Store.stats(currentMeeting).assigned], ['已签到', Store.stats(currentMeeting).checked], ['未签到', Store.stats(currentMeeting).unchecked]];

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    XLSX.utils.book_add_sheet(wb, ws1, '汇总');
    const ws2 = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_add_sheet(wb, ws2, '签到明细');
    XLSX.writeFile(wb, (currentMeeting.name || '签到报表') + '.xlsx');
    toast('已导出Excel');
  }
})();
