import { api } from '../api.js';
import {
  escapeHtml,
  formatDate,
  priorityClass,
  statusClass,
  debounce,
  showToast
} from '../utils.js';
import { openTaskDetailModal, openTaskFormModal, openConfirmModal } from '../modal.js';

const DEFAULT_CATEGORIES = ['Work', 'Personal', 'Study', 'Health', 'Finance', 'General'];

const filterState = {
  status: 'All',
  search: '',
  category: 'All',
  priority: 'All',
  sort: 'due_date:asc'
};

export async function renderTasksView({ refreshGlobalCounts, getSettings }) {
  const searchInput = document.getElementById('tasks-search-input');
  const categorySelect = document.getElementById('tasks-category-filter');
  const prioritySelect = document.getElementById('tasks-priority-filter');
  const sortSelect = document.getElementById('tasks-sort-select');
  const resetBtn = document.getElementById('tasks-reset-filters-btn');
  const statusButtons = document.querySelectorAll('[data-status-tab]');

  // Restore current UI state
  searchInput.value = filterState.search;
  prioritySelect.value = filterState.priority;
  sortSelect.value = filterState.sort;

  statusButtons.forEach((btn) => {
    const isMatch = btn.getAttribute('data-status-tab') === filterState.status;
    btn.classList.toggle('active', isMatch);
    btn.setAttribute('aria-selected', String(isMatch));
  });

  async function loadAndDrawTasks() {
    const [sortBy, sortOrder] = filterState.sort.split(':');
    const query = {
      sortBy,
      sortOrder
    };

    if (filterState.search) query.search = filterState.search;
    if (filterState.status !== 'All') query.status = filterState.status;
    if (filterState.priority !== 'All') query.priority = filterState.priority;
    if (filterState.category !== 'All') query.category = filterState.category;

    const hasActiveFilter =
      filterState.status !== 'All' ||
      filterState.search !== '' ||
      filterState.category !== 'All' ||
      filterState.priority !== 'All';
    resetBtn.hidden = !hasActiveFilter;

    const response = await api.getTasks(query);
    const tasks = response.data;
    const mergedCategories = Array.from(
      new Set([...DEFAULT_CATEGORIES, ...(response.categories || [])])
    ).sort((a, b) => a.localeCompare(b));

    populateCategorySelect(categorySelect, mergedCategories, filterState.category);

    document.getElementById('tasks-result-count').textContent =
      `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;

    const container = document.getElementById('tasks-table-container');

    if (tasks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">${
            hasActiveFilter ? 'No matching tasks found' : 'Your task list is empty'
          }</div>
          <p class="empty-state-desc">${
            hasActiveFilter
              ? 'Try adjusting your search keywords, category, priority, or status filter.'
              : 'Organize your daily priorities, deadlines, and projects in one place.'
          }</p>
          ${
            hasActiveFilter
              ? '<button type="button" id="empty-clear-filters-btn" class="btn btn-secondary btn-sm">Reset Filters</button>'
              : '<button type="button" id="empty-create-task-btn" class="btn btn-primary btn-sm">Create First Task</button>'
          }
        </div>
      `;

      document.getElementById('empty-clear-filters-btn')?.addEventListener('click', () => {
        resetFilters();
      });
      document.getElementById('empty-create-task-btn')?.addEventListener('click', () => {
        openTaskFormModal({ defaultSettings: getSettings() });
      });
      return;
    }

    container.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th class="task-row-check"><span class="sr-only">Done</span></th>
              <th>Task</th>
              <th>Category</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Due Date</th>
              <th class="align-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${tasks
              .map((task) => {
                const isDone = task.status === 'Completed';
                return `
                  <tr>
                    <td class="task-row-check">
                      <input
                        type="checkbox"
                        class="checkbox-input"
                        data-toggle-complete="${task.id}"
                        data-current-status="${escapeHtml(task.status)}"
                        aria-label="Toggle completion for ${escapeHtml(task.title)}"
                        ${isDone ? 'checked' : ''}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        class="task-title-btn ${isDone ? 'task-completed-text' : ''}"
                        data-view-id="${task.id}"
                      >
                        ${escapeHtml(task.title)}
                      </button>
                      ${
                        task.description
                          ? `<div class="task-desc-snippet">${escapeHtml(task.description)}</div>`
                          : ''
                      }
                    </td>
                    <td>${escapeHtml(task.category)}</td>
                    <td><span class="${priorityClass(task.priority)}">${escapeHtml(task.priority)}</span></td>
                    <td><span class="${statusClass(task.status)}">${escapeHtml(task.status)}</span></td>
                    <td class="tabular-nums">
                      ${
                        task.is_overdue
                          ? `<span class="overdue-flag">Overdue · ${escapeHtml(formatDate(task.due_date))}</span>`
                          : `<span>${escapeHtml(formatDate(task.due_date))}</span>`
                      }
                    </td>
                    <td class="align-right">
                      <div class="row-actions">
                        <button type="button" class="row-action-btn" data-view-id="${task.id}">View</button>
                        <button type="button" class="row-action-btn" data-edit-id="${task.id}">Edit</button>
                        <button type="button" class="row-action-btn row-action-danger" data-delete-id="${task.id}">Delete</button>
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    // Bind table actions
    container.querySelectorAll('[data-toggle-complete]').forEach((cb) => {
      cb.addEventListener('change', async () => {
        const id = Number(cb.getAttribute('data-toggle-complete'));
        const prevStatus = cb.getAttribute('data-current-status');
        const nextStatus = prevStatus === 'Completed' ? 'Pending' : 'Completed';
        cb.disabled = true;
        try {
          await api.updateTask(id, { status: nextStatus });
          showToast(nextStatus === 'Completed' ? 'Task completed.' : 'Task reopened.');
          await refreshGlobalCounts();
          await loadAndDrawTasks();
        } catch (err) {
          cb.checked = prevStatus === 'Completed';
          cb.disabled = false;
          showToast(err.message || 'Could not update task status.', 'error');
        }
      });
    });

    container.querySelectorAll('[data-view-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openTaskDetailModal(Number(btn.getAttribute('data-view-id')));
      });
    });

    container.querySelectorAll('[data-edit-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-edit-id'));
        const found = tasks.find((t) => t.id === id);
        if (found) {
          openTaskFormModal({ task: found, defaultSettings: getSettings() });
        }
      });
    });

    container.querySelectorAll('[data-delete-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-delete-id'));
        const found = tasks.find((t) => t.id === id);
        if (!found) return;

        const confirmed = await openConfirmModal({
          title: 'Delete Task',
          message: `Permanently delete "${found.title}"?`,
          confirmLabel: 'Delete'
        });
        if (!confirmed) return;

        try {
          await api.deleteTask(id);
          showToast('Task deleted.');
          await refreshGlobalCounts();
          await loadAndDrawTasks();
        } catch (err) {
          showToast(err.message || 'Failed to delete task.', 'error');
        }
      });
    });
  }

  function resetFilters() {
    filterState.status = 'All';
    filterState.search = '';
    filterState.category = 'All';
    filterState.priority = 'All';
    filterState.sort = 'due_date:asc';

    searchInput.value = '';
    categorySelect.value = 'All';
    prioritySelect.value = 'All';
    sortSelect.value = 'due_date:asc';
    statusButtons.forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-status-tab') === 'All');
    });

    loadAndDrawTasks();
  }

  statusButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterState.status = btn.getAttribute('data-status-tab');
      statusButtons.forEach((b) => b.classList.toggle('active', b === btn));
      loadAndDrawTasks();
    });
  });

  const debouncedSearch = debounce(() => {
    filterState.search = searchInput.value.trim();
    loadAndDrawTasks();
  }, 180);

  searchInput.addEventListener('input', debouncedSearch);

  categorySelect.addEventListener('change', () => {
    filterState.category = categorySelect.value;
    loadAndDrawTasks();
  });

  prioritySelect.addEventListener('change', () => {
    filterState.priority = prioritySelect.value;
    loadAndDrawTasks();
  });

  sortSelect.addEventListener('change', () => {
    filterState.sort = sortSelect.value;
    loadAndDrawTasks();
  });

  resetBtn.addEventListener('click', resetFilters);

  await loadAndDrawTasks();
}

function populateCategorySelect(selectEl, categories, selectedValue) {
  selectEl.innerHTML = [
    '<option value="All">All Categories</option>',
    ...categories.map(
      (cat) =>
        `<option value="${escapeHtml(cat)}" ${cat === selectedValue ? 'selected' : ''}>${escapeHtml(cat)}</option>`
    )
  ].join('');
}
