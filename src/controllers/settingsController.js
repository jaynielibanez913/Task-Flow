import { validateSettingsUpdate } from '../validators/taskValidator.js';
import { getCurrentSettings, updateSettings } from '../services/taskService.js';

export function getSettingsHandler(req, res, next) {
  try {
    const settings = getCurrentSettings();
    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (err) {
    next(err);
  }
}

export function updateSettingsHandler(req, res, next) {
  try {
    const validated = validateSettingsUpdate(req.body);
    const updated = updateSettings(validated);
    res.status(200).json({
      success: true,
      message: 'Preferences saved.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
}
