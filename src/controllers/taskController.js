import {
  validateTaskId,
  validateCreateTask,
  validateUpdateTask,
  validateTaskFilters
} from '../validators/taskValidator.js';
import {
  listTasks,
  getTask,
  addNewTask,
  modifyTask,
  removeTask,
  clearCompleted
} from '../services/taskService.js';

export function getAllTasksHandler(req, res, next) {
  try {
    const filters = validateTaskFilters(req.query);
    const result = listTasks(filters);
    res.status(200).json({
      success: true,
      count: result.tasks.length,
      categories: result.categories,
      data: result.tasks
    });
  } catch (err) {
    next(err);
  }
}

export function getTaskByIdHandler(req, res, next) {
  try {
    const id = validateTaskId(req.params.id);
    const task = getTask(id);
    res.status(200).json({
      success: true,
      data: task
    });
  } catch (err) {
    next(err);
  }
}

export function createTaskHandler(req, res, next) {
  try {
    const validated = validateCreateTask(req.body);
    const created = addNewTask(validated);
    res.status(201).json({
      success: true,
      message: 'Task created successfully.',
      data: created
    });
  } catch (err) {
    next(err);
  }
}

export function updateTaskHandler(req, res, next) {
  try {
    const id = validateTaskId(req.params.id);
    const updates = validateUpdateTask(req.body);
    const updated = modifyTask(id, updates);
    res.status(200).json({
      success: true,
      message: 'Task updated successfully.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

export function deleteTaskHandler(req, res, next) {
  try {
    const id = validateTaskId(req.params.id);
    const result = removeTask(id);
    res.status(200).json({
      success: true,
      message: 'Task deleted successfully.',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export function clearCompletedTasksHandler(req, res, next) {
  try {
    const result = clearCompleted();
    res.status(200).json({
      success: true,
      message: `Cleared ${result.removedCount} completed task(s).`,
      data: result
    });
  } catch (err) {
    next(err);
  }
}
