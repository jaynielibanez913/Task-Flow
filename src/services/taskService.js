import {
  findAllTasks,
  findTaskById,
  createTask,
  updateTaskById,
  deleteTaskById,
  deleteCompletedTasks,
  getDistinctCategories,
  logTaskActivity,
  getRecentActivities,
  getAllTasksRaw,
  getUserSettings,
  saveUserSettings
} from '../repositories/taskRepository.js';
import { AppError } from '../validators/taskValidator.js';

export function getTodayLocalIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function enrichTask(task, todayIso) {
  if (!task) return null;
  const isOverdue = Boolean(
    task.due_date &&
    task.due_date < todayIso &&
    task.status !== 'Completed'
  );
  return {
    ...task,
    is_overdue: isOverdue
  };
}

export function listTasks(filters) {
  const todayIso = getTodayLocalIso();
  const rows = findAllTasks(filters, todayIso);
  const categories = getDistinctCategories();
  return {
    tasks: rows.map((row) => enrichTask(row, todayIso)),
    categories
  };
}

export function getTask(id) {
  const todayIso = getTodayLocalIso();
  const task = findTaskById(id);
  if (!task) {
    throw new AppError(`Task with ID ${id} was not found.`, 404);
  }
  return enrichTask(task, todayIso);
}

export function addNewTask(validatedData) {
  const now = new Date().toISOString();
  const todayIso = getTodayLocalIso();

  const created = createTask({
    ...validatedData,
    created_at: now,
    updated_at: now
  });

  logTaskActivity({
    taskId: created.id,
    taskTitle: created.title,
    action: 'created',
    details: `Created in ${created.category} (${created.priority} priority)`,
    createdAt: now
  });

  if (created.status === 'Completed') {
    logTaskActivity({
      taskId: created.id,
      taskTitle: created.title,
      action: 'completed',
      details: 'Created directly as Completed',
      createdAt: now
    });
  }

  return enrichTask(created, todayIso);
}

export function modifyTask(id, validatedUpdates) {
  const existing = findTaskById(id);
  if (!existing) {
    throw new AppError(`Task with ID ${id} was not found.`, 404);
  }

  const now = new Date().toISOString();
  const todayIso = getTodayLocalIso();

  const updated = updateTaskById(id, {
    ...validatedUpdates,
    updated_at: now
  });

  if (validatedUpdates.status && validatedUpdates.status !== existing.status) {
    const actionType = validatedUpdates.status === 'Completed' ? 'completed' : 'status_changed';
    const detailMsg =
      validatedUpdates.status === 'Completed'
        ? 'Marked task as Completed'
        : `Moved status from ${existing.status} to ${validatedUpdates.status}`;

    logTaskActivity({
      taskId: updated.id,
      taskTitle: updated.title,
      action: actionType,
      details: detailMsg,
      createdAt: now
    });
  } else {
    logTaskActivity({
      taskId: updated.id,
      taskTitle: updated.title,
      action: 'updated',
      details: `Updated details (${updated.category} · ${updated.priority})`,
      createdAt: now
    });
  }

  return enrichTask(updated, todayIso);
}

export function removeTask(id) {
  const existing = findTaskById(id);
  if (!existing) {
    throw new AppError(`Task with ID ${id} was not found.`, 404);
  }

  const now = new Date().toISOString();
  logTaskActivity({
    taskId: null,
    taskTitle: existing.title,
    action: 'deleted',
    details: `Removed from ${existing.category}`,
    createdAt: now
  });

  deleteTaskById(id);
  return { deletedId: id, title: existing.title };
}

export function clearCompleted() {
  const removedCount = deleteCompletedTasks();
  if (removedCount > 0) {
    logTaskActivity({
      taskId: null,
      taskTitle: `${removedCount} completed task${removedCount === 1 ? '' : 's'}`,
      action: 'cleared',
      details: 'Cleared completed tasks archive',
      createdAt: new Date().toISOString()
    });
  }
  return { removedCount };
}

