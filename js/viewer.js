/* ============================================================
   Viewer screen — holds the global state `V` and the per-page
   render pipeline. Each page is composed of stacked layers:

     canvas (PDF pixels)
       hlLayer    – highlight rectangles (under text)
       drawLayer  – pen strokes (canvas, on top of PDF, under text)
       textLayer  – pdf.js text spans for selection (z-index 3)
       psLayer    – post-it icons (z-index 4)

   All annotation coordinates are stored as page-relative fractions
   so they survive zoom changes.
   ============================================================ */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const V = {
  paper: null, pdf: null, pages: [], baseSizes: [], wraps: [],
  scale: 1,
  anns: { highlights: [], postits: [], drawings: [] },
  annSha: null,
  observer: null,
  saveTimer: null,
  dirty: false
};

async function openViewer(paper) {
  V.paper = paper; V.scale = 1;
  V.anns = { highlights: [], postits: [], drawings: [] }; V.annSha = null;
  V.pages = []; V.baseSizes = []; V.wraps = []; V.dirty = false;
  setPostitMode(false); setDrawMode(false);
  $('#vTitle').textContent = paper.title;
  $('#pagesContainer').innerHTML = '';
  $('#viewerLoading').style.display = 'block';
  $('#saveStatus').textContent = '';
  $('#sbList').innerHTML = '';
  showScreen('#viewerScreen');
  try {
    const [buf, ann] = await Promise.all([
      ghGetRaw(paper.file),
      ghGetJsonFile(`annotations/${paper.id}.json`)
    ]);
    if (ann) { V.anns = ann.data; V.annSha = ann.sha; }
    if (!V.anns.highlights) V.anns.highlights = [];
    if (!V.anns.postits) V.anns.postits = [];
    if (!V.anns.drawings) V.anns.drawings = [];
    V.pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    await buildPages();
    renderSidebar();
  } catch (e) {
    toast(`열기 실패: ${e.message}`, true);
    showScreen('#tableScreen');
  } finally { $('#viewerLoading').style.display = 'none'; }
}

async function buildPages() {
  const cont = $('#pagesContainer');
  cont.innerHTML = '';
  const n = V.pdf.numPages;
  $('#pageIndicator').textContent = `${n} pages`;

  for (let i = 1; i <= n; i++) {
    const page = await V.pdf.getPage(i);
    V.pages[i] = page;
    const vp = page.getViewport({ scale: 1 });
    V.baseSizes[i] = { w: vp.width, h: vp.height };
  }

  // Pick a comfortable starting zoom that fits the viewer width.
  const avail = $('#viewerMain').clientWidth - 48;
  V.scale = Math.min(1.6, Math.max(0.6, avail / V.baseSizes[1].w));

  for (let i = 1; i <= n; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'pageWrap';
    wrap.dataset.page = i;
    cont.appendChild(wrap);
    V.wraps[i] = wrap;
  }
  layoutPages();

  V.observer && V.observer.disconnect();
  V.observer = new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) renderPage(+en.target.dataset.page);
  }, { root: $('#viewerMain'), rootMargin: '600px 0px' });
  V.wraps.forEach(w => w && V.observer.observe(w));
}

function layoutPages() {
  for (let i = 1; i < V.wraps.length; i++) {
    const w = V.wraps[i]; if (!w) continue;
    w.style.width = (V.baseSizes[i].w * V.scale) + 'px';
    w.style.height = (V.baseSizes[i].h * V.scale) + 'px';
    w.dataset.rendered = '';            // force re-render at new scale
    w.innerHTML = '';
  }
}

async function renderPage(i) {
  const wrap = V.wraps[i];
  const key = 's' + V.scale.toFixed(3);
  if (wrap.dataset.rendered === key || wrap.dataset.rendering === key) return;
  wrap.dataset.rendering = key;
  const page = V.pages[i];
  const viewport = page.getViewport({ scale: V.scale });
  const dpr = window.devicePixelRatio || 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = viewport.width + 'px';
  canvas.style.height = viewport.height + 'px';
  await page.render({
    canvasContext: canvas.getContext('2d'),
    viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
  }).promise;
  if (wrap.dataset.rendering !== key) return;   // zoom changed mid-render

  const hlLayer = document.createElement('div');
  hlLayer.className = 'hlLayer';

  const textLayer = document.createElement('div');
  textLayer.className = 'textLayer';
  textLayer.style.setProperty('--scale-factor', viewport.scale);
  textLayer.style.width = viewport.width + 'px';
  textLayer.style.height = viewport.height + 'px';

  const psLayer = document.createElement('div');
  psLayer.className = 'psLayer';

  const drawLayer = document.createElement('canvas');
  drawLayer.className = 'drawLayer';

  wrap.innerHTML = '';
  wrap.appendChild(canvas);
  wrap.appendChild(hlLayer);
  wrap.appendChild(drawLayer);
  wrap.appendChild(textLayer);
  wrap.appendChild(psLayer);

  const textContent = await page.getTextContent();
  await pdfjsLib.renderTextLayer({
    textContentSource: textContent, container: textLayer, viewport, textDivs: []
  }).promise;

  paintHighlights(i);
  paintPostits(i);
  paintDrawings(i);
  wrap.dataset.rendered = key;
  delete wrap.dataset.rendering;
}

function repaintAll() {
  for (let i = 1; i < V.wraps.length; i++)
    if (V.wraps[i] && V.wraps[i].dataset.rendered) {
      paintHighlights(i); paintPostits(i); paintDrawings(i);
    }
}

/* ---------- zoom ---------- */
function setZoom(f) {
  V.scale = Math.min(3, Math.max(0.4, V.scale * f));
  layoutPages();
  V.observer.disconnect();
  V.wraps.forEach(w => w && V.observer.observe(w));
}
$('#zoomIn').onclick = () => setZoom(1.2);
$('#zoomOut').onclick = () => setZoom(1 / 1.2);

/* ---------- annotation persistence ---------- */
function scheduleSave() {
  V.dirty = true;
  $('#saveStatus').textContent = '저장 대기…';
  clearTimeout(V.saveTimer);
  V.saveTimer = setTimeout(saveAnnotations, 1200);
}

async function saveAnnotations() {
  if (!V.paper) return;
  V.dirty = false;
  $('#saveStatus').textContent = '저장 중…';
  const path = `annotations/${V.paper.id}.json`;
  const b64 = strToB64(JSON.stringify(V.anns, null, 2));
  try {
    V.annSha = await ghPut(path, b64, V.annSha, `annotate ${V.paper.title}`);
    $('#saveStatus').textContent = V.dirty ? '저장 대기…' : '저장됨 ✓';
  } catch (e) {
    if (e.conflict) {
      // sha mismatch — refetch and retry once; last write wins.
      try {
        const remote = await ghGetJsonFile(path);
        V.annSha = remote ? remote.sha : null;
        V.annSha = await ghPut(path, b64, V.annSha, `annotate ${V.paper.title}`);
        $('#saveStatus').textContent = '저장됨 ✓';
        return;
      } catch (e2) { e = e2; }
    }
    $('#saveStatus').textContent = '저장 실패!';
    toast(`어노테이션 저장 실패: ${e.message}`, true);
  }
}

$('#backBtn').onclick = async () => {
  clearTimeout(V.saveTimer);
  if (V.dirty) await saveAnnotations();
  V.pdf && V.pdf.destroy();
  V.pdf = null; V.paper = null;
  V.observer && V.observer.disconnect();
  showScreen('#tableScreen');
};

window.addEventListener('beforeunload', e => {
  if (V.dirty) { saveAnnotations(); e.preventDefault(); e.returnValue = ''; }
});
