import { Router } from 'express';
import { getDashboardHandler } from '../controllers/dashboardController.js';

const router = Router();

router
  .route('/')
  .get(getDashboardHandler)
  .all((req, res) => {
    res.set('Allow', 'GET');
    res.status(405).json({
      success: false,
      error: `Method ${req.method} is not allowed on this endpoint.`
    });
  });

export default router;
