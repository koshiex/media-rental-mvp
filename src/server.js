import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isEmpty, openDatabase } from './db.js';
import { systemClock } from './domain/clock.js';
import { createApp } from './http/app.js';
import { createMetrics } from './http/metrics.js';
import { seedDatabase } from './seed.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
const DB_PATH = process.env.DB_PATH ?? 'data/media-rental.db';
const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  console.error(`Некорректный PORT: ${process.env.PORT}`);
  process.exit(1);
}

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = openDatabase(DB_PATH);
const clock = systemClock();
if (isEmpty(db)) {
  seedDatabase(db, clock.today());
  console.log('База пустая — загружены демо-данные');
}

const server = createServer(createApp({ db, clock, metrics: createMetrics(), publicDir: PUBLIC_DIR }));
server.listen(PORT, HOST, () => {
  console.log(`МедиаПрокат MVP запущен: http://localhost:${PORT}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
