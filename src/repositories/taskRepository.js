import { getDb } from '../config/database.js';

export function findAllTasks(filters = {}, todayIsoDate) {
  const db = getDb();
  const conditions = [];
  const params = {};

  if (filters.search) {
    conditions.push(
      '(LOWER(title) LIKE @search OR LOWER(description) LIKE @search OR LOWER(category) LIKE @search)'
    );
    params.search = `%${filters.search.toLowerCase()}%`;
  }

  if (filters.status) {
    conditions.push('status = @status');
    params.status = filters.status;
  }

  if (filters.priority) {
    conditions.push('priority = @priority');
    params.priority = filters.priority;
  }

  if (filters.category) {
    conditions.push('LOWER(category) = LOWER(@category)');
    params.category = filters.category;
  }

  if (filters.overdue) {
    conditions.push("due_date IS NOT NULL AND due_date != '' AND due_date < @today AND status != 'Completed'");
    params.today = todayIsoDate;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const direction = filters.sortOrder === 'desc' ? 'DESC' : 'ASC';

  let orderClause = 'ORDER BY created_at DESC';
  switch (filters.sortBy) {
    case 'due_date':
      orderClause = `ORDER BY CASE WHEN due_date IS NULL OR due_date = '' THEN 1 ELSE 0 END ASC, due_date ${direction}, id DESC`;
      break;
    case 'priority':
      orderClause = `ORDER BY CASE priority WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 1 ELSE 0 END ${direction}, COALESCE(due_date, '9999-12-31') ASC`;
      break;
    case 'title':
      orderClause = `ORDER BY LOWER(title) ${direction}, id DESC`;
      break;
    case 'status':
      orderClause = `ORDER BY CASE status WHEN 'Pending' THEN 1 WHEN 'In Progress' THEN 2 WHEN 'Completed' THEN 3 ELSE 4 END ${direction}, id DESC`;
      break;
    case 'updated_at':
      orderClause = `ORDER BY updated_at ${direction}, id DESC`;
      break;
    case 'created_at':
    default:
      orderClause = `ORDER BY created_at ${direction}, id DESC`;
      break;
  }

  const sql = `
    SELECT id, title, description, category, priority, status, due_date, created_at, updated_at
    FROM tasks
    ${whereClause}
    ${orderClause}
  `;

  return db.prepare(sql).all(params);
}

export function findTaskById(id) {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT id, title, description, category, priority, status, due_date, created_at, updated_at
         FROM tasks
         WHERE id = ?`
      )
      .get(id) || null
  );
}

export function createTask(taskData) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO tasks (title, description, category, priority, status, due_date, created_at, updated_at)
    VALUES (@title, @description, @category, @priority, @status, @due_date, @created_at, @updated_at)
  `);
  const info = stmt.run(taskData);
  return findTaskById(Number(info.lastInsertRowid));
}

export function updateTaskById(id, fields) {
  const db = getDb();
  const assignments = [];
  const params = { id };

  for (const [key, value] of Object.entries(fields)) {
    assignments.push(`${key} = @${key}`);
    params[key] = value;
  }

  const sql = `
    UPDATE tasks
    SET ${assignments.join(', ')}
    WHERE id = @id
  `;

  const info = db.prepare(sql).run(params);
  if (info.changes === 0) {
    return null;
  }
  return findTaskById(id);
}

export function deleteTaskById(id) {
  const db = getDb();
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return info.changes > 0;
}

export function deleteCompletedTasks() {
  const db = getDb();
  const info = db.prepare("DELETE FROM tasks WHERE status = 'Completed'").run();
  return info.changes;
}

export function getDistinctCategories() {
  const db = getDb();
  const rows = db
    .prepare('SELECT DISTINCT category FROM tasks ORDER BY LOWER(category) ASC')
    .all();
  return rows.map((r) => r.category);
}

export function logTaskActivity({ taskId, taskTitle, action, details, createdAt }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO activity_logs (task_id, task_title, action, details, created_at)
    VALUES (@taskId, @taskTitle, @action, @details, @createdAt)
  `).run({
    taskId: taskId ?? null,
    taskTitle,
    action,
    details: details || '',
    createdAt: createdAt || new Date().toISOString()
  });
}

export function getRecentActivities(limit = 10) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, task_id, task_title, action, details, created_at
       FROM activity_logs
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(limit);
}

export function getAllTasksRaw() {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, title, description, category, priority, status, due_date, created_at, updated_at
       FROM tasks
       ORDER BY updated_at DESC, id DESC`
    )
    .all();
}

export function getUserSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM user_settings').all();
  const result = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function saveUserSettings(settingsObj) {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO user_settings (key, value, updated_at)
    VALUES (@key, @value, @updated_at)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(settingsObj)) {
      stmt.run({ key, value: String(value), updated_at: now });
    }
  });
  tx();

  return getUserSettings();
}
