const TASKS_KEY = 'taskflow_local_tasks_v1';
const LOGS_KEY = 'taskflow_local_logs_v1';
const SETTINGS_KEY = 'taskflow_local_settings_v1';
const SEEDED_KEY = 'taskflow_local_seeded_v1';

const ALLOWED_PRIORITIES = ['Low', 'Medium', 'High'];
const ALLOWED_STATUSES = ['Pending', 'In Progress', 'Completed'];

let useStaticFallback = false;

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function tsOffset(days, hours = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // Ignore storage quota errors
  }
}

function ensureInitialized() {
  const settings = readJson(SETTINGS_KEY, null);
  if (!settings) {
    writeJson(SETTINGS_KEY, {
      theme: 'light',
      displayName: 'Alex Morgan',
      defaultCategory: 'Work',
      defaultPriority: 'Medium',
      weeklyGoal: 10,
      compactMode: false
    });
  }

  let isSeeded = false;
  try {
    isSeeded = localStorage.getItem(SEEDED_KEY) === '1';
  } catch {
    isSeeded = false;
  }
  if (isSeeded) return;

  const seedTasks = [
    {
      id: 1,
      title: 'Finalize Q4 personal productivity roadmap',
      description: 'Review quarterly milestones, align weekly focus blocks, and archive outdated backlog items.',
      category: 'Work',
      priority: 'High',
      status: 'In Progress',
      due_date: dateOffset(1),
      created_at: tsOffset(-4, -2),
      updated_at: tsOffset(-1, -1)
    },
    {
      id: 2,
      title: 'Submit monthly expense report and receipts',
      description: 'Compile software subscriptions, travel invoices, and export summary sheet before finance cutoff.',
      category: 'Finance',
      priority: 'High',
      status: 'Pending',
      due_date: dateOffset(-2),
      created_at: tsOffset(-6, -3),
      updated_at: tsOffset(-6, -3)
    },
    {
      id: 3,
      title: 'Prepare REST API architecture notes',
      description: 'Document validation rules, SQLite indexing strategy, and error response contracts for code review.',
      category: 'Study',
      priority: 'Medium',
      status: 'Completed',
      due_date: dateOffset(-1),
      created_at: tsOffset(-5, -4),
      updated_at: tsOffset(-1, -3)
    },
    {
      id: 4,
      title: 'Complete 45-minute strength & mobility session',
      description: 'Upper body compound routine followed by 15 minutes of thoracic and hip mobility work.',
      category: 'Health',
      priority: 'Medium',
      status: 'Completed',
      due_date: dateOffset(0),
      created_at: tsOffset(-2, -5),
      updated_at: tsOffset(0, -2)
    },
    {
      id: 5,
      title: 'Schedule annual dental and vision checkup',
      description: 'Confirm morning appointment availability for next week and update calendar reminders.',
      category: 'Personal',
      priority: 'Low',
      status: 'Pending',
      due_date: dateOffset(4),
      created_at: tsOffset(-2, -1),
      updated_at: tsOffset(-2, -1)
    }
  ];

  const seedLogs = seedTasks.map((t, idx) => ({
    id: idx + 1,
    task_id: t.id,
    task_title: t.title,
    action: t.status === 'Completed' ? 'completed' : 'created',
    details:
      t.status === 'Completed'
        ? 'Marked task as Completed'
        : `Created in ${t.category} (${t.priority} priority)`,
    created_at: t.updated_at
  }));

  writeJson(TASKS_KEY, seedTasks);
  writeJson(LOGS_KEY, seedLogs);
  try {
    localStorage.setItem(SEEDED_KEY, '1');
  } catch {
    // Ignore
  }
}

function enrich(task, today) {
  return {
    ...task,
    is_overdue: Boolean(task.due_date && task.due_date < today && task.status !== 'Completed')
  };
}

function appendLog(taskId, taskTitle, action, details) {
  const logs = readJson(LOGS_KEY, []);
  const nextId = logs.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
  logs.unshift({
    id: nextId,
    task_id: taskId,
    task_title: taskTitle,
    action,
    details,
    created_at: new Date().toISOString()
  });
  writeJson(LOGS_KEY, logs.slice(0, 40));
}

