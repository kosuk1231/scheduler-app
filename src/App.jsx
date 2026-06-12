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

async function apiGet() {
  const r = await fetch(GAS_URL, { method: "GET" });
  return await r.json();
}
async function apiPost(payload) {
  // Content-Type 미지정 → text/plain(단순요청)으로 보내 CORS preflight 회피
  await fetch(GAS_URL, { method: "POST", body: JSON.stringify(payload) });
}
const apiSaveMeeting = (m) => apiPost({ action: "saveMeeting", meeting: m });
const apiDeleteMeeting = (id) => apiPost({ action: "deleteMeeting", id });
const apiSaveResponse = (mtgId, name, avail, note) => apiPost({ action: "saveResponse", mtgId, name, avail, note });
const apiSetFinal = (id, finalSlotId) => apiPost({ action: "setFinal", id, finalSlotId });
async function apiParseImage(image, mediaType, today) {
  const r = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "parseImage", image, mediaType, today }) });
  return await r.json();
}
async function apiAddToCalendar(mtgId) {
  const r = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "addToCalendar", mtgId }) });
  return await r.json();
}
const apiAddSlot = (mtgId, slot) => apiPost({ action: "addSlot", mtgId, slot });

/* ───────────────────────── 공통 헬퍼 ───────────────────────── */
const TYPES = ["워크숍", "회의", "강의", "온라인 중계"];
const TYPE_ICON = { "워크숍": "🧩", "회의": "💬", "강의": "🎓", "온라인 중계": "📡" };
const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const uid = (p = "") => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const genCode = () => Array.from({ length: 6 }, () => CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]).join("");
const asArr = (v) => (Array.isArray(v) ? v : (() => { try { return JSON.parse(v) || []; } catch { return []; } })());
const asObj = (v) => (v && typeof v === "object" ? v : (() => { try { return JSON.parse(v) || {}; } catch { return {}; } })());

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

