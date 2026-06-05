/* ============================================================
   Markdown + math renderer used in the note popup and sidebar.
   Uses `marked` for Markdown and KaTeX auto-render for $math$.
   ============================================================ */

const KATEX_DELIMS = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '$', right: '$', display: false },
  { left: '\\(', right: '\\)', display: false }
];

function renderMd(text, container) {
  if (!text || !text.trim()) {
    container.classList.add('empty');
    container.textContent = '여기에 미리보기가 표시됩니다. **굵게**, `code`, $E=mc^2$, $$\\int_0^1 x\\,dx$$ 등 가능.';
    return;
  }
  container.classList.remove('empty');
  try {
    container.innerHTML = window.marked
      ? marked.parse(text, { breaks: true, gfm: true })
      : esc(text).replace(/\n/g, '<br>');
  } catch { container.textContent = text; }
  if (window.renderMathInElement) {
    try { renderMathInElement(container, { delimiters: KATEX_DELIMS, throwOnError: false }); }
    catch {}
  }
}
