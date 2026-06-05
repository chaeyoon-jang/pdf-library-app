/* ============================================================
   Sidebar — a unified, page-ordered list of highlights and
   post-its with Markdown-rendered note bodies. A small header
   line shows the count of free-hand drawings.
   ============================================================ */

$('#sidebarBtn').onclick = () => $('#sidebar').classList.toggle('open');

function renderSidebar() {
  const items = [
    ...V.anns.highlights.map(h => ({
      kind: 'hl', id: h.id, color: h.color,
      page: h.regions[0].page, sortY: h.regions[0].rects[0][1],
      text: h.text, note: (h.note && h.note.trim()) ? h.note : ''
    })),
    ...(V.anns.postits || []).map(p => ({
      kind: 'ps', id: p.id, color: p.color,
      page: p.page, sortY: p.y,
      text: '', note: (p.note && p.note.trim()) ? p.note : ''
    }))
  ].sort((a, b) => a.page - b.page || a.sortY - b.sortY);

  const drawCount = (V.anns.drawings || []).length;
  const drawNote = drawCount
    ? `<div style="padding:10px 18px;font-size:12px;color:var(--muted);border-bottom:1px solid var(--row)">✎ 드로잉 ${drawCount}개</div>`
    : '';

  if (!items.length) {
    $('#sbList').innerHTML = drawNote +
      '<div style="padding:20px;color:var(--muted);font-size:13px;line-height:1.7">텍스트를 드래그하면 형광펜 색상 선택이 나타납니다.<br>「＋ 포스트잇」으로 페이지 어디든 메모를 붙일 수 있어요.<br>「✎ 드로잉」으로 펜슬·마우스로 직접 그릴 수 있어요.<br><br>마크다운과 수식($x^2$) 입력이 가능합니다.</div>';
    return;
  }

  $('#sbList').innerHTML = drawNote + items.map(it => `
    <div class="sbItem" data-id="${it.id}" data-kind="${it.kind}">
      <div class="sbMeta">
        <span class="dot" style="background:${it.color}"></span>
        <span class="sbPage">p.${it.page}${it.kind === 'ps' ? ' · 포스트잇' : ''}</span>
      </div>
      ${it.text ? `<div class="sbText">${esc(it.text)}</div>` : ''}
      ${it.note ? `<div class="sbNote mdBody"></div>` : ''}
    </div>`).join('');

  // Render Markdown / math into each note element. The note divs and the
  // `noted` list are emitted in matching order so the index lines up.
  const noted = items.filter(x => x.note);
  $('#sbList').querySelectorAll('.sbNote').forEach((el, i) => {
    if (noted[i]) renderMd(noted[i].note, el);
  });
}

$('#sbList').addEventListener('click', e => {
  const item = e.target.closest('.sbItem'); if (!item) return;
  const kind = item.dataset.kind, id = item.dataset.id;
  let pageNo, selector;
  if (kind === 'ps') {
    const ps = V.anns.postits.find(p => p.id === id); if (!ps) return;
    pageNo = ps.page; selector = `.postit[data-id="${id}"]`;
  } else {
    const hl = V.anns.highlights.find(h => h.id === id); if (!hl) return;
    pageNo = hl.regions[0].page; selector = `.hl[data-id="${id}"]`;
  }
  const wrap = V.wraps[pageNo];
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => {
    wrap.querySelectorAll(selector).forEach(el => {
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1600);
    });
  }, 400);
});
