import { api } from '../api.js';
import {
  applyTheme,
  applyCompactMode,
  downloadTasksCsv,
  downloadTasksJson,
  showToast
} from '../utils.js';
import { openConfirmModal } from '../modal.js';

export async function renderSettingsView({ getSettings, onSettingsUpdated, refreshGlobalCounts }) {
  const settings = getSettings();

  const lightBtn = document.getElementById('theme-btn-light');
  const darkBtn = document.getElementById('theme-btn-dark');
  const compactCheckbox = document.getElementById('setting-compact-checkbox');
  const displayNameInput = document.getElementById('setting-display-name');
  const weeklyGoalInput = document.getElementById('setting-weekly-goal');
  const defaultCategorySelect = document.getElementById('setting-default-category');
  const defaultPrioritySelect = document.getElementById('setting-default-priority');
  const prefsForm = document.getElementById('settings-preferences-form');

  function syncThemeButtons(activeTheme) {
    lightBtn.classList.toggle('active', activeTheme === 'light');
    darkBtn.classList.toggle('active', activeTheme === 'dark');
  }

  const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : settings.theme;
  syncThemeButtons(currentTheme);

  compactCheckbox.checked = Boolean(settings.compactMode);
  displayNameInput.value = settings.displayName || 'Alex Morgan';
  weeklyGoalInput.value = String(settings.weeklyGoal || 10);
  defaultCategorySelect.value = settings.defaultCategory || 'Work';
  defaultPrioritySelect.value = settings.defaultPriority || 'Medium';

  async function selectTheme(nextTheme) {
    applyTheme(nextTheme);
    syncThemeButtons(nextTheme);
    try {
      const res = await api.updateSettings({ theme: nextTheme });
      onSettingsUpdated(res.data);
      showToast(`${nextTheme === 'dark' ? 'Dark' : 'Light'} mode enabled.`);
    } catch (err) {
      showToast(err.message || 'Unable to save theme preference.', 'error');
    }
  }

  lightBtn.addEventListener('click', () => selectTheme('light'));
  darkBtn.addEventListener('click', () => selectTheme('dark'));

  compactCheckbox.addEventListener('change', async () => {
    const enabled = compactCheckbox.checked;
    applyCompactMode(enabled);
    try {
      const res = await api.updateSettings({ compactMode: enabled });
      onSettingsUpdated(res.data);
      showToast(enabled ? 'Compact table density enabled.' : 'Standard table density restored.');
    } catch (err) {
      showToast(err.message || 'Unable to save density setting.', 'error');
    }
  });

  prefsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const saveBtn = document.getElementById('settings-save-btn');
    const displayName = displayNameInput.value.trim();
    const weeklyGoal = Number(weeklyGoalInput.value);
    const defaultCategory = defaultCategorySelect.value;
    const defaultPriority = defaultPrioritySelect.value;

    if (!displayName) {
      showToast('Display name cannot be empty.', 'error');
      displayNameInput.focus();
      return;
    }

    if (!Number.isInteger(weeklyGoal) || weeklyGoal < 1 || weeklyGoal > 200) {
      showToast('Weekly goal must be between 1 and 200.', 'error');
      weeklyGoalInput.focus();
      return;
    }

    saveBtn.disabled = true;
    try {
      const res = await api.updateSettings({
        displayName,
        weeklyGoal,
        defaultCategory,
        defaultPriority
      });
      onSettingsUpdated(res.data);
      showToast('Workspace preferences saved.');
    } catch (err) {
      showToast(err.message || 'Could not save preferences.', 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  document.getElementById('settings-download-source-btn')?.addEventListener('click', () => {
    showToast('Downloading taskflow-source-code.zip...');
  });

  // Export JSON & CSV
  document.getElementById('settings-export-json-btn').addEventListener('click', async () => {
    try {
      const res = await api.getTasks({ sortBy: 'created_at', sortOrder: 'desc' });
      downloadTasksJson(res.data, 'taskflow-backup.json');
      showToast('Exported tasks as JSON.');
    } catch (err) {
      showToast(err.message || 'Export failed.', 'error');
    }
  });

  document.getElementById('settings-export-csv-btn').addEventListener('click', async () => {
    try {
      const res = await api.getTasks({ sortBy: 'created_at', sortOrder: 'desc' });
      downloadTasksCsv(res.data, 'taskflow-backup.csv');
      showToast('Exported tasks as CSV.');
    } catch (err) {
      showToast(err.message || 'Export failed.', 'error');
    }
  });

  // Clear Completed Tasks
  document.getElementById('settings-clear-completed-btn').addEventListener('click', async () => {
    const confirmed = await openConfirmModal({
      title: 'Clear Completed Tasks',
      message: 'Permanently delete all tasks marked as Completed from SQLite storage?',
      confirmLabel: 'Clear Completed'
    });
    if (!confirmed) return;

    try {
      const res = await api.clearCompletedTasks();
      await refreshGlobalCounts();
      showToast(res.message || 'Completed tasks cleared.');
    } catch (err) {
      showToast(err.message || 'Failed to clear completed tasks.', 'error');
    }
  });
}
