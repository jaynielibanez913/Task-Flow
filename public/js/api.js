async function request(url, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || (payload && payload.success === false)) {
    const errorMessage =
      payload?.error || `Request failed with HTTP status ${response.status}.`;
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
    return request(qs ? `/api/tasks?${qs}` : '/api/tasks');
  },

  getTaskById(id) {
    return request(`/api/tasks/${encodeURIComponent(id)}`);
  },

  createTask(taskData) {
    return request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData)
    });
  },

  updateTask(id, updates) {
    return request(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  deleteTask(id) {
    return request(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  clearCompletedTasks() {
    return request('/api/tasks/completed', {
      method: 'DELETE'
    });
  },

  getDashboard() {
    return request('/api/dashboard');
  },

  getSettings() {
    return request('/api/settings');
  },

  updateSettings(prefs) {
    return request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(prefs)
    });
  }
};
