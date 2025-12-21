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
      const errorResponse: any = {
        error: error.name.replace('Error', ''),
        message: error.message,
        code: error.code,
        details: error.message
      };
      
      // Include stack trace in non-production environments for debugging
      if (c.env?.ENVIRONMENT !== 'production' && error instanceof Error) {
        errorResponse.stack = error.stack;
      }
      
      return c.json(errorResponse, error.statusCode);
    }
    
    // Handle generic errors
    const errorResponse: any = {
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
      details: error instanceof Error ? error.message : String(error)
    };
    
    // Include stack trace in non-production environments for debugging
    if (c.env?.ENVIRONMENT !== 'production' && error instanceof Error) {
      errorResponse.stack = error.stack;
    }

    return c.json(errorResponse, 500);
  }
}
