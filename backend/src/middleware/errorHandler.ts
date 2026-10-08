import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  status?: string;
  code?: string;
}

// Postgres error codes that mean the request was wrong, not the server.
const PG_ERRORS: Record<string, [number, string]> = {
  '23505': [409, 'That already exists.'],
  '23503': [400, 'That refers to something that no longer exists.'],
  '23502': [400, 'A required value is missing.'],
  '23514': [400, 'A value is outside the allowed range.'],
  '22P02': [400, 'A value has the wrong format.'],
  '22001': [400, 'A value is too long.'],
  '22003': [400, 'A number is out of range.'],
  '22007': [400, 'A date is invalid.'],
  '22008': [400, 'A date is out of range.'],
};

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  const pgMapping = err.code ? PG_ERRORS[err.code] : undefined;
  if (pgMapping && statusCode === 500) {
    [statusCode, message] = pgMapping;
  } else if (err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'That file is too large.';
  } else if (err.name === 'PayloadTooLargeError') {
    statusCode = 413;
    message = 'The request is too large.';
  }

  if (!isProduction) {
    console.error('[Error]', {
      message: err.message,
      statusCode,
      code: err.code,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  } else {
    console.error(`[Error] ${statusCode} ${err.message} - ${req.method} ${req.path}`);
  }

  // Server faults never expose SQL or stack detail to the browser in production;
  // the log above keeps the original message.
  if (isProduction && statusCode >= 500) {
    message = 'Something went wrong on the server. Nothing was changed; try again.';
  }

  res.status(statusCode).json({
    error: message,
    ...(!isProduction && { stack: err.stack }),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}

export function createError(message: string, statusCode: number): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  return err;
}
