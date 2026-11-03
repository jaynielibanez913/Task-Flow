import { api } from './api.js';
import { applyTheme, applyCompactMode, escapeHtml, getInitials, showToast } from './utils.js';
import { initModals, openTaskFormModal } from './modal.js';
import { renderDashboardView } from './views/dashboardView.js';
import { renderTasksView } from './views/tasksView.js';
import { renderBoardView } from './views/boardView.js';
import { renderReportsView } from './views/reportsView.js';
import { renderSettingsView } from './views/settingsView.js';

const PAGE_CONFIG = {
  dashboard: {
    title: 'Dashboard',
    templateUrl: '/pages/dashboard.html',
    render: renderDashboardView
  },
  tasks: {
    title: 'My Tasks',
    templateUrl: '/pages/tasks.html',
    render: renderTasksView
  },
  board: {
    title: 'Task Board',
    templateUrl: '/pages/board.html',
    render: renderBoardView
  },
  reports: {
    title: 'Reports & Analytics',
    templateUrl: '/pages/reports.html',
    render: renderReportsView
  },
  settings: {
    title: 'Settings',
    templateUrl: '/pages/settings.html',
    render: renderSettingsView
  }
};

const templateCache = new Map();

let currentRoute = 'dashboard';
let cachedSettings = {
  theme: 'light',
  displayName: 'Alex Morgan',
  defaultCategory: 'Work',
  defaultPriority: 'Medium',
  weeklyGoal: 10,
  compactMode: false
};

function resolveInitialRoute() {
  const hash = window.location.hash.replace(/^#/, '').trim().toLowerCase();
  if (hash && PAGE_CONFIG[hash]) return hash;

  const pathSeg = window.location.pathname.replace(/^\//, '').trim().toLowerCase();
  if (pathSeg && PAGE_CONFIG[pathSeg]) return pathSeg;

  return 'dashboard';
}

async function fetchTemplate(url) {
  if (templateCache.has(url)) {
    return templateCache.get(url);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load view template: ${url}`);
  }
  const html = await res.text();
  templateCache.set(url, html);
  return html;
}

function syncSidebarProfile(settings) {
  const nameEl = document.getElementById('sidebar-user-name');
  const avatarEl = document.getElementById('sidebar-avatar');
  const dateEl = document.getElementById('sidebar-date-label');

  if (nameEl) nameEl.textContent = settings.displayName || 'Alex Morgan';
  if (avatarEl) avatarEl.textContent = getInitials(settings.displayName || 'Alex Morgan');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }
}

async function refreshGlobalCounts() {
  try {
    const dash = await api.getDashboard();
    const activeCount = dash.data.summary.activeTasks;
    const badge = document.getElementById('nav-active-count');
    if (badge) {
      badge.textContent = String(activeCount);
    }
  } catch {
    // Non-fatal background counter sync
  }
}

function closeMobileSidebar() {
  document.getElementById('app-sidebar')?.classList.remove('open');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop) backdrop.hidden = true;
}

function openMobileSidebar() {
  document.getElementById('app-sidebar')?.classList.add('open');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop) backdrop.hidden = false;
}

async function navigateTo(routeKey, pushHash = true) {
  const targetRoute = PAGE_CONFIG[routeKey] ? routeKey : 'dashboard';
  currentRoute = targetRoute;
  const config = PAGE_CONFIG[targetRoute];

  if (pushHash && window.location.hash !== `#${targetRoute}`) {
    history.replaceState(null, '', `#${targetRoute}`);
  }

  closeMobileSidebar();

  // Update active nav item & breadcrumb
  document.querySelectorAll('.nav-item[data-nav]').forEach((btn) => {
    const active = btn.getAttribute('data-nav') === targetRoute;
    btn.classList.toggle('active', active);
    if (active) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  const breadcrumbEl = document.getElementById('breadcrumb-current');
  if (breadcrumbEl) {
    breadcrumbEl.textContent = config.title;
  }

  const container = document.getElementById('view-container');
  try {
    const html = await fetchTemplate(config.templateUrl);
    container.innerHTML = html;

    await config.render({
      navigateTo,
      refreshGlobalCounts,
      getSettings: () => cachedSettings,
      onSettingsUpdated: (updated) => {
        cachedSettings = updated;
        syncSidebarProfile(cachedSettings);
      }
    });
  } catch (err) {
    const safeMsg =
      typeof err?.message === 'string' && err.message !== '[object Object]'
        ? err.message
        : 'Check your connection and try again.';
    container.innerHTML = `
      <div class="surface-panel">
        <div class="empty-state">
          <div class="empty-state-title">Unable to load page</div>
          <p class="empty-state-desc">${escapeHtml(safeMsg)}</p>
          <button type="button" id="retry-route-btn" class="btn btn-primary btn-sm">Retry</button>
        </div>
      </div>
    `;
    document.getElementById('retry-route-btn')?.addEventListener('click', () => {
      navigateTo(targetRoute, false);
    });
    showToast(safeMsg, 'error');
  }
}

async function bootstrap() {
  // Wire sidebar navigation
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      const target = el.getAttribute('data-nav');
      navigateTo(target);
    });
  });

  // Mobile sidebar toggles
  document.getElementById('open-sidebar-btn')?.addEventListener('click', openMobileSidebar);
  document.getElementById('close-sidebar-btn')?.addEventListener('click', closeMobileSidebar);
  document.getElementById('sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);

  // Topbar primary CTA
  document.getElementById('topbar-new-task-btn')?.addEventListener('click', () => {
    openTaskFormModal({ defaultSettings: cachedSettings });
  });

  // Initialize modals & re-render active page after task creation/update/delete
  initModals({
    getSettings: () => cachedSettings,
    onDataMutated: async () => {
      await refreshGlobalCounts();
      await navigateTo(currentRoute, false);
    }
  });

  window.addEventListener('hashchange', () => {
    const nextRoute = resolveInitialRoute();
    if (nextRoute !== currentRoute) {
      navigateTo(nextRoute, false);
    }
  });

  // Load persisted settings from SQLite
  try {
    const settingsRes = await api.getSettings();
    cachedSettings = settingsRes.data;

    let storedTheme = null;
    try {
      storedTheme = localStorage.getItem('taskflow_theme');
    } catch {
      storedTheme = null;
    }

    const effectiveTheme = storedTheme || cachedSettings.theme || 'light';
    applyTheme(effectiveTheme);
    applyCompactMode(cachedSettings.compactMode);
    syncSidebarProfile(cachedSettings);
  } catch {
    syncSidebarProfile(cachedSettings);
  }

  await refreshGlobalCounts();
  const initialRoute = resolveInitialRoute();
  await navigateTo(initialRoute, true);
}

bootstrap();