export function getDashboardAndAnalytics() {
  const todayIso = getTodayLocalIso();
  const allTasks = getAllTasksRaw().map((t) => enrichTask(t, todayIso));
  const settings = getCurrentSettings();

  const totalTasks = allTasks.length;
  let pendingTasks = 0;
  let inProgressTasks = 0;
  let completedTasks = 0;
  let overdueTasks = 0;

  const priorityMap = {
    High: { priority: 'High', total: 0, completed: 0, pending: 0, inProgress: 0 },
    Medium: { priority: 'Medium', total: 0, completed: 0, pending: 0, inProgress: 0 },
    Low: { priority: 'Low', total: 0, completed: 0, pending: 0, inProgress: 0 }
  };

  const categoryMap = new Map();

  for (const task of allTasks) {
    if (task.status === 'Pending') pendingTasks += 1;
    else if (task.status === 'In Progress') inProgressTasks += 1;
    else if (task.status === 'Completed') completedTasks += 1;

    if (task.is_overdue) {
      overdueTasks += 1;
    }

    const pBucket = priorityMap[task.priority];
    if (pBucket) {
      pBucket.total += 1;
      if (task.status === 'Completed') pBucket.completed += 1;
      else if (task.status === 'In Progress') pBucket.inProgress += 1;
      else pBucket.pending += 1;
    }

    const catKey = task.category || 'General';
    if (!categoryMap.has(catKey)) {
      categoryMap.set(catKey, {
        category: catKey,
        total: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        overdue: 0
      });
    }
    const cBucket = categoryMap.get(catKey);
    cBucket.total += 1;
    if (task.status === 'Completed') cBucket.completed += 1;
    else if (task.status === 'In Progress') cBucket.inProgress += 1;
    else cBucket.pending += 1;
    if (task.is_overdue) cBucket.overdue += 1;
  }

  const completionPercentage =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 1000) / 10 : 0;

  // Build 7-day productivity window ending today (local calendar dates)
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weeklyDays = [];
  const dayIndexByDate = new Map();

  for (let offset = -6; offset <= 0; offset += 1) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateKey = `${yyyy}-${mm}-${dd}`;
    const entry = {
      date: dateKey,
      label: dayNames[d.getDay()],
      shortDate: `${mm}/${dd}`,
      created: 0,
      completed: 0
    };
    weeklyDays.push(entry);
    dayIndexByDate.set(dateKey, entry);
  }

  for (const task of allTasks) {
    if (task.created_at) {
      const createdDate = localDateKeyFromIso(task.created_at);
      if (dayIndexByDate.has(createdDate)) {
        dayIndexByDate.get(createdDate).created += 1;
      }
    }
    if (task.status === 'Completed' && task.updated_at) {
      const completedDate = localDateKeyFromIso(task.updated_at);
      if (dayIndexByDate.has(completedDate)) {
        dayIndexByDate.get(completedDate).completed += 1;
      }
    }
  }

  const weeklyCompletedCount = weeklyDays.reduce((acc, d) => acc + d.completed, 0);
  const weeklyCreatedCount = weeklyDays.reduce((acc, d) => acc + d.created, 0);

  const priorityDistribution = ['High', 'Medium', 'Low'].map((level) => {
    const item = priorityMap[level];
    return {
      ...item,
      percentage: totalTasks > 0 ? Math.round((item.total / totalTasks) * 1000) / 10 : 0,
      completionRate: item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0
    };
  });

  const categoryBreakdown = Array.from(categoryMap.values())
    .map((item) => ({
      ...item,
      completionRate: item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0
    }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));

  const upcomingDeadlines = allTasks
    .filter((t) => t.status !== 'Completed')
    .sort((a, b) => {
      const dateA = a.due_date || '9999-12-31';
      const dateB = b.due_date || '9999-12-31';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const pWeight = { High: 3, Medium: 2, Low: 1 };
      return (pWeight[b.priority] || 0) - (pWeight[a.priority] || 0);
    })
    .slice(0, 6);

  const completionHistory = allTasks
    .filter((t) => t.status === 'Completed')
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    .slice(0, 20);

  const recentActivities = getRecentActivities(10);

  return {
    summary: {
      totalTasks,
      pendingTasks,
      inProgressTasks,
      completedTasks,
      overdueTasks,
      activeTasks: pendingTasks + inProgressTasks,
      completionPercentage,
      weeklyCompletedCount,
      weeklyCreatedCount,
      weeklyGoal: Number(settings.weeklyGoal) || 10
    },
    weeklyProductivity: weeklyDays,
    priorityDistribution,
    categoryBreakdown,
    upcomingDeadlines,
    completionHistory,
    recentActivities
  };
}

function localDateKeyFromIso(isoTimestamp) {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return String(isoTimestamp).slice(0, 10);
  }
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getCurrentSettings() {
  const raw = getUserSettings();
  return {
    theme: raw.theme === 'dark' ? 'dark' : 'light',
    displayName: raw.displayName || 'Alex Morgan',
    defaultCategory: raw.defaultCategory || 'Work',
    defaultPriority: raw.defaultPriority || 'Medium',
    weeklyGoal: Number(raw.weeklyGoal) || 10,
    compactMode: raw.compactMode === 'true'
  };
}

export function updateSettings(validatedPrefs) {
  saveUserSettings(validatedPrefs);
  return getCurrentSettings();
}
