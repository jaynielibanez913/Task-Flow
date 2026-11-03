import { Router } from 'express';
import {
  getAllTasksHandler,
  getTaskByIdHandler,
  createTaskHandler,
  updateTaskHandler,
  deleteTaskHandler,
  clearCompletedTasksHandler
} from '../controllers/taskController.js';

const router = Router();

function methodNotAllowed(allowedMethods) {
  return (req, res) => {
    res.set('Allow', allowedMethods.join(', '));
    res.status(405).json({
      success: false,
      error: `Method ${req.method} is not allowed on this endpoint.`
    });
  };
}

router
  .route('/completed')
  .delete(clearCompletedTasksHandler)
  .all(methodNotAllowed(['DELETE']));

router
  .route('/')
  .get(getAllTasksHandler)
  .post(createTaskHandler)
  .all(methodNotAllowed(['GET', 'POST']));

router
  .route('/:id')
  .get(getTaskByIdHandler)
  .put(updateTaskHandler)
  .patch(updateTaskHandler)
  .delete(deleteTaskHandler)
  .all(methodNotAllowed(['GET', 'PUT', 'PATCH', 'DELETE']));

export default router;
