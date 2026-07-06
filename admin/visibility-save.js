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

  function explainGitHubError(response, action) {
    const msg = response.data?.message || response.status;
    if (response.status === 401) {
      return 'GitHub 토큰이 올바르지 않거나 만료되었습니다. 새 토큰을 넣어주세요.';
    }
    if (response.status === 403) {
      return 'GitHub 토큰에 저장 권한이 없습니다. Contents 권한을 Read and write로 설정해주세요.';
    }
    if (response.status === 404) {
      return `${action} 실패: 저장소 선택 또는 토큰 쓰기 권한을 확인하세요. Fine-grained PAT에서 minwookhan/lectures 저장소와 Contents: Read and write 권한이 필요합니다.`;
    }
    if (response.status === 409 || /does not match/i.test(String(msg))) {
      return '목록 파일이 방금 바뀌었습니다. 자동 재시도에도 실패했습니다. 새로고침 후 다시 시도해주세요.';
    }
    return `${action} 실패: ${msg}`;
  }

  function isConflict(response) {
    const msg = response.data?.message || '';
    return response.status === 409 || /does not match/i.test(String(msg));
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

  async function fetchToc(repo) {
    const current = await gh(`/repos/${repo.owner}/${repo.name}/contents/data/toc.json?ref=${repo.branch}&_=${Date.now()}`);
    if (!current.ok) throw new Error(explainGitHubError(current, 'toc.json 조회'));
    return {
      sha: current.data.sha,
      toc: JSON.parse(decodeBase64Utf8(current.data.content))
    };
  }

  async function saveVisibility(repo, courseSlug, nextHidden, nextLabel) {
    let lastResponse = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) log(`최신 목록으로 재시도… (${attempt}/3)`);

      const current = await fetchToc(repo);
      const course = current.toc.courses?.find((item) => item.slug === courseSlug);
      if (!course) throw new Error('과목을 찾을 수 없습니다');

      course.hidden = nextHidden;

      const saved = await gh(`/repos/${repo.owner}/${repo.name}/contents/data/toc.json`, {
        method: 'PUT',
        body: {
          message: `visibility: ${course.title} ${nextLabel}`,
          content: b64EncodeUnicode(JSON.stringify(current.toc, null, 2) + '\n'),
          sha: current.sha,
          branch: repo.branch
        }
      });

      if (saved.ok) return { saved, course };
      lastResponse = saved;
      if (!isConflict(saved)) throw new Error(explainGitHubError(saved, 'toc.json 저장'));
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }

    throw new Error(explainGitHubError(lastResponse, 'toc.json 저장'));
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
      log('숨김 설정 저장…');
      const { saved, course } = await saveVisibility(repo, courseSlug, nextHidden, nextLabel);

      log(`✓ ${nextLabel} 설정됨 · ${saved.data.commit.sha.slice(0, 7)}`, 'done');
      toast(`"${course.title}" ${nextLabel} 설정됨`);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      btn.disabled = false;
      log(`✗ ${error.message}`, 'error');
      toast('실패: ' + error.message, 5200);
      window.setTimeout(closeProgress, 5000);
    }
  }, true);
})();
