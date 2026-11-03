export const ALLOWED_PRIORITIES = ['Low', 'Medium', 'High'];
export const ALLOWED_STATUSES = ['Pending', 'In Progress', 'Completed'];
export const ALLOWED_SORT_FIELDS = ['due_date', 'priority', 'created_at', 'updated_at', 'title', 'status'];
export const ALLOWED_SORT_ORDERS = ['asc', 'desc'];

export class AppError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function sanitizeString(value, maxLength = 500) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new AppError('Invalid input type: expected string value.', 400);
  }
  // Remove non-printable control characters except newline and tab
  const cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  if (cleaned.length > maxLength) {
    return cleaned.slice(0, maxLength);
  }
  return cleaned;
}

export function isValidIsoDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function validateTaskId(rawId) {
  const idStr = String(rawId ?? '').trim();
  if (!/^[1-9]\d*$/.test(idStr)) {
    throw new AppError('Task ID must be a positive integer.', 400);
  }
  const id = Number(idStr);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError('Task ID is out of valid range.', 400);
  }
  return id;
}

export function validateCreateTask(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('Request body must be a valid JSON object.', 400);
  }

  const errors = [];

  let title = '';
  if (typeof payload.title !== 'string') {
    errors.push({ field: 'title', message: 'Task title is required.' });
  } else {
    title = sanitizeString(payload.title, 200);
    if (title.length === 0) {
      errors.push({ field: 'title', message: 'Task title cannot be empty.' });
    } else if (payload.title.trim().length > 160) {
      errors.push({ field: 'title', message: 'Task title must be 160 characters or fewer.' });
    }
  }

  let description = '';
  if (payload.description !== undefined && payload.description !== null) {
    if (typeof payload.description !== 'string') {
      errors.push({ field: 'description', message: 'Description must be a string.' });
    } else if (payload.description.trim().length > 2000) {
      errors.push({ field: 'description', message: 'Description must be 2000 characters or fewer.' });
    } else {
      description = sanitizeString(payload.description, 2000);
    }
  }

  let category = 'General';
  if (payload.category !== undefined && payload.category !== null && String(payload.category).trim() !== '') {
    if (typeof payload.category !== 'string') {
      errors.push({ field: 'category', message: 'Category must be a string.' });
    } else if (payload.category.trim().length > 50) {
      errors.push({ field: 'category', message: 'Category must be 50 characters or fewer.' });
    } else {
      category = sanitizeString(payload.category, 50);
    }
  }

  const priority = payload.priority !== undefined ? payload.priority : 'Medium';
  if (!ALLOWED_PRIORITIES.includes(priority)) {
    errors.push({
      field: 'priority',
      message: `Priority must be one of: ${ALLOWED_PRIORITIES.join(', ')}.`
    });
  }

  const status = payload.status !== undefined ? payload.status : 'Pending';
  if (!ALLOWED_STATUSES.includes(status)) {
    errors.push({
      field: 'status',
      message: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}.`
    });
  }

  let dueDate = null;
  if (payload.due_date !== undefined && payload.due_date !== null && String(payload.due_date).trim() !== '') {
    if (typeof payload.due_date !== 'string' || !isValidIsoDate(payload.due_date.trim())) {
      errors.push({
        field: 'due_date',
        message: 'Due date must be a valid calendar date in YYYY-MM-DD format.'
      });
    } else {
      dueDate = payload.due_date.trim();
    }
  }

  if (errors.length > 0) {
    throw new AppError(errors[0].message, 400, errors);
  }

  return {
    title,
    description,
    category,
    priority,
    status,
    due_date: dueDate
  };
}

export function validateUpdateTask(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('Request body must be a valid JSON object.', 400);
  }

  const allowedKeys = ['title', 'description', 'category', 'priority', 'status', 'due_date'];
  const providedKeys = Object.keys(payload).filter((key) => allowedKeys.includes(key));

  if (providedKeys.length === 0) {
    throw new AppError('At least one valid task field must be provided for update.', 400);
  }

  const errors = [];
  const updates = {};

  if ('title' in payload) {
    if (typeof payload.title !== 'string') {
      errors.push({ field: 'title', message: 'Task title must be a string.' });
    } else {
      const cleaned = sanitizeString(payload.title, 200);
      if (cleaned.length === 0) {
        errors.push({ field: 'title', message: 'Task title cannot be empty.' });
      } else if (payload.title.trim().length > 160) {
        errors.push({ field: 'title', message: 'Task title must be 160 characters or fewer.' });
      } else {
        updates.title = cleaned;
      }
    }
  }

  if ('description' in payload) {
    if (payload.description === null) {
      updates.description = '';
    } else if (typeof payload.description !== 'string') {
      errors.push({ field: 'description', message: 'Description must be a string.' });
    } else if (payload.description.trim().length > 2000) {
      errors.push({ field: 'description', message: 'Description must be 2000 characters or fewer.' });
    } else {
      updates.description = sanitizeString(payload.description, 2000);
    }
  }

  if ('category' in payload) {
    if (typeof payload.category !== 'string') {
      errors.push({ field: 'category', message: 'Category must be a string.' });
    } else {
      const cleaned = sanitizeString(payload.category, 60);
      if (cleaned.length === 0) {
        errors.push({ field: 'category', message: 'Category cannot be empty.' });
      } else if (payload.category.trim().length > 50) {
        errors.push({ field: 'category', message: 'Category must be 50 characters or fewer.' });
      } else {
        updates.category = cleaned;
      }
    }
  }

  if ('priority' in payload) {
    if (!ALLOWED_PRIORITIES.includes(payload.priority)) {
      errors.push({
        field: 'priority',
        message: `Priority must be one of: ${ALLOWED_PRIORITIES.join(', ')}.`
      });
    } else {
      updates.priority = payload.priority;
    }
  }

  if ('status' in payload) {
    if (!ALLOWED_STATUSES.includes(payload.status)) {
      errors.push({
        field: 'status',
        message: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}.`
      });
    } else {
      updates.status = payload.status;
    }
  }

  if ('due_date' in payload) {
    if (payload.due_date === null || String(payload.due_date).trim() === '') {
      updates.due_date = null;
    } else if (typeof payload.due_date !== 'string' || !isValidIsoDate(payload.due_date.trim())) {
      errors.push({
        field: 'due_date',
        message: 'Due date must be a valid calendar date in YYYY-MM-DD format.'
      });
    } else {
      updates.due_date = payload.due_date.trim();
    }
  }

  if (errors.length > 0) {
    throw new AppError(errors[0].message, 400, errors);
  }

  return updates;
}

