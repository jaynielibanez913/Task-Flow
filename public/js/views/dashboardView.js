import { api } from '../api.js';
import {
  escapeHtml,
  formatDate,
  formatRelativeTime,
  priorityClass,
  statusClass,
  showToast
} from '../utils.js';
import { openTaskDetailModal, openTaskFormModal } from '../modal.js';

export async function renderDashboardView({ navigateTo, refreshGlobalCounts, getSettings }) {
  const response = await api.getDashboard();
  const {
    summary,
    weeklyProductivity,
    priorityDistribution,
    upcomingDeadlines,
    recentActivities
  } = response.data;

  // Bind navigation shortcut links
  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigateTo(btn.getAttribute('data-goto'));
    });
  });

  // Populate 5 Summary KPIs
  document.getElementById('kpi-total').textContent = String(summary.totalTasks);
  document.getElementById('kpi-pending').textContent = String(summary.pendingTasks);
  document.getElementById('kpi-in-progress').textContent = String(summary.inProgressTasks);
  document.getElementById('kpi-completed').textContent = String(summary.completedTasks);

  const overdueEl = document.getElementById('kpi-overdue');
  overdueEl.textContent = String(summary.overdueTasks);
  overdueEl.classList.toggle('metric-danger', summary.overdueTasks > 0);
  document.getElementById('kpi-overdue-note').textContent =
    summary.overdueTasks > 0 ? 'Requires attention' : 'All on schedule';

  document.getElementById('kpi-completion-sub').textContent = `${summary.completionPercentage}% completed`;
  document.getElementById('dashboard-goal-summary').textContent =
    `Weekly Goal: ${summary.weeklyCompletedCount} / ${summary.weeklyGoal} completed`;

  // Progress bar
  document.getElementById('dashboard-rate-figure').textContent = `${summary.completionPercentage}%`;
  const fillEl = document.getElementById('dashboard-progress-fill');
  fillEl.style.width = `${Math.min(100, summary.completionPercentage)}%`;
  document
    .getElementById('dashboard-progress-bar-role')
    .setAttribute('aria-valuenow', String(summary.completionPercentage));
  document.getElementById('dashboard-progress-label').textContent =
    `${summary.completedTasks} of ${summary.totalTasks} tasks completed`;

  // 7-Day Weekly Bar Chart
  const chartContainer = document.getElementById('dashboard-weekly-chart');
  const maxDayCompleted = Math.max(1, ...weeklyProductivity.map((d) => d.completed));
  chartContainer.innerHTML = weeklyProductivity
    .map((day) => {
      const heightPct = day.completed > 0 ? Math.max(10, Math.round((day.completed / maxDayCompleted) * 100)) : 4;
      return `
        <div class="bar-col">
          <span class="bar-count tabular-nums">${day.completed}</span>
          <div class="bar-track" title="${escapeHtml(day.label)} (${escapeHtml(day.shortDate)}): ${day.completed} completed">
            <div class="bar-fill" style="height: ${heightPct}%"></div>
          </div>
          <span class="bar-day-label">${escapeHtml(day.label)}</span>
          <span class="bar-date-sub">${escapeHtml(day.shortDate)}</span>
        </div>
      `;
    })
    .join('');

  // Priority Breakdown
  const priorityList = document.getElementById('dashboard-priority-list');
  priorityList.innerHTML = priorityDistribution
    .map((item) => {
      const barColorClass =
        item.priority === 'High'
          ? 'priority-bar-high'
          : item.priority === 'Medium'
            ? 'priority-bar-medium'
            : 'priority-bar-low';
      return `
        <div class="priority-row">
          <div class="priority-row-top">
            <span class="priority-row-name">${escapeHtml(item.priority)} Priority</span>
            <span class="priority-row-stats tabular-nums">${item.total} tasks · ${item.percentage}% (${item.completed} done)</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${barColorClass}" style="width: ${Math.min(100, item.percentage)}%"></div>
          </div>
        </div>
      `;
    })
    .join('');

  // Upcoming & Overdue Deadlines Table
  const deadlinesContainer = document.getElementById('dashboard-deadlines-container');
  if (upcomingDeadlines.length === 0) {
    deadlinesContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No pending deadlines</div>
        <p class="empty-state-desc">All scheduled tasks are completed. Create a new task to plan your next milestone.</p>
        <button type="button" id="dashboard-empty-add-btn" class="btn btn-primary btn-sm">Create Task</button>
      </div>
    `;
    document.getElementById('dashboard-empty-add-btn')?.addEventListener('click', () => {
      openTaskFormModal({ defaultSettings: getSettings() });
    });
  } else {
    deadlinesContainer.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th class="task-row-check"><span class="sr-only">Complete</span></th>
              <th>Task</th>
              <th>Status</th>
              <th class="align-right">Due Date</th>
            </tr>
          </thead>
          <tbody>
            ${upcomingDeadlines
              .map(
                (t) => `
              <tr>
                <td class="task-row-check">
                  <input
                    type="checkbox"
                    class="checkbox-input"
                    data-quick-complete="${t.id}"
                    aria-label="Mark ${escapeHtml(t.title)} as completed"
                  />
                </td>
                <td>
                  <button type="button" class="task-title-btn" data-view-task="${t.id}">
                    ${escapeHtml(t.title)}
                  </button>
                  <div class="meta-inline">
                    <span>${escapeHtml(t.category)}</span>
                    <span aria-hidden="true">·</span>
                    <span class="${priorityClass(t.priority)}">${escapeHtml(t.priority)}</span>
                  </div>
                </td>
                <td>
                  <span class="${statusClass(t.status)}">${escapeHtml(t.status)}</span>
                </td>
                <td class="align-right tabular-nums">
                  ${
                    t.is_overdue
                      ? `<span class="overdue-flag">Overdue · ${escapeHtml(formatDate(t.due_date))}</span>`
                      : `<span>${escapeHtml(formatDate(t.due_date))}</span>`
                  }
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    deadlinesContainer.querySelectorAll('[data-view-task]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openTaskDetailModal(Number(btn.getAttribute('data-view-task')));
      });
    });

    deadlinesContainer.querySelectorAll('[data-quick-complete]').forEach((checkbox) => {
      checkbox.addEventListener('change', async () => {
        const taskId = Number(checkbox.getAttribute('data-quick-complete'));
        checkbox.disabled = true;
        try {
          await api.updateTask(taskId, { status: 'Completed' });
          showToast('Task marked as Completed.');
          await refreshGlobalCounts();
          await renderDashboardView({ navigateTo, refreshGlobalCounts, getSettings });
        } catch (err) {
          checkbox.checked = false;
          checkbox.disabled = false;
          showToast(err.message || 'Could not update task.', 'error');
        }
      });
    });
  }

  // Recent Activity Feed
  const activityContainer = document.getElementById('dashboard-activity-list');
  if (recentActivities.length === 0) {
    activityContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No activity yet</div>
        <p class="empty-state-desc">Task updates, completions, and edits will appear here chronologically.</p>
      </div>
    `;
  } else {
    activityContainer.innerHTML = recentActivities
      .map(
        (act) => `
        <div class="activity-item">
          <div>
            <div class="activity-text">
              <strong>${escapeHtml(act.task_title)}</strong>
            </div>
            <div class="activity-sub">${escapeHtml(act.details || act.action)}</div>
          </div>
          <span class="activity-time tabular-nums">${escapeHtml(formatRelativeTime(act.created_at))}</span>
        </div>
      `
      )
      .join('');
  }
}
