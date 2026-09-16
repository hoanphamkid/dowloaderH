import { z } from 'zod';
import { config } from '../config.js';
export const urlSchema = z.object({ url: z.string().trim().min(1).max(4096) }).strict();
export const downloadSchema = urlSchema.extend({
  formatId: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  type: z.enum(['video', 'audio']),
});
export const batchSchema = z
  .object({ urls: z.array(z.string().trim().min(1).max(4096)).min(1).max(config.maxBatch) })
  .strict();
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success)
      return res.status(400).json({
        error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    req.body = result.data;
    next();
  };
}
