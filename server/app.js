import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config, root } from './config.js';
import routes from './routes/videoRoutes.js';
import { AppError } from './utils/errors.js';
export function createApp(versions = {}) {
  const app = express();
  const visitors = new Map();
  const visitorTtl = 45_000;
  const pruneVisitors = () => {
    const cutoff = Date.now() - visitorTtl;
    for (const [id, seenAt] of visitors) if (seenAt < cutoff) visitors.delete(id);
  };
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'https:', 'http:', 'data:'],
          'script-src': ["'self'"],
          'connect-src': ["'self'"],
          'upgrade-insecure-requests': null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || config.origins.includes(origin) || origin === 'https://dowloaderh.onrender.com')
          return callback(null, true);
        return callback(new Error('Origin is not allowed.'));
      },
    }),
  );
  app.use((req, res, next) => {
    // CORS alone does not stop browser form submissions to a local server.
    if (
      req.method === 'POST' &&
      req.headers.origin &&
      !config.origins.includes(req.headers.origin) &&
      req.headers.origin !== `http://${config.host}:${config.port}` &&
      req.headers.origin !== 'https://dowloaderh.onrender.com'
    )
      return res.status(403).json({ error: 'Origin is not allowed.' });
    if (req.method === 'POST' && !req.is('application/json'))
      return res.status(415).json({ error: 'Use application/json.' });
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/health', (req, res) =>
    res.json({
      status: 'ok',
      versions,
      limits: {
        maxBatch: config.maxBatch,
        maxDuration: config.maxDuration,
        maxFileSize: config.maxBytes,
      },
    }),
  );
  app.post('/api/visitors/heartbeat', (req, res) => {
    const id = typeof req.body?.id === 'string' ? req.body.id.slice(0, 100) : '';
    if (id) visitors.set(id, Date.now());
    pruneVisitors();
    res.json({ online: visitors.size });
  });
  app.get('/api/visitors/online', (req, res) => {
    pruneVisitors();
    res.json({ online: visitors.size });
  });
  app.use('/api', routes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  const dist = path.join(root, 'client', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error instanceof AppError
        ? error.status
        : error.type === 'entity.too.large'
          ? 413
          : error instanceof SyntaxError
            ? 400
            : 500;
    if (status === 500) console.error(error);
    res.status(status).json({
      error:
        status === 500
          ? 'An unexpected server error occurred.'
          : error instanceof AppError
            ? error.message
            : 'Invalid request body.',
    });
  });
  return app;
}