const localStore = {
  getTasks(params = {}) {
    ensureInitialized();
    const today = todayIso();
    const all = readJson(TASKS_KEY, []).map((t) => enrich(t, today));
    const categories = Array.from(new Set(all.map((t) => t.category))).sort((a, b) =>
      a.localeCompare(b)
    );

    let filtered = all;
    if (params.search) {
      const q = String(params.search).toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          (t.category || '').toLowerCase().includes(q)
      );
    }
    if (params.status && params.status !== 'All') {
      if (params.status === 'Overdue') {
        filtered = filtered.filter((t) => t.is_overdue);
      } else {
        filtered = filtered.filter((t) => t.status === params.status);
      }
    }
    if (params.priority && params.priority !== 'All') {
      filtered = filtered.filter((t) => t.priority === params.priority);
    }
    if (params.category && params.category !== 'All') {
      filtered = filtered.filter(
        (t) => (t.category || '').toLowerCase() === String(params.category).toLowerCase()
      );
    }

    const dir = String(params.sortOrder || 'asc').toLowerCase() === 'desc' ? -1 : 1;
    const sortBy = params.sortBy || 'due_date';
    const pWeight = { High: 3, Medium: 2, Low: 1 };

    filtered.sort((a, b) => {
      if (sortBy === 'due_date') {
        const aEmpty = !a.due_date;
        const bEmpty = !b.due_date;
        if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
        return String(a.due_date || '').localeCompare(String(b.due_date || '')) * dir;
      }
      if (sortBy === 'priority') {
        return ((pWeight[a.priority] || 0) - (pWeight[b.priority] || 0)) * dir;
      }
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title) * dir;
      }
      return String(a.created_at || '').localeCompare(String(b.created_at || '')) * dir;
    });

    return { success: true, count: filtered.length, categories, data: filtered };
  },

  getTaskById(id) {
    ensureInitialized();
    const numId = Number(id);
    const found = readJson(TASKS_KEY, []).find((t) => t.id === numId);
    if (!found) throw new Error(`Task with ID ${id} was not found.`);
    return { success: true, data: enrich(found, todayIso()) };
  },

  createTask(payload) {
    ensureInitialized();
    const title = String(payload?.title || '').trim();
    if (!title) throw new Error('Task title cannot be empty.');
    const priority = ALLOWED_PRIORITIES.includes(payload?.priority) ? payload.priority : 'Medium';
    const status = ALLOWED_STATUSES.includes(payload?.status) ? payload.status : 'Pending';
    const category = String(payload?.category || 'General').trim() || 'General';

    const tasks = readJson(TASKS_KEY, []);
    const nextId = tasks.reduce((max, t) => Math.max(max, t.id || 0), 0) + 1;
    const now = new Date().toISOString();
    const created = {
      id: nextId,
      title,
      description: String(payload?.description || '').trim(),
      category,
      priority,
      status,
      due_date: payload?.due_date || null,
      created_at: now,
      updated_at: now
    };
    tasks.unshift(created);
    writeJson(TASKS_KEY, tasks);
    appendLog(created.id, created.title, 'created', `Created in ${category} (${priority} priority)`);
    return { success: true, data: enrich(created, todayIso()) };
  },

  updateTask(id, updates) {
    ensureInitialized();
    const numId = Number(id);
    const tasks = readJson(TASKS_KEY, []);
    const idx = tasks.findIndex((t) => t.id === numId);
    if (idx === -1) throw new Error(`Task with ID ${id} was not found.`);

    const existing = tasks[idx];
    const updated = {
      ...existing,
      ...(updates.title !== undefined ? { title: String(updates.title).trim() } : {}),
      ...(updates.description !== undefined ? { description: String(updates.description || '').trim() } : {}),
      ...(updates.category !== undefined ? { category: String(updates.category).trim() } : {}),
      ...(updates.priority !== undefined ? { priority: updates.priority } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      ...(updates.due_date !== undefined ? { due_date: updates.due_date || null } : {}),
      updated_at: new Date().toISOString()
    };
    tasks[idx] = updated;
    writeJson(TASKS_KEY, tasks);

    if (updates.status && updates.status !== existing.status) {
      appendLog(
        updated.id,
        updated.title,
        updates.status === 'Completed' ? 'completed' : 'status_changed',
        updates.status === 'Completed'
          ? 'Marked task as Completed'
          : `Moved status from ${existing.status} to ${updates.status}`
      );
    } else {
      appendLog(updated.id, updated.title, 'updated', `Updated details (${updated.category} · ${updated.priority})`);
    }

    return { success: true, data: enrich(updated, todayIso()) };
  },

  deleteTask(id) {
    ensureInitialized();
    const numId = Number(id);
    const tasks = readJson(TASKS_KEY, []);
    const target = tasks.find((t) => t.id === numId);
    if (!target) throw new Error(`Task with ID ${id} was not found.`);
    writeJson(
      TASKS_KEY,
      tasks.filter((t) => t.id !== numId)
    );
    appendLog(null, target.title, 'deleted', `Removed from ${target.category}`);
    return { success: true, data: { deletedId: numId, title: target.title } };
  },

  clearCompletedTasks() {
    ensureInitialized();
    const tasks = readJson(TASKS_KEY, []);
    const remaining = tasks.filter((t) => t.status !== 'Completed');
    const removedCount = tasks.length - remaining.length;
    writeJson(TASKS_KEY, remaining);
    if (removedCount > 0) {
      appendLog(null, `${removedCount} completed task(s)`, 'cleared', 'Cleared completed tasks archive');
    }
    return {
      success: true,
      message: `Cleared ${removedCount} completed task(s).`,
      data: { removedCount }
    };
  },

  getDashboard() {
    ensureInitialized();
    const today = todayIso();
    const allTasks = readJson(TASKS_KEY, []).map((t) => enrich(t, today));
    const settings = this.getSettings().data;
    const totalTasks = allTasks.length;
    const pendingTasks = allTasks.filter((t) => t.status === 'Pending').length;
    const inProgressTasks = allTasks.filter((t) => t.status === 'In Progress').length;
    const completedTasks = allTasks.filter((t) => t.status === 'Completed').length;
    const overdueTasks = allTasks.filter((t) => t.is_overdue).length;
    const completionPercentage =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 1000) / 10 : 0;

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyProductivity = [];
    const mapByDate = new Map();

    for (let offset = -6; offset <= 0; offset += 1) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      const entry = {
        date: key,
        label: dayNames[d.getDay()],
        shortDate: `${mm}/${dd}`,
        created: 0,
        completed: 0
      };
      weeklyProductivity.push(entry);
      mapByDate.set(key, entry);
    }

    for (const t of allTasks) {
      const cDay = String(t.created_at || '').slice(0, 10);
      if (mapByDate.has(cDay)) mapByDate.get(cDay).created += 1;
      if (t.status === 'Completed') {
        const uDay = String(t.updated_at || '').slice(0, 10);
        if (mapByDate.has(uDay)) mapByDate.get(uDay).completed += 1;
      }
    }

    const priorityDistribution = ['High', 'Medium', 'Low'].map((level) => {
      const subset = allTasks.filter((t) => t.priority === level);
      const comp = subset.filter((t) => t.status === 'Completed').length;
      return {
        priority: level,
        total: subset.length,
        completed: comp,
        pending: subset.filter((t) => t.status === 'Pending').length,
        inProgress: subset.filter((t) => t.status === 'In Progress').length,
        percentage: totalTasks > 0 ? Math.round((subset.length / totalTasks) * 1000) / 10 : 0,
        completionRate: subset.length > 0 ? Math.round((comp / subset.length) * 100) : 0
      };
    });

    const catMap = new Map();
    for (const t of allTasks) {
      const c = t.category || 'General';
      if (!catMap.has(c)) {
        catMap.set(c, { category: c, total: 0, completed: 0, inProgress: 0, pending: 0, overdue: 0 });
      }
      const bucket = catMap.get(c);
      bucket.total += 1;
      if (t.status === 'Completed') bucket.completed += 1;
      else if (t.status === 'In Progress') bucket.inProgress += 1;
      else bucket.pending += 1;
      if (t.is_overdue) bucket.overdue += 1;
    }

    const categoryBreakdown = Array.from(catMap.values()).map((item) => ({
      ...item,
      completionRate: item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0
    }));

    const upcomingDeadlines = allTasks
      .filter((t) => t.status !== 'Completed')
      .sort((a, b) => String(a.due_date || '9999-12-31').localeCompare(String(b.due_date || '9999-12-31')))
      .slice(0, 6);

    const completionHistory = allTasks
      .filter((t) => t.status === 'Completed')
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
      .slice(0, 20);

    return {
      success: true,
      data: {
        summary: {
          totalTasks,
          pendingTasks,
          inProgressTasks,
          completedTasks,
          overdueTasks,
          activeTasks: pendingTasks + inProgressTasks,
          completionPercentage,
          weeklyCompletedCount: weeklyProductivity.reduce((s, d) => s + d.completed, 0),
          weeklyCreatedCount: weeklyProductivity.reduce((s, d) => s + d.created, 0),
          weeklyGoal: Number(settings.weeklyGoal) || 10
        },
        weeklyProductivity,
        priorityDistribution,
        categoryBreakdown,
        upcomingDeadlines,
        completionHistory,
        recentActivities: readJson(LOGS_KEY, []).slice(0, 10)
      }
    };
  },

  getSettings() {
    ensureInitialized();
    const s = readJson(SETTINGS_KEY, {});
    return {
      success: true,
      data: {
        theme: s.theme === 'dark' ? 'dark' : 'light',
        displayName: s.displayName || 'Alex Morgan',
        defaultCategory: s.defaultCategory || 'Work',
        defaultPriority: s.defaultPriority || 'Medium',
        weeklyGoal: Number(s.weeklyGoal) || 10,
        compactMode: Boolean(s.compactMode)
      }
    };
  },

  updateSettings(prefs) {
    ensureInitialized();
    const current = this.getSettings().data;
    const merged = { ...current, ...prefs };
    writeJson(SETTINGS_KEY, merged);
    return { success: true, message: 'Preferences saved.', data: merged };
  }
};

