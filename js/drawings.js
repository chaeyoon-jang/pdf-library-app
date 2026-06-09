/* ============================================================
   Free-hand drawing with Apple Pencil / mouse.

   iPad scroll fix
   ---------------
   The browser decides whether to scroll based on `touch-action`, and
   the OS treats the Pencil as a touch input for that decision. So
   `touch-action: pan-y` lets the Pencil scroll the page even while
   our pointerdown handler tries to draw.

   Fix: listen for the legacy touch events with `{passive: false}`
   and `preventDefault()` only when the first touch is a stylus
   (`touch.touchType === 'stylus'`). Fingers fall through and scroll
   normally; the Pencil never initiates a scroll.

   Drawing data
   ------------
   { id, page, color, width, points: [[x,y]…], created }
   – x, y, width are page-relative fractions of width
   ============================================================ */

let drawMode = false, drawTool = 'pen';
let drawColor = '#2a221a', drawWidth = 0.0045;
let currentStroke = null, drawingPage = 0;
let erasing = false, eraserPage = 0;
const ERASER_TOL = 0.012;   // ~1.2% of page width; forgiving but not greedy

/* ---------- rendering ---------- */
function paintDrawings(pageNo) {
  const wrap = V.wraps[pageNo]; if (!wrap) return;
  const cv = wrap.querySelector('canvas.drawLayer'); if (!cv) return;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (!W || !H) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.floor(W * dpr);
  cv.height = Math.floor(H * dpr);
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const d of (V.anns.drawings || [])) {
    if (d.page !== pageNo) continue;
    drawStroke(ctx, d, W, H);
  }
  if (currentStroke && currentStroke.page === pageNo) drawStroke(ctx, currentStroke, W, H);
}

function drawStroke(ctx, d, W, H) {
  const pts = d.points; if (!pts || !pts.length) return;
  ctx.strokeStyle = d.color;
  ctx.fillStyle = d.color;
  ctx.lineWidth = d.width * W;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0]*W, pts[0][1]*H, (d.width*W)/2, 0, Math.PI*2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0]*W, pts[0][1]*H);
  for (let i = 1; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i+1];
    // quadratic curve through the midpoint of each segment → naturally smooth
    ctx.quadraticCurveTo(x1*W, y1*H, ((x1+x2)/2)*W, ((y1+y2)/2)*H);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0]*W, last[1]*H);
  ctx.stroke();
}

