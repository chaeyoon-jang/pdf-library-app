/* ============================================================
   Library screen — the searchable table of papers, plus the
   metadata edit modal and the upload / delete flows.
   ============================================================ */

let library = { papers: [] };
let librarySha = null;

async function loadLibrary() {
  const got = await ghGetJsonFile('library.json');
  if (got) { library = got.data; librarySha = got.sha; }
  else {
    library = { papers: [] };
    librarySha = await ghPut('library.json',
      strToB64(JSON.stringify(library, null, 2)), null, 'init library');
  }
}

async function saveLibrary() {
  const payload = () => strToB64(JSON.stringify(library, null, 2));
  try {
    librarySha = await ghPut('library.json', payload(), librarySha, 'update library');
  } catch (e) {
    if (!e.conflict) throw e;
    // Another device updated meanwhile → merge by id (local edits win, remote-only kept)
    const remote = await ghGetJsonFile('library.json');
    if (remote) {
      const localIds = new Set(library.papers.map(p => p.id));
      for (const rp of remote.data.papers) if (!localIds.has(rp.id)) library.papers.push(rp);
      librarySha = remote.sha;
    }
    librarySha = await ghPut('library.json', payload(), librarySha, 'update library (merged)');
  }
}

async function enterLibrary() {
  await loadLibrary();
  $('#repoTag').textContent = `${cfg.owner}/${cfg.repo}`;
  renderTable();
  showScreen('#tableScreen');
}

/* ---------- table render ---------- */
function renderTable() {
  const q = $('#searchInput').value.trim().toLowerCase();
  const rows = library.papers.filter(p => {
    if (!q) return true;
    const tags = (p.tags || []).map(t => t.toLowerCase());
    return tags.some(t => t.includes(q)) || (p.title || '').toLowerCase().includes(q);
  });
  const tb = $('#tableBody');
  tb.innerHTML = rows.map(p => `
    <tr data-id="${p.id}">
      <td class="titleCell">${esc(p.title)}${!p.file ? ' <span class="placeholder" style="font-weight:400;font-size:11px">· PDF 없음</span>' : ''}</td>
      <td class="summaryCell">${p.summary ? esc(p.summary) : '<span class="placeholder">요약 없음 — ✎로 입력</span>'}</td>
      <td class="tagCell">${(p.tags && p.tags.length)
        ? p.tags.map(t => `<span class="tagChip" data-tag="${esc(t)}">${esc(t)}</span>`).join('')
        : '<span class="placeholder">—</span>'}</td>
      <td class="bibCell">${p.bibtex
        ? `<code title="${esc(p.bibtex)}">${esc(p.bibtex.split('\n')[0])}</code>`
        : '<span class="placeholder">bibtex 없음</span>'}</td>
      <td class="actionCell">
        ${p.bibtex ? `<button class="ghost copyBib" title="bibtex 복사">⧉</button>` : ''}
        <button class="ghost editRow" title="편집">✎</button>
        ${p.file ? `<button class="ghost delPdfRow" title="PDF만 삭제 (정보 유지)">PDF✕</button>` : ''}
        <button class="ghost delRow" title="전체 삭제">✕</button>
      </td>
    </tr>`).join('');
  $('#emptyMsg').style.display = rows.length ? 'none' : 'block';
}

$('#searchInput').oninput = renderTable;
$('#refreshBtn').onclick = async () => { await loadLibrary(); renderTable(); toast('새로고침 완료'); };

$('#tableBody').addEventListener('click', async e => {
  const chip = e.target.closest('.tagChip');
  if (chip) {                       // click tag → filter
    $('#searchInput').value = chip.dataset.tag;
    renderTable();
    return;
  }
  const tr = e.target.closest('tr'); if (!tr) return;
  const paper = library.papers.find(p => p.id === tr.dataset.id); if (!paper) return;
  if (e.target.closest('.copyBib')) {
    await navigator.clipboard.writeText(paper.bibtex);
    return toast('BibTeX 복사됨');
  }
  if (e.target.closest('.editRow')) return openEditModal(paper);
  if (e.target.closest('.delPdfRow')) return deletePdfOnly(paper);
  if (e.target.closest('.delRow')) return deletePaper(paper);
  if (!paper.file) return toast('PDF가 삭제된 항목입니다. 편집(✎)에서 정보를 확인하세요.');
  openViewer(paper);
});

/* ---------- add pdf ---------- */
$('#addBtn').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = async e => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of files) {
    const id = uid();
    toast(`업로드 중: ${f.name}`);
    try {
      const buf = await f.arrayBuffer();
      await ghPut(`papers/${id}.pdf`, bufToB64(buf), null, `add ${f.name}`);
      library.papers.unshift({
        id, title: f.name.replace(/\.pdf$/i, ''), summary: '', bibtex: '', tags: [],
        file: `papers/${id}.pdf`, added: new Date().toISOString()
      });
      await saveLibrary();
      renderTable();
      toast(`완료: ${f.name}`);
    } catch (err) { toast(`업로드 실패: ${err.message}`, true); }
  }
};

/* ---------- edit modal ---------- */
let editingPaper = null;
function openEditModal(p) {
  editingPaper = p;
  $('#mTitle').value = p.title || '';
  $('#mSummary').value = p.summary || '';
  $('#mTags').value = (p.tags || []).join(', ');
  $('#mBibtex').value = p.bibtex || '';
  $('#modalBack').classList.add('show');
}
$('#mCancel').onclick = () => $('#modalBack').classList.remove('show');
$('#mSave').onclick = async () => {
  editingPaper.title = $('#mTitle').value.trim();
  editingPaper.summary = $('#mSummary').value.trim();
  editingPaper.tags = $('#mTags').value.split(',').map(t => t.trim()).filter(Boolean);
  editingPaper.bibtex = $('#mBibtex').value.trim();
  $('#modalBack').classList.remove('show');
  renderTable();
  try { await saveLibrary(); toast('저장됨'); }
  catch (e) { toast(`저장 실패: ${e.message}`, true); }
};

/* ---------- delete flows ---------- */
async function deletePaper(p) {
  if (!confirm(`"${p.title}" 문서와 모든 형광펜/메모를 삭제할까요?`)) return;
  try {
    if (p.file) {
      const pdfSha = await ghFileSha(p.file);
      if (pdfSha) await ghDelete(p.file, pdfSha, `delete ${p.title}`);
    }
    const annSha = await ghFileSha(`annotations/${p.id}.json`);
    if (annSha) await ghDelete(`annotations/${p.id}.json`, annSha, `delete annotations of ${p.title}`);
    library.papers = library.papers.filter(x => x.id !== p.id);
    await saveLibrary();
    renderTable();
    toast('삭제됨');
  } catch (e) { toast(`삭제 실패: ${e.message}`, true); }
}

async function deletePdfOnly(p) {
  if (!p.file) return;
  if (!confirm(`"${p.title}"의 PDF 파일과 형광펜/메모만 삭제할까요?\n제목·요약·태그·BibTeX는 그대로 유지됩니다.`)) return;
  try {
    const pdfSha = await ghFileSha(p.file);
    if (pdfSha) await ghDelete(p.file, pdfSha, `delete pdf only: ${p.title}`);
    const annSha = await ghFileSha(`annotations/${p.id}.json`);
    if (annSha) await ghDelete(`annotations/${p.id}.json`, annSha, `delete annotations of ${p.title}`);
    p.file = null;
    await saveLibrary();
    renderTable();
    toast('PDF 삭제됨 (정보 유지)');
  } catch (e) { toast(`삭제 실패: ${e.message}`, true); }
}
