/* ============================================================
   The shared edit popup used by both highlights and post-its.
   Tracks one of `activeHl` / `activePostit` at a time and routes
   color / note / delete actions to the right collection.

   The note textarea supports Markdown + KaTeX (see markdown.js)
   and the popup renders a live preview as the user types.
   ============================================================ */

const hlPopup = $('#hlPopup');
let activeHl = null, activePostit = null;

$('#hlColors').innerHTML = COLORS.map(c =>
  `<button class="swatch" data-color="${c}" style="background:${c}"></button>`).join('');

function openPopup(anchor) {
  hlPopup.classList.add('show');
  const pw = 380, ph = hlPopup.offsetHeight || 320;
  let left = Math.max(8, Math.min(window.innerWidth - pw - 8, anchor.left));
  let top = anchor.bottom + 8;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, window.innerHeight - ph - 8);
  hlPopup.style.left = left + 'px';
  hlPopup.style.top = top + 'px';
  renderMd($('#hlNote').value, $('#hlPreview'));
  $('#hlNote').focus();
}

function openHlPopup(id, anchor) {
  activeHl = V.anns.highlights.find(h => h.id === id);
  activePostit = null;
  if (!activeHl) return;
  $('#hlNote').value = activeHl.note || '';
  openPopup(anchor);
}

function openPostitPopup(id, anchor) {
  activePostit = (V.anns.postits || []).find(p => p.id === id);
  activeHl = null;
  if (!activePostit) return;
  $('#hlNote').value = activePostit.note || '';
  openPopup(anchor);
}

function closePopup() {
  hlPopup.classList.remove('show');
  activeHl = null; activePostit = null;
  renderSidebar();
}

/* ---------- handlers ---------- */
$('#hlColors').addEventListener('click', e => {
  const btn = e.target.closest('.swatch'); if (!btn) return;
  if (activeHl) { activeHl.color = btn.dataset.color; repaintAll(); }
  else if (activePostit) { activePostit.color = btn.dataset.color; paintPostits(activePostit.page); }
  else return;
  renderSidebar(); scheduleSave();
});

$('#hlNote').addEventListener('input', () => {
  const v = $('#hlNote').value;
  if (activeHl) activeHl.note = v;
  else if (activePostit) {
    activePostit.note = v;
    const el = document.querySelector(`.postit[data-id="${activePostit.id}"]`);
    if (el) el.title = v ? v.slice(0, 80) : '포스트잇';
  } else return;
  renderMd(v, $('#hlPreview'));
  scheduleSave();
});
$('#hlNote').addEventListener('blur', renderSidebar);

$('#hlClose').onclick = closePopup;

$('#hlDelete').onclick = () => {
  if (activeHl) {
    V.anns.highlights = V.anns.highlights.filter(h => h.id !== activeHl.id);
    activeHl = null; repaintAll();
  } else if (activePostit) {
    const pg = activePostit.page;
    V.anns.postits = V.anns.postits.filter(p => p.id !== activePostit.id);
    activePostit = null; paintPostits(pg);
  } else return;
  hlPopup.classList.remove('show');
  renderSidebar(); scheduleSave();
};

// click outside the popup → close (but don't close when clicking targets
// that themselves re-open the popup).
document.addEventListener('mousedown', e => {
  if (hlPopup.classList.contains('show') &&
      !e.target.closest('#hlPopup') &&
      !e.target.closest('.hl') &&
      !e.target.closest('.postit')) {
    closePopup();
  }
});
