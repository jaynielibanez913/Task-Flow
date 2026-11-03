import { localFallbackApi } from './localFallback.js';

let useStaticFallback = false;

function extractErrorMessage(payload, status) {
  if (!payload) {
    return `Request failed with HTTP status ${status}.`;
  }
  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }
  if (payload.error && typeof payload.error === 'object') {
    if (typeof payload.error.message === 'string' && payload.error.message.trim()) {
      return payload.error.message;
    }
    if (typeof payload.error.code === 'string') {
      return `Server error (${payload.error.code}).`;
    }
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  return `Request failed with HTTP status ${status}.`;
}

async function request(url, options = {}, fallbackFn = null) {
  if (useStaticFallback && fallbackFn) {
    return fallbackFn();
  }

  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers
    });
  } catch (networkErr) {
    if (fallbackFn) {
      useStaticFallback = true;
      return fallbackFn();
    }
    throw new Error(networkErr?.message || 'Network connection error.');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  // Detect static-only hosting (e.g., Vercel static deployment without Express /api server)
  // Our Express API always includes a boolean `success` field in every JSON response.
  const isMissingBackendServer =
    !response.ok && (!payload || typeof payload.success !== 'boolean');

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
    return request(
      qs ? `/api/tasks?${qs}` : '/api/tasks',
      {},
      () => localFallbackApi.getTasks(params)
    );
  },

  getTaskById(id) {
    return request(
      `/api/tasks/${encodeURIComponent(id)}`,
      {},
      () => localFallbackApi.getTaskById(id)
    );
  },

  createTask(taskData) {
    return request(
      '/api/tasks',
      {
        method: 'POST',
        body: JSON.stringify(taskData)
      },
      () => localFallbackApi.createTask(taskData)
    );
  },

  updateTask(id, updates) {
    return request(
      `/api/tasks/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates)
      },
      () => localFallbackApi.updateTask(id, updates)
    );
  },

  deleteTask(id) {
    return request(
      `/api/tasks/${encodeURIComponent(id)}`,
      {
        method: 'DELETE'
      },
      () => localFallbackApi.deleteTask(id)
    );
  },

  clearCompletedTasks() {
    return request(
      '/api/tasks/completed',
      {
        method: 'DELETE'
      },
      () => localFallbackApi.clearCompletedTasks()
    );
  },

  getDashboard() {
    return request('/api/dashboard', {}, () => localFallbackApi.getDashboard());
  },

  getSettings() {
    return request('/api/settings', {}, () => localFallbackApi.getSettings());
  },

  updateSettings(prefs) {
    return request(
      '/api/settings',
      {
        method: 'PUT',
        body: JSON.stringify(prefs)
      },
      () => localFallbackApi.updateSettings(prefs)
    );
  }
};
