/* ============================================================
   GitHub Contents API wrapper. The repo is the entire backend:
     library.json            → paper metadata
     papers/<id>.pdf         → binary PDFs
     annotations/<id>.json   → highlights + post-its + drawings
   ============================================================ */

let cfg = null;
try { cfg = JSON.parse(localStorage.getItem('pdflib.cfg') || 'null'); } catch (e) {}

async function gh(path, opts = {}, accept) {
  const base = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
  const res = await fetch(path ? `${base}/${path}` : base, {
    cache: 'no-store',
    ...opts,
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Accept': accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {})
    }
  });
  return res;
}

// → {data, sha} | null
async function ghGetJsonFile(path) {
  const res = await gh(`contents/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`);
  const j = await res.json();
  return { data: JSON.parse(b64ToStr(j.content)), sha: j.sha };
}

// raw bytes — works for files >1MB which the JSON endpoint truncates
async function ghGetRaw(path) {
  const res = await gh(`contents/${path}`, {}, 'application/vnd.github.raw+json');
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`);
  return res.arrayBuffer();
}

// PUT (create or update). Throws an `Error` with `.conflict = true` on 409/422.
async function ghPut(path, b64content, sha, message) {
  const body = { message, content: b64content };
  if (sha) body.sha = sha;
  const res = await gh(`contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422)
    throw Object.assign(new Error('conflict'), { conflict: true });
  if (!res.ok) throw new Error(`GitHub PUT ${res.status}: ${path}`);
  return (await res.json()).content.sha;
}

async function ghDelete(path, sha, message) {
  const res = await gh(`contents/${path}`, { method: 'DELETE', body: JSON.stringify({ message, sha }) });
  if (!res.ok && res.status !== 404) throw new Error(`GitHub DELETE ${res.status}: ${path}`);
}

// Get sha by listing the containing directory — needed for >1MB PDFs whose
// /contents endpoint refuses to return a sha directly.
async function ghFileSha(path) {
  const dir = path.split('/').slice(0, -1).join('/');
  const res = await gh(`contents/${dir}`);
  if (!res.ok) return null;
  const list = await res.json();
  const f = Array.isArray(list) ? list.find(x => x.path === path) : null;
  return f ? f.sha : null;
}
