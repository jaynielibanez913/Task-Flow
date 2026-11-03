import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

let dbInstance = null;
let activeDbPath = null;

function formatDateOffset(daysOffset) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimestampOffset(daysOffset, hoursOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  date.setHours(date.getHours() + hoursOffset);
  return date.toISOString();
}

export function getDbPath() {
  if (process.env.DB_PATH) {
    return path.resolve(process.env.DB_PATH);
  }
  return path.join(PROJECT_ROOT, 'database', 'taskflow.db');
}

export function initDatabase(customPath = null) {
  const targetPath = customPath ? path.resolve(customPath) : getDbPath();

  if (dbInstance && activeDbPath === targetPath) {
    return dbInstance;
  }

  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignore close error on stale handle
    }
    dbInstance = null;
  }

  if (targetPath !== ':memory:') {
    const dbDir = path.dirname(targetPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  const db = new Database(targetPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'General' CHECK (length(trim(category)) > 0),
      priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
      status TEXT NOT NULL CHECK (status IN ('Pending', 'In Progress', 'Completed')),
      due_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      task_title TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS user_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  seedInitialDataIfNeeded(db);

  dbInstance = db;
  activeDbPath = targetPath;
  return dbInstance;
}

function seedInitialDataIfNeeded(db) {
  const now = new Date().toISOString();

  const defaultSettings = {
    theme: 'light',
    displayName: 'Alex Morgan',
    defaultCategory: 'Work',
    defaultPriority: 'Medium',
    weeklyGoal: '10',
    compactMode: 'false'
  };

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO user_settings (key, value, updated_at)
    VALUES (@key, @value, @updated_at)
  `);

  const seedSettingsTx = db.transaction(() => {
    for (const [key, value] of Object.entries(defaultSettings)) {
      insertSetting.run({ key, value, updated_at: now });
    }
  });
  seedSettingsTx();

  if (process.env.SKIP_SEED === 'true') {
    return;
  }

  const seededRow = db.prepare('SELECT value FROM app_meta WHERE key = ?').get('initial_seed_v1');
  if (seededRow) {
    return;
  }

  const existingCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count;
  if (existingCount > 0) {
    db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run('initial_seed_v1', '1');
    return;
  }

  const sampleTasks = [
    {
      title: 'Finalize Q4 personal productivity roadmap',
      description: 'Review quarterly milestones, align weekly focus blocks, and archive outdated backlog items.',
      category: 'Work',
      priority: 'High',
      status: 'In Progress',
      due_date: formatDateOffset(1),
      created_at: formatTimestampOffset(-4, -2),
      updated_at: formatTimestampOffset(-1, -1)
    },
    {
      title: 'Submit monthly expense report and receipts',
      description: 'Compile software subscriptions, travel invoices, and export summary sheet before finance cutoff.',
      category: 'Finance',
      priority: 'High',
      status: 'Pending',
      due_date: formatDateOffset(-2),
      created_at: formatTimestampOffset(-6, -3),
      updated_at: formatTimestampOffset(-6, -3)
    },
    {
      title: 'Prepare REST API architecture notes',
      description: 'Document validation rules, SQLite indexing strategy, and error response contracts for code review.',
      category: 'Study',
      priority: 'Medium',
      status: 'Completed',
      due_date: formatDateOffset(-1),
      created_at: formatTimestampOffset(-5, -4),
      updated_at: formatTimestampOffset(-1, -3)
    },
    {
      title: 'Complete 45-minute strength & mobility session',
      description: 'Upper body compound routine followed by 15 minutes of thoracic and hip mobility work.',
      category: 'Health',
      priority: 'Medium',
      status: 'Completed',
      due_date: formatDateOffset(0),
      created_at: formatTimestampOffset(-2, -5),
      updated_at: formatTimestampOffset(0, -2)
    },
    {
      title: 'Audit database backup and recovery script',
      description: 'Verify automated SQLite snapshot integrity and confirm restore procedure in local staging.',
      category: 'Work',
      priority: 'High',
      status: 'Completed',
      due_date: formatDateOffset(-3),
      created_at: formatTimestampOffset(-6, -1),
      updated_at: formatTimestampOffset(-3, -2)
    },
    {
      title: 'Schedule annual dental and vision checkup',
      description: 'Confirm morning appointment availability for next week and update calendar reminders.',
      category: 'Personal',
      priority: 'Low',
      status: 'Pending',
      due_date: formatDateOffset(4),
      created_at: formatTimestampOffset(-2, -1),
      updated_at: formatTimestampOffset(-2, -1)
    },
    {
      title: 'Refactor frontend state filtering module',
      description: 'Ensure search, category, and priority filters synchronize cleanly across table and board views.',
      category: 'Work',
      priority: 'Medium',
      status: 'In Progress',
      due_date: formatDateOffset(2),
      created_at: formatTimestampOffset(-3, -4),
      updated_at: formatTimestampOffset(0, -4)
    },
    {
      title: 'Read chapters 4–5 of Designing Data-Intensive Applications',
      description: 'Take structured summary notes on encoding evolution, replication logs, and read-after-write consistency.',
      category: 'Study',
      priority: 'Low',
      status: 'Completed',
      due_date: formatDateOffset(-2),
      created_at: formatTimestampOffset(-5, -1),
      updated_at: formatTimestampOffset(-2, -2)
    }
  ];

  const insertTask = db.prepare(`
    INSERT INTO tasks (title, description, category, priority, status, due_date, created_at, updated_at)
    VALUES (@title, @description, @category, @priority, @status, @due_date, @created_at, @updated_at)
  `);

  const insertLog = db.prepare(`
    INSERT INTO activity_logs (task_id, task_title, action, details, created_at)
    VALUES (@task_id, @task_title, @action, @details, @created_at)
  `);

  const seedTx = db.transaction(() => {
    for (const item of sampleTasks) {
      const info = insertTask.run(item);
      const taskId = Number(info.lastInsertRowid);

      insertLog.run({
        task_id: taskId,
        task_title: item.title,
        action: 'created',
        details: `Created in ${item.category} (${item.priority} priority)`,
        created_at: item.created_at
      });

      if (item.status === 'Completed') {
        insertLog.run({
          task_id: taskId,
          task_title: item.title,
          action: 'completed',
          details: 'Marked task as Completed',
          created_at: item.updated_at
        });
      } else if (item.status === 'In Progress') {
        insertLog.run({
          task_id: taskId,
          task_title: item.title,
          action: 'status_changed',
          details: 'Moved status from Pending to In Progress',
          created_at: item.updated_at
        });
      }
    }

    db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('initial_seed_v1', '1');
  });

  seedTx();
}

export function getDb() {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    activeDbPath = null;
  }
}
