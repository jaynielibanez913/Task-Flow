import { api } from '../api.js';
import {
  escapeHtml,
  formatDateTime,
  priorityClass,
  downloadTasksCsv,
  showToast
} from '../utils.js';
import { openTaskDetailModal } from '../modal.js';

export async function renderReportsView() {
  const response = await api.getDashboard();
  const {
    summary,
    weeklyProductivity,
    priorityDistribution,
    categoryBreakdown,
    completionHistory
  } = response.data;

  // Summary strip
  document.getElementById('rep-completed-total').textContent = String(summary.completedTasks);
  document.getElementById('rep-total-context').textContent = `Out of ${summary.totalTasks} total tasks`;
  document.getElementById('rep-completion-pct').textContent = `${summary.completionPercentage}%`;
  document.getElementById('rep-weekly-completed').textContent = String(summary.weeklyCompletedCount);
  document.getElementById('rep-weekly-created').textContent = `${summary.weeklyCreatedCount} created in last 7 days`;
  document.getElementById('rep-active-backlog').textContent = String(summary.activeTasks);

  const overdueEl = document.getElementById('rep-overdue-context');
  overdueEl.textContent = `${summary.overdueTasks} overdue`;
  overdueEl.classList.toggle('overdue-flag', summary.overdueTasks > 0);

  // Dual Bar Weekly Chart (Completed vs Created)
  const weeklyChart = document.getElementById('reports-weekly-chart');
  const maxVal = Math.max(
    1,
    ...weeklyProductivity.map((d) => Math.max(d.completed, d.created))
  );

  weeklyChart.innerHTML = weeklyProductivity
    .map((day) => {
      const compHeight = day.completed > 0 ? Math.max(8, Math.round((day.completed / maxVal) * 100)) : 3;
      const creHeight = day.created > 0 ? Math.max(8, Math.round((day.created / maxVal) * 100)) : 3;
      return `
        <div class="bar-col">
          <span class="bar-count tabular-nums">${day.completed}/${day.created}</span>
          <div class="dual-bar-pair" title="${escapeHtml(day.label)} (${escapeHtml(day.shortDate)}): ${day.completed} completed, ${day.created} created">
            <div class="dual-bar dual-bar-completed" style="height: ${compHeight}%"></div>
            <div class="dual-bar dual-bar-created" style="height: ${creHeight}%"></div>
          </div>
          <span class="bar-day-label">${escapeHtml(day.label)}</span>
          <span class="bar-date-sub">${escapeHtml(day.shortDate)}</span>
        </div>
      `;
    })
    .join('');

  // Priority Distribution
  const priorityDistEl = document.getElementById('reports-priority-dist');
  priorityDistEl.innerHTML = priorityDistribution
    .map((item) => {
      const barClass =
        item.priority === 'High'
          ? 'priority-bar-high'
          : item.priority === 'Medium'
            ? 'priority-bar-medium'
            : 'priority-bar-low';
      return `
        <div class="priority-row">
          <div class="priority-row-top">
            <span class="priority-row-name">${escapeHtml(item.priority)} Priority</span>
            <span class="priority-row-stats tabular-nums">
              ${item.total} total (${item.percentage}%) · ${item.completionRate}% completed
            </span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${barClass}" style="width: ${Math.min(100, item.percentage)}%"></div>
          </div>
        </div>
      `;
    })
    .join('');

  // Category Breakdown Table
  const catTableContainer = document.getElementById('reports-category-table');
  if (categoryBreakdown.length === 0) {
    catTableContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No category data</div>
        <p class="empty-state-desc">Add tasks with categories to view completion metrics by domain.</p>
      </div>
    `;
  } else {
    catTableContainer.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th class="align-right">Total</th>
              <th class="align-right">Completed</th>
              <th class="align-right">Rate</th>
            </tr>
          </thead>
          <tbody>
            ${categoryBreakdown
              .map(
                (cat) => `
              <tr>
                <td><strong>${escapeHtml(cat.category)}</strong></td>
                <td class="align-right tabular-nums">${cat.total}</td>
                <td class="align-right tabular-nums">${cat.completed}</td>
                <td class="align-right tabular-nums">${cat.completionRate}%</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Task Completion History Table
  const historyContainer = document.getElementById('reports-history-table');
  if (completionHistory.length === 0) {
    historyContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No completed tasks yet</div>
        <p class="empty-state-desc">Tasks marked as Completed will be recorded here with timestamps.</p>
      </div>
    `;
  } else {
    historyContainer.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Completed Task</th>
              <th>Priority</th>
              <th class="align-right">Completed At</th>
            </tr>
          </thead>
          <tbody>
            ${completionHistory
              .map(
                (task) => `
              <tr>
                <td>
                  <button type="button" class="task-title-btn" data-history-view="${task.id}">
                    ${escapeHtml(task.title)}
                  </button>
                  <div class="meta-inline"><span>${escapeHtml(task.category)}</span></div>
                </td>
                <td><span class="${priorityClass(task.priority)}">${escapeHtml(task.priority)}</span></td>
                <td class="align-right tabular-nums">${escapeHtml(formatDateTime(task.updated_at))}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    historyContainer.querySelectorAll('[data-history-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openTaskDetailModal(Number(btn.getAttribute('data-history-view')));
      });
    });
  }

  // CSV Export Button
  document.getElementById('reports-export-csv-btn')?.addEventListener('click', async () => {
    try {
      const allTasksRes = await api.getTasks({ sortBy: 'created_at', sortOrder: 'desc' });
      downloadTasksCsv(allTasksRes.data, 'taskflow-analytics-export.csv');
      showToast('CSV report downloaded.');
    } catch (err) {
      showToast(err.message || 'Unable to export CSV.', 'error');
    }
  });
}