// True if (x,y) is within `tol + width/2` of any segment of the stroke.
function strokeHit(d, x, y, tol) {
  const pts = d.points;
  const r = (d.width / 2) + tol;
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = pts[i];
    if ((px - x) ** 2 + (py - y) ** 2 <= r * r) return true;
    if (i > 0) {
      const [ax, ay] = pts[i-1];
      const dx = px - ax, dy = py - ay;
      const len2 = dx*dx + dy*dy;
      if (len2 < 1e-10) continue;
      let t = ((x - ax) * dx + (y - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const sx = ax + t*dx, sy = ay + t*dy;
      if ((sx - x) ** 2 + (sy - y) ** 2 <= r * r) return true;
    }
  }
  return false;
}

/* ---------- mode + tool wiring ---------- */
function setDrawMode(on) {
  drawMode = !!on;
  if (drawMode && postitMode) setPostitMode(false);
  document.body.classList.toggle('drawMode', drawMode);
  document.body.classList.toggle('eraserTool', drawMode && drawTool === 'eraser');
  const btn = $('#drawBtn'); if (btn) btn.classList.toggle('active', drawMode);
  $('#drawPanel').classList.toggle('show', drawMode);
}
$('#drawBtn').onclick = () => setDrawMode(!drawMode);

(function initDrawTools() {
  $('#penColors').insertAdjacentHTML('beforeend',
    PEN_COLORS.map(c =>
      `<button class="penSwatch${c===drawColor?' active':''}" data-color="${c}" style="background:${c}"></button>`
    ).join(''));
  $('#penWidths').insertAdjacentHTML('beforeend',
    PEN_WIDTHS.map(p =>
      `<button class="widthBtn${p.w===drawWidth?' active':''}" data-width="${p.w}">
        <span style="width:${p.dot+8}px;height:${Math.max(2,p.dot/2+1)}px"></span>
      </button>`
    ).join(''));
})();

$('#penColors').addEventListener('click', e => {
  const b = e.target.closest('.penSwatch'); if (!b) return;
  drawColor = b.dataset.color;
  $('#penColors').querySelectorAll('.penSwatch').forEach(x => x.classList.toggle('active', x === b));
});
$('#penWidths').addEventListener('click', e => {
  const b = e.target.closest('.widthBtn'); if (!b) return;
  drawWidth = +b.dataset.width;
  $('#penWidths').querySelectorAll('.widthBtn').forEach(x => x.classList.toggle('active', x === b));
});
$('#drawPanel').addEventListener('click', e => {
  const b = e.target.closest('.toolBtn'); if (!b) return;
  drawTool = b.dataset.tool;
  $('#drawPanel').querySelectorAll('.toolBtn').forEach(x => x.classList.toggle('active', x === b));
  document.body.classList.toggle('eraserTool', drawMode && drawTool === 'eraser');
});
$('#undoBtn').onclick = () => {
  if (!V.anns.drawings.length) return;
  const last = V.anns.drawings.pop();
  paintDrawings(last.page);
  renderSidebar(); scheduleSave();
};

/* ---------- iPad scroll fix ----------
   When drawMode is on:
     stylus touch → preventDefault → no scroll, our pointer events fire
     finger touch → fall through → the page scrolls normally
   When drawMode is off these handlers are no-ops, so finger/Pencil
   both scroll. */
function isStylusTouch(e) {
  const t = e.touches && e.touches[0];
  return !!(t && (t.touchType === 'stylus'));
}
const onTouchIntercept = e => {
  if (!drawMode) return;
  if (isStylusTouch(e)) e.preventDefault();
};
$('#pagesContainer').addEventListener('touchstart', onTouchIntercept, { passive: false });
$('#pagesContainer').addEventListener('touchmove',  onTouchIntercept, { passive: false });

/* ---------- pointer flow ---------- */
function eraseAt(pageNo, x, y) {
  const before = V.anns.drawings.length;
  V.anns.drawings = V.anns.drawings.filter(d =>
    !(d.page === pageNo && strokeHit(d, x, y, ERASER_TOL)));
  if (V.anns.drawings.length !== before) {
    paintDrawings(pageNo);
    renderSidebar();
    scheduleSave();
  }
}

$('#pagesContainer').addEventListener('pointerdown', e => {
  if (!drawMode) return;
  if (e.pointerType === 'touch') return;        // finger → let the page scroll/pinch
  if (pinch) return;                            // a pinch is in progress
  const wrap = e.target.closest('.pageWrap'); if (!wrap) return;
  const pr = wrap.getBoundingClientRect();
  const x = (e.clientX - pr.left) / pr.width;
  const y = (e.clientY - pr.top) / pr.height;
  const pageNo = +wrap.dataset.page;

  e.preventDefault();
  try { wrap.setPointerCapture(e.pointerId); } catch {}

  if (drawTool === 'eraser') {
    erasing = true;
    eraserPage = pageNo;
    eraseAt(pageNo, x, y);
    return;
  }
  // pen
  drawingPage = pageNo;
  currentStroke = {
    id: uid(), page: pageNo, color: drawColor, width: drawWidth,
    points: [[+x.toFixed(4), +y.toFixed(4)]], created: new Date().toISOString()
  };
  paintDrawings(pageNo);
});

$('#pagesContainer').addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') return;
  if (pinch) return;
  if (erasing) {
    const wrap = V.wraps[eraserPage]; if (!wrap) return;
    const pr = wrap.getBoundingClientRect();
    eraseAt(eraserPage,
      (e.clientX - pr.left) / pr.width,
      (e.clientY - pr.top) / pr.height);
    return;
  }
  if (!currentStroke) return;
  const wrap = V.wraps[drawingPage]; if (!wrap) return;
  const pr = wrap.getBoundingClientRect();
  const x = (e.clientX - pr.left) / pr.width;
  const y = (e.clientY - pr.top) / pr.height;
  const last = currentStroke.points[currentStroke.points.length - 1];
  // skip points that didn't move enough to be visible — keeps file size sane
  if (Math.hypot(x - last[0], y - last[1]) < 0.0015) return;
  currentStroke.points.push([+x.toFixed(4), +y.toFixed(4)]);
  paintDrawings(drawingPage);
});

function endPointer() {
  if (erasing) { erasing = false; return; }
  if (!currentStroke) return;
  if (currentStroke.points.length >= 1) V.anns.drawings.push(currentStroke);
  const pg = currentStroke.page;
  currentStroke = null;
  paintDrawings(pg);
  scheduleSave();
}
$('#pagesContainer').addEventListener('pointerup', endPointer);
$('#pagesContainer').addEventListener('pointercancel', endPointer);
$('#pagesContainer').addEventListener('pointerleave', endPointer);

/* helper exposed for the pinch handler in viewer.js — it needs to abort
   any in-progress stroke when two fingers come down. */
function abortStroke() {
  if (erasing) { erasing = false; return; }
  if (!currentStroke) return;
  const pg = currentStroke.page;
  currentStroke = null;
  paintDrawings(pg);
}