function extractErrorMessage(payload, status) {
  if (!payload) return `Request failed with HTTP status ${status}.`;
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  if (payload.error && typeof payload.error === 'object') {
    if (typeof payload.error.message === 'string' && payload.error.message.trim()) {
      return payload.error.message;
    }
    if (typeof payload.error.code === 'string') {
      return `Server error (${payload.error.code}).`;
    }
  }
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
  return `Request failed with HTTP status ${status}.`;
}

async function request(url, options = {}, fallbackFn = null) {
  if (useStaticFallback && fallbackFn) {
    return fallbackFn();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
  } catch (networkErr) {
    clearTimeout(timeoutId);
    if (fallbackFn) {
      useStaticFallback = true;
      return fallbackFn();
    }
    throw new Error(networkErr?.message || 'Network connection error.');
  }
  clearTimeout(timeoutId);

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  // Switch to built-in persistence if hosted on static CDN or serverless container without native SQLite
  const isMissingBackendServer =
    payload?.serverlessFallback === true ||
    (!response.ok && (!payload || typeof payload.success !== 'boolean'));

  if (isMissingBackendServer && fallbackFn) {
    useStaticFallback = true;
    return fallbackFn();
  }

  if (!response.ok || (payload && payload.success === false)) {
    const errorMessage = extractErrorMessage(payload, response.status);
    const err = new Error(errorMessage);
    err.status = response.status;
    err.details = payload?.details || null;
    throw err;
  }

  return payload;
}

