import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config, root } from './config.js';
import routes from './routes/videoRoutes.js';
import { AppError, ERROR_CODES, errorBody, fail } from './utils/errors.js';
import { listDonations, recordDonation } from './services/donationService.js';
export function createApp(versions = {}) {
  const app = express();
  // Render runs the service behind a reverse proxy. Trust the first proxy so
  // express-rate-limit can safely read X-Forwarded-For without rejecting requests.
  app.set('trust proxy', 1);
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
          'media-src': ["'self'", 'https:', 'http:', 'blob:'],
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
        if (
          !origin ||
          config.origins.includes(origin) ||
          origin === 'https://dowloaderh.onrender.com' ||
          origin === 'https://hoanpham-downloader.vercel.app'
        )
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
      req.headers.origin !== 'https://dowloaderh.onrender.com' &&
      req.headers.origin !== 'https://hoanpham-downloader.vercel.app'
    )
      return res.status(403).json({
        success: false,
        code: 'ACCESS_DENIED',
        message: 'Origin is not allowed.',
        error: 'Origin is not allowed.',
      });
    if (req.method === 'POST' && !req.is('application/json'))
      return res.status(415).json({
        success: false,
        code: 'INVALID_URL',
        message: 'Use application/json.',
        error: 'Use application/json.',
      });
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
  app.get('/api/donations', async (req, res) => res.json({ donations: await listDonations() }));
  app.post('/api/donations/webhook', async (req, res) => {
    await recordDonation(req.body);
    res.status(200).json({ received: true });
  });
  app.use('/api', routes);
  app.use('/api', (req, res) =>
    res.status(404).json({
      success: false,
      code: 'MEDIA_NOT_FOUND',
      message: 'API endpoint not found.',
      error: 'API endpoint not found.',
    }),
  );
  const dist = path.join(root, 'client', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let wrapped = error;
    if (!(error instanceof AppError)) {
      if (error?.type === 'entity.too.large')
        wrapped = fail(ERROR_CODES.INVALID_URL, 413, 'Request too large.');
      else if (error instanceof SyntaxError)
        wrapped = fail(ERROR_CODES.INVALID_URL, 400, 'Invalid request body.');
      else if (error?.message === 'Origin is not allowed.')
        wrapped = fail(ERROR_CODES.ACCESS_DENIED, 403, error.message);
      else wrapped = fail(ERROR_CODES.SERVER_ERROR, 500);
    }
    if (wrapped.status === 500) console.error(error);
    res.status(wrapped.status).json(errorBody(wrapped));
  });
  return app;
}
