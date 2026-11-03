import { api } from '../api.js';
import {
  escapeHtml,
  formatDate,
  priorityClass,
  debounce,
  showToast
} from '../utils.js';
import { openTaskDetailModal, openTaskFormModal } from '../modal.js';

const DEFAULT_CATEGORIES = ['Work', 'Personal', 'Study', 'Health', 'Finance', 'General'];

const boardFilters = {
  search: '',
  category: 'All',
  priority: 'All'
};

export async function renderBoardView({ refreshGlobalCounts, getSettings }) {
  const searchInput = document.getElementById('board-search-input');
  const categorySelect = document.getElementById('board-category-filter');
  const prioritySelect = document.getElementById('board-priority-filter');

  searchInput.value = boardFilters.search;
  prioritySelect.value = boardFilters.priority;

  document.querySelectorAll('[data-quick-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const status = btn.getAttribute('data-quick-add');
      openTaskFormModal({ presetStatus: status, defaultSettings: getSettings() });
    });
  });

  let draggedTaskId = null;

  async function loadBoard() {
    const query = { sortBy: 'priority', sortOrder: 'desc' };
    if (boardFilters.search) query.search = boardFilters.search;
    if (boardFilters.category !== 'All') query.category = boardFilters.category;
    if (boardFilters.priority !== 'All') query.priority = boardFilters.priority;

    const res = await api.getTasks(query);
    const tasks = res.data;

    const mergedCategories = Array.from(
      new Set([...DEFAULT_CATEGORIES, ...(res.categories || [])])
    ).sort((a, b) => a.localeCompare(b));

    categorySelect.innerHTML = [
      '<option value="All">All Categories</option>',
      ...mergedCategories.map(
        (c) => `<option value="${escapeHtml(c)}" ${c === boardFilters.category ? 'selected' : ''}>${escapeHtml(c)}</option>`
      )
    ].join('');

    const grouped = {
      Pending: [],
      'In Progress': [],
      Completed: []
    };

    for (const task of tasks) {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    }

    document.getElementById('board-count-pending').textContent = String(grouped.Pending.length);
    document.getElementById('board-count-inprogress').textContent = String(grouped['In Progress'].length);
    document.getElementById('board-count-completed').textContent = String(grouped.Completed.length);

    renderColumn('board-col-pending', grouped.Pending, 'No pending tasks');
    renderColumn('board-col-inprogress', grouped['In Progress'], 'No tasks in progress');
    renderColumn('board-col-completed', grouped.Completed, 'No completed tasks');
  }

  function renderColumn(elementId, list, emptyLabel) {
    const colEl = document.getElementById(elementId);
    if (list.length === 0) {
      colEl.innerHTML = `<div class="empty-column-note">${escapeHtml(emptyLabel)}</div>`;
      return;
    }

    colEl.innerHTML = list
      .map(
        (task) => `
        <article class="board-card" draggable="true" data-card-id="${task.id}">
          <div class="board-card-kicker">
            <span>${escapeHtml(task.category)}</span>
            <span aria-hidden="true">·</span>
            <span class="${priorityClass(task.priority)}">${escapeHtml(task.priority)} Priority</span>
          </div>

          <button type="button" class="board-card-title ${task.status === 'Completed' ? 'task-completed-text' : ''}" data-card-view="${task.id}">
            ${escapeHtml(task.title)}
          </button>

          ${
            task.description
              ? `<p class="board-card-desc">${escapeHtml(task.description)}</p>`
              : ''
          }

          <div class="board-card-footer">
            <span class="board-card-due tabular-nums ${task.is_overdue ? 'overdue-flag' : ''}">
              ${
                task.is_overdue
                  ? `Overdue · ${escapeHtml(formatDate(task.due_date))}`
                  : escapeHtml(formatDate(task.due_date))
              }
            </span>

            <select
              class="form-select form-select-compact"
              data-card-status="${task.id}"
              aria-label="Update status for ${escapeHtml(task.title)}"
            >
              <option value="Pending" ${task.status === 'Pending' ? 'selected' : ''}>Pending</option>
              <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
              <option value="Completed" ${task.status === 'Completed' ? 'selected' : ''}>Completed</option>
            </select>
          </div>
        </article>
      `
      )
      .join('');

    colEl.querySelectorAll('[data-card-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openTaskDetailModal(Number(btn.getAttribute('data-card-view')));
      });
    });

    colEl.querySelectorAll('[data-card-status]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const taskId = Number(sel.getAttribute('data-card-status'));
        const nextStatus = sel.value;
        sel.disabled = true;
        try {
          await api.updateTask(taskId, { status: nextStatus });
          showToast(`Moved to ${nextStatus}.`);
          await refreshGlobalCounts();
          await loadBoard();
        } catch (err) {
          sel.disabled = false;
          showToast(err.message || 'Could not move task.', 'error');
        }
      });
    });

    colEl.querySelectorAll('[data-card-id]').forEach((card) => {
      card.addEventListener('dragstart', (event) => {
        draggedTaskId = Number(card.getAttribute('data-card-id'));
        card.classList.add('dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(draggedTaskId));
        }
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        draggedTaskId = null;
        document.querySelectorAll('.kanban-dropzone').forEach((dz) => dz.classList.remove('drag-over'));
      });
    });
  }

  // Bind Drag & Drop on columns
  document.querySelectorAll('.kanban-dropzone').forEach((zone) => {
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', async (event) => {
      event.preventDefault();
      zone.classList.remove('drag-over');
      const targetStatus = zone.getAttribute('data-drop-status');
      const idFromTransfer = Number(event.dataTransfer?.getData('text/plain')) || draggedTaskId;
      if (!idFromTransfer || !targetStatus) return;

      try {
        await api.updateTask(idFromTransfer, { status: targetStatus });
        showToast(`Moved to ${targetStatus}.`);
        await refreshGlobalCounts();
        await loadBoard();
      } catch (err) {
        showToast(err.message || 'Unable to move card.', 'error');
      }
    });
  });

  const debouncedFilter = debounce(() => {
    boardFilters.search = searchInput.value.trim();
    loadBoard();
  }, 180);

  searchInput.addEventListener('input', debouncedFilter);
  categorySelect.addEventListener('change', () => {
    boardFilters.category = categorySelect.value;
    loadBoard();
  });
  prioritySelect.addEventListener('change', () => {
    boardFilters.priority = prioritySelect.value;
    loadBoard();
  });

  await loadBoard();
}