/* ───────────────────────── styles ───────────────────────── */
const CSS = `
.wm * { box-sizing: border-box; }
.wm {
  --bg:#EBEEF3; --panel:#FFFFFF; --ink:#172029; --muted:#6A7886; --faint:#9AA7B4;
  --line:#E2E8EE; --brand:#0E8C7F; --brand-dk:#0A6B61; --brand-rgb:14,140,127;
  --amber:#D98A24; --bad:#C24B3A; --shadow:0 1px 2px rgba(23,32,41,.05),0 8px 24px rgba(23,32,41,.06);
  font-family:'Pretendard',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','Segoe UI',sans-serif;
  color:var(--ink); background:var(--bg); min-height:100vh; line-height:1.5; -webkit-font-smoothing:antialiased;
}
.wm-wrap { max-width:840px; margin:0 auto; padding:0 18px 96px; }
.wm-top { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; padding:28px 2px 22px; }
.wm-brand { display:flex; align-items:baseline; gap:10px; cursor:pointer; }
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
.wm-pri { background:var(--brand); color:#fff; }
.wm-pri:hover { background:var(--brand-dk); }
.wm-ghost { background:#fff; color:var(--ink); border:1px solid var(--line); }
.wm-ghost:hover { border-color:#C9D3DC; }
.wm-danger { background:#fff; color:var(--bad); border:1px solid #EAD2CD; }
.wm-danger:hover { background:#FDF4F2; }
.wm-sm { font-size:12.5px; padding:7px 11px; border-radius:9px; }

.wm-card { background:var(--panel); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); }
.wm-list { display:flex; flex-direction:column; gap:12px; }
.wm-mcard { padding:18px 20px; cursor:pointer; transition:border-color .15s, transform .08s; }
.wm-mcard:hover { border-color:#C7D3DC; transform:translateY(-1px); }
.wm-titlerow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.wm-mtitle { font-size:17px; font-weight:750; letter-spacing:-.02em; margin:0; }
.wm-type { font-size:11px; font-weight:700; padding:3px 8px; border-radius:7px; letter-spacing:-.01em;
  background:rgba(var(--brand-rgb),.1); color:var(--brand-dk); white-space:nowrap; }
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
.wm-sec h2 { font-size:14px; font-weight:750; letter-spacing:-.02em; margin:0 0 2px; }
.wm-sec .hint { font-size:12.5px; color:var(--muted); margin:0 0 16px; }

.wm-chips { display:flex; flex-direction:column; gap:8px; }
.wm-chip { display:flex; align-items:center; gap:11px; width:100%; text-align:left; cursor:pointer;
  border:1.5px solid var(--line); background:#fff; border-radius:11px; padding:11px 14px; font-family:inherit; transition:.12s; }
.wm-chip:hover { border-color:#C7D3DC; }
.wm-chip.on { border-color:var(--brand); background:rgba(var(--brand-rgb),.06); }
.wm-chip:disabled { cursor:default; opacity:.55; }
.wm-chip:disabled:hover { border-color:var(--line); }
.wm-tick { width:20px; height:20px; border-radius:6px; border:1.5px solid var(--faint); flex:none; display:flex; align-items:center; justify-content:center; color:#fff; transition:.12s; }
.wm-chip.on .wm-tick { background:var(--brand); border-color:var(--brand); }
.wm-chip .when { font-size:14px; font-weight:600; letter-spacing:-.01em; }
.wm-chip .dur { font-size:12px; color:var(--muted); margin-left:auto; }

.wm-rank { display:flex; flex-direction:column; gap:10px; }
.wm-slot { border:1px solid var(--line); border-radius:13px; padding:13px 15px; position:relative; overflow:hidden; transition:border-color .15s; }
.wm-slot .fill { position:absolute; inset:0; right:auto; background:rgba(var(--brand-rgb),.10); z-index:0; transition:width .5s cubic-bezier(.2,.7,.2,1); }
.wm-slot.all { border-color:var(--brand); box-shadow:0 0 0 3px rgba(var(--brand-rgb),.14); }
.wm-slot.final { border-color:#172029; box-shadow:0 0 0 3px rgba(23,32,41,.12); }
.wm-slot > * { position:relative; z-index:1; }
.wm-slothead { display:flex; align-items:center; gap:11px; }
.wm-no { width:24px; height:24px; border-radius:7px; background:#172029; color:#fff; font-size:12px; font-weight:800; display:flex; align-items:center; justify-content:center; flex:none; }
.wm-slot.all .wm-no { background:var(--brand); }
.wm-when2 { font-size:14.5px; font-weight:700; letter-spacing:-.02em; }
.wm-time2 { font-size:12px; color:var(--muted); }
.wm-count { margin-left:auto; font-size:13px; font-weight:750; color:var(--brand-dk); white-space:nowrap; }
.wm-allbadge { margin-left:8px; font-size:10.5px; font-weight:800; color:#fff; background:var(--brand); padding:3px 7px; border-radius:999px; }
.wm-people { margin-top:9px; display:flex; flex-wrap:wrap; gap:5px; }
.wm-p { font-size:11.5px; padding:3px 8px; border-radius:7px; font-weight:600; }
.wm-p.yes { background:rgba(var(--brand-rgb),.14); color:var(--brand-dk); }
.wm-p.no { background:#F0F2F5; color:var(--faint); text-decoration:line-through; }
.wm-pick { margin-top:11px; }

.wm-confirmbar { background:#172029; color:#fff; border-radius:13px; padding:16px 18px; margin-bottom:16px; }
.wm-confirmbar .lab { font-size:11.5px; font-weight:700; color:#7FE0D2; letter-spacing:.02em; text-transform:uppercase; }
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
.wm-info { font-size:13px; color:var(--muted); margin:0 0 18px; display:flex; gap:13px; flex-wrap:wrap; align-items:center; }
.wm-spin { width:22px; height:22px; border:2.5px solid var(--line); border-top-color:var(--brand); border-radius:50%; animation:wm-rot .7s linear infinite; margin:48px auto; }
@keyframes wm-rot { to { transform:rotate(360deg); } }
.wm-note { font-size:12px; color:var(--faint); background:#F4F6F9; border:1px solid var(--line); border-radius:10px; padding:11px 13px; line-height:1.55; margin-top:14px; }
.wm-setup { padding:26px; margin-top:8px; }
.wm-setup h2 { font-size:18px; margin:0 0 6px; letter-spacing:-.02em; }
.wm-setup p { font-size:13px; color:var(--muted); margin:0 0 18px; line-height:1.6; }
.wm-steps { font-size:12.5px; color:var(--muted); line-height:1.7; background:#F4F6F9; border:1px solid var(--line); border-radius:10px; padding:13px 15px; margin-top:14px; }
.wm-drop { display:flex; align-items:center; justify-content:center; gap:8px; text-align:center; cursor:pointer; border:1.5px dashed var(--line); border-radius:12px; padding:16px; font-size:13px; color:var(--muted); background:#F8FAFB; transition:.15s; line-height:1.5; }
.wm-drop:hover { border-color:var(--brand); color:var(--brand-dk); background:rgba(var(--brand-rgb),.05); }
@media (max-width:560px){ .wm-slotrow { flex-wrap:wrap; } .wm-slotrow .wm-input { flex:1 1 40%; } }
@media (prefers-reduced-motion:reduce){ .wm *{animation:none!important; transition:none!important;} }
`;

