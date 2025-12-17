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
      const errorResponse: ApiError = {
        error: error.name.replace('Error', ''),
        message: error.message,
        code: error.code
      };
      return c.json(errorResponse, error.statusCode);
    }
    
    // Handle generic errors
    const errorResponse: ApiError = {
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An unexpected error occurred'
    };

    return c.json(errorResponse, 500);
  }
}
