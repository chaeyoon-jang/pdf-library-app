/* ============================================================
   Text-selection highlights. Owns:
     – paintHighlights(pageNo)
     – the floating color-picker that appears after a selection
     – createHighlightFromSelection(color)
     – the click-to-edit affordance (delegated to the popup)
   ============================================================ */

function paintHighlights(pageNo) {
  const wrap = V.wraps[pageNo]; if (!wrap) return;
  const layer = wrap.querySelector('.hlLayer'); if (!layer) return;
  layer.innerHTML = '';
  const W = wrap.clientWidth, H = wrap.clientHeight;
  for (const hl of V.anns.highlights) {
    for (const reg of hl.regions) {
      if (reg.page !== pageNo) continue;
      for (const [x, y, w, h] of reg.rects) {
        const d = document.createElement('div');
        d.className = 'hl';
        d.dataset.id = hl.id;
        d.style.cssText = `left:${x*W}px;top:${y*H}px;width:${w*W}px;height:${h*H}px;background:${hl.color}`;
        d.title = hl.note || '';
        layer.appendChild(d);
      }
    }
  }
}

/* ---------- selection → swatch popup ---------- */
const selPopup = $('#selPopup');
selPopup.innerHTML = COLORS.map(c =>
  `<button class="swatch" data-color="${c}" style="background:${c}"></button>`).join('');
selPopup.addEventListener('mousedown', e => e.preventDefault());  // keep selection alive

document.addEventListener('mouseup', e => {
  if (!$('#viewerScreen').classList.contains('active')) return;
  if (drawMode) return;
  if (e.target.closest('#selPopup') || e.target.closest('#hlPopup')) return;
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { selPopup.classList.remove('show'); return; }
    const anchor = sel.anchorNode && sel.anchorNode.parentElement;
    if (!anchor || !anchor.closest('.textLayer')) { selPopup.classList.remove('show'); return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    selPopup.classList.add('show');
    const pw = selPopup.offsetWidth || 140;
    selPopup.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width/2 - pw/2)) + 'px';
    selPopup.style.top = Math.max(8, r.top - 44) + 'px';
  }, 0);
});

selPopup.addEventListener('click', e => {
  const btn = e.target.closest('.swatch'); if (!btn) return;
  createHighlightFromSelection(btn.dataset.color);
});

function createHighlightFromSelection(color) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const text = sel.toString().trim();
  const rects = [...sel.getRangeAt(0).getClientRects()];
  const regions = [];
  for (let i = 1; i < V.wraps.length; i++) {
    const wrap = V.wraps[i]; if (!wrap) continue;
    const pr = wrap.getBoundingClientRect();
    const inPage = [];
    for (const r of rects) {
      if (r.width < 1 || r.height < 1) continue;
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      if (cx < pr.left || cx > pr.right || cy < pr.top || cy > pr.bottom) continue;
      const nr = [
        +((r.left - pr.left)/pr.width).toFixed(5),
        +((r.top - pr.top)/pr.height).toFixed(5),
        +(r.width/pr.width).toFixed(5),
        +(r.height/pr.height).toFixed(5)
      ];
      // Browsers can emit overlapping rects for a single line — keep only the
      // outermost so we don't draw doubled highlights.
      if (!inPage.some(k => k[0] <= nr[0]+0.002 && k[1] <= nr[1]+0.002 &&
                            k[0]+k[2] >= nr[0]+nr[2]-0.002 && k[1]+k[3] >= nr[1]+nr[3]-0.002))
        inPage.push(nr);
    }
    if (inPage.length) regions.push({ page: i, rects: inPage });
  }
  if (!regions.length) return;
  const hl = { id: uid(), color, text, note: '', created: new Date().toISOString(), regions };
  V.anns.highlights.push(hl);
  sel.removeAllRanges();
  selPopup.classList.remove('show');
  repaintAll();
  renderSidebar();
  scheduleSave();
  // Open the memo popup anchored just below the first rect.
  const first = regions[0], wrap = V.wraps[first.page], pr = wrap.getBoundingClientRect();
  const [x, y, w, h] = first.rects[0];
  openHlPopup(hl.id, { left: pr.left + x*pr.width, bottom: pr.top + (y+h)*pr.height });
}
