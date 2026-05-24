/* ============================================
   Lectures — Admin
   ============================================ */

(() => {
  'use strict';

  // ---------- Storage keys ----------
  const STORAGE = {
    theme: 'lectures.theme',
    repo: 'lectures.admin.repo',     // {owner, name, branch}
    token: 'lectures.admin.token'
  };

  const $ = (s) => document.querySelector(s);

  // ---------- DOM ----------
  const dropzone = $('#dropzone');
  const fileInput = $('#fileInput');
  const browseBtn = $('#browseBtn');
  const uploadForm = $('#uploadForm');
  const previewName = $('#previewName');
  const previewTree = $('#previewTree');
  const previewNotes = $('#previewNotes');
  const cancelBtn = $('#cancelBtn');
  const courseSelect = $('#courseSelect');
  const newCourseBtn = $('#newCourseBtn');
  const newCourseFields = $('#newCourseFields');
  const newCourseTitle = $('#newCourseTitle');
  const newCourseSlug = $('#newCourseSlug');
  const chapterTitle = $('#chapterTitle');
  const chapterTags = $('#chapterTags');
  const targetPath = $('#targetPath');
  const uploadBtn = $('#uploadBtn');
  const catalog = $('#catalog');
  const connStatus = $('#connStatus');
  const settingsBtn = $('#settingsBtn');
  const themeBtn = $('#themeBtn');
  const toastEl = $('#toast');

  const settingsModal = $('#settingsModal');
  const editModal = $('#editModal');
  const progressModal = $('#progressModal');
  const progressText = $('#progressText');
  const progressLog = $('#progressLog');

  // ---------- State ----------
  let toc = { courses: [] };
  let tocSha = null;          // for GitHub API conflict-free updates
  let pendingPayload = null;  // { files: {path: blob|string}, mainPath, isSingle }
  let editingRef = null;      // {courseSlug, chapterIndex}

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, ms = 2200) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  // ---------- Theme (mirrors main app) ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('#themeIconLight').style.display = theme === 'light' ? '' : 'none';
    $('#themeIconDark').style.display = theme === 'dark' ? '' : 'none';
  }
  applyTheme(localStorage.getItem(STORAGE.theme) || 'light');
  themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem(STORAGE.theme, next);
  });

  // ============================================
  // Settings (Token / Repo)
  // ============================================
  function getRepo() {
    try { return JSON.parse(localStorage.getItem(STORAGE.repo)) || {}; }
    catch { return {}; }
  }
  function getToken() {
    return localStorage.getItem(STORAGE.token) || '';
  }
  function isConfigured() {
    const r = getRepo();
    return !!(r.owner && r.name && r.branch && getToken());
  }

  function updateConnStatus(state = 'unknown') {
    connStatus.classList.remove('connected', 'error');
    const text = connStatus.querySelector('.status-text');
    if (state === 'connected') {
      connStatus.classList.add('connected');
      const r = getRepo();
      text.textContent = `${r.owner}/${r.name}`;
    } else if (state === 'error') {
      connStatus.classList.add('error');
      text.textContent = '연결 오류';
    } else if (isConfigured()) {
      text.textContent = '확인 필요';
    } else {
      text.textContent = '미연결';
    }
  }

  function openSettings() {
    const r = getRepo();
    $('#repoOwner').value = r.owner || '';
    $('#repoName').value = r.name || '';
    $('#repoBranch').value = r.branch || 'main';
    $('#ghToken').value = getToken();
    settingsModal.hidden = false;
  }
  function closeSettings() { settingsModal.hidden = true; }
  settingsBtn.addEventListener('click', openSettings);
  settingsModal.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]') || e.target === settingsModal.querySelector('.modal__backdrop')) {
      closeSettings();
    }
  });
  $('#saveSettingsBtn').addEventListener('click', () => {
    const owner = $('#repoOwner').value.trim();
    const name = $('#repoName').value.trim();
    const branch = $('#repoBranch').value.trim() || 'main';
    const token = $('#ghToken').value.trim();
    if (!owner || !name || !token) {
      toast('소유자, 레포명, 토큰을 모두 입력하세요');
      return;
    }
    localStorage.setItem(STORAGE.repo, JSON.stringify({ owner, name, branch }));
    localStorage.setItem(STORAGE.token, token);
    closeSettings();
    toast('저장됨');
    boot();
  });
  $('#testConnBtn').addEventListener('click', async () => {
    const owner = $('#repoOwner').value.trim();
    const name = $('#repoName').value.trim();
    const branch = $('#repoBranch').value.trim() || 'main';
    const token = $('#ghToken').value.trim();
    if (!owner || !name || !token) { toast('정보를 모두 입력하세요'); return; }
    try {
      const r = await gh(`/repos/${owner}/${name}/branches/${branch}`, { token });
      if (r.ok) toast(`연결 성공 · last commit ${r.data.commit.sha.slice(0, 7)}`);
      else toast(`실패: ${r.data.message || r.status}`);
    } catch (e) { toast(`오류: ${e.message}`); }
  });

  // Edit modal close
  editModal.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]') || e.target === editModal.querySelector('.modal__backdrop')) {
      editModal.hidden = true;
      editingRef = null;
    }
  });

  // Esc to close any modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!settingsModal.hidden) settingsModal.hidden = true;
      if (!editModal.hidden) { editModal.hidden = true; editingRef = null; }
    }
    if (e.key === 's' && !isTyping(e.target)) { e.preventDefault(); openSettings(); }
    if (e.key === 't' && !isTyping(e.target)) {
      e.preventDefault(); themeBtn.click();
    }
  });
  function isTyping(el) {
    return ['INPUT', 'TEXTAREA'].includes(el.tagName) || el.isContentEditable;
  }

  // ============================================
  // GitHub API helpers
  // ============================================
  async function gh(path, { method = 'GET', body = null, token = null, headers = {} } = {}) {
    const t = token || getToken();
    const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
    const opts = {
      method,
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(t ? { 'Authorization': `Bearer ${t}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    let data = null;
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
    return { ok: res.ok, status: res.status, data, headers: res.headers };
  }

  // Commit multiple files in one go using the Git Data API
  // files: { 'path/in/repo': { content: string|Uint8Array, encoding: 'utf-8'|'base64' } }
  // deletes: ['path/to/delete', ...]
  async function commitFiles(message, files = {}, deletes = []) {
    const repo = getRepo();
    const base = `/repos/${repo.owner}/${repo.name}`;

    log('레포 정보 조회…');
    const refRes = await gh(`${base}/git/refs/heads/${repo.branch}`);
    if (!refRes.ok) throw new Error(`브랜치 조회 실패: ${refRes.data?.message || refRes.status}`);
    const latestSha = refRes.data.object.sha;

    const commitRes = await gh(`${base}/git/commits/${latestSha}`);
    if (!commitRes.ok) throw new Error('커밋 조회 실패');
    const baseTreeSha = commitRes.data.tree.sha;

    // Build new tree entries
    const treeEntries = [];

    // For files: create blobs first
    log(`blob 생성 중… (${Object.keys(files).length}개)`);
    for (const [path, file] of Object.entries(files)) {
      let content, encoding;
      if (file.encoding === 'base64') {
        content = file.content;
        encoding = 'base64';
      } else {
        // Need to base64-encode unicode-safe
        content = b64EncodeUnicode(file.content);
        encoding = 'base64';
      }
      const blobRes = await gh(`${base}/git/blobs`, {
        method: 'POST',
        body: { content, encoding }
      });
      if (!blobRes.ok) throw new Error(`blob 생성 실패 (${path}): ${blobRes.data?.message}`);
      treeEntries.push({
        path,
        mode: '100644',
        type: 'blob',
        sha: blobRes.data.sha
      });
    }

    // For deletions: set sha = null
    for (const path of deletes) {
      treeEntries.push({
        path,
        mode: '100644',
        type: 'blob',
        sha: null
      });
    }

    log('트리 생성 중…');
    const treeRes = await gh(`${base}/git/trees`, {
      method: 'POST',
      body: { base_tree: baseTreeSha, tree: treeEntries }
    });
    if (!treeRes.ok) throw new Error(`트리 생성 실패: ${treeRes.data?.message}`);

    log('커밋 생성 중…');
    const newCommitRes = await gh(`${base}/git/commits`, {
      method: 'POST',
      body: { message, tree: treeRes.data.sha, parents: [latestSha] }
    });
    if (!newCommitRes.ok) throw new Error(`커밋 생성 실패: ${newCommitRes.data?.message}`);

    log('브랜치 업데이트 중…');
    const updateRes = await gh(`${base}/git/refs/heads/${repo.branch}`, {
      method: 'PATCH',
      body: { sha: newCommitRes.data.sha, force: false }
    });
    if (!updateRes.ok) throw new Error(`브랜치 업데이트 실패: ${updateRes.data?.message}`);

    return newCommitRes.data.sha;
  }

  function b64EncodeUnicode(str) {
    // Convert utf-8 string to base64
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  // ============================================
  // toc.json load/save
  // ============================================
  async function loadToc() {
    const repo = getRepo();
    if (!isConfigured()) {
      // Fall back to local fetch (read-only)
      try {
        const res = await fetch('../data/toc.json', { cache: 'no-store' });
        if (res.ok) toc = await res.json();
      } catch {}
      return;
    }
    const r = await gh(`/repos/${repo.owner}/${repo.name}/contents/data/toc.json?ref=${repo.branch}`);
    if (r.ok) {
      try {
        toc = JSON.parse(decodeBase64Utf8(r.data.content));
        tocSha = r.data.sha;
      } catch (e) {
        console.error('toc.json 파싱 실패', e);
        toc = { courses: [] };
      }
    } else if (r.status === 404) {
      toc = { courses: [] };
      tocSha = null;
    } else {
      throw new Error(`toc.json 로드 실패: ${r.data?.message || r.status}`);
    }
  }
  function decodeBase64Utf8(b64) {
    const cleaned = b64.replace(/\s/g, '');
    const bin = atob(cleaned);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ============================================
  // Slugify (URL-safe, keeps Korean)
  // ============================================
  function slugify(s) {
    return (s || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}\-]/gu, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // ============================================
  // Course selector
  // ============================================
  function refreshCourseSelect() {
    courseSelect.innerHTML = '';
    if (toc.courses.length === 0) {
      const opt = document.createElement('option');
      opt.value = '__new__';
      opt.textContent = '(새 과목 만들기)';
      courseSelect.appendChild(opt);
      newCourseFields.hidden = false;
    } else {
      toc.courses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.slug;
        opt.textContent = c.title;
        courseSelect.appendChild(opt);
      });
      const newOpt = document.createElement('option');
      newOpt.value = '__new__';
      newOpt.textContent = '+ 새 과목 만들기';
      courseSelect.appendChild(newOpt);
    }
    courseSelect.addEventListener('change', onCourseSelectChange);
    onCourseSelectChange();
  }
  function onCourseSelectChange() {
    newCourseFields.hidden = courseSelect.value !== '__new__';
    updateTargetPath();
  }
  newCourseBtn.addEventListener('click', () => {
    courseSelect.value = '__new__';
    onCourseSelectChange();
    newCourseTitle.focus();
  });
  newCourseTitle.addEventListener('input', () => {
    newCourseSlug.value = slugify(newCourseTitle.value);
    updateTargetPath();
  });
  newCourseSlug.addEventListener('input', updateTargetPath);
  chapterTitle.addEventListener('input', updateTargetPath);

  function getSelectedCourse() {
    if (courseSelect.value === '__new__') {
      const title = newCourseTitle.value.trim();
      const slug = newCourseSlug.value.trim() || slugify(title);
      return { slug, title, isNew: true };
    }
    const c = toc.courses.find(c => c.slug === courseSelect.value);
    return c ? { slug: c.slug, title: c.title, isNew: false } : null;
  }

  function updateTargetPath() {
    const course = getSelectedCourse();
    const chSlug = slugify(chapterTitle.value);
    if (!course || !course.slug || !chSlug) {
      targetPath.textContent = '—';
      uploadBtn.disabled = !canUpload();
      return;
    }
    const ext = pendingPayload?.isSingle ? '.html' : '/';
    targetPath.textContent = `courses/${course.slug}/${chSlug}${ext}`;
    uploadBtn.disabled = !canUpload();
  }

  function canUpload() {
    if (!pendingPayload) return false;
    if (!isConfigured()) return false;
    const c = getSelectedCourse();
    if (!c || !c.slug) return false;
    if (!chapterTitle.value.trim()) return false;
    return true;
  }

  // ============================================
  // Drop zone & file ingestion
  // ============================================
  ['dragenter', 'dragover'].forEach(ev => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-hover');
    });
  });
  ['dragleave', 'drop'].forEach(ev => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-hover');
    });
  });
  dropzone.addEventListener('click', (e) => {
    if (e.target.id === 'browseBtn') return;
    fileInput.click();
  });
  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });
  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  cancelBtn.addEventListener('click', resetUploadForm);

  function resetUploadForm() {
    pendingPayload = null;
    uploadForm.hidden = true;
    chapterTitle.value = '';
    chapterTags.value = '';
    newCourseTitle.value = '';
    newCourseSlug.value = '';
    fileInput.value = '';
    previewTree.innerHTML = '';
    previewNotes.innerHTML = '';
    previewName.textContent = '—';
    updateTargetPath();
  }

  async function handleFile(file) {
    resetUploadForm();
    previewName.textContent = file.name;
    const ext = file.name.toLowerCase().split('.').pop();

    if (ext === 'html' || ext === 'htm') {
      // Single HTML upload
      const text = await file.text();
      const cleanText = sanitizeImagePaths(text, null).html;
      pendingPayload = {
        isSingle: true,
        files: { 'index.html': { content: cleanText, encoding: 'utf-8' } },
        mainName: file.name
      };
      renderPreview([{ path: file.name, size: file.size, isMain: true }], [
        { type: 'ok', text: '단일 HTML — 그대로 업로드됩니다' }
      ]);
      // Auto-suggest title from <title> tag
      const m = text.match(/<title>([^<]+)<\/title>/i);
      if (m && !chapterTitle.value) {
        chapterTitle.value = m[1].trim();
        updateTargetPath();
      }
      uploadForm.hidden = false;
      return;
    }

    if (ext !== 'zip') {
      toast('지원하지 않는 파일 형식입니다 (.zip 또는 .html)');
      return;
    }

    try {
      const zip = await JSZip.loadAsync(file);
      const entries = [];
      zip.forEach((relPath, entry) => {
        if (!entry.dir) entries.push({ relPath, entry });
      });
      if (entries.length === 0) {
        toast('zip이 비어있습니다');
        return;
      }

      // Detect common root prefix (e.g. "sorting/")
      const rootPrefix = detectRootPrefix(entries.map(e => e.relPath));

      // Find main HTML
      const htmls = entries.filter(e => /\.html?$/i.test(e.relPath));
      if (htmls.length === 0) {
        toast('zip 안에 HTML 파일이 없습니다');
        return;
      }
      let mainEntry;
      const indexCandidate = htmls.find(e => /(?:^|\/)index\.html?$/i.test(e.relPath));
      if (indexCandidate) {
        mainEntry = indexCandidate;
      } else if (htmls.length === 1) {
        mainEntry = htmls[0];
      } else {
        // Pick largest at the shallowest depth
        mainEntry = htmls.sort((a, b) => {
          const da = a.relPath.split('/').length;
          const db = b.relPath.split('/').length;
          if (da !== db) return da - db;
          return b.entry._data.uncompressedSize - a.entry._data.uncompressedSize;
        })[0];
      }

      // Build file map: strip root prefix, rename main to index.html, consolidate images dir
      const files = {};
      const previewItems = [];
      const notes = [];

      const mainText = await mainEntry.entry.async('string');
      const oldMainDir = dirname(mainEntry.relPath);

      // Determine original images dir within the zip (relative to main HTML)
      const imageDirs = new Set();
      entries.forEach(e => {
        if (/\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(e.relPath)) {
          const d = dirname(e.relPath);
          if (d) imageDirs.add(d);
        }
      });

      // Sanitize: rewrite "old_images/foo.png" → "images/foo.png", same for ../
      const { html: cleanedHtml, replacements } = sanitizeImagePaths(mainText, { oldMainDir, imageDirs });
      const rewroteCount = replacements;

      // Place main as index.html (at the chapter root)
      files['index.html'] = { content: cleanedHtml, encoding: 'utf-8' };
      previewItems.push({ path: stripPrefix(mainEntry.relPath, rootPrefix) + ' → index.html', isMain: true, size: mainEntry.entry._data.uncompressedSize });

      // Copy other files; relocate any-image-folder → images/
      for (const { relPath, entry } of entries) {
        if (entry === mainEntry.entry) continue;
        const stripped = stripPrefix(relPath, rootPrefix);
        if (!stripped) continue;

        let targetPath;
        if (/\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(stripped)) {
          // Place all images flat under images/
          const base = stripped.split('/').pop();
          targetPath = `images/${base}`;
        } else if (/\.(css|js)$/i.test(stripped)) {
          // Asset files: keep relative position from main HTML
          const fromMain = stripPrefix(relPath, oldMainDir ? oldMainDir + '/' : '') || stripped;
          targetPath = fromMain;
        } else {
          // Other files: keep flat or relative from root
          const fromMain = stripPrefix(relPath, oldMainDir ? oldMainDir + '/' : '') || stripped;
          targetPath = fromMain;
        }

        if (!targetPath || targetPath === 'index.html') continue;

        // Binary safe
        const blob = await entry.async('uint8array');
        const isBinary = /\.(png|jpe?g|gif|webp|bmp|ico|pdf|woff2?|ttf|otf|mp4|mp3)$/i.test(targetPath);
        if (isBinary) {
          // Convert to base64
          let bin = '';
          for (let i = 0; i < blob.length; i++) bin += String.fromCharCode(blob[i]);
          files[targetPath] = { content: btoa(bin), encoding: 'base64' };
        } else {
          const text = new TextDecoder('utf-8').decode(blob);
          files[targetPath] = { content: text, encoding: 'utf-8' };
        }
        previewItems.push({ path: stripped + (targetPath !== stripped ? ` → ${targetPath}` : ''), size: blob.length });
      }

      // Notes
      notes.push({ type: 'ok', text: `메인 파일: ${stripPrefix(mainEntry.relPath, rootPrefix)}` });
      if (rewroteCount > 0) {
        notes.push({ type: 'ok', text: `이미지 경로 ${rewroteCount}개 자동 정리됨` });
      }
      const imgCount = previewItems.filter(p => /\.(png|jpe?g|gif|svg|webp)$/i.test(p.path)).length;
      if (imgCount > 0) notes.push({ type: 'ok', text: `이미지 ${imgCount}개 포함` });

      // Auto-suggest title from <title>
      const m = mainText.match(/<title>([^<]+)<\/title>/i);
      if (m && !chapterTitle.value) {
        chapterTitle.value = m[1].trim();
      }

      pendingPayload = {
        isSingle: false,
        files,
        mainName: mainEntry.relPath
      };
      renderPreview(previewItems, notes);
      uploadForm.hidden = false;
      updateTargetPath();
    } catch (e) {
      console.error(e);
      toast('zip 처리 실패: ' + e.message);
    }
  }

  function detectRootPrefix(paths) {
    if (paths.length === 0) return '';
    const first = paths[0].split('/');
    if (first.length === 1) return '';
    const candidate = first[0] + '/';
    if (paths.every(p => p.startsWith(candidate))) return candidate;
    return '';
  }
  function stripPrefix(path, prefix) {
    if (!prefix) return path;
    return path.startsWith(prefix) ? path.slice(prefix.length) : path;
  }
  function dirname(p) {
    const i = p.lastIndexOf('/');
    return i < 0 ? '' : p.slice(0, i);
  }

  // Rewrites image refs in HTML to use a flat `images/` folder.
  // - "anything_images/foo.png" → "images/foo.png"
  // - "anything/images/foo.png" → "images/foo.png"
  // - "./foo.png" stays if next to main
  function sanitizeImagePaths(html, ctx) {
    let count = 0;
    const imgExt = /\.(png|jpe?g|gif|svg|webp|bmp|ico)/i;
    const rewritten = html.replace(/(src|href)\s*=\s*(['"])([^'"]+)\2/gi, (m, attr, q, val) => {
      if (!imgExt.test(val)) return m;
      // Skip absolute URLs and data URIs
      if (/^(https?:|data:|\/\/|#)/i.test(val)) return m;
      // Skip already-prefixed
      if (val.startsWith('images/')) return m;
      const base = val.split('/').pop();
      count++;
      return `${attr}=${q}images/${base}${q}`;
    });
    return { html: rewritten, replacements: count };
  }

  function renderPreview(items, notes) {
    previewTree.innerHTML = items.map(it => {
      const cls = it.isMain ? 'file main' : 'file';
      const size = it.size ? `<span class="meta">${formatSize(it.size)}</span>` : '';
      return `<div class="${cls}">${escapeHtml(it.path)}${size}</div>`;
    }).join('');
    previewNotes.innerHTML = notes.map(n => `
      <div class="note ${n.type}">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${n.type === 'ok'
            ? '<polyline points="20 6 9 17 4 12"/>'
            : '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'}
        </svg>
        <span>${escapeHtml(n.text)}</span>
      </div>
    `).join('');
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/1024/1024).toFixed(1) + ' MB';
  }

  // ============================================
  // Upload (commit to GitHub)
  // ============================================
  uploadBtn.addEventListener('click', doUpload);

  async function doUpload() {
    if (!canUpload()) { toast('필수 입력이 빠졌어요'); return; }
    const course = getSelectedCourse();
    const chTitle = chapterTitle.value.trim();
    const chSlug = slugify(chTitle);
    const tags = chapterTags.value.split(',').map(s => s.trim()).filter(Boolean);

    // Build target file map
    const fileMap = {};
    if (pendingPayload.isSingle) {
      const target = `courses/${course.slug}/${chSlug}.html`;
      fileMap[target] = pendingPayload.files['index.html'];
    } else {
      const root = `courses/${course.slug}/${chSlug}/`;
      for (const [k, v] of Object.entries(pendingPayload.files)) {
        fileMap[root + k] = v;
      }
    }

    // Update toc
    const newToc = JSON.parse(JSON.stringify(toc));
    let courseObj = newToc.courses.find(c => c.slug === course.slug);
    if (!courseObj) {
      courseObj = { slug: course.slug, title: course.title, chapters: [] };
      newToc.courses.push(courseObj);
    }
    const newPath = pendingPayload.isSingle
      ? `courses/${course.slug}/${chSlug}.html`
      : `courses/${course.slug}/${chSlug}/`;
    // Check for existing chapter with same path
    const dupeIdx = courseObj.chapters.findIndex(ch => ch.path === newPath);
    const newChapter = { title: chTitle, path: newPath, tags };
    if (dupeIdx >= 0) {
      if (!confirm('같은 경로의 챕터가 이미 존재합니다. 덮어쓰시겠어요?')) return;
      courseObj.chapters[dupeIdx] = newChapter;
    } else {
      courseObj.chapters.push(newChapter);
    }
    fileMap['data/toc.json'] = { content: JSON.stringify(newToc, null, 2) + '\n', encoding: 'utf-8' };

    // Commit
    openProgress(`업로드 중: ${chTitle}`);
    try {
      const sha = await commitFiles(`add: ${course.title} / ${chTitle}`, fileMap);
      log(`✓ 완료 · ${sha.slice(0, 7)}`, 'done');
      toc = newToc;
      setTimeout(() => {
        closeProgress();
        toast('업로드 완료');
        resetUploadForm();
        refreshCourseSelect();
        renderCatalog();
      }, 500);
    } catch (e) {
      log(`✗ ${e.message}`, 'error');
      progressText.textContent = '실패';
      setTimeout(closeProgress, 3000);
      toast('업로드 실패: ' + e.message);
    }
  }

  function openProgress(text) {
    progressText.textContent = text;
    progressLog.innerHTML = '';
    progressModal.hidden = false;
  }
  function closeProgress() { progressModal.hidden = true; }
  function log(msg, cls = '') {
    const div = document.createElement('div');
    div.className = 'step ' + cls;
    div.textContent = msg;
    progressLog.appendChild(div);
    progressLog.scrollTop = progressLog.scrollHeight;
  }

  // ============================================
  // Catalog (list, reorder, edit, delete)
  // ============================================
  function renderCatalog() {
    if (!toc.courses || toc.courses.length === 0) {
      catalog.innerHTML = '<div class="empty">아직 자료가 없습니다. 위에서 첫 자료를 업로드해보세요.</div>';
      return;
    }
    catalog.innerHTML = toc.courses.map(course => `
      <div class="cat-course" data-course="${escapeAttr(course.slug)}">
        <div class="cat-course__head">
          <span class="cat-course__title">${escapeHtml(course.title)}</span>
          <span class="cat-course__count">${course.chapters.length}개</span>
          <div class="cat-course__actions">
            <button class="danger-btn" data-action="delete-course" data-course="${escapeAttr(course.slug)}">과목 삭제</button>
          </div>
        </div>
        <ul class="cat-list" data-course="${escapeAttr(course.slug)}">
          ${course.chapters.map((ch, i) => `
            <li class="cat-item" data-chapter-index="${i}">
              <span class="drag-handle" title="드래그해서 순서 변경">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/>
                  <circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>
                </svg>
              </span>
              <div class="cat-item__main">
                <div class="cat-item__title">
                  ${escapeHtml(ch.title)}
                  ${(ch.tags || []).slice(0, 3).map(t => `<span class="cat-item__tag">${escapeHtml(t)}</span>`).join('')}
                </div>
                <div class="cat-item__meta">${escapeHtml(ch.path)}</div>
              </div>
              <div class="cat-item__actions">
                <button class="ghost-btn" data-action="edit" data-course="${escapeAttr(course.slug)}" data-index="${i}">수정</button>
                <button class="danger-btn" data-action="delete" data-course="${escapeAttr(course.slug)}" data-index="${i}">삭제</button>
              </div>
            </li>
          `).join('')}
        </ul>
      </div>
    `).join('');

    // Sortable per list
    catalog.querySelectorAll('.cat-list').forEach(list => {
      Sortable.create(list, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onEnd: () => persistReorder(list)
      });
    });

    // Action buttons
    catalog.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', onActionClick);
    });
  }

  async function persistReorder(list) {
    const courseSlug = list.dataset.course;
    const course = toc.courses.find(c => c.slug === courseSlug);
    if (!course) return;
    const newOrder = [...list.querySelectorAll('.cat-item')].map(li => {
      return course.chapters[parseInt(li.dataset.chapterIndex, 10)];
    });
    course.chapters = newOrder;
    // Re-render to reset indices
    renderCatalog();

    openProgress('순서 저장 중…');
    try {
      const fileMap = { 'data/toc.json': { content: JSON.stringify(toc, null, 2) + '\n', encoding: 'utf-8' } };
      const sha = await commitFiles(`reorder: ${course.title}`, fileMap);
      log(`✓ 저장됨 · ${sha.slice(0, 7)}`, 'done');
      setTimeout(closeProgress, 500);
      toast('순서 저장됨');
    } catch (e) {
      log('✗ ' + e.message, 'error');
      setTimeout(closeProgress, 3000);
      toast('저장 실패: ' + e.message);
    }
  }

  function onActionClick(e) {
    const btn = e.currentTarget;
    const action = btn.dataset.action;
    const courseSlug = btn.dataset.course;
    const idx = btn.dataset.index !== undefined ? parseInt(btn.dataset.index, 10) : null;

    if (action === 'edit') openEdit(courseSlug, idx);
    else if (action === 'delete') deleteChapter(courseSlug, idx);
    else if (action === 'delete-course') deleteCourse(courseSlug);
  }

  function openEdit(courseSlug, idx) {
    const course = toc.courses.find(c => c.slug === courseSlug);
    const ch = course?.chapters[idx];
    if (!ch) return;
    editingRef = { courseSlug, idx };
    $('#editTitle').value = ch.title;
    $('#editTags').value = (ch.tags || []).join(', ');
    $('#editPath').textContent = ch.path;
    editModal.hidden = false;
  }
  $('#saveEditBtn').addEventListener('click', async () => {
    if (!editingRef) return;
    const course = toc.courses.find(c => c.slug === editingRef.courseSlug);
    const ch = course?.chapters[editingRef.idx];
    if (!ch) return;
    ch.title = $('#editTitle').value.trim() || ch.title;
    ch.tags = $('#editTags').value.split(',').map(s => s.trim()).filter(Boolean);
    editModal.hidden = true;
    editingRef = null;

    openProgress('수정 저장 중…');
    try {
      const fileMap = { 'data/toc.json': { content: JSON.stringify(toc, null, 2) + '\n', encoding: 'utf-8' } };
      const sha = await commitFiles(`edit: ${ch.title}`, fileMap);
      log(`✓ 저장됨 · ${sha.slice(0, 7)}`, 'done');
      setTimeout(closeProgress, 500);
      toast('수정 완료');
      renderCatalog();
    } catch (e) {
      log('✗ ' + e.message, 'error');
      setTimeout(closeProgress, 3000);
      toast('실패: ' + e.message);
    }
  });

  async function deleteChapter(courseSlug, idx) {
    const course = toc.courses.find(c => c.slug === courseSlug);
    const ch = course?.chapters[idx];
    if (!ch) return;
    if (!confirm(`"${ch.title}" 챕터를 삭제하시겠어요?\n자료 파일까지 삭제됩니다.`)) return;

    openProgress('삭제 중…');
    try {
      const deletes = await listFilesUnder(ch.path);
      course.chapters.splice(idx, 1);
      const fileMap = { 'data/toc.json': { content: JSON.stringify(toc, null, 2) + '\n', encoding: 'utf-8' } };
      const sha = await commitFiles(`delete: ${ch.title}`, fileMap, deletes);
      log(`✓ ${deletes.length}개 파일 삭제 · ${sha.slice(0, 7)}`, 'done');
      setTimeout(closeProgress, 500);
      toast('삭제됨');
      renderCatalog();
    } catch (e) {
      log('✗ ' + e.message, 'error');
      setTimeout(closeProgress, 3000);
      toast('실패: ' + e.message);
    }
  }

  async function deleteCourse(courseSlug) {
    const course = toc.courses.find(c => c.slug === courseSlug);
    if (!course) return;
    if (!confirm(`"${course.title}" 과목 전체를 삭제하시겠어요?\n${course.chapters.length}개 챕터와 모든 자료가 삭제됩니다.`)) return;

    openProgress('과목 삭제 중…');
    try {
      const allDeletes = [];
      for (const ch of course.chapters) {
        const files = await listFilesUnder(ch.path);
        allDeletes.push(...files);
      }
      toc.courses = toc.courses.filter(c => c.slug !== courseSlug);
      const fileMap = { 'data/toc.json': { content: JSON.stringify(toc, null, 2) + '\n', encoding: 'utf-8' } };
      const sha = await commitFiles(`delete course: ${course.title}`, fileMap, allDeletes);
      log(`✓ ${allDeletes.length}개 파일 삭제 · ${sha.slice(0, 7)}`, 'done');
      setTimeout(closeProgress, 500);
      toast('과목 삭제됨');
      refreshCourseSelect();
      renderCatalog();
    } catch (e) {
      log('✗ ' + e.message, 'error');
      setTimeout(closeProgress, 3000);
      toast('실패: ' + e.message);
    }
  }

  // List all files under a path (folder or single file)
  async function listFilesUnder(path) {
    const repo = getRepo();
    if (path.endsWith('/')) {
      // It's a folder; recurse via Git Tree API
      const branchRes = await gh(`/repos/${repo.owner}/${repo.name}/branches/${repo.branch}`);
      if (!branchRes.ok) throw new Error('브랜치 조회 실패');
      const treeSha = branchRes.data.commit.commit.tree.sha;
      const treeRes = await gh(`/repos/${repo.owner}/${repo.name}/git/trees/${treeSha}?recursive=1`);
      if (!treeRes.ok) throw new Error('트리 조회 실패');
      const prefix = path.replace(/\/$/, '') + '/';
      return treeRes.data.tree
        .filter(item => item.type === 'blob' && item.path.startsWith(prefix))
        .map(item => item.path);
    }
    // Single file
    return [path];
  }

  // ============================================
  // Helpers
  // ============================================
  function escapeHtml(s) {
    return (s ?? '').toString().replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ============================================
  // Boot
  // ============================================
  async function boot() {
    updateConnStatus();
    if (!isConfigured()) {
      catalog.innerHTML = `
        <div class="empty">
          시작하려면 우상단 ⚙ 설정에서 GitHub 정보를 입력하세요.<br>
          <small style="display:block;margin-top:8px">레포 소유자, 이름, 토큰이 필요합니다.</small>
        </div>`;
      // Still load any local toc for the course dropdown
      await loadToc();
      refreshCourseSelect();
      return;
    }
    try {
      await loadToc();
      updateConnStatus('connected');
      refreshCourseSelect();
      renderCatalog();
    } catch (e) {
      console.error(e);
      updateConnStatus('error');
      catalog.innerHTML = `<div class="empty" style="color:#dc2626">연결 실패: ${escapeHtml(e.message)}</div>`;
    }
  }

  boot();
})();
