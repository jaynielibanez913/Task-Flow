import { api } from './api.js';
import { formatDate, formatDateTime, showToast } from './utils.js';

const PRESET_CATEGORIES = ['Work', 'Personal', 'Study', 'Health', 'Finance', 'General'];

let onDataMutatedCallback = null;
let activeDetailTask = null;
let confirmResolver = null;

export function initModals({ onDataMutated, getSettings }) {
  onDataMutatedCallback = onDataMutated;

  const formModal = document.getElementById('task-form-modal');
  const detailModal = document.getElementById('task-detail-modal');
  const confirmModal = document.getElementById('confirm-modal');

  const categorySelect = document.getElementById('task-category-select');
  const customCategoryInput = document.getElementById('task-custom-category-input');
  const taskForm = document.getElementById('task-form');

  categorySelect.addEventListener('change', () => {
    if (categorySelect.value === '__custom__') {
      customCategoryInput.hidden = false;
      customCategoryInput.focus();
    } else {
      customCategoryInput.hidden = true;
      customCategoryInput.value = '';
    }
  });

  // Close buttons & backdrop clicks
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-close-modal');
      closeModalById(targetId);
    });
  });

  [formModal, detailModal, confirmModal].forEach((overlay) => {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeModalById(overlay.id);
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!confirmModal.hidden) closeModalById('confirm-modal');
      else if (!formModal.hidden) closeModalById('task-form-modal');
      else if (!detailModal.hidden) closeModalById('task-detail-modal');
    }
  });

  // Handle Create / Update Submit
  taskForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = document.getElementById('task-form-error');
    const submitBtn = document.getElementById('task-form-submit-btn');
    errorBox.hidden = true;

    const idVal = document.getElementById('task-id-input').value.trim();
    const title = document.getElementById('task-title-input').value.trim();
    const description = document.getElementById('task-description-input').value.trim();
    const selectedCat = categorySelect.value;
    const category =
      selectedCat === '__custom__' ? customCategoryInput.value.trim() : selectedCat;
    const dueDate = document.getElementById('task-due-date-input').value.trim();
    const priority = document.getElementById('task-priority-select').value;
    const status = document.getElementById('task-status-select').value;

    if (!title) {
      errorBox.textContent = 'Please enter a task title.';
      errorBox.hidden = false;
      document.getElementById('task-title-input').focus();
      return;
    }

    if (!category) {
      errorBox.textContent = 'Please provide a category name.';
      errorBox.hidden = false;
      customCategoryInput.focus();
      return;
    }

    const payload = {
      title,
      description,
      category,
      priority,
      status,
      due_date: dueDate || null
    };

    submitBtn.disabled = true;
    try {
      if (idVal) {
        await api.updateTask(Number(idVal), payload);
        showToast('Task updated.');
      } else {
        await api.createTask(payload);
        showToast('Task created.');
      }
      closeModalById('task-form-modal');
      if (onDataMutatedCallback) {
        await onDataMutatedCallback();
      }
    } catch (err) {
      errorBox.textContent = err.message || 'Unable to save task.';
      errorBox.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Detail Modal Actions
  const detailStatusSelect = document.getElementById('detail-status-select');
  detailStatusSelect.addEventListener('change', async () => {
    if (!activeDetailTask) return;
    const nextStatus = detailStatusSelect.value;
    try {
      const res = await api.updateTask(activeDetailTask.id, { status: nextStatus });
      activeDetailTask = res.data;
      document.getElementById('detail-updated-at').textContent = formatDateTime(activeDetailTask.updated_at);
      showToast(`Status updated to ${nextStatus}.`);
      if (onDataMutatedCallback) {
        await onDataMutatedCallback();
      }
    } catch (err) {
      detailStatusSelect.value = activeDetailTask.status;
      showToast(err.message || 'Failed to update status.', 'error');
    }
  });

  document.getElementById('detail-edit-btn').addEventListener('click', () => {
    if (!activeDetailTask) return;
    const taskCopy = { ...activeDetailTask };
    closeModalById('task-detail-modal');
    openTaskFormModal({ task: taskCopy, defaultSettings: getSettings() });
  });

  document.getElementById('detail-delete-btn').addEventListener('click', async () => {
    if (!activeDetailTask) return;
    const taskToDelete = activeDetailTask;
    closeModalById('task-detail-modal');
    const confirmed = await openConfirmModal({
      title: 'Delete Task',
      message: `Permanently delete "${taskToDelete.title}"? This action cannot be undone.`,
      confirmLabel: 'Delete Task'
    });
    if (!confirmed) return;

    try {
      await api.deleteTask(taskToDelete.id);
      showToast('Task deleted.');
      if (onDataMutatedCallback) {
        await onDataMutatedCallback();
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete task.', 'error');
    }
  });

  // Confirm Modal Accept Button
  document.getElementById('confirm-modal-accept-btn').addEventListener('click', () => {
    if (confirmResolver) {
      const resolve = confirmResolver;
      confirmResolver = null;
      document.getElementById('confirm-modal').hidden = true;
      resolve(true);
    }
  });
}

export function openTaskFormModal({ task = null, presetStatus = null, defaultSettings = {} } = {}) {
  const modal = document.getElementById('task-form-modal');
  const titleHeading = document.getElementById('task-form-title');
  const submitBtn = document.getElementById('task-form-submit-btn');
  const errorBox = document.getElementById('task-form-error');
  const categorySelect = document.getElementById('task-category-select');
  const customCategoryInput = document.getElementById('task-custom-category-input');

  errorBox.hidden = true;

  if (task) {
    titleHeading.textContent = 'Edit Task';
    submitBtn.textContent = 'Save Changes';
    document.getElementById('task-id-input').value = String(task.id);
    document.getElementById('task-title-input').value = task.title || '';
    document.getElementById('task-description-input').value = task.description || '';
    document.getElementById('task-due-date-input').value = task.due_date || '';
    document.getElementById('task-priority-select').value = task.priority || 'Medium';
    document.getElementById('task-status-select').value = task.status || 'Pending';

    if (PRESET_CATEGORIES.includes(task.category)) {
      categorySelect.value = task.category;
      customCategoryInput.hidden = true;
      customCategoryInput.value = '';
    } else {
      categorySelect.value = '__custom__';
      customCategoryInput.hidden = false;
      customCategoryInput.value = task.category || '';
    }
  } else {
    titleHeading.textContent = 'Create Task';
    submitBtn.textContent = 'Create Task';
    document.getElementById('task-id-input').value = '';
    document.getElementById('task-title-input').value = '';
    document.getElementById('task-description-input').value = '';
    document.getElementById('task-due-date-input').value = '';
    document.getElementById('task-priority-select').value = defaultSettings.defaultPriority || 'Medium';
    document.getElementById('task-status-select').value = presetStatus || 'Pending';

    const defCat = defaultSettings.defaultCategory || 'Work';
    if (PRESET_CATEGORIES.includes(defCat)) {
      categorySelect.value = defCat;
      customCategoryInput.hidden = true;
      customCategoryInput.value = '';
    } else {
      categorySelect.value = '__custom__';
      customCategoryInput.hidden = false;
      customCategoryInput.value = defCat;
    }
  }

  modal.hidden = false;
  setTimeout(() => {
    document.getElementById('task-title-input').focus();
  }, 20);
}

export async function openTaskDetailModal(taskId) {
  try {
    const res = await api.getTaskById(taskId);
    const task = res.data;
    activeDetailTask = task;

    const overdueSuffix = task.is_overdue ? ' · Overdue' : '';
    document.getElementById('detail-task-meta').textContent =
      `${task.category} · ${task.priority} Priority${overdueSuffix}`;
    document.getElementById('detail-task-title').textContent = task.title;
    document.getElementById('detail-task-description').textContent =
      task.description || 'No additional description provided for this task.';
    document.getElementById('detail-status-select').value = task.status;
    document.getElementById('detail-due-date').textContent = formatDate(task.due_date);
    document.getElementById('detail-created-at').textContent = formatDateTime(task.created_at);
    document.getElementById('detail-updated-at').textContent = formatDateTime(task.updated_at);

    document.getElementById('task-detail-modal').hidden = false;
  } catch (err) {
    showToast(err.message || 'Unable to load task details.', 'error');
  }
}

export function openConfirmModal({ title, message, confirmLabel = 'Confirm' }) {
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-message').textContent = message;
  document.getElementById('confirm-modal-accept-btn').textContent = confirmLabel;
  document.getElementById('confirm-modal').hidden = false;

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function closeModalById(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
  if (id === 'confirm-modal' && confirmResolver) {
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(false);
  }
}