/* ───────────────────────── App ───────────────────────── */
export default function App() {
  const [gasUrl, setGasUrl] = useState(undefined); // undefined=확인중, ""=설정필요, url=연결됨
  const [data, setData] = useState(null); // {meetings, responses, error?}
  const [view, setView] = useState("home");
  const [curId, setCurId] = useState(null);
  const [mode, setMode] = useState("host");
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [linkCode, setLinkCode] = useState(typeof window !== "undefined" ? readHashCode() : "");
  const toastTimer = useRef(null);

  const flash = (m) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 2200); };

  const loadData = useCallback(async () => {
    if (!GAS_URL) return;
    try {
      const d = await apiGet();
      const meetings = (d.meetings || []).map((m) => ({ ...m, slots: asArr(m.slots), createdAt: Number(m.createdAt) || 0, expected: m.expected ? Number(m.expected) : null }))
        .sort((a, b) => b.createdAt - a.createdAt);
      const responses = (d.responses || []).map((r) => ({ ...r, avail: asObj(r.avail) }));
      setData({ meetings, responses });
    } catch {
      setData({ meetings: [], responses: [], error: true });
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (GAS_URL_DEFAULT) { GAS_URL = GAS_URL_DEFAULT; setGasUrl(GAS_URL_DEFAULT); await loadData(); return; }
      const c = hasWS ? await cfgGet() : "";
      if (c) { GAS_URL = c; setGasUrl(c); await loadData(); }
      else setGasUrl("");
    })();
  }, [loadData]);

  useEffect(() => {
    const onHash = () => { const c = readHashCode(); if (c) setLinkCode(c); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!linkCode || !data) return;
    const m = data.meetings.find((x) => (x.code || "").toUpperCase() === linkCode);
    if (m) { setMode("guest"); setCurId(m.id); setView("detail"); }
    else flash("링크의 모임을 찾지 못했어요");
    setLinkCode("");
  }, [linkCode, data]);

  const saveUrl = async (url) => {
    GAS_URL = url.trim();
    if (hasWS) await cfgSet(GAS_URL);
    setGasUrl(GAS_URL);
    setShowSetup(false);
    setData(null);
    await loadData();
    flash("연결됐어요");
  };

  const goHome = async () => {
    setCurId(null); setView("home"); setLinkCode("");
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    await loadData();
  };

  if (gasUrl === undefined) return (<div className="wm"><style>{CSS}</style><div className="wm-spin" /></div>);
  if (gasUrl === "" || showSetup)
    return (<div className="wm"><style>{CSS}</style><div className="wm-wrap"><Setup onSave={saveUrl} current={gasUrl} onClose={gasUrl ? () => setShowSetup(false) : null} /></div></div>);

  const meetings = data ? data.meetings : null;
  const responses = data ? data.responses : [];

  return (
    <div className="wm">
      <style>{CSS}</style>
      <div className="wm-wrap">
        <div className="wm-top">
          <div className="wm-brand" onClick={goHome}>
            <span className="wm-logo">우모<b>가</b></span>
            <span className="wm-sub">우리가 모두 가능한 시간</span>
          </div>
          <div className="wm-headbtns">
            {view === "home" && <button className="wm-btn wm-pri" onClick={() => setView("create")}>+ 새 모임</button>}
            <button className="wm-gear" title="연결 설정" onClick={() => setShowSetup(true)}>⚙</button>
          </div>
        </div>

        {data && data.error && <div className="wm-err">시트에 연결하지 못했어요. ⚙ 연결 설정의 URL과 배포 권한(모든 사용자)을 확인해 주세요.</div>}

        {view === "home" && (
          <Home meetings={meetings} flash={flash}
            onOpen={(id) => { setMode("host"); setCurId(id); setView("detail"); }}
            onJoin={(id) => { setMode("guest"); setCurId(id); setView("detail"); }}
            onNew={() => setView("create")} />
        )}
        {view === "create" && (
          <Create onCancel={goHome} flash={flash}
            onSaved={async (m) => { await apiSaveMeeting(m); await loadData(); setCurId(m.id); setMode("host"); setView("detail"); flash("모임을 만들었어요"); }} />
        )}
        {view === "detail" && curId && meetings && (
          <Detail
            mtg={meetings.find((m) => m.id === curId)}
            responses={responses.filter((r) => r.mtgId === curId)}
            mode={mode} flash={flash} askConfirm={setConfirm}
            onBack={goHome} onRefresh={loadData}
            onDeleted={async () => { setCurId(null); setView("home"); await loadData(); }} />
        )}
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
function Home({ meetings, flash, onOpen, onJoin, onNew }) {
  const [code, setCode] = useState("");
  if (meetings === null) return <div className="wm-spin" />;

  const join = () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    const m = meetings.find((x) => (x.code || "").toUpperCase() === c);
    if (m) onJoin(m.id); else flash("그 코드의 모임을 찾지 못했어요");
  };
  const JoinBox = (
    <div className="wm-join">
      <input className="wm-input" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && join()} placeholder="참여 코드 입력" maxLength={6} />
      <button className="wm-btn wm-ghost" onClick={join}>참여</button>
    </div>
  );

  if (meetings.length === 0)
    return (<div>{JoinBox}<div className="wm-card wm-empty"><h3>아직 잡은 모임이 없어요</h3><p>모임을 만들면 참여 코드가 나와요. 코드를 공유하면 참석자가 바로 들어와 가능 시간을 체크합니다.</p><button className="wm-btn wm-pri" onClick={onNew}>첫 모임 만들기</button></div></div>);

  return (
    <div>
      {JoinBox}
      <div className="wm-list">
        {meetings.map((m) => {
          const span = m.slots.length ? `${fmtSlot(m.slots[0].start).split(" ")[0]} 외 ${m.slots.length}개 후보` : "후보 없음";
          const st = statusOf(m); const rt = remainText(m.deadline);
          return (
            <div key={m.id} className="wm-card wm-mcard" onClick={() => onOpen(m.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div className="wm-titlerow">
                  {m.type && <span className="wm-type">{TYPE_ICON[m.type] || ""} {m.type}</span>}
                  <h3 className="wm-mtitle">{m.title}</h3>
                </div>
                <span className={"wm-badge " + st.k}>{st.t}</span>
              </div>
              <div className="wm-meta">
                <span>🗓 {span}</span>
                {m.location && <span>📍 {m.location}</span>}
                {rt && <span className={"wm-dl" + (st.k === "soon" ? " soon" : st.k === "closed" ? " over" : "")}>⏳ {rt}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── Create ───────────────────────── */
function Create({ onCancel, onSaved, flash }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("회의");
  const [location, setLocation] = useState("");
  const [desc, setDesc] = useState("");
  const [dlDate, setDlDate] = useState("");
  const [dlTime, setDlTime] = useState("");
  const [expected, setExpected] = useState("");
  const [slots, setSlots] = useState([{ id: uid("s"), date: "", time: "", durationMin: 60 }]);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseErr, setParseErr] = useState("");

  const setSlot = (i, patch) => setSlots((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addSlot = () => setSlots((s) => [...s, { id: uid("s"), date: "", time: "", durationMin: 60 }]);
  const rmSlot = (i) => setSlots((s) => (s.length > 1 ? s.filter((_, idx) => idx !== i) : s));
  const valid = title.trim() && slots.some((s) => s.date && s.time);
  const toBase64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
  const onImage = async (file) => {
    if (!file) return;
    setParsing(true); setParseErr("");
    try {
      const b64 = await toBase64(file);
      const res = await apiParseImage(b64, file.type || "image/png", new Date().toISOString().slice(0, 10));
      const got = res && res.ok && Array.isArray(res.slots) ? res.slots : null;
      if (got && got.length) {
        setSlots(got.map((s) => ({ id: uid("s"), date: s.date || "", time: s.time || "", durationMin: Number(s.durationMin) || 60 })));
        flash && flash(`${got.length}개 후보를 채웠어요. 확인 후 수정하세요`);
      } else if (res && res.error === "NO_KEY") {
        setParseErr("이미지 분석 키가 설정되지 않았어요 (Apps Script 속성 ANTHROPIC_API_KEY).");
      } else {
        setParseErr("일정을 찾지 못했어요. 직접 입력해 주세요.");
      }
    } catch {
      setParseErr("이미지 분석에 실패했어요. 직접 입력해 주세요.");
    }
    setParsing(false);
  };
  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const it of items) {
        if (it.type && it.type.indexOf("image") === 0) {
          const file = it.getAsFile();
          if (file) { e.preventDefault(); onImage(file); break; }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const save = async () => {
    setSaving(true);
    const built = slots.filter((s) => s.date && s.time)
      .map((s) => ({ id: s.id, start: `${s.date}T${s.time}`, durationMin: Number(s.durationMin) || 60 }))
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    await onSaved({
      id: uid("m"), code: genCode(), title: title.trim(), type,
      location: location.trim(), desc: desc.trim(),
      deadline: dlDate && dlTime ? `${dlDate}T${dlTime}` : null,
      expected: expected ? Number(expected) : null,
      slots: built, finalSlotId: null, createdAt: Date.now(),
    });
  };

  return (
    <div>
      <button className="wm-back" onClick={onCancel}>← 목록</button>
      <h1 className="wm-h1">새 모임</h1>
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
          <label className="wm-label">스크린샷으로 후보 채우기 (선택)</label>
          <label className="wm-drop">
            <input type="file" accept="image/*" style={{ display: "none" }} disabled={parsing} onChange={(e) => onImage(e.target.files && e.target.files[0])} />
            {parsing ? "이미지에서 일정을 읽는 중…" : "📷 캡처 올리기 또는 붙여넣기(Ctrl+V) — 후보 시간을 자동으로 채워줍니다"}
          </label>
          {parseErr && <div className="wm-lockmsg" style={{ marginTop: 8 }}>{parseErr}</div>}
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
          <button className="wm-btn wm-pri" disabled={!valid || saving} style={{ opacity: valid && !saving ? 1 : 0.45 }} onClick={save}>{saving ? "저장 중…" : "만들기"}</button>
          <button className="wm-btn wm-ghost" onClick={onCancel}>취소</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Detail ───────────────────────── */
function Detail({ mtg, responses, mode, flash, askConfirm, onBack, onRefresh, onDeleted }) {
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
    await apiSetFinal(mtg.id, next); await onRefresh();
    flash(next ? "이 시간으로 확정했어요" : "확정을 취소했어요");
  };
  const delMeeting = () => askConfirm({
    title: "모임을 삭제할까요?", msg: "후보 일정과 참석자 응답이 시트에서 모두 사라집니다.",
    onYes: async () => { await apiDeleteMeeting(mtg.id); await onDeleted(); },
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
    const res = await apiAddToCalendar(mtg.id);
    setSavingCal(false);
    if (res && res.ok) flash("내 구글 캘린더에 저장했어요");
    else flash((res && res.error) || "캘린더 저장 실패");
  };

  return (
    <div>
      <button className="wm-back" onClick={onBack}>← 목록</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div className="wm-titlerow" style={{ marginTop: 4 }}>
          {mtg.type && <span className="wm-type">{TYPE_ICON[mtg.type] || ""} {mtg.type}</span>}
          <h1 className="wm-h1" style={{ margin: 0 }}>{mtg.title}</h1>
        </div>
        {isHost && <button className="wm-btn wm-danger wm-sm" onClick={delMeeting} style={{ marginTop: 6, flex: "none" }}>모임 삭제</button>}
      </div>
      <div className="wm-info" style={{ marginTop: 12 }}>
        {mtg.location && <span>📍 {mtg.location}</span>}
        <span>👥 응답 {total}{mtg.expected ? "/" + mtg.expected : ""}명</span>
        <span>🗓 후보 {mtg.slots.length}개</span>
        {rt && <span className={"wm-dl" + (closed ? " over" : statusOf(mtg).k === "soon" ? " soon" : "")}>⏳ {rt}</span>}
      </div>
      {mtg.desc && <div className="wm-note" style={{ marginTop: 0, marginBottom: 16 }}>{mtg.desc}</div>}

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
            <a className="wm-gcal" href={gcalUrl(mtg, finalSlot)} target="_blank" rel="noreferrer">📅 구글 캘린더에 추가</a>
            {isHost && <button className="wm-gcal" disabled={savingCal} onClick={saveToCal}>{savingCal ? "저장 중…" : "💾 내 캘린더에 저장"}</button>}
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
