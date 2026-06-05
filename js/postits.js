/* ============================================================
   Post-it placement + rendering. Post-it data:
     { id, color, page, x, y, note, created }
   where (x,y) are page-relative fractions.

   The page click-handler below also covers highlight clicks
   because the two concerns share the same listener.
   ============================================================ */

let postitMode = false;

function paintPostits(pageNo) {
  const wrap = V.wraps[pageNo]; if (!wrap) return;
  const layer = wrap.querySelector('.psLayer'); if (!layer) return;
  layer.innerHTML = '';
  const W = wrap.clientWidth, H = wrap.clientHeight;
  for (const ps of (V.anns.postits || [])) {
    if (ps.page !== pageNo) continue;
    const d = document.createElement('div');
    d.className = 'postit';
    d.dataset.id = ps.id;
    d.style.cssText = `left:${ps.x*W}px;top:${ps.y*H}px;background:${ps.color}`;
    d.title = ps.note ? ps.note.slice(0, 80) : '포스트잇';
    layer.appendChild(d);
  }
}

function setPostitMode(on) {
  postitMode = !!on;
  if (postitMode && drawMode) setDrawMode(false);
  document.body.classList.toggle('postitMode', postitMode);
  const btn = $('#postitBtn'); if (btn) btn.classList.toggle('active', postitMode);
}

$('#postitBtn').onclick = () => setPostitMode(!postitMode);

function placePostit(pageNo, x, y) {
  const ps = {
    id: uid(), color: COLORS[0], page: pageNo, x, y,
    note: '', created: new Date().toISOString()
  };
  V.anns.postits.push(ps);
  paintPostits(pageNo);
  renderSidebar();
  scheduleSave();
  const wrap = V.wraps[pageNo], pr = wrap.getBoundingClientRect();
  openPostitPopup(ps.id, { left: pr.left + x*pr.width, bottom: pr.top + y*pr.height + 18 });
}

/* ---------- click on page: dispatcher for postit + highlight ---------- */
$('#pagesContainer').addEventListener('click', e => {
  if (drawMode) return;                          // drawing has its own pointer flow
  // 1) placement mode → drop a new post-it
  if (postitMode) {
    const wrap = e.target.closest('.pageWrap');
    if (!wrap) { setPostitMode(false); return; }
    const pr = wrap.getBoundingClientRect();
    placePostit(+wrap.dataset.page,
      (e.clientX - pr.left) / pr.width,
      (e.clientY - pr.top) / pr.height);
    setPostitMode(false);
    return;
  }
  // 2) click on an existing post-it
  const psEl = e.target.closest('.postit');
  if (psEl) {
    const r = psEl.getBoundingClientRect();
    return openPostitPopup(psEl.dataset.id, { left: r.right, bottom: r.bottom });
  }
  // 3) ignore clicks that end a text-selection drag
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim()) return;
  // 4) click directly on a .hl element
  const el = e.target.closest('.hl');
  if (el) {
    const r = el.getBoundingClientRect();
    return openHlPopup(el.dataset.id, { left: r.left, bottom: r.bottom });
  }
  // 5) the text layer sits above the highlight layer, so clicks on highlighted
  //    text land on text spans — hit-test stored rects to recover the highlight.
  const wrap = e.target.closest('.pageWrap');
  if (!wrap) return;
  const pr = wrap.getBoundingClientRect();
  const x = (e.clientX - pr.left) / pr.width;
  const y = (e.clientY - pr.top) / pr.height;
  const pageNo = +wrap.dataset.page;
  for (const hl of V.anns.highlights)
    for (const reg of hl.regions) {
      if (reg.page !== pageNo) continue;
      for (const [rx, ry, rw, rh] of reg.rects)
        if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh)
          return openHlPopup(hl.id, { left: e.clientX - 20, bottom: e.clientY + 6 });
    }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (postitMode) setPostitMode(false);
    if (drawMode) setDrawMode(false);
  }
});
