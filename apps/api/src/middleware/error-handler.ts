import type { ErrorHandler } from 'hono';
import { logger } from './logger.js';

export const errorHandler: ErrorHandler = (err, c) => {
  logger.error({ err, path: c.req.path, method: c.req.method }, 'Unhandled error');

  const status = 'status' in err ? (err as any).status : 500;

  if (status === 404) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: err.message || 'Resource not found' } },
      404
    );
  }

  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message:
          process.env.NODE_ENV === 'development'
            ? err.message
            : 'An unexpected error occurred',
      },
    },
    500
  );
};
