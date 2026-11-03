import app from '../src/app.js';
import { initDatabase } from '../src/config/database.js';

initDatabase();

export default function handler(req, res) {
  if (req.url && !req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? req.url : `/${req.url}`}`;
  }
  return app(req, res);
}
