import 'dotenv/config';
import app from './src/app.js';
import { initDatabase, closeDatabase } from './src/config/database.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

initDatabase();

const server = app.listen(PORT, HOST, () => {
  console.log(`TaskFlow server listening on http://${HOST}:${PORT}`);
});

function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Closing TaskFlow server and SQLite connection...`);
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
