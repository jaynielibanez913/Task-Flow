import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import taskRoutes from './routes/taskRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import { AppError } from './validators/taskValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const app = express();

app.disable('x-powered-by');

// Security headers (preserving iframe compatibility for preview environment)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// Prevent caching on dynamic API responses
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// REST API Endpoints
app.use('/api/tasks', taskRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', dashboardRoutes);
app.use('/api/settings', settingsRoutes);

// 404 handler for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Requested API endpoint does not exist.'
  });
});

// Serve frontend static assets from public/
app.use(express.static(PUBLIC_DIR));

// Clean client-side route fallback to index.html for main application views
const APP_PAGE_ROUTES = ['/dashboard', '/tasks', '/board', '/reports', '/settings'];
app.get(APP_PAGE_ROUTES, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Fallback for unknown non-API GET routes
app.use((req, res) => {
  if (req.method === 'GET' && req.accepts('html')) {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    return;
  }
  res.status(404).json({
    success: false,
    error: 'Resource not found.'
  });
});

// Centralized Error Handling Middleware (never exposes internal paths or SQL details)
app.use((err, req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    res.status(400).json({
      success: false,
      error: 'Malformed JSON request body.'
    });
    return;
  }

  if (err instanceof AppError) {
    const response = {
      success: false,
      error: err.message
    };
    if (err.details) {
      response.details = err.details;
    }
    res.status(err.statusCode).json(response);
    return;
  }

  if (err && err.type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      error: 'Request payload exceeds maximum allowed size.'
    });
    return;
  }

  // Log unexpected internal errors server-side without leaking internals to the client
  if (process.env.NODE_ENV !== 'test') {
    console.error('[TaskFlow Internal Error]:', err?.message || 'Unexpected error');
  }

  res.status(500).json({
    success: false,
    error: 'An unexpected server error occurred. Please try again.'
  });
});

export default app;
