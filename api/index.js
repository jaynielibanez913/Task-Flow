let cachedApp = null;
let initError = null;

async function getExpressApp() {
  if (cachedApp) return cachedApp;
  try {
    const [{ app }, { initDatabase }] = await Promise.all([
      import('../src/app.js'),
      import('../src/config/database.js')
    ]);
    initDatabase();
    cachedApp = app;
    return cachedApp;
  } catch (err) {
    initError = err;
    return null;
  }
}

export default async function handler(req, res) {
  const expressApp = await getExpressApp();
  if (!expressApp) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        serverlessFallback: true,
        error: initError?.message || 'SQLite native runtime unavailable in this serverless container.'
      })
    );
    return;
  }

  if (req.url && !req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? req.url : `/${req.url}`}`;
  }
  return expressApp(req, res);
}
