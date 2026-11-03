import { Router } from 'express';
import { getSettingsHandler, updateSettingsHandler } from '../controllers/settingsController.js';

const router = Router();

router
  .route('/')
  .get(getSettingsHandler)
  .put(updateSettingsHandler)
  .all((req, res) => {
    res.set('Allow', 'GET, PUT');
    res.status(405).json({
      success: false,
      error: `Method ${req.method} is not allowed on this endpoint.`
    });
  });

export default router;
