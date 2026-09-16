import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { validate, urlSchema, downloadSchema, batchSchema } from '../middleware/validation.js';
import * as controller from '../controllers/videoController.js';
const router = Router();
const limiter = (limit) =>
  rateLimit({
    windowMs: config.rateWindow,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng chờ một lát rồi thử lại.' },
  });
const infoLimit = limiter(config.infoLimit);
const downloadLimit = limiter(config.downloadLimit);
router.post('/video/info', infoLimit, validate(urlSchema), controller.info);
router.post(
  '/batch/info',
  limiter(Math.max(1, Math.floor(config.infoLimit / config.maxBatch))),
  validate(batchSchema),
  controller.batchInfo,
);
router.post('/video/download', downloadLimit, validate(downloadSchema), controller.download);
router.post('/audio/download', downloadLimit, validate(downloadSchema), controller.download);
router.get('/download/:jobId/status', controller.status);
router.get('/download/:jobId/progress', controller.progress);
router.get('/download/:jobId/file', controller.file);
export default router;
