/* ============================================================
   Shared helpers and constants used across the app.
   Everything here is attached to the global window scope.
   ============================================================ */

const $ = s => document.querySelector(s);

const COLORS = ['#fce8c4', '#ead2b0', '#e6c098', '#d4ad8c'];
const PEN_COLORS = ['#2a221a', '#735239', '#a8534a', '#426478'];
const PEN_WIDTHS = [
  { key: 'thin',  w: 0.0025, dot: 3 },
  { key: 'mid',   w: 0.0045, dot: 5 },
  { key: 'thick', w: 0.0075, dot: 8 }
];

const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function toast(msg, isErr) {
  const t = document.createElement('div');
  t.className = 'toast' + (isErr ? ' err' : '');
  t.textContent = msg;
  $('#toastBox').appendChild(t);
  setTimeout(() => t.remove(), isErr ? 5000 : 2600);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

/* base64 helpers — used by the GitHub layer for binary + utf-8 payloads */
function bufToB64(buf) {
  const bytes = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const strToB64 = s => bufToB64(new TextEncoder().encode(s));
function b64ToStr(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
