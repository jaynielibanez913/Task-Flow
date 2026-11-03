import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.SKIP_SEED = 'true';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-test-'));
const testDbPath = path.join(tempDir, 'test-taskflow.db');
process.env.DB_PATH = testDbPath;

import { app } from '../src/app.js';
import { initDatabase, closeDatabase } from '../src/config/database.js';

let server = null;
let baseUrl = '';

async function apiRequest(endpoint, options = {}) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const body = await res.json();
  return { status: res.status, headers: res.headers, body };
}

describe('TaskFlow REST API, Validation & SQLite Persistence Suite', () => {
  before(async () => {
    initDatabase(testDbPath);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  let createdTaskId = null;

  it('sets security headers and serves empty initial state cleanly', async () => {
    const { status, headers, body } = await apiRequest('/api/tasks');
    assert.equal(status, 200);
    assert.equal(headers.get('x-content-type-options'), 'nosniff');
    assert.equal(body.success, true);
    assert.equal(body.count, 0);
    assert.deepEqual(body.data, []);
  });

  it('creates tasks with valid data and stores timestamps', async () => {
    const { status, body } = await apiRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Design SQLite schema',
        description: 'Apply NOT NULL and CHECK constraints',
        category: 'Work',
        priority: 'High',
        status: 'In Progress',
        due_date: '2099-12-31'
      })
    });

    assert.equal(status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.title, 'Design SQLite schema');
    assert.equal(body.data.priority, 'High');
    assert.equal(body.data.status, 'In Progress');
    assert.equal(body.data.is_overdue, false);
    assert.ok(Number.isInteger(body.data.id));
    assert.ok(body.data.created_at);
    createdTaskId = body.data.id;
  });

  it('retrieves a specific task by ID', async () => {
    const { status, body } = await apiRequest(`/api/tasks/${createdTaskId}`);
    assert.equal(status, 200);
    assert.equal(body.data.id, createdTaskId);
    assert.equal(body.data.category, 'Work');
  });

  it('updates task fields and marks task as Completed', async () => {
    const { status, body } = await apiRequest(`/api/tasks/${createdTaskId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: 'Design & verify SQLite schema',
        status: 'Completed',
        priority: 'Medium'
      })
    });

    assert.equal(status, 200);
    assert.equal(body.data.title, 'Design & verify SQLite schema');
    assert.equal(body.data.status, 'Completed');
    assert.equal(body.data.priority, 'Medium');
  });

  it('rejects invalid priority, status, due dates, empty titles, and invalid IDs', async () => {
    const emptyTitle = await apiRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: '   ', priority: 'Low', status: 'Pending' })
    });
    assert.equal(emptyTitle.status, 400);

    const badPriority = await apiRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test', priority: 'Urgent', status: 'Pending' })
    });
    assert.equal(badPriority.status, 400);

    const badStatus = await apiRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test', priority: 'Low', status: 'Archived' })
    });
    assert.equal(badStatus.status, 400);

    const badDate = await apiRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test', priority: 'Low', status: 'Pending', due_date: '2026-02-30' })
    });
    assert.equal(badDate.status, 400);

    const badId = await apiRequest('/api/tasks/not-an-int');
    assert.equal(badId.status, 400);

    const missingTask = await apiRequest('/api/tasks/999999');
    assert.equal(missingTask.status, 404);
  });

  it('restricts unsupported HTTP methods with 405 Method Not Allowed', async () => {
    const res = await apiRequest('/api/dashboard', { method: 'DELETE' });
    assert.equal(res.status, 405);
  });

  it('supports search, filtering, sorting, and parameterized SQL injection resistance', async () => {
    await apiRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Overdue tax filing',
        description: 'Quarterly statement',
        category: 'Finance',
        priority: 'High',
        status: 'Pending',
        due_date: '2020-01-01'
      })
    });

    await apiRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Morning run 5km',
        description: 'Zone 2 aerobic pace',
        category: 'Health',
        priority: 'Low',
        status: 'In Progress',
        due_date: '2099-06-15'
      })
    });

    const searchRes = await apiRequest('/api/tasks?search=aerobic');
    assert.equal(searchRes.status, 200);
    assert.equal(searchRes.body.count, 1);
    assert.equal(searchRes.body.data[0].title, 'Morning run 5km');

    const overdueRes = await apiRequest('/api/tasks?status=Overdue');
    assert.equal(overdueRes.status, 200);
    assert.equal(overdueRes.body.count, 1);
    assert.equal(overdueRes.body.data[0].title, 'Overdue tax filing');
    assert.equal(overdueRes.body.data[0].is_overdue, true);

    const injectionAttempt = await apiRequest(
      `/api/tasks?search=${encodeURIComponent("'; DROP TABLE tasks; --")}`
    );
    assert.equal(injectionAttempt.status, 200);
    assert.equal(injectionAttempt.body.count, 0);

    const verifyIntact = await apiRequest('/api/tasks');
    assert.equal(verifyIntact.body.count, 3);
  });

  it('computes accurate dashboard statistics and analytics from SQLite data', async () => {
    const { status, body } = await apiRequest('/api/dashboard');
    assert.equal(status, 200);
    const { summary, priorityDistribution, completionHistory } = body.data;

    assert.equal(summary.totalTasks, 3);
    assert.equal(summary.completedTasks, 1);
    assert.equal(summary.pendingTasks, 1);
    assert.equal(summary.inProgressTasks, 1);
    assert.equal(summary.overdueTasks, 1);
    assert.equal(summary.completionPercentage, 33.3);
    assert.equal(priorityDistribution.length, 3);
    assert.equal(completionHistory.length, 1);
  });

  it('persists tasks and user preferences across database close and re-initialization', async () => {
    const prefRes = await apiRequest('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        theme: 'dark',
        displayName: 'Jordan Lee',
        weeklyGoal: 15
      })
    });
    assert.equal(prefRes.status, 200);
    assert.equal(prefRes.body.data.theme, 'dark');

    // Simulate server restart by closing and reopening SQLite connection
    closeDatabase();
    initDatabase(testDbPath);

    const afterRestartTasks = await apiRequest('/api/tasks');
    assert.equal(afterRestartTasks.body.count, 3);

    const afterRestartSettings = await apiRequest('/api/settings');
    assert.equal(afterRestartSettings.body.data.displayName, 'Jordan Lee');
    assert.equal(afterRestartSettings.body.data.weeklyGoal, 15);
  });

  it('deletes tasks cleanly and updates totals', async () => {
    const delRes = await apiRequest(`/api/tasks/${createdTaskId}`, {
      method: 'DELETE'
    });
    assert.equal(delRes.status, 200);

    const getDeleted = await apiRequest(`/api/tasks/${createdTaskId}`);
    assert.equal(getDeleted.status, 404);

    const dash = await apiRequest('/api/dashboard');
    assert.equal(dash.body.data.summary.totalTasks, 2);
  });
});
