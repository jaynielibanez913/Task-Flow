import { Router } from 'express';
import { buildSourceCodeZip } from '../services/sourceArchiveService.js';

const router = Router();

router
  .route('/')
  .get((req, res, next) => {
    try {
      const zipBuffer = buildSourceCodeZip();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="taskflow-source-code.zip"');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.status(200).send(zipBuffer);
    } catch (err) {
      next(err);
    }
  })
  .all((req, res) => {
    res.set('Allow', 'GET');
    res.status(405).json({
      success: false,
      error: `Method ${req.method} is not allowed on this endpoint.`
    });
  });

export default router;