export function validateTaskFilters(query = {}) {
  const filters = {
    search: '',
    status: '',
    priority: '',
    category: '',
    overdue: false,
    sortBy: 'due_date',
    sortOrder: 'asc'
  };

  if (typeof query.search === 'string' && query.search.trim().length > 0) {
    filters.search = sanitizeString(query.search, 120);
  }

  if (typeof query.status === 'string' && query.status.trim().length > 0 && query.status !== 'All') {
    if (query.status === 'Overdue') {
      filters.overdue = true;
    } else if (ALLOWED_STATUSES.includes(query.status)) {
      filters.status = query.status;
    } else {
      throw new AppError(`Invalid status filter. Allowed values: ${ALLOWED_STATUSES.join(', ')}.`, 400);
    }
  }

  if (query.overdue === 'true' || query.overdue === '1') {
    filters.overdue = true;
  }

  if (typeof query.priority === 'string' && query.priority.trim().length > 0 && query.priority !== 'All') {
    if (!ALLOWED_PRIORITIES.includes(query.priority)) {
      throw new AppError(`Invalid priority filter. Allowed values: ${ALLOWED_PRIORITIES.join(', ')}.`, 400);
    }
    filters.priority = query.priority;
  }

  if (typeof query.category === 'string' && query.category.trim().length > 0 && query.category !== 'All') {
    filters.category = sanitizeString(query.category, 50);
  }

  if (typeof query.sortBy === 'string' && ALLOWED_SORT_FIELDS.includes(query.sortBy)) {
    filters.sortBy = query.sortBy;
  }

  if (typeof query.sortOrder === 'string' && ALLOWED_SORT_ORDERS.includes(query.sortOrder.toLowerCase())) {
    filters.sortOrder = query.sortOrder.toLowerCase();
  }

  return filters;
}

export function validateSettingsUpdate(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('Settings payload must be a valid JSON object.', 400);
  }

  const sanitized = {};

  if ('theme' in payload) {
    if (!['light', 'dark'].includes(payload.theme)) {
      throw new AppError('Theme must be either "light" or "dark".', 400);
    }
    sanitized.theme = payload.theme;
  }

  if ('displayName' in payload) {
    const cleaned = sanitizeString(String(payload.displayName), 60);
    if (!cleaned) {
      throw new AppError('Display name cannot be empty.', 400);
    }
    sanitized.displayName = cleaned;
  }

  if ('defaultCategory' in payload) {
    const cleaned = sanitizeString(String(payload.defaultCategory), 50);
    if (!cleaned) {
      throw new AppError('Default category cannot be empty.', 400);
    }
    sanitized.defaultCategory = cleaned;
  }

  if ('defaultPriority' in payload) {
    if (!ALLOWED_PRIORITIES.includes(payload.defaultPriority)) {
      throw new AppError(`Default priority must be one of: ${ALLOWED_PRIORITIES.join(', ')}.`, 400);
    }
    sanitized.defaultPriority = payload.defaultPriority;
  }

  if ('weeklyGoal' in payload) {
    const goal = Number(payload.weeklyGoal);
    if (!Number.isInteger(goal) || goal < 1 || goal > 200) {
      throw new AppError('Weekly task goal must be a whole number between 1 and 200.', 400);
    }
    sanitized.weeklyGoal = String(goal);
  }

  if ('compactMode' in payload) {
    sanitized.compactMode = String(Boolean(payload.compactMode === true || payload.compactMode === 'true'));
  }

  if (Object.keys(sanitized).length === 0) {
    throw new AppError('No valid preference fields provided.', 400);
  }

  return sanitized;
}
