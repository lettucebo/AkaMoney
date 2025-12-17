import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { HttpError, NotFoundError, ValidationError, ForbiddenError } from '../../types/errors';
import { errorMiddleware } from '../error';

describe('Error Middleware', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // Test that errorMiddleware is a function that handles errors properly
  it('should be a middleware function', () => {
    expect(typeof errorMiddleware).toBe('function');
  });

  it('should pass through when no error', async () => {
    const app = new Hono();
    app.use('*', errorMiddleware);
    app.get('/test', (c) => c.json({ success: true }));
    
    const res = await app.request('/test');
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // Test error handling using Hono's onError
  it('should handle HttpError when using onError', async () => {
    const app = new Hono();
    
    app.onError((err, c) => {
      if (err instanceof HttpError) {
        return c.json({
          error: err.name.replace('Error', ''),
          message: err.message,
          code: err.code
        }, err.statusCode);
      }
      return c.json({
        error: 'Internal Server Error',
        message: err instanceof Error ? err.message : 'An unexpected error occurred'
      }, 500);
    });
    
    app.get('/test', async () => {
      throw new NotFoundError('Not found');
    });
    
    const res = await app.request('/test');
    expect(res.status).toBe(404);
    
    const body = await res.json();
    expect(body.error).toBe('NotFound');
    expect(body.message).toBe('Not found');
  });

  // Test error types used by errorMiddleware
  describe('Error types used by middleware', () => {
    it('should properly identify HttpError', () => {
      const error = new HttpError('Test', 418, 'TEST');
      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(418);
      expect(error.code).toBe('TEST');
    });

    it('should properly identify NotFoundError as HttpError', () => {
      const error = new NotFoundError('Not found');
      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(404);
    });

    it('should properly identify ValidationError as HttpError', () => {
      const error = new ValidationError('Invalid');
      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(400);
    });

    it('should properly identify ForbiddenError as HttpError', () => {
      const error = new ForbiddenError('Forbidden');
      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(403);
    });

    it('should handle error name transformation for response', () => {
      const error = new NotFoundError('Not found');
      // Simulating what the middleware does: error.name.replace('Error', '')
      const errorName = error.name.replace('Error', '');
      expect(errorName).toBe('NotFound');
    });

    it('should handle generic Error differently', () => {
      const error = new Error('Generic error');
      expect(error).not.toBeInstanceOf(HttpError);
    });
  });

  // Test the actual middleware function signature
  describe('Middleware function behavior', () => {
    it('should have correct function signature', () => {
      expect(errorMiddleware.length).toBe(2); // c, next
    });

    it('should call next and handle successful response', async () => {
      const mockContext = {
        json: vi.fn().mockReturnValue(new Response())
      };
      const mockNext = vi.fn().mockResolvedValue(undefined);
      
      await errorMiddleware(mockContext as any, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockContext.json).not.toHaveBeenCalled();
    });

    it('should catch HttpError and return proper response', async () => {
      const mockResponse = new Response(JSON.stringify({ error: 'NotFound' }), { status: 404 });
      const mockContext = {
        json: vi.fn().mockReturnValue(mockResponse)
      };
      const mockNext = vi.fn().mockRejectedValue(new NotFoundError('Not found'));
      
      const result = await errorMiddleware(mockContext as any, mockNext);
      
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'NotFound',
          message: 'Not found',
          code: 'NOT_FOUND'
        }),
        404
      );
    });

    it('should catch generic Error and return 500 response', async () => {
      const mockResponse = new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
      const mockContext = {
        json: vi.fn().mockReturnValue(mockResponse)
      };
      const mockNext = vi.fn().mockRejectedValue(new Error('Something went wrong'));
      
      const result = await errorMiddleware(mockContext as any, mockNext);
      
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal Server Error',
          message: 'Something went wrong'
        }),
        500
      );
    });

    it('should handle non-Error objects thrown', async () => {
      const mockResponse = new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
      const mockContext = {
        json: vi.fn().mockReturnValue(mockResponse)
      };
      const mockNext = vi.fn().mockRejectedValue('string error');
      
      const result = await errorMiddleware(mockContext as any, mockNext);
      
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal Server Error',
          message: 'An unexpected error occurred'
        }),
        500
      );
    });
  });
});
