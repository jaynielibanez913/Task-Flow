import { getDashboardAndAnalytics } from '../services/taskService.js';

export function getDashboardHandler(req, res, next) {
  try {
    const dashboardData = getDashboardAndAnalytics();
    res.status(200).json({
      success: true,
      data: dashboardData
    });
  } catch (err) {
    next(err);
  }
}
