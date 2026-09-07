/* ============================================================
 * 会议签到系统 - 参会人员签到页（手机端）
 * 隐私：仅展示本人座位，其他人员信息隐藏
 * ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);

  const params = new URLSearchParams(location.search);
  const meetingId = params.get('m') || '';
  let meeting = null;
  let mySeat = null;

  function escape(s) {
    return (s === undefined || s === null ? '' : s).toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function init() {
    const meetings = await Store.listMeetings();
    if (!meetingId) {
      // 未带参数：只有一个会议直接进，多个则让用户选
      if (meetings.length === 1) {
        enterMeeting(meetings[0]);
        return;
      }
      showMeetingPicker(meetings);
      return;
    }
    meeting = await Store.getMeeting(meetingId);
    if (!meeting) {
      // 参数无效：也给选择机会
      if (meetings.length === 1) {
        enterMeeting(meetings[0]);
        return;
      }
      showMeetingPicker(meetings);
      return;
    }
    enterMeeting(meeting);
  }

  function enterMeeting(m) {
    meeting = m;
    if (m && m.id) meetingId = m.id;  // 同步更新 meetingId，供签到时使用
    $('mt').textContent = m.name + (m.date ? ' · ' + m.date : '');
    show('formView');
  }

  function showMeetingPicker(meetings) {
    const box = $('pickerList');
    if (!meetings.length) {
      box.innerHTML = `<div class="text-center text-slate-400 py-8">暂无可用会议</div>`;
    } else {
      box.innerHTML = `
        <p class="text-sm text-slate-500 text-center mb-3">请选择要签到的会议</p>
        <div class="space-y-2">
          ${meetings.map(m => `
            <button class="meeting-btn w-full text-left p-3 border border-slate-200 rounded-lg hover:bg-slate-50 active:bg-slate-100" data-id="${escape(m.id)}">
              <div class="font-medium">${escape(m.name)}</div>
              <div class="text-xs text-slate-400 mt-0.5">${escape(m.date || '未设置日期')} · ${escape(m.location || '未设置地点')}</div>
            </button>
          `).join('')}
        </div>`;
      box.querySelectorAll('.meeting-btn').forEach(b => {
        b.addEventListener('click', () => {
          const id = b.dataset.id;
          const m = meetings.find(x => x.id === id);
          if (m) {
            history.replaceState(null, '', '?m=' + id);
            enterMeeting(m);
          }
        });
      });
    }
    show('pickerView');
  }

  function show(view) {
    ['formView', 'successView', 'failView', 'invalidView', 'pickerView'].forEach(v => $(v).classList.add('hidden'));
    $(view).classList.remove('hidden');
  }

  $('ckForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('ckName').value.trim();
    const unit = $('ckUnit').value.trim();
    const msg = $('ckMsg');
    msg.classList.add('hidden');

    if (!name) {
      msg.textContent = '请填写姓名';
      msg.classList.remove('hidden');
      return;
    }
    if (!unit) {
      msg.textContent = '请填写单位';
      msg.classList.remove('hidden');
      return;
    }

    const btn = $('ckSubmit');
    btn.disabled = true;
    btn.textContent = '签到中…';
    try {
      const r = await Store.checkin(meetingId, name, unit);
      if (r.ok) {
        mySeat = r.seat;
        renderSuccess();
        show('successView');
      } else {
        $('failMsg').textContent = r.msg || '未匹配到座位';
        show('failView');
      }
    } catch (err) {
      $('failMsg').textContent = '签到失败：' + err.message;
      show('failView');
    } finally {
      btn.disabled = false;
      btn.textContent = '签 到';
    }
  });

  function renderSuccess() {
    $('suInfo').textContent = `${mySeat.name} · ${mySeat.unit}`;
    $('suSeat').textContent = `第${mySeat.row}排 第${mySeat.col}座`;

    // 渲染座位图，仅本人座位高亮，其他座位显示模糊标记
    const seats = meeting.seats || [];
    const rows = meeting.rows || 1;
    const cols = meeting.cols || 1;
    const byRow = {};
    seats.forEach(s => {
      if (!byRow[s.row]) byRow[s.row] = {};
      byRow[s.row][s.col] = s;
    });

    let table = '';
    for (let r = 1; r <= rows; r++) {
      let cells = '';
      for (let c = 1; c <= cols; c++) {
        const s = byRow[r] && byRow[r][c];
        const isMine = s && mySeat && s.row === mySeat.row && s.col === mySeat.col;
        let cls, label;
        if (isMine) {
          cls = 'seat-highlight';
          label = '我';
        } else if (s && s.name) {
          // 隐藏他人信息
          cls = 'bg-slate-200 border border-slate-300 text-slate-400';
          label = '●';
        } else {
          cls = 'bg-slate-50 border border-slate-200 text-slate-300';
          label = '';
        }
        cells += `<td class="p-1"><div class="seat ${cls} rounded-lg w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center text-[10px]">${label}</div></td>`;
      }
      table += `<tr><td class="text-center text-[10px] text-slate-400 pr-1">${r}</td>${cells}</tr>`;
    }
    $('seatMap').innerHTML = `<table class="border-collapse mx-auto"><tbody>${table}</tbody></table>`;
  }

  $('retryBtn').onclick = () => show('formView');
  $('againBtn').onclick = () => {
    $('ckName').value = '';
    $('ckUnit').value = '';
    mySeat = null;
    show('formView');
  };

  init();
})();
