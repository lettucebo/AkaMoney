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
    console.error('Request handling failed:', {
      name: error instanceof Error ? error.name : 'NonErrorThrow'
    });
    
    // Handle custom HTTP errors with status codes
    if (error instanceof HttpError) {
      if (error.statusCode === 500) {
        return c.json({
          error: 'Internal Server Error',
          message: 'An unexpected error occurred',
          code: error.code
        }, 500);
      }

      return c.json({
        error: error.name.replace('Error', ''),
        message: error.message,
        code: error.code,
        details: error.message
      }, error.statusCode);
    }
    
    // Handle generic errors
    return c.json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred'
    }, 500);
  }
}
