import type { Context } from 'hono';
import type { ApiError } from '../types';
import { HttpError } from '../types/errors';

/**
 * Error handling middleware
 */
export async function errorMiddleware(c: Context, next: () => Promise<void>) {
  try {
    await next();
  } catch (error) {
    console.error('Error:', error);
    
    // Handle custom HTTP errors with status codes
    if (error instanceof HttpError) {
      return c.json({
        error: error.name.replace('Error', ''),
        message: error.message,
        code: error.code,
        details: error.message,
        stack: error instanceof Error ? error.stack : undefined
      }, error.statusCode);
    }
    
    // Handle generic errors
    return c.json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
  }
}