export const api = {
  getTasks(params = {}) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && String(value) !== '') {
        searchParams.set(key, String(value));
      }
    }
    const qs = searchParams.toString();
    return request(qs ? `/api/tasks?${qs}` : '/api/tasks', {}, () => localStore.getTasks(params));
  },

  getTaskById(id) {
    return request(`/api/tasks/${encodeURIComponent(id)}`, {}, () => localStore.getTaskById(id));
  },

  createTask(taskData) {
    return request(
      '/api/tasks',
      { method: 'POST', body: JSON.stringify(taskData) },
      () => localStore.createTask(taskData)
    );
  },

  updateTask(id, updates) {
    return request(
      `/api/tasks/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(updates) },
      () => localStore.updateTask(id, updates)
    );
  },

  deleteTask(id) {
    return request(
      `/api/tasks/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      () => localStore.deleteTask(id)
    );
  },

  clearCompletedTasks() {
    return request(
      '/api/tasks/completed',
      { method: 'DELETE' },
      () => localStore.clearCompletedTasks()
    );
  },

  getDashboard() {
    return request('/api/dashboard', {}, () => localStore.getDashboard());
  },

  getSettings() {
    return request('/api/settings', {}, () => localStore.getSettings());
  },

  updateSettings(prefs) {
    return request(
      '/api/settings',
      { method: 'PUT', body: JSON.stringify(prefs) },
      () => localStore.updateSettings(prefs)
    );
  }
};
