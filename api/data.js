/* ============================================================
 * Vercel Serverless Function: /api/data
 * 会议签到系统数据接口（GET/POST）
 * 持久化优先级：Vercel KV → /tmp 本地文件
 * ============================================================ */
const fs = require('fs');
const path = require('path');

const KV_KEY = 'meeting_checkin_data';
const TMP_FILE = path.join('/tmp', 'meeting_checkin_data.json');

function defaultData() {
  return {
    meetings: [],
    admin: { username: 'admin', password: 'admin123' },
    currentMeetingId: null
  };
}

/* ---------- Vercel KV 读写 ---------- */
async function kvGet() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${KV_KEY}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const body = await res.json();
    const raw = body && body.result;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
async function kvSet(data) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try {
    const res = await fetch(`${url}/set/${KV_KEY}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: JSON.stringify(data), nx: false })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

/* ---------- 本地文件读写（Serverless 临时存储） ---------- */
function fileGet() {
  try {
    if (fs.existsSync(TMP_FILE)) {
      return JSON.parse(fs.readFileSync(TMP_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return null;
}
function fileSet(data) {
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- 统一读写（KV 优先，兜底文件） ---------- */
async function loadData() {
  let d = await kvGet();
  if (d) return d;
  d = fileGet();
  if (d) return d;
  d = defaultData();
  await saveData(d);
  return d;
}
async function saveData(data) {
  await kvSet(data);
  fileSet(data);
  return { ok: true };
}

/* ---------- Handler ---------- */
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    const data = await loadData();
    res.status(200).json(data);
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body || typeof body !== 'object') {
      res.status(400).json({ ok: false, msg: 'invalid body' });
      return;
    }
    await saveData(body);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ ok: false, msg: 'method not allowed' });
};
