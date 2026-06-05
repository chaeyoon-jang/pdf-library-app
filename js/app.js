/* ============================================================
   Boot + setup screen — the smallest top-level glue.
   ============================================================ */

$('#connectBtn').onclick = async () => {
  const owner = $('#cfgOwner').value.trim();
  const repo  = $('#cfgRepo').value.trim();
  const token = $('#cfgToken').value.trim();
  if (!owner || !repo || !token) return toast('모든 항목을 입력하세요', true);
  cfg = { owner, repo, token };
  $('#connectBtn').textContent = '연결 중…';
  try {
    const res = await gh('');
    if (res.status === 401) throw new Error('토큰이 유효하지 않습니다');
    if (res.status === 404) throw new Error('저장소를 찾을 수 없습니다 (이름/토큰 권한 확인)');
    if (!res.ok) throw new Error(`GitHub 오류 ${res.status}`);
    localStorage.setItem('pdflib.cfg', JSON.stringify(cfg));
    await enterLibrary();
  } catch (e) {
    cfg = null;
    toast(e.message, true);
  } finally { $('#connectBtn').textContent = '연결'; }
};

$('#settingsBtn').onclick = () => {
  $('#cfgOwner').value = cfg?.owner || '';
  $('#cfgRepo').value = cfg?.repo || '';
  $('#cfgToken').value = cfg?.token || '';
  showScreen('#setupScreen');
};

/* ---------- boot ---------- */
(async () => {
  if (cfg && cfg.token) {
    try { await enterLibrary(); return; }
    catch (e) { toast(`연결 실패: ${e.message}`, true); }
  }
  showScreen('#setupScreen');
})();
