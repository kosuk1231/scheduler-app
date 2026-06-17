import { useState, useEffect, useRef, useCallback } from "react";

/* ───────────────────────── 백엔드 연결 ─────────────────────────
 * Vercel 등에 배포할 때는 아래 GAS_URL_DEFAULT 에 웹 앱 URL(.../exec)을 박아두면
 * 연결 설정 화면 없이 바로 동작합니다. 아티팩트에서 쓸 때는 화면에서 입력하면
 * 공유 저장소에 기억되어 참여자도 같은 백엔드를 씁니다. */
const GAS_URL_DEFAULT = "https://script.google.com/macros/s/AKfycbxeEqwcO6nBb7UwHcNIFeOZ--7iGG44C6_rEkaOUBV5hO--hVnm3oerAmuZDAHw4sswIw/exec";
let GAS_URL = GAS_URL_DEFAULT;

const hasWS = typeof window !== "undefined" && window.storage;
async function cfgGet() {
  try { const r = await window.storage.get("cfg:gasUrl", true); return r ? r.value : ""; }
  catch { return ""; }
}
async function cfgSet(v) { try { await window.storage.set("cfg:gasUrl", v, true); } catch {} }

async function apiPost(payload) {
  // 쓰기: text/plain 단순요청(프리플라이트 회피). 응답은 읽지 않으며, 막혀도 무시(쓰기는 서버에서 수행됨)
  try { await fetch(GAS_URL, { method: "POST", body: JSON.stringify(payload) }); } catch {}
}
async function apiGetReq(params) {
  // 읽기·인증: GET(쿼리스트링) — Apps Script 응답을 브라우저에서 안정적으로 읽기 위해
  const qs = new URLSearchParams({ ...params, t: Date.now() }).toString();
  const r = await fetch(GAS_URL + "?" + qs, { method: "GET" });
  return await r.json();
}
const apiHostData = (pin) => apiGetReq({ action: "hostData", pin });
const apiGetByCode = (code) => apiGetReq({ action: "getByCode", code });
const apiPublicList = () => apiGetReq({ action: "publicList" });
const apiAddHost = (name, newPin, pin) => apiPost({ action: "addHost", name, newPin, pin });
const apiAddToCalendar = (mtgId, pin) => apiGetReq({ action: "addToCalendar", mtgId, pin });
const apiSaveMeeting = (m, pin) => apiPost({ action: "saveMeeting", meeting: m, pin });
const apiDeleteMeeting = (id, pin) => apiPost({ action: "deleteMeeting", id, pin });
const apiSetFinal = (id, finalSlotId, pin) => apiPost({ action: "setFinal", id, finalSlotId, pin });
const apiSaveResponse = (mtgId, name, avail, note) => apiPost({ action: "saveResponse", mtgId, name, avail, note });
const apiAddSlot = (mtgId, slot) => apiPost({ action: "addSlot", mtgId, slot });

