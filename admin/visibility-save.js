/* Fix course visibility saves through the GitHub Contents API. */
(() => {
  'use strict';

  const STORAGE = {
    repo: 'lectures.admin.repo',
    token: 'lectures.admin.token'
  };

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

  async function gh(path, { method = 'GET', body = null } = {}) {
    const token = getToken();
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
    return { ok: res.ok, status: res.status, data };
  }

  function decodeBase64Utf8(b64) {
    const cleaned = b64.replace(/\s/g, '');
    const bin = atob(cleaned);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function b64EncodeUnicode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function toast(msg, ms = 2400) {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => el.classList.remove('show'), ms);
  }

  function openProgress(text) {
    const modal = document.querySelector('#progressModal');
    const progressText = document.querySelector('#progressText');
    const progressLog = document.querySelector('#progressLog');
    if (progressText) progressText.textContent = text;
    if (progressLog) progressLog.innerHTML = '';
    if (modal) modal.hidden = false;
  }

  function closeProgress() {
    const modal = document.querySelector('#progressModal');
    if (modal) modal.hidden = true;
  }

  function log(msg, cls = '') {
    const progressLog = document.querySelector('#progressLog');
    if (!progressLog) return;
    const div = document.createElement('div');
    div.className = `step ${cls}`;
    div.textContent = msg;
    progressLog.appendChild(div);
    progressLog.scrollTop = progressLog.scrollHeight;
  }

  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action="toggle-course-visibility"]');
    if (!btn) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (!isConfigured()) {
      toast('GitHub 설정을 먼저 저장하세요');
      return;
    }

    const repo = getRepo();
    const courseSlug = btn.dataset.course;
    const nextHidden = !btn.classList.contains('is-hidden');
    const nextLabel = nextHidden ? '숨김' : '공개';

    btn.disabled = true;
    openProgress(`과목 ${nextLabel} 설정 저장 중…`);

    try {
      log('목록 정보 조회…');
      const current = await gh(`/repos/${repo.owner}/${repo.name}/contents/data/toc.json?ref=${repo.branch}`);
      if (!current.ok) throw new Error(`toc.json 조회 실패: ${current.data?.message || current.status}`);

      const toc = JSON.parse(decodeBase64Utf8(current.data.content));
      const course = toc.courses?.find((item) => item.slug === courseSlug);
      if (!course) throw new Error('과목을 찾을 수 없습니다');

      course.hidden = nextHidden;

      log('숨김 설정 저장…');
      const saved = await gh(`/repos/${repo.owner}/${repo.name}/contents/data/toc.json`, {
        method: 'PUT',
        body: {
          message: `visibility: ${course.title} ${nextLabel}`,
          content: b64EncodeUnicode(JSON.stringify(toc, null, 2) + '\n'),
          sha: current.data.sha,
          branch: repo.branch
        }
      });
      if (!saved.ok) throw new Error(`toc.json 저장 실패: ${saved.data?.message || saved.status}`);

      log(`✓ ${nextLabel} 설정됨 · ${saved.data.commit.sha.slice(0, 7)}`, 'done');
      toast(`"${course.title}" ${nextLabel} 설정됨`);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      btn.disabled = false;
      log(`✗ ${error.message}`, 'error');
      toast('실패: ' + error.message, 3200);
      window.setTimeout(closeProgress, 3000);
    }
  }, true);
})();
