/* ============================================
   Lectures — App
   ============================================ */

(() => {
  'use strict';

  const STORAGE = {
    theme: 'lectures.theme',
    sidebar: 'lectures.sidebar',
    collapsed: 'lectures.collapsed-courses'
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const app = $('#app');
  const nav = $('#nav');
  const frame = $('#frame');
  const welcome = $('#welcome');
  const crumbs = $('#crumbs');
  const searchInput = $('#search');
  const toggleBtn = $('#toggleBtn');
  const themeBtn = $('#themeBtn');
  const themeIconLight = $('#themeIconLight');
  const themeIconDark = $('#themeIconDark');
  const toastEl = $('#toast');

  let toc = { courses: [] };
  let filterText = '';
  let collapsedCourses = new Set();

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, ms = 2000) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  // ---------- Theme ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeIconLight.style.display = theme === 'light' ? '' : 'none';
    themeIconDark.style.display = theme === 'dark' ? '' : 'none';
  }
  function initTheme() {
    const saved = localStorage.getItem(STORAGE.theme) || 'light';
    applyTheme(saved);
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem(STORAGE.theme, next);
  }

  // ---------- Sidebar collapse (push) ----------
  function applySidebar(collapsed) {
    app.classList.toggle('sidebar-collapsed', collapsed);
  }
  function initSidebar() {
    const saved = localStorage.getItem(STORAGE.sidebar);
    applySidebar(saved === '1');
  }
  function toggleSidebar() {
    const collapsed = !app.classList.contains('sidebar-collapsed');
    applySidebar(collapsed);
    localStorage.setItem(STORAGE.sidebar, collapsed ? '1' : '0');
  }

  // ---------- TOC: load & render ----------
  async function loadToc() {
    try {
      const res = await fetch('data/toc.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('toc.json 로드 실패: ' + res.status);
      toc = await res.json();
    } catch (e) {
      console.error(e);
      toc = { courses: [] };
      toast('목차를 불러올 수 없습니다');
    }
    loadCollapsedCourses();
    renderNav();
  }

  function loadCollapsedCourses() {
    try {
      const raw = localStorage.getItem(STORAGE.collapsed);
      collapsedCourses = new Set(raw ? JSON.parse(raw) : []);
    } catch { collapsedCourses = new Set(); }
  }
  function saveCollapsedCourses() {
    localStorage.setItem(STORAGE.collapsed, JSON.stringify([...collapsedCourses]));
  }

  function matchesFilter(chapter, course) {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    const haystack = [
      chapter.title || '',
      course.title || '',
      ...(chapter.tags || [])
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  }

  function renderNav() {
    if (!toc.courses || toc.courses.length === 0) {
      nav.innerHTML = `
        <div class="sidebar__empty">
          아직 자료가 없습니다.<br>
          <code>admin/</code> 페이지에서 첫 자료를 업로드해보세요.
        </div>`;
      return;
    }

    const hash = location.hash.replace(/^#\/?/, '');
    const html = toc.courses.map(course => {
      const chapters = (course.chapters || []).filter(ch => matchesFilter(ch, course));
      if (filterText && chapters.length === 0) return '';

      const isCollapsed = collapsedCourses.has(course.slug) && !filterText;

      const chaptersHtml = chapters.map(ch => {
        const id = `${course.slug}/${slugify(ch.title)}`;
        const active = decodeURIComponent(hash) === id ? 'active' : '';
        const tags = (ch.tags || []).slice(0, 2).map(t =>
          `<span class="chapter__tag">${escapeHtml(t)}</span>`
        ).join('');
        const tagsWrap = tags ? `<span class="chapter__tags">${tags}</span>` : '';
        return `<button class="chapter ${active}" data-course="${escapeAttr(course.slug)}" data-chapter="${escapeAttr(ch.title)}" data-path="${escapeAttr(ch.path)}">
          ${escapeHtml(ch.title)}${tagsWrap}
        </button>`;
      }).join('');

      return `
        <div class="course ${isCollapsed ? 'collapsed' : ''}" data-course="${escapeAttr(course.slug)}">
          <button class="course__title" data-toggle-course="${escapeAttr(course.slug)}">
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            <span>${escapeHtml(course.title)}</span>
          </button>
          <div class="course__chapters">${chaptersHtml}</div>
        </div>`;
    }).join('');

    nav.innerHTML = html || `<div class="sidebar__empty">검색 결과가 없습니다.</div>`;

    // Wire events
    nav.querySelectorAll('.chapter').forEach(btn => {
      btn.addEventListener('click', () => {
        const courseSlug = btn.dataset.course;
        const chapterTitle = btn.dataset.chapter;
        const id = `${courseSlug}/${slugify(chapterTitle)}`;
        location.hash = '#/' + encodeURIComponent(courseSlug) + '/' + encodeURIComponent(slugify(chapterTitle));
        navigateTo(courseSlug, chapterTitle, btn.dataset.path);
      });
    });
    nav.querySelectorAll('[data-toggle-course]').forEach(btn => {
      btn.addEventListener('click', () => {
        const slug = btn.dataset.toggleCourse;
        if (collapsedCourses.has(slug)) collapsedCourses.delete(slug);
        else collapsedCourses.add(slug);
        saveCollapsedCourses();
        renderNav();
      });
    });
  }

  // ---------- Navigation ----------
  function navigateTo(courseSlug, chapterTitle, path) {
    const course = toc.courses.find(c => c.slug === courseSlug);
    const chapter = course?.chapters.find(ch => ch.title === chapterTitle);
    if (!chapter) return;

    const url = chapter.path;
    frame.style.display = 'block';
    welcome.style.display = 'none';
    frame.src = url;

    crumbs.innerHTML = `
      <span>${escapeHtml(course.title)}</span>
      <span class="sep">/</span>
      <span class="current">${escapeHtml(chapter.title)}</span>
    `;
    document.title = `${chapter.title} — ${course.title}`;

    // Update active state
    nav.querySelectorAll('.chapter').forEach(b => b.classList.remove('active'));
    const btn = nav.querySelector(`.chapter[data-course="${cssEscape(courseSlug)}"][data-chapter="${cssEscape(chapterTitle)}"]`);
    btn?.classList.add('active');
  }

  function navigateFromHash() {
    const hash = location.hash.replace(/^#\/?/, '');
    if (!hash) return;
    const parts = hash.split('/').map(decodeURIComponent);
    if (parts.length < 2) return;
    const [courseSlug, chapterSlug] = parts;
    const course = toc.courses.find(c => c.slug === courseSlug);
    if (!course) return;
    const chapter = course.chapters.find(ch => slugify(ch.title) === chapterSlug);
    if (!chapter) return;
    navigateTo(courseSlug, chapter.title, chapter.path);
  }

  // ---------- Search ----------
  function onSearchInput() {
    filterText = searchInput.value.trim();
    renderNav();
  }

  // ---------- Keyboard shortcuts ----------
  function onKeydown(e) {
    const tag = e.target.tagName;
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;

    // Esc: clear search OR blur input
    if (e.key === 'Escape') {
      if (e.target === searchInput) {
        searchInput.value = '';
        onSearchInput();
        searchInput.blur();
      }
      return;
    }

    if (isTyping) return;

    // Sidebar toggle: [ or \
    if (e.key === '[' || e.key === '\\') {
      e.preventDefault();
      toggleSidebar();
      return;
    }

    // Focus search: /
    if (e.key === '/') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    // Theme: t
    if (e.key === 't') {
      e.preventDefault();
      toggleTheme();
    }
  }

  // ---------- Helpers ----------
  function slugify(s) {
    return (s || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}\-]/gu, '')
      .replace(/-+/g, '-');
  }
  function escapeHtml(s) {
    return (s ?? '').toString().replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }
  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return (s || '').replace(/(["'\\\]])/g, '\\$1');
  }

  // ---------- Init ----------
  function init() {
    initTheme();
    initSidebar();

    toggleBtn.addEventListener('click', toggleSidebar);
    themeBtn.addEventListener('click', toggleTheme);
    searchInput.addEventListener('input', onSearchInput);
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('hashchange', navigateFromHash);

    loadToc().then(() => {
      navigateFromHash();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