/* ───────────────────────── 공통 헬퍼 ───────────────────────── */
const TYPES = ["워크숍", "회의", "강의", "온라인 중계"];
const TYPE_ICON = { "워크숍": "🧩", "회의": "💬", "강의": "🎓", "온라인 중계": "📡" };
const TYPE_ICON_NAME = { "워크숍": "blocks", "회의": "chat", "강의": "book", "온라인 중계": "broadcast" };
function Icon({ name, size = 16, className }) {
  const P = {
    cal: <><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 3v3M16 3v3" /></>,
    caladd: <><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 3v3M16 3v3M12 13v4M10 15h4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    pin: <><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.4" /></>,
    users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.6 19a5.5 5.5 0 0 1 10.8 0" /><path d="M16 6.6a3 3 0 0 1 0 5.8M17 19a5 5 0 0 0-2.4-4.2" /></>,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    user: <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></>,
    blocks: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    chat: <path d="M4 5.5h16A1.5 1.5 0 0 1 21.5 7v8A1.5 1.5 0 0 1 20 16.5H9.5L5 20v-3.5H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5Z" />,
    book: <><path d="M12 6.5C10.5 5.2 8.6 4.5 5.5 4.5V18c3.1 0 5 .7 6.5 2" /><path d="M12 6.5C13.5 5.2 15.4 4.5 18.5 4.5V18c-3.1 0-5 .7-6.5 2" /><path d="M12 6.5V20" /></>,
    broadcast: <><circle cx="12" cy="12" r="2" /><path d="M8.6 8.6a4.8 4.8 0 0 0 0 6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8M6.2 6.2a8 8 0 0 0 0 11.6M17.8 6.2a8 8 0 0 1 0 11.6" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ flex: "none" }}>
      {P[name] || null}
    </svg>
  );
}
function TypeTag({ type }) {
  return <span className="wm-type"><Icon name={TYPE_ICON_NAME[type] || "cal"} size={13} /> {type}</span>;
}
const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const uid = (p = "") => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const genCode = () => Array.from({ length: 6 }, () => CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]).join("");
const asArr = (v) => (Array.isArray(v) ? v : (() => { try { return JSON.parse(v) || []; } catch { return []; } })());
const asObj = (v) => (v && typeof v === "object" ? v : (() => { try { return JSON.parse(v) || {}; } catch { return {}; } })());
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch {} };
const normM = (m) => ({ ...m, slots: asArr(m.slots), createdAt: Number(m.createdAt) || 0, expected: m.expected ? Number(m.expected) : null });
const normResp = (r) => ({ ...r, avail: asObj(r.avail) });
const normList = (d) => ({ meetings: (d.meetings || []).map(normM).sort((a, b) => b.createdAt - a.createdAt), responses: (d.responses || []).map(normResp) });

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n) => String(n).padStart(2, "0");
function fmtSlot(start) {
  const d = new Date(start);
  if (isNaN(d)) return start;
  return `${d.getMonth() + 1}.${d.getDate()}(${WD[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtRange(start, mins) {
  const s = new Date(start);
  const e = new Date(s.getTime() + (mins || 60) * 60000);
  return `${pad(s.getHours())}:${pad(s.getMinutes())}–${pad(e.getHours())}:${pad(e.getMinutes())}`;
}
function gcalUrl(mtg, slot) {
  const start = new Date(slot.start);
  const end = new Date(start.getTime() + (slot.durationMin || 60) * 60000);
  const z = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `${mtg.title}${mtg.type ? " (" + mtg.type + ")" : ""}`,
    dates: `${z(start)}/${z(end)}`,
    details: mtg.desc || "",
    location: mtg.location || "",
  });
  return "https://calendar.google.com/calendar/render?" + p.toString();
}
function isClosed(m) { return m.deadline && Date.now() > new Date(m.deadline).getTime(); }
function statusOf(m) {
  if (m.finalSlotId) return { k: "done", t: "확정" };
  if (isClosed(m)) return { k: "closed", t: "마감" };
  if (m.deadline) {
    const diff = new Date(m.deadline).getTime() - Date.now();
    if (diff < 24 * 3600 * 1000) return { k: "soon", t: "마감임박" };
  }
  return { k: "collect", t: "취합중" };
}
function remainText(deadline) {
  if (!deadline) return null;
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "응답 마감됨";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const mn = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `마감까지 ${d}일 ${h}시간`;
  if (h > 0) return `마감까지 ${h}시간 ${mn}분`;
  return `마감까지 ${mn}분`;
}
function readHashCode() {
  const h = typeof window !== "undefined" ? (window.location.hash || "") : "";
  const m = h.match(/#\/m\/([A-Za-z0-9]+)/);
  return m ? m[1].toUpperCase() : "";
}
function meetingUrl(code) {
  return window.location.origin + window.location.pathname + "#/m/" + code;
}
const WD_MAP = { "일": 0, "월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6 };
function parseScheduleText(text, todayDate) {
  if (!text) return [];
  const today = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
  const out = [];
  const seen = new Set();
  let lastDate = null;
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromMD = (mo, da) => {
    let d = new Date(today.getFullYear(), mo - 1, da);
    if (d < today) d = new Date(today.getFullYear() + 1, mo - 1, da);
    return ymd(d);
  };
  const nextWeekday = (wd) => {
    const d = new Date(today);
    d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7));
    return ymd(d);
  };
  function pushSlot(date, t, dur) {
    const time = pad(t.h) + ":" + pad(t.m);
    const key = date + " " + time;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ date, time, durationMin: dur });
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let dateStr = null, mDate = null;
    if ((mDate = line.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/))) {
      dateStr = fromMD(+mDate[1], +mDate[2]);
    } else if ((mDate = line.match(/(\d{1,2})\s*[\/.]\s*(\d{1,2})/))) {
      const mo = +mDate[1], da = +mDate[2];
      if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) dateStr = fromMD(mo, da); else mDate = null;
    } else if (/오늘/.test(line)) { dateStr = ymd(today); }
    else if (/내일/.test(line)) { const d = new Date(today); d.setDate(d.getDate() + 1); dateStr = ymd(d); }
    else if (/모레/.test(line)) { const d = new Date(today); d.setDate(d.getDate() + 2); dateStr = ymd(d); }
    else { const w = line.match(/([일월화수목금토])\s*요일/); if (w) dateStr = nextWeekday(WD_MAP[w[1]]); }
    if (dateStr) lastDate = dateStr;
    const useDate = dateStr || lastDate;
    if (!useDate) continue;
    let pp = line;
    if (mDate) pp = pp.replace(mDate[0], " ");
    pp = pp.replace(/(\d{1,2})\s*([~\-])\s*(\d{1,2})\s*시/g, "$1시$2$3시");
    pp = pp.replace(/(\d{1,2})\s*시\s*반/g, "$1:30");
    pp = pp.replace(/(\d{1,2})\s*시\s*(\d{1,2})\s*분/g, (m, a, b) => a + ":" + pad(+b));
    pp = pp.replace(/(\d{1,2})\s*시/g, "$1:00");
    const ms = [...pp.matchAll(/(\d{1,2}):(\d{2})/g)];
    if (!ms.length) continue;
    const isPM = /(오후|저녁|밤)/.test(line);
    const isAM = /(오전|아침|새벽)/.test(line);
    const times = ms.map((x) => {
      let h = +x[1]; const mi = +x[2];
      if (isPM && h < 12) h += 12;
      else if (isAM && h === 12) h = 0;
      else if (!isPM && !isAM && h >= 1 && h <= 7) h += 12;
      if (h > 23) h = 23;
      return { h, m: mi };
    });
    const isRange = times.length >= 2 && /[~]|부터|까지|\-/.test(pp);
    if (isRange) {
      const a = times[0], b = times[1];
      let dur = (b.h * 60 + b.m) - (a.h * 60 + a.m);
      if (dur <= 0) dur = 60;
      pushSlot(useDate, a, dur);
    } else {
      for (const t of times) pushSlot(useDate, t, 60);
    }
  }
  out.sort((a, b) => new Date(a.date + "T" + a.time) - new Date(b.date + "T" + b.time));
  return out;
}

/* ───────────────────────── styles ───────────────────────── */
const CSS = `
.wm * { box-sizing: border-box; }
.wm {
  --bg:#F2F5F8; --panel:#FFFFFF; --ink:#172029; --muted:#6A7886; --faint:#9AA7B4;
  --line:#E2E8EE; --brand:#0E8C7F; --brand-dk:#0A6B61; --brand-rgb:14,140,127;
  --amber:#D98A24; --bad:#C24B3A; --clay:#C2603C; --shadow:0 1px 2px rgba(23,32,41,.05),0 8px 24px rgba(23,32,41,.06);
  --grad:linear-gradient(135deg,#13A697,#0B7065); --ring:0 0 0 3px rgba(14,140,127,.16); --e1:0 1px 2px rgba(23,32,41,.06),0 2px 6px rgba(23,32,41,.05); --e2:0 6px 16px rgba(23,32,41,.08),0 20px 44px rgba(23,32,41,.09);
  font-family:'Pretendard',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','Segoe UI',sans-serif;
  color:var(--ink); background:var(--bg); min-height:100vh; line-height:1.5; -webkit-font-smoothing:antialiased;
}
.wm-wrap { max-width:840px; margin:0 auto; padding:0 18px 96px; }
.wm-top { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; padding:28px 2px 22px; }
.wm-brand { display:flex; align-items:center; gap:10px; cursor:pointer; }
.wm-logomark { width:30px; height:30px; border-radius:9px; background:var(--grad); color:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(14,140,127,.32); }
.wm-logo { font-size:25px; font-weight:800; letter-spacing:-.03em; color:var(--ink); }
.wm-logo b { color:var(--brand); }
.wm-sub { font-size:12.5px; color:var(--muted); letter-spacing:-.01em; }
.wm-headbtns { display:flex; gap:8px; align-items:center; }
.wm-gear { background:none; border:none; cursor:pointer; font-size:18px; color:var(--muted); padding:6px; border-radius:8px; }
.wm-gear:hover { background:#fff; }
.wm-btn { border:none; border-radius:11px; font-family:inherit; font-weight:650; cursor:pointer;
  font-size:14px; padding:11px 16px; transition:transform .08s ease, background .15s; letter-spacing:-.01em; }
.wm-btn:active { transform:translateY(1px); }
.wm-btn:focus-visible { outline:2px solid var(--brand); outline-offset:2px; }
.wm-btn:disabled { cursor:default; }
.wm-pri { background:var(--grad); color:#fff; box-shadow:0 1px 2px rgba(10,107,97,.3), 0 6px 16px rgba(14,140,127,.26); }
.wm-pri:hover { filter:brightness(1.05); box-shadow:0 2px 4px rgba(10,107,97,.32), 0 10px 22px rgba(14,140,127,.34); }
.wm-ghost { background:#fff; color:var(--ink); border:1px solid var(--line); }
.wm-ghost:hover { border-color:#C9D3DC; }
.wm-danger { background:#fff; color:var(--bad); border:1px solid #EAD2CD; }
.wm-danger:hover { background:#FDF4F2; }
.wm-sm { font-size:12.5px; padding:7px 11px; border-radius:9px; }

.wm-card { background:var(--panel); border:1px solid var(--line); border-radius:16px; box-shadow:var(--e1); }
.wm-list { display:flex; flex-direction:column; gap:12px; }
.wm-mcard { padding:18px 20px; cursor:pointer; transition:border-color .15s, transform .08s; }
.wm-mcard:hover { border-color:#CFE3DF; transform:translateY(-2px); box-shadow:var(--e2); }
.wm-acc { width:100%; text-align:left; background:none; border:none; font-family:inherit; cursor:pointer; padding:0; color:inherit; }
.wm-titlerow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.wm-mtitle { font-size:17px; font-weight:750; letter-spacing:-.02em; margin:0; }
.wm-type { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700; padding:4px 9px; border-radius:8px; letter-spacing:-.01em; background:rgba(var(--brand-rgb),.1); color:var(--brand-dk); white-space:nowrap; }
.wm-meta { font-size:12.5px; color:var(--muted); display:flex; gap:14px; flex-wrap:wrap; margin-top:9px; }
.wm-meta span { display:inline-flex; align-items:center; gap:5px; }
.wm-badge { font-size:11px; font-weight:700; padding:4px 9px; border-radius:999px; letter-spacing:-.01em; white-space:nowrap; }
.wm-badge.collect { background:rgba(var(--brand-rgb),.1); color:var(--brand-dk); }
.wm-badge.done { background:#172029; color:#fff; }
.wm-badge.closed { background:#EEF0F3; color:var(--faint); }
.wm-badge.soon { background:rgba(217,138,36,.14); color:var(--amber); }

.wm-join { display:flex; gap:8px; margin-bottom:14px; }
.wm-join .wm-input { flex:1; text-transform:uppercase; letter-spacing:.12em; font-weight:650; }

.wm-empty { text-align:center; padding:64px 20px; color:var(--muted); }
.wm-empty h3 { color:var(--ink); font-size:18px; margin:0 0 6px; letter-spacing:-.02em; }
.wm-empty p { font-size:13.5px; margin:0 0 20px; }

.wm-field { margin-bottom:16px; }
.wm-label { display:block; font-size:12.5px; font-weight:650; color:var(--muted); margin-bottom:7px; letter-spacing:-.01em; }
.wm-input { width:100%; border:1px solid var(--line); border-radius:10px; padding:11px 13px;
  font-size:14.5px; font-family:inherit; color:var(--ink); background:#fff; transition:border-color .15s; }
.wm-input:focus { outline:none; border-color:var(--brand); box-shadow:0 0 0 3px rgba(var(--brand-rgb),.12); }
textarea.wm-input { resize:vertical; min-height:64px; }

.wm-seg { display:flex; gap:8px; flex-wrap:wrap; }
.wm-segb { border:1.5px solid var(--line); background:#fff; border-radius:10px; padding:9px 13px; cursor:pointer;
  font-family:inherit; font-size:13.5px; font-weight:600; color:var(--muted); transition:.12s; display:inline-flex; gap:6px; align-items:center; }
.wm-segb:hover { border-color:#C7D3DC; }
.wm-segb.on { border-color:var(--brand); background:rgba(var(--brand-rgb),.07); color:var(--brand-dk); }

.wm-slotrow { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
.wm-slotrow .wm-input { padding:9px 11px; font-size:13.5px; }
.wm-x { border:none; background:#F1F4F7; color:var(--muted); width:36px; height:38px; border-radius:9px; cursor:pointer; font-size:18px; flex:none; transition:background .15s; }
.wm-x:hover { background:#E7EBEF; color:var(--bad); }

.wm-sec { padding:20px 22px; }
.wm-sec h2 { font-size:14px; font-weight:750; letter-spacing:-.02em; margin:0 0 2px; position:relative; padding-left:13px; }
.wm-sec h2::before { content:""; position:absolute; left:0; top:2px; bottom:2px; width:4px; border-radius:3px; background:var(--grad); }
.wm-sec .hint { font-size:12.5px; color:var(--muted); margin:0 0 16px; }

.wm-chips { display:flex; flex-direction:column; gap:8px; }
.wm-chip { display:flex; align-items:center; gap:11px; width:100%; text-align:left; cursor:pointer;
  border:1.5px solid var(--line); background:#fff; border-radius:12px; padding:12px 14px; font-family:inherit; transition:.14s; box-shadow:var(--e1); }
.wm-chip:hover { border-color:#CFE3DF; transform:translateY(-1px); }
.wm-chip.on { border-color:var(--brand); background:linear-gradient(0deg, rgba(14,140,127,.08), rgba(14,140,127,.03)); }
.wm-chip:disabled { cursor:default; opacity:.55; }
.wm-chip:disabled:hover { border-color:var(--line); }
.wm-tick { width:20px; height:20px; border-radius:6px; border:1.5px solid var(--faint); flex:none; display:flex; align-items:center; justify-content:center; color:#fff; transition:.12s; }
.wm-chip.on .wm-tick { background:var(--brand); border-color:var(--brand); }
.wm-chip .when { font-size:14px; font-weight:600; letter-spacing:-.01em; }
.wm-chip .dur { font-size:12px; color:var(--muted); margin-left:auto; }

.wm-rank { display:flex; flex-direction:column; gap:10px; }
.wm-slot { border:1px solid var(--line); border-radius:14px; padding:14px 16px; position:relative; overflow:hidden; box-shadow:var(--e1); transition:transform .14s, box-shadow .14s; }
.wm-slot:hover { transform:translateY(-1px); box-shadow:var(--e2); }
.wm-slot .fill { position:absolute; inset:0; right:auto; background:linear-gradient(90deg, rgba(14,140,127,.18), rgba(14,140,127,.06)); z-index:0; transition:width .55s cubic-bezier(.2,.7,.2,1); }
.wm-slot.all { border-color:var(--brand); box-shadow:var(--ring), var(--e1); }
.wm-slot.final { border-color:var(--ink); box-shadow:0 0 0 3px rgba(23,32,41,.1), var(--e1); }
.wm-slot > * { position:relative; z-index:1; }
.wm-slothead { display:flex; align-items:center; gap:11px; }
.wm-no { width:26px; height:26px; border-radius:50%; background:#ECF1F4; color:var(--muted); font-size:12px; font-weight:800; display:flex; align-items:center; justify-content:center; flex:none; }
.wm-slot.all .wm-no { background:var(--grad); color:#fff; }
.wm-when2 { font-size:14.5px; font-weight:700; letter-spacing:-.02em; }
.wm-time2 { font-size:12px; color:var(--muted); }
.wm-count { margin-left:auto; font-size:12.5px; font-weight:800; color:var(--brand-dk); white-space:nowrap; background:rgba(14,140,127,.1); padding:3px 9px; border-radius:999px; }
.wm-allbadge { margin-left:8px; font-size:10.5px; font-weight:800; color:#fff; background:var(--grad); padding:3px 8px; border-radius:999px; }
.wm-people { margin-top:9px; display:flex; flex-wrap:wrap; gap:5px; }
.wm-p { font-size:11.5px; padding:3px 8px; border-radius:7px; font-weight:600; }
.wm-p.yes { background:rgba(var(--brand-rgb),.14); color:var(--brand-dk); }
.wm-p.no { background:#F0F2F5; color:var(--faint); text-decoration:line-through; }
.wm-pick { margin-top:11px; }

.wm-confirmbar { background:linear-gradient(135deg,#0E8C7F,#0A6B61); color:#fff; border-radius:16px; padding:18px 20px; margin-bottom:16px; box-shadow:0 10px 30px rgba(14,140,127,.3); }
.wm-confirmbar .lab { font-size:11px; font-weight:700; color:#CFF6EE; letter-spacing:.08em; text-transform:uppercase; }
.wm-confirmbar .big { font-size:18px; font-weight:750; letter-spacing:-.02em; margin:3px 0 13px; }
.wm-confirmbar .row { display:flex; gap:9px; flex-wrap:wrap; }
.wm-gcal { background:#fff; color:#172029; text-decoration:none; display:inline-flex; align-items:center; gap:7px; font-weight:650; font-size:13.5px; padding:9px 14px; border-radius:10px; border:none; font-family:inherit; cursor:pointer; }
.wm-gcal:hover { background:#EFF2F5; }

.wm-share { border:1px dashed var(--line); border-radius:13px; padding:14px 16px; margin-bottom:16px; background:#F8FAFB; }
.wm-share .codetag { font-size:11px; font-weight:700; color:var(--muted); letter-spacing:.02em; }
.wm-code { font-size:24px; font-weight:800; letter-spacing:.14em; color:var(--brand-dk); margin:2px 0 10px; font-family:'SFMono-Regular',ui-monospace,Menlo,monospace; }
.wm-invite { width:100%; border:1px solid var(--line); border-radius:9px; padding:9px 11px; font-size:12.5px; font-family:inherit; color:var(--muted); background:#fff; resize:none; line-height:1.5; }
.wm-linkrow { display:flex; gap:8px; align-items:center; }
.wm-linkrow .wm-input { flex:1; font-size:12.5px; padding:9px 11px; }
.wm-dl { font-size:12.5px; font-weight:650; }
.wm-dl.soon { color:var(--amber); }
.wm-dl.over { color:var(--bad); }
.wm-lockmsg { background:#FBF3EC; border:1px solid #F0DFCB; color:var(--amber); border-radius:10px; padding:11px 13px; font-size:12.5px; font-weight:600; }
.wm-err { background:#FDF4F2; border:1px solid #EAD2CD; color:var(--bad); border-radius:10px; padding:11px 13px; font-size:12.5px; font-weight:600; margin-bottom:14px; }

.wm-toast { position:fixed; left:50%; bottom:26px; transform:translateX(-50%); background:#172029; color:#fff; padding:11px 18px; border-radius:11px; font-size:13.5px; font-weight:600; z-index:50; box-shadow:0 8px 28px rgba(0,0,0,.25); animation:wm-up .25s ease; }
@keyframes wm-up { from{opacity:0; transform:translate(-50%,8px);} to{opacity:1;transform:translate(-50%,0);} }
.wm-modal { position:fixed; inset:0; background:rgba(23,32,41,.45); z-index:60; display:flex; align-items:center; justify-content:center; padding:20px; }
.wm-mbox { background:#fff; border-radius:16px; padding:24px; max-width:380px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,.3); }
.wm-mbox h3 { margin:0 0 6px; font-size:16px; letter-spacing:-.02em; }
.wm-mbox p { margin:0 0 16px; font-size:13.5px; color:var(--muted); line-height:1.55; }
.wm-mbox .row { display:flex; gap:9px; justify-content:flex-end; margin-top:18px; }
.wm-back { background:none; border:none; color:var(--muted); font-family:inherit; font-size:13.5px; cursor:pointer; padding:6px 0; margin:6px 0 2px; display:inline-flex; align-items:center; gap:5px; }
.wm-back:hover { color:var(--ink); }
.wm-h1 { font-size:22px; font-weight:800; letter-spacing:-.03em; margin:4px 0 4px; }
.wm-info { font-size:13px; color:var(--muted); margin:0 0 18px; display:flex; gap:14px; flex-wrap:wrap; align-items:center; }
.wm-info span { display:inline-flex; align-items:center; gap:5px; }
.wm-spin { width:22px; height:22px; border:2.5px solid var(--line); border-top-color:var(--brand); border-radius:50%; animation:wm-rot .7s linear infinite; margin:48px auto; }
@keyframes wm-rot { to { transform:rotate(360deg); } }
.wm-note { font-size:12px; color:var(--faint); background:#F4F6F9; border:1px solid var(--line); border-radius:10px; padding:11px 13px; line-height:1.55; margin-top:14px; }
.wm-desc { background:linear-gradient(180deg,#F6FBFA,#FFFFFF); border:1px solid var(--line); border-left:3px solid var(--brand); border-radius:13px; padding:14px 16px; margin:0 0 16px; box-shadow:var(--e1); }
.wm-desc-lab { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700; letter-spacing:.05em; color:var(--brand-dk); text-transform:uppercase; margin-bottom:7px; }
.wm-desc-body { font-size:14px; color:#2C3742; line-height:1.7; white-space:pre-wrap; }
.wm-setup { padding:26px; margin-top:8px; }
.wm-setup h2 { font-size:18px; margin:0 0 6px; letter-spacing:-.02em; }
.wm-setup p { font-size:13px; color:var(--muted); margin:0 0 18px; line-height:1.6; }
.wm-steps { font-size:12.5px; color:var(--muted); line-height:1.7; background:#F4F6F9; border:1px solid var(--line); border-radius:10px; padding:13px 15px; margin-top:14px; }
.wm-entry { padding:30px 26px; margin-top:8px; }
.wm-entry h2 { font-size:19px; margin:0 0 6px; letter-spacing:-.02em; }
.wm-entry p { font-size:13px; color:var(--muted); margin:0 0 18px; line-height:1.6; }
.wm-linktiny { background:none; border:none; color:var(--brand-dk); font-family:inherit; font-size:13px; cursor:pointer; padding:10px 0 0; text-decoration:underline; }
.wm-logout { background:none; border:1px solid var(--line); color:var(--muted); border-radius:9px; font-family:inherit; font-size:12.5px; padding:7px 11px; cursor:pointer; }
.wm-logout:hover { color:var(--ink); }
.wm-menuwrap { position:relative; }
.wm-adminbtn { background:none; border:1px solid var(--line); color:var(--muted); border-radius:9px; font-family:inherit; font-size:12.5px; font-weight:600; padding:7px 12px; cursor:pointer; }
.wm-adminbtn:hover { color:var(--ink); border-color:#C9D3DC; }
.wm-pop { position:absolute; right:0; top:calc(100% + 8px); background:#fff; border:1px solid var(--line); border-radius:12px; box-shadow:0 10px 30px rgba(23,32,41,.16); padding:12px; min-width:236px; z-index:40; display:flex; flex-direction:column; gap:9px; }
.wm-pop .wm-input { text-transform:none; letter-spacing:normal; }
.wm-popitem { background:none; border:none; text-align:left; font-family:inherit; font-size:13.5px; color:var(--ink); padding:10px 11px; border-radius:9px; cursor:pointer; }
.wm-popitem:hover { background:#F1F4F7; }
.wm-backdrop { position:fixed; inset:0; z-index:39; }
.wm-footer { text-align:center; font-size:12px; color:var(--faint); margin-top:36px; }
/* ── landing (SaaS) ── */
.wm-hero { position:relative; overflow:hidden; border-radius:20px; padding:34px 30px;
  background:linear-gradient(180deg,#FFFFFF,#F6FBFA); border:1px solid var(--line); box-shadow:var(--e2); }
.wm-hero::before { content:""; position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(440px 220px at 100% -12%, rgba(14,140,127,.13), transparent 62%); }
.wm-hero::after { content:""; position:absolute; inset:0; pointer-events:none; opacity:.6;
  background-image:radial-gradient(rgba(23,32,41,.06) 1px, transparent 1.5px); background-size:18px 18px;
  -webkit-mask-image:linear-gradient(180deg,#000,transparent 72%); mask-image:linear-gradient(180deg,#000,transparent 72%); }
.wm-hero > * { position:relative; z-index:1; }
.wm-eyebrow { display:inline-block; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
  color:var(--brand-dk); background:rgba(14,140,127,.1); padding:5px 11px; border-radius:999px; margin-bottom:15px; }
.wm-hero h2 { font-size:34px; font-weight:850; letter-spacing:-.045em; margin:0; color:var(--ink); line-height:1.05; }
.wm-hero h2 b { color:var(--brand); }
.wm-hero .tag { font-size:14px; color:var(--muted); font-weight:600; margin-top:8px; }
.wm-hero p { font-size:13.5px; color:#46535F; line-height:1.72; margin:16px 0 0; max-width:56ch; }
.wm-hero p b { color:var(--brand-dk); font-weight:700; }
.wm-feats { display:flex; flex-wrap:wrap; gap:9px; margin-top:22px; }
.wm-feat { display:inline-flex; align-items:center; gap:8px; font-size:12.5px; font-weight:650; color:var(--ink);
  background:#fff; border:1px solid var(--line); border-radius:12px; padding:8px 13px 8px 9px; box-shadow:var(--e1); }
.wm-feat .ic { width:24px; height:24px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--brand-dk); background:rgba(14,140,127,.12); }
.wm-sectionlabel { display:flex; align-items:center; gap:10px; font-size:12px; font-weight:700; color:var(--muted); letter-spacing:-.01em; margin:0 2px 15px; }
.wm-sectionlabel::after { content:""; flex:1; height:1px; background:linear-gradient(90deg, var(--line), transparent); }
.wm-bricklist { display:flex; flex-direction:column; gap:14px; }
.wm-vcard { background:#fff; border:1px solid var(--line); border-radius:16px; box-shadow:var(--e1); overflow:hidden;
  transition:transform .14s ease, box-shadow .14s ease, border-color .14s ease; }
.wm-vcard:hover { transform:translateY(-2px); box-shadow:var(--e2); border-color:#CFE3DF; }
.wm-vstripe { height:3px; background:var(--grad); }
.wm-vstripe.alt { background:linear-gradient(135deg,#E0902B,#C2603C); }
.wm-vcard .wm-acc { padding:16px 18px; }
.wm-caret { width:26px; height:26px; border-radius:8px; background:#F1F5F7; display:flex; align-items:center; justify-content:center; color:var(--muted); font-size:11px; flex:none; }
.wm-brickfoot { padding:0 18px 16px; }
.wm-brickempty { background:#fff; border:1px dashed var(--line); border-radius:16px; padding:44px 20px; text-align:center; color:var(--muted); font-size:13.5px; margin-top:18px; box-shadow:var(--e1); }
@media (max-width:560px){ .wm-hero { padding:26px 20px; } .wm-hero h2 { font-size:28px; } }
.wm-drop { display:flex; align-items:center; justify-content:center; gap:8px; text-align:center; cursor:pointer; border:1.5px dashed var(--line); border-radius:12px; padding:16px; font-size:13px; color:var(--muted); background:#F8FAFB; transition:.15s; line-height:1.5; }
.wm-drop:hover { border-color:var(--brand); color:var(--brand-dk); background:rgba(var(--brand-rgb),.05); }
@media (max-width:560px){ .wm-slotrow { flex-wrap:wrap; } .wm-slotrow .wm-input { flex:1 1 40%; } }
@media (prefers-reduced-motion:reduce){ .wm *{animation:none!important; transition:none!important;} }
`;

/* ───────────────────────── App ───────────────────────── */
export default function App() {
  const [gasUrl, setGasUrl] = useState(undefined);
  const [data, setData] = useState(null);
  const [view, setView] = useState("home");
  const [curId, setCurId] = useState(null);
  const [mode, setMode] = useState("host");
  const [host, setHost] = useState(false);
  const [hostPin, setHostPin] = useState("");
  const [guestCode, setGuestCode] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const toastTimer = useRef(null);

  const flash = (m) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 2200); };

  const loadData = useCallback(async () => {
    if (!GAS_URL) return;
    try {
      if (host && hostPin) {
        const d = await apiHostData(hostPin);
        if (d.ok) { setData(normList(d)); setIsAdmin(!!d.admin); }
        else { setHost(false); setHostPin(""); lsDel("umoga:pin"); }
      } else if (guestCode) {
        const d = await apiGetByCode(guestCode);
        if (d.ok) setData({ meetings: [normM(d.meeting)], responses: (d.responses || []).map(normResp) });
      }
    } catch {}
  }, [host, hostPin, guestCode]);

  const openByCode = async (code, expectId) => {
    const c = (code || "").trim().toUpperCase();
    if (!c) return false;
    try {
      const d = await apiGetByCode(c);
      if (d && d.ok && (!expectId || d.meeting.id === expectId)) {
        setGuestCode(c); setMode("guest");
        setData({ meetings: [normM(d.meeting)], responses: (d.responses || []).map(normResp) });
        setCurId(d.meeting.id); setView("detail");
        return true;
      }
      flash(expectId ? "코드가 이 모임과 일치하지 않아요" : "그 코드의 모임을 찾지 못했어요");
    } catch { flash("서버 연결을 확인해 주세요"); }
    return false;
  };

  const hostLogin = async (pin) => {
    const pn = (pin || "").trim();
    if (!pn) return false;
    try {
      const d = await apiHostData(pn);
      if (d && d.ok) {
        setHost(true); setHostPin(pn); lsSet("umoga:pin", pn); setIsAdmin(!!d.admin);
        setGuestCode(null); setCurId(null); setView("home"); setData(normList(d));
        return true;
      }
      flash("비밀번호가 올바르지 않아요");
    } catch { flash("서버 연결을 확인해 주세요"); }
    return false;
  };
  const hostLogout = () => {
    setHost(false); setHostPin(""); setIsAdmin(false); lsDel("umoga:pin");
    setGuestCode(null); setCurId(null); setView("home"); setData({ meetings: [], responses: [] });
  };

  useEffect(() => {
    (async () => {
      try {
        if (GAS_URL_DEFAULT) { GAS_URL = GAS_URL_DEFAULT; setGasUrl(GAS_URL_DEFAULT); }
        else {
          const c = hasWS ? await cfgGet() : "";
          if (c) { GAS_URL = c; setGasUrl(c); } else { setGasUrl(""); return; }
        }
        const hashCode = readHashCode();
        if (hashCode) { await openByCode(hashCode); return; }
        const savedPin = lsGet("umoga:pin");
        if (savedPin) {
          const d = await apiHostData(savedPin);
          if (d && d.ok) { setHost(true); setHostPin(savedPin); setIsAdmin(!!d.admin); setData(normList(d)); return; }
          lsDel("umoga:pin");
        }
        setData({ meetings: [], responses: [] });
      } catch {
        setData({ meetings: [], responses: [] });
        flash("서버 연결을 확인해 주세요");
      }
    })();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const onHash = () => { const c = readHashCode(); if (c) openByCode(c); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line
  }, []);

  const saveUrl = async (url) => {
    GAS_URL = url.trim();
    if (hasWS) await cfgSet(GAS_URL);
    setGasUrl(GAS_URL); setShowSetup(false);
    flash("연결됐어요");
  };

  const goHome = async () => {
    setCurId(null); setView("home");
    if (typeof window !== "undefined" && window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (host) { setGuestCode(null); await loadData(); }
    else { setGuestCode(null); setData({ meetings: [], responses: [] }); }
  };

  if (gasUrl === undefined) return (<div className="wm"><style>{CSS}</style><div className="wm-spin" /></div>);
  if (gasUrl === "" || showSetup)
    return (<div className="wm"><style>{CSS}</style><div className="wm-wrap"><Setup onSave={saveUrl} current={gasUrl} onClose={gasUrl ? () => setShowSetup(false) : null} /></div></div>);

  const curMeeting = data && curId ? data.meetings.find((m) => m.id === curId) : null;

  let body;
  if (data === null) body = <div className="wm-spin" />;
  else if (view === "detail" && curMeeting)
    body = (
      <Detail mtg={curMeeting} responses={data.responses.filter((r) => r.mtgId === curId)}
        mode={mode} hostPin={hostPin} flash={flash} askConfirm={setConfirm}
        onBack={goHome} onRefresh={loadData} onEdit={() => setView("edit")}
        onDeleted={async () => { setCurId(null); setView("home"); await loadData(); }} />
    );
  else if (view === "landing")
    body = <CodeEntry onEnter={openByCode} />;
  else if (host && view === "edit" && curMeeting)
    body = (
      <Create initial={curMeeting} onCancel={() => setView("detail")} flash={flash}
        onSaved={async (m) => { await apiSaveMeeting(m, hostPin); await loadData(); setCurId(m.id); setView("detail"); flash("수정했어요"); }} />
    );
  else if (host && view === "create")
    body = (
      <Create onCancel={goHome} flash={flash}
        onSaved={async (m) => { await apiSaveMeeting(m, hostPin); await loadData(); setCurId(m.id); setMode("host"); setView("detail"); flash("모임을 만들었어요"); }} />
    );
  else if (host)
    body = <Home meetings={data.meetings} isAdmin={isAdmin}
      onAddHost={async (name, pin) => { await apiAddHost(name, pin, hostPin); flash(name + " 님에게 권한을 줬어요"); }}
      onOpen={(id) => { setMode("host"); setCurId(id); setView("detail"); }} onNew={() => setView("create")} />;
  else
    body = <CodeEntry onEnter={openByCode} />;

  return (
    <div className="wm">
      <style>{CSS}</style>
      {(loginOpen || menuOpen) && <div className="wm-backdrop" onClick={() => { setLoginOpen(false); setMenuOpen(false); }} />}
      <div className="wm-wrap">
        <div className="wm-top">
          <div className="wm-brand" onClick={goHome}>
            <span className="wm-logomark"><Icon name="check" size={16} /></span>
            <span className="wm-logo">우모<b>가</b></span>
            <span className="wm-sub">우리가 모두 가능한 시간</span>
          </div>
          <div className="wm-headbtns">
            {host && view === "home" && <button className="wm-btn wm-pri" onClick={() => setView("create")}>+ 새 모임</button>}
            {host && (view === "home" || view === "landing") && (
              view === "landing"
                ? <button className="wm-btn wm-ghost wm-sm" onClick={goHome}>관리자 홈</button>
                : <button className="wm-btn wm-ghost wm-sm" onClick={() => setView("landing")}>메인 화면</button>
            )}
            {!host && (
              <div className="wm-menuwrap">
                <button className="wm-adminbtn" onClick={() => { setLoginOpen((v) => !v); setMenuOpen(false); }}>관리자 로그인</button>
                {loginOpen && (
                  <div className="wm-pop">
                    <input type="password" className="wm-input" placeholder="비밀번호" value={adminPin} autoFocus
                      onChange={(e) => setAdminPin(e.target.value)}
                      onKeyDown={async (e) => { if (e.key === "Enter") { const ok = await hostLogin(adminPin); if (ok) { setAdminPin(""); setLoginOpen(false); } } }} />
                    <button className="wm-btn wm-pri wm-sm" disabled={!adminPin.trim()} onClick={async () => { const ok = await hostLogin(adminPin); if (ok) { setAdminPin(""); setLoginOpen(false); } }}>로그인</button>
                  </div>
                )}
              </div>
            )}
            {host && (
              <div className="wm-menuwrap">
                <button className="wm-gear" title="메뉴" onClick={() => setMenuOpen((v) => !v)}>⚙</button>
                {menuOpen && (
                  <div className="wm-pop">
                    <button className="wm-popitem" onClick={() => { setShowSetup(true); setMenuOpen(false); }}>스프레드시트 연결</button>
                    <button className="wm-popitem" onClick={() => { setMenuOpen(false); hostLogout(); }}>로그아웃</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {body}
        <div className="wm-footer">만든이 @carpediemkosuk</div>
      </div>

      {toast && <div className="wm-toast">{toast}</div>}
      {confirm && (
        <div className="wm-modal" onClick={() => setConfirm(null)}>
          <div className="wm-mbox" onClick={(e) => e.stopPropagation()}>
            <h3>{confirm.title}</h3><p>{confirm.msg}</p>
            <div className="row">
              <button className="wm-btn wm-ghost wm-sm" onClick={() => setConfirm(null)}>취소</button>
              <button className="wm-btn wm-danger wm-sm" onClick={() => { confirm.onYes(); setConfirm(null); }}>{confirm.yes || "삭제"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ───────────────────────── Setup ───────────────────────── */
function Setup({ onSave, current, onClose }) {
  const [url, setUrl] = useState(current || "");
  return (
    <div className="wm-card wm-setup">
      {onClose && <button className="wm-back" onClick={onClose}>← 닫기</button>}
      <h2>구글 시트에 연결</h2>
      <p>입력하신 데이터가 구글 스프레드시트에 쌓입니다. Apps Script 웹 앱 URL을 한 번만 넣어 주세요.</p>
      <div className="wm-field" style={{ marginBottom: 10 }}>
        <label className="wm-label">웹 앱 URL</label>
        <input className="wm-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" />
      </div>
      <button className="wm-btn wm-pri" disabled={!url.trim()} style={{ opacity: url.trim() ? 1 : 0.45 }} onClick={() => onSave(url)}>연결</button>
      <div className="wm-steps">
        ① 시트 → 확장 프로그램 → Apps Script 에 <b>Code.gs</b> 붙여넣기<br />
        ② 배포 → 새 배포 → 유형 “웹 앱” → 실행: 나 / 액세스: <b>모든 사용자</b> → 배포<br />
        ③ 표시되는 <b>웹 앱 URL(.../exec)</b>을 위에 입력
      </div>
    </div>
  );
}

/* ───────────────────────── Home ───────────────────────── */
function CodeEntry({ onEnter }) {
  const [active, setActive] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [code, setCode] = useState("");
  useEffect(() => {
    (async () => { try { const d = await apiPublicList(); setActive(d && d.ok ? d.meetings : []); } catch { setActive([]); } })();
  }, []);
  const toggle = (id) => { setOpenId((cur) => (cur === id ? null : id)); setCode(""); };
  const submit = (id) => onEnter(code, id);
  return (
    <div>
      <div className="wm-hero">
        <span className="wm-eyebrow">일정 조율 · 우모가</span>
        <h2>우모<b>가</b></h2>
        <div className="tag">우리가 모두 가능한 시간</div>
        <p>여러 사람의 가능한 시간을 모아 <b>모두가 되는 시간</b>을 찾아주는 도구예요. 주최자가 올린 후보 중 가능한 시간을 체크하고, <b>후보에 없으면 내가 가능한 시간을 직접 추가</b>할 수도 있어요. 가장 많이 겹치는 시간이 자동으로 정리되고, 확정된 일정은 <b>구글 캘린더에 등록할 수 있어요</b>.</p>
        <div className="wm-feats">
          <span className="wm-feat"><span className="ic"><Icon name="cal" size={14} /></span> 시간 자동 취합</span>
          <span className="wm-feat"><span className="ic"><Icon name="plus" size={14} /></span> 내 시간 추가</span>
          <span className="wm-feat"><span className="ic"><Icon name="caladd" size={14} /></span> 캘린더 등록</span>
        </div>
      </div>
      {active && active.length === 0 && (<div className="wm-brickempty">지금 진행 중인 모임이 없어요.</div>)}
      {active && active.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="wm-sectionlabel">현재 투표 중인 모임 · 눌러서 코드 입력</div>
          <div className="wm-bricklist">
            {active.map((m, i) => (
              <div key={m.id} className="wm-vcard">
                <div className={"wm-vstripe" + (i % 2 ? " alt" : "")} />
                <button className="wm-acc" onClick={() => toggle(m.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div className="wm-titlerow">
                      {m.type && <TypeTag type={m.type} />}
                      <h3 className="wm-mtitle">{m.title}</h3>
                    </div>
                    <span className="wm-caret">{openId === m.id ? "▲" : "▼"}</span>
                  </div>
                  {m.deadline && <div className="wm-meta" style={{ marginTop: 8 }}><span className="wm-dl"><Icon name="clock" size={13} /> {remainText(m.deadline)}</span></div>}
                </button>
                {openId === m.id && (
                  <div className="wm-brickfoot">
                    <div className="wm-join">
                      <input className="wm-input" value={code} autoFocus onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit(m.id)} placeholder="참여 코드" maxLength={6} />
                      <button className="wm-btn wm-pri" disabled={!code.trim()} onClick={() => submit(m.id)}>입장</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Home({ meetings, isAdmin, onAddHost, onOpen, onNew }) {
  const [hn, setHn] = useState("");
  const [hp, setHp] = useState("");
  if (meetings === null) return <div className="wm-spin" />;
  const AdminPanel = isAdmin ? (
    <div className="wm-card" style={{ padding: 18, marginTop: 14 }}>
      <div className="wm-label" style={{ marginBottom: 6 }}>다른 사람에게 일정 생성 권한 주기</div>
      <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.55 }}>이름과 비밀번호를 정해 알려주면, 그 사람은 자기 비밀번호로 로그인해 자신의 모임만 만들고 관리합니다.</p>
      <div className="wm-slotrow">
        <input className="wm-input" placeholder="이름" value={hn} onChange={(e) => setHn(e.target.value)} />
        <input className="wm-input" placeholder="비밀번호" value={hp} onChange={(e) => setHp(e.target.value)} />
        <button className="wm-btn wm-ghost wm-sm" disabled={!hn.trim() || !hp.trim()} onClick={() => { onAddHost(hn.trim(), hp.trim()); setHn(""); setHp(""); }}>권한 부여</button>
      </div>
    </div>
  ) : null;
  if (meetings.length === 0)
    return (<div><div className="wm-card wm-empty"><h3>아직 잡은 모임이 없어요</h3><p>모임을 만들면 참여 코드와 링크가 나와요. 그걸 받은 사람만 해당 모임에 입장할 수 있습니다.</p><button className="wm-btn wm-pri" onClick={onNew}>첫 모임 만들기</button></div>{AdminPanel}</div>);
  return (
    <div>
      <div className="wm-list">
        {meetings.map((m) => {
          const span = m.slots.length ? `${fmtSlot(m.slots[0].start).split(" ")[0]} 외 ${m.slots.length}개 후보` : "후보 없음";
          const st = statusOf(m); const rt = remainText(m.deadline);
          return (
            <div key={m.id} className="wm-card wm-mcard" onClick={() => onOpen(m.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div className="wm-titlerow">
                  {m.type && <TypeTag type={m.type} />}
                  <h3 className="wm-mtitle">{m.title}</h3>
                </div>
                <span className={"wm-badge " + st.k}>{st.t}</span>
              </div>
              <div className="wm-meta">
                <span><Icon name="cal" size={13} /> {span}</span>
                {m.location && <span><Icon name="pin" size={13} /> {m.location}</span>}
                {rt && <span className={"wm-dl" + (st.k === "soon" ? " soon" : st.k === "closed" ? " over" : "")}><Icon name="clock" size={13} /> {rt}</span>}
                {isAdmin && m.owner && <span><Icon name="user" size={13} /> {m.owner}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {AdminPanel}
    </div>
  );
}

/* ───────────────────────── Create ───────────────────────── */
function Create({ onCancel, onSaved, flash, initial }) {
  const ed = !!initial;
  const [title, setTitle] = useState(initial ? initial.title || "" : "");
  const [type, setType] = useState(initial ? initial.type || "회의" : "회의");
  const [location, setLocation] = useState(initial ? initial.location || "" : "");
  const [desc, setDesc] = useState(initial ? initial.desc || "" : "");
  const [dlDate, setDlDate] = useState(initial && initial.deadline ? initial.deadline.split("T")[0] : "");
  const [dlTime, setDlTime] = useState(initial && initial.deadline ? (initial.deadline.split("T")[1] || "") : "");
  const [expected, setExpected] = useState(initial && initial.expected ? String(initial.expected) : "");
  const [slots, setSlots] = useState(
    initial && initial.slots && initial.slots.length
      ? initial.slots.map((x) => ({ id: x.id, date: (x.start || "").split("T")[0] || "", time: (x.start || "").split("T")[1] || "", durationMin: x.durationMin || 60 }))
      : [{ id: uid("s"), date: "", time: "", durationMin: 60 }]
  );
  const [saving, setSaving] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [extractMsg, setExtractMsg] = useState("");

  const setSlot = (i, patch) => setSlots((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addSlot = () => setSlots((s) => [...s, { id: uid("s"), date: "", time: "", durationMin: 60 }]);
  const rmSlot = (i) => setSlots((s) => (s.length > 1 ? s.filter((_, idx) => idx !== i) : s));
  const valid = title.trim() && slots.some((s) => s.date && s.time);
  const extract = () => {
    const got = parseScheduleText(pasteText, new Date());
    if (got.length) {
      setSlots(got.map((s) => ({ id: uid("s"), date: s.date, time: s.time, durationMin: s.durationMin || 60 })));
      setExtractMsg(`${got.length}개 후보를 채웠어요. 아래에서 확인·수정하세요.`);
    } else {
      setExtractMsg("날짜·시간을 찾지 못했어요. 예) 7/1 오후 4시 · 7/2(목) 10시");
    }
  };

  const save = async () => {
    setSaving(true);
    const built = slots.filter((s) => s.date && s.time)
      .map((s) => ({ id: s.id, start: `${s.date}T${s.time}`, durationMin: Number(s.durationMin) || 60 }))
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    const common = {
      title: title.trim(), type, location: location.trim(), desc: desc.trim(),
      deadline: dlDate && dlTime ? `${dlDate}T${dlTime}` : null,
      expected: expected ? Number(expected) : null, slots: built,
    };
    if (ed) {
      const fin = built.some((x) => x.id === initial.finalSlotId) ? initial.finalSlotId : null;
      await onSaved({ ...initial, ...common, finalSlotId: fin });
    } else {
      await onSaved({ ...common, id: uid("m"), code: genCode(), finalSlotId: null, createdAt: Date.now() });
    }
  };

  return (
    <div>
      <button className="wm-back" onClick={onCancel}>← 목록</button>
      <h1 className="wm-h1">{ed ? "모임 수정" : "새 모임"}</h1>
      <div className="wm-card" style={{ padding: "22px" }}>
        <div className="wm-field">
          <label className="wm-label">유형</label>
          <div className="wm-seg">
            {TYPES.map((t) => (
              <button key={t} className={"wm-segb" + (type === t ? " on" : "")} onClick={() => setType(t)}>
                <span>{TYPE_ICON[t]}</span>{t}
              </button>
            ))}
          </div>
        </div>
        <div className="wm-field">
          <label className="wm-label">이름</label>
          <input className="wm-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 공정위원회 7월 정기회의" />
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="wm-field" style={{ flex: "1 1 200px" }}>
            <label className="wm-label">장소 (선택)</label>
            <input className="wm-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="예) 협회 304호 / 온라인" />
          </div>
          <div className="wm-field" style={{ flex: "1 1 200px" }}>
            <label className="wm-label">응답 마감 (선택)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" className="wm-input" value={dlDate} onChange={(e) => setDlDate(e.target.value)} />
              <input type="time" className="wm-input" value={dlTime} onChange={(e) => setDlTime(e.target.value)} />
            </div>
          </div>
          <div className="wm-field" style={{ flex: "1 1 140px" }}>
            <label className="wm-label">응답 예상 인원 (선택)</label>
            <input type="number" min="1" className="wm-input" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="예) 6" />
          </div>
        </div>
        <div className="wm-field">
          <label className="wm-label">안내 (선택)</label>
          <textarea className="wm-input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="참석자에게 보여줄 메모나 안건" />
        </div>
        <div className="wm-field">
          <label className="wm-label">대화 내용 붙여넣기로 후보 채우기 (선택)</label>
          <textarea className="wm-input" style={{ minHeight: 96 }} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
            placeholder={"카톡 등에서 복사한 일정 텍스트를 붙여넣으세요.\n예) 7/1(수) 오후 4시 / 7/2 목 10시 / 7/6 16~18시"} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
            <button className="wm-btn wm-ghost wm-sm" disabled={!pasteText.trim()} onClick={extract}>텍스트에서 일정 추출</button>
            {extractMsg && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{extractMsg}</span>}
          </div>
        </div>
        <div className="wm-field" style={{ marginBottom: 6 }}>
          <label className="wm-label">후보 일시 — 참석자가 이 중에서 가능한 시간을 고릅니다</label>
        </div>
        {slots.map((s, i) => (
          <div className="wm-slotrow" key={s.id}>
            <input type="date" className="wm-input" value={s.date} onChange={(e) => setSlot(i, { date: e.target.value })} />
            <input type="time" className="wm-input" value={s.time} onChange={(e) => setSlot(i, { time: e.target.value })} />
            <select className="wm-input" style={{ flex: "0 0 92px" }} value={s.durationMin} onChange={(e) => setSlot(i, { durationMin: e.target.value })}>
              <option value={30}>30분</option><option value={60}>1시간</option><option value={90}>1.5시간</option><option value={120}>2시간</option><option value={180}>3시간</option>
            </select>
            <button className="wm-x" onClick={() => rmSlot(i)} title="삭제">×</button>
          </div>
        ))}
        <button className="wm-btn wm-ghost wm-sm" onClick={addSlot} style={{ marginTop: 4 }}>+ 시간 후보 추가</button>
        <div style={{ display: "flex", gap: 9, marginTop: 24 }}>
          <button className="wm-btn wm-pri" disabled={!valid || saving} style={{ opacity: valid && !saving ? 1 : 0.45 }} onClick={save}>{saving ? "저장 중…" : ed ? "저장" : "만들기"}</button>
          <button className="wm-btn wm-ghost" onClick={onCancel}>취소</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Detail ───────────────────────── */
function Detail({ mtg, responses, mode, hostPin, flash, askConfirm, onBack, onRefresh, onEdit, onDeleted }) {
  const [name, setName] = useState("");
  const [avail, setAvail] = useState({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newDur, setNewDur] = useState(60);
  const [adding, setAdding] = useState(false);
  const [savingCal, setSavingCal] = useState(false);

  useEffect(() => {
    const t = setInterval(onRefresh, 8000); // 다른 사람 응답 자동 반영
    return () => clearInterval(t);
  }, [onRefresh]);

  if (!mtg) return <div className="wm-spin" />;

  const isHost = mode === "host";
  const closed = isClosed(mtg);
  const locked = closed && !isHost;
  const rt = remainText(mtg.deadline);
  const total = responses.length;
  const denom = mtg.expected && mtg.expected > 0 ? mtg.expected : total;
  const tally = mtg.slots.map((s) => {
    const yes = responses.filter((r) => r.avail && r.avail[s.id]);
    return { slot: s, yesNames: yes.map((r) => r.name), no: responses.filter((r) => !(r.avail && r.avail[s.id])).map((r) => r.name), count: yes.length };
  });
  const ranked = [...tally].sort((a, b) => b.count - a.count || new Date(a.slot.start) - new Date(b.slot.start));
  const finalSlot = mtg.slots.find((s) => s.id === mtg.finalSlotId);

  const link = meetingUrl(mtg.code);
  const inviteText = `[${mtg.title}] ${mtg.type ? "(" + mtg.type + ") " : ""}가능한 시간을 알려주세요.\n${link}` + (mtg.deadline ? `\n응답 마감: ${fmtSlot(mtg.deadline)}` : "");
  const copyInvite = async () => { try { await navigator.clipboard.writeText(inviteText); flash("초대 문구를 복사했어요"); } catch { flash("아래 문구를 길게 눌러 복사하세요"); } };
  const copyLink = async () => { try { await navigator.clipboard.writeText(link); flash("링크를 복사했어요"); } catch { flash("링크를 길게 눌러 복사하세요"); } };

  const toggle = (sid) => setAvail((a) => ({ ...a, [sid]: !a[sid] }));
  const loadMine = (n) => { const mine = responses.find((r) => r.name.trim().toLowerCase() === n.trim().toLowerCase()); if (mine) { setAvail(mine.avail || {}); setNote(mine.note || ""); } };

  const submit = async () => {
    if (locked) { flash("응답이 마감되었습니다"); return; }
    if (!name.trim()) { flash("이름을 입력해 주세요"); return; }
    setBusy(true);
    await apiSaveResponse(mtg.id, name.trim(), avail, note.trim());
    await onRefresh(); setBusy(false);
    flash(`${name.trim()} 님 일정 저장됨`);
  };
  const setFinal = async (sid) => {
    const next = mtg.finalSlotId === sid ? "" : sid;
    await apiSetFinal(mtg.id, next, hostPin); await onRefresh();
    flash(next ? "이 시간으로 확정했어요" : "확정을 취소했어요");
  };
  const delMeeting = () => askConfirm({
    title: "모임을 삭제할까요?", msg: "후보 일정과 참석자 응답이 시트에서 모두 사라집니다.",
    onYes: async () => { await apiDeleteMeeting(mtg.id, hostPin); await onDeleted(); },
  });
  const addMySlot = async () => {
    if (!newDate || !newTime) return;
    setAdding(true);
    const sid = uid("s");
    await apiAddSlot(mtg.id, { id: sid, start: `${newDate}T${newTime}`, durationMin: Number(newDur) || 60 });
    await onRefresh();
    setAvail((a) => ({ ...a, [sid]: true }));
    setNewDate(""); setNewTime(""); setNewDur(60);
    setAdding(false);
    flash("가능한 시간을 추가했어요");
  };
  const saveToCal = async () => {
    setSavingCal(true);
    const res = await apiAddToCalendar(mtg.id, hostPin);
    setSavingCal(false);
    if (res && res.ok) flash("내 구글 캘린더에 저장했어요");
    else flash((res && res.error) || "캘린더 저장 실패");
  };

  return (
    <div>
      <button className="wm-back" onClick={onBack}>← 목록</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div className="wm-titlerow" style={{ marginTop: 4 }}>
          {mtg.type && <TypeTag type={mtg.type} />}
          <h1 className="wm-h1" style={{ margin: 0 }}>{mtg.title}</h1>
          <span className={"wm-badge " + statusOf(mtg).k}>{statusOf(mtg).t}</span>
        </div>
        {isHost && (
          <div style={{ display: "flex", gap: 8, marginTop: 6, flex: "none" }}>
            <button className="wm-btn wm-ghost wm-sm" onClick={onEdit}>수정</button>
            <button className="wm-btn wm-danger wm-sm" onClick={delMeeting}>모임 삭제</button>
          </div>
        )}
      </div>
      <div className="wm-info" style={{ marginTop: 12 }}>
        {mtg.location && <span><Icon name="pin" size={13} /> {mtg.location}</span>}
        <span><Icon name="users" size={13} /> 응답 {total}{mtg.expected ? "/" + mtg.expected : ""}명</span>
        <span><Icon name="cal" size={13} /> 후보 {mtg.slots.length}개</span>
        {rt && <span className={"wm-dl" + (closed ? " over" : statusOf(mtg).k === "soon" ? " soon" : "")}><Icon name="clock" size={13} /> {rt}</span>}
      </div>
      {mtg.desc && (
        <div className="wm-desc">
          <span className="wm-desc-lab"><Icon name="chat" size={13} /> 안내</span>
          <div className="wm-desc-body">{mtg.desc}</div>
        </div>
      )}

      {isHost && (
        <div className="wm-share">
          <div className="codetag">이 모임 링크 — 참석자에게 공유하세요</div>
          <div className="wm-linkrow" style={{ margin: "6px 0 4px" }}>
            <input className="wm-input" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="wm-btn wm-pri wm-sm" onClick={copyLink}>링크 복사</button>
          </div>
          <div className="codetag" style={{ marginTop: 8 }}>또는 참여 코드 <b style={{ color: "var(--brand-dk)", letterSpacing: ".1em" }}>{mtg.code}</b></div>
          <textarea className="wm-invite" rows={3} readOnly value={inviteText} onFocus={(e) => e.target.select()} style={{ marginTop: 10 }} />
          <button className="wm-btn wm-ghost wm-sm" style={{ marginTop: 10 }} onClick={copyInvite}>초대 문구 복사</button>
        </div>
      )}

      {finalSlot && (
        <div className="wm-confirmbar">
          <div className="lab">확정된 시간</div>
          <div className="big">{fmtSlot(finalSlot.start)} · {fmtRange(finalSlot.start, finalSlot.durationMin)}</div>
          <div className="row">
            <a className="wm-gcal" href={gcalUrl(mtg, finalSlot)} target="_blank" rel="noreferrer"><Icon name="caladd" size={15} /> 구글 캘린더에 추가</a>
            {isHost && <button className="wm-gcal" disabled={savingCal} onClick={saveToCal}>{savingCal ? "저장 중…" : <><Icon name="check" size={15} /> 내 캘린더에 저장</>}</button>}
            {isHost && <button className="wm-btn wm-ghost wm-sm" onClick={() => setFinal(finalSlot.id)}>확정 취소</button>}
          </div>
        </div>
      )}

      <div className="wm-card wm-sec" style={{ marginBottom: 16 }}>
        <h2>내 가능한 시간 등록</h2>
        <p className="hint">이름을 적고 가능한 시간을 모두 골라 주세요. 같은 이름으로 다시 저장하면 수정됩니다.</p>
        {locked && <div className="wm-lockmsg" style={{ marginBottom: 14 }}>응답이 마감되어 더 이상 등록할 수 없어요.</div>}
        <div className="wm-field">
          <input className="wm-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={(e) => loadMine(e.target.value)} placeholder="이름" />
        </div>
        <div className="wm-chips">
          {mtg.slots.map((s) => (
            <button key={s.id} className={"wm-chip" + (avail[s.id] ? " on" : "")} disabled={locked} onClick={() => toggle(s.id)}>
              <span className="wm-tick">{avail[s.id] ? "✓" : ""}</span>
              <span className="when">{fmtSlot(s.start)}</span>
              <span className="dur">{fmtRange(s.start, s.durationMin)}</span>
            </button>
          ))}
        </div>
        {!locked && (
          <div style={{ marginTop: 12 }}>
            <div className="wm-label" style={{ marginBottom: 7 }}>원하는 시간이 없나요? 직접 추가하세요</div>
            <div className="wm-slotrow">
              <input type="date" className="wm-input" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              <input type="time" className="wm-input" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
              <select className="wm-input" style={{ flex: "0 0 92px" }} value={newDur} onChange={(e) => setNewDur(e.target.value)}>
                <option value={30}>30분</option><option value={60}>1시간</option><option value={90}>1.5시간</option><option value={120}>2시간</option><option value={180}>3시간</option>
              </select>
              <button className="wm-btn wm-ghost wm-sm" disabled={adding || !newDate || !newTime} onClick={addMySlot}>{adding ? "추가 중…" : "추가"}</button>
            </div>
          </div>
        )}
        <div className="wm-field" style={{ marginTop: 14, marginBottom: 0 }}>
          <input className="wm-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (선택) — 예) 오전만 가능" />
        </div>
        <button className="wm-btn wm-pri" style={{ marginTop: 16, opacity: locked || busy ? 0.45 : 1 }} disabled={locked || busy} onClick={submit}>{busy ? "저장 중…" : "참여 가능 일정 선택 완료"}</button>
      </div>

      <div className="wm-card wm-sec">
        <h2>취합 결과 {total > 0 && <span style={{ color: "var(--muted)", fontWeight: 500 }}>· 다 되는 시간 순</span>}</h2>
        {total === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>아직 응답이 없어요. 위에서 가능 시간을 등록하거나, 참여 코드를 참석자에게 공유하세요.</p>
        ) : (
          <div className="wm-rank">
            {ranked.map((t, i) => {
              const ratio = denom ? Math.min(1, t.count / denom) : 0;
              const all = denom > 0 && t.count >= denom;
              const isFinal = mtg.finalSlotId === t.slot.id;
              return (
                <div key={t.slot.id} className={"wm-slot" + (all ? " all" : "") + (isFinal ? " final" : "")}>
                  <div className="fill" style={{ width: `${ratio * 100}%` }} />
                  <div className="wm-slothead">
                    <span className="wm-no">{i + 1}</span>
                    <div>
                      <div className="wm-when2">{fmtSlot(t.slot.start)}{all && <span className="wm-allbadge">모두 가능</span>}</div>
                      <div className="wm-time2">{fmtRange(t.slot.start, t.slot.durationMin)}</div>
                    </div>
                    <span className="wm-count">{t.count}/{denom}</span>
                  </div>
                  {(t.yesNames.length > 0 || t.no.length > 0) && (
                    <div className="wm-people">
                      {t.yesNames.map((n, k) => <span key={"y" + k} className="wm-p yes">{n}</span>)}
                      {t.no.map((n, k) => <span key={"n" + k} className="wm-p no">{n}</span>)}
                    </div>
                  )}
                  {isHost && (
                    <div className="wm-pick">
                      <button className={"wm-btn wm-sm " + (isFinal ? "wm-ghost" : "wm-pri")} onClick={() => setFinal(t.slot.id)}>{isFinal ? "확정됨 · 취소" : "이 시간으로 확정"}</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="wm-note">입력한 일정은 구글 시트에 저장되어 모든 참여자에게 자동 취합됩니다(8초마다 갱신).</div>
      </div>
    </div>
  );
}
