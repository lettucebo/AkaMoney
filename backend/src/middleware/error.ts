import type { Context } from 'hono';
import type { ApiError } from '../types';

/**
 * Error handling middleware
 */
export async function errorMiddleware(c: Context, next: () => Promise<void>) {
  try {
    await next();
  } catch (error) {
    console.error('Error:', error);
    
    const errorResponse: ApiError = {
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An unexpected error occurred'
    };

    // Return appropriate status code based on error type
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('Not found')) {
        return c.json({ ...errorResponse, error: 'Not Found' }, 404);
      }
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        return c.json({ ...errorResponse, error: 'Conflict' }, 409);
      }
      if (error.message.includes('Invalid') || error.message.includes('validation')) {
        return c.json({ ...errorResponse, error: 'Bad Request' }, 400);
      }
      if (error.message.includes('Unauthorized') || error.message.includes('authentication')) {
        return c.json({ ...errorResponse, error: 'Unauthorized' }, 401);
      }
    }

    return c.json(errorResponse, 500);
  }
}
