import { describe, it, expect } from 'vitest';
import {
  HttpError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
  ValidationError
} from '../errors';

describe('Custom Error Types', () => {
  describe('HttpError', () => {
    it('should create error with message and status code', () => {
      const error = new HttpError('Test error', 500);
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('HttpError');
    });

    it('should create error with optional code', () => {
      const error = new HttpError('Test error', 500, 'TEST_CODE');
      
      expect(error.code).toBe('TEST_CODE');
    });

    it('should be instance of Error', () => {
      const error = new HttpError('Test error', 500);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('NotFoundError', () => {
    it('should have default message', () => {
      const error = new NotFoundError();
      
      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.name).toBe('NotFoundError');
    });

    it('should accept custom message', () => {
      const error = new NotFoundError('URL not found');
      
      expect(error.message).toBe('URL not found');
      expect(error.statusCode).toBe(404);
    });

    it('should be instance of HttpError', () => {
      const error = new NotFoundError();
      expect(error).toBeInstanceOf(HttpError);
    });
  });

  describe('UnauthorizedError', () => {
    it('should have default message', () => {
      const error = new UnauthorizedError();
      
      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.name).toBe('UnauthorizedError');
    });

    it('should accept custom message', () => {
      const error = new UnauthorizedError('Invalid credentials');
      
      expect(error.message).toBe('Invalid credentials');
    });

    it('should be instance of HttpError', () => {
      const error = new UnauthorizedError();
      expect(error).toBeInstanceOf(HttpError);
    });
  });

  describe('ForbiddenError', () => {
    it('should have default message', () => {
      const error = new ForbiddenError();
      
      expect(error.message).toBe('Forbidden');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.name).toBe('ForbiddenError');
    });

    it('should accept custom message', () => {
      const error = new ForbiddenError('Access denied');
      
      expect(error.message).toBe('Access denied');
    });

    it('should be instance of HttpError', () => {
      const error = new ForbiddenError();
      expect(error).toBeInstanceOf(HttpError);
    });
  });

  describe('BadRequestError', () => {
    it('should have default message', () => {
      const error = new BadRequestError();
      
      expect(error.message).toBe('Bad request');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.name).toBe('BadRequestError');
    });

    it('should accept custom message', () => {
      const error = new BadRequestError('Invalid input');
      
      expect(error.message).toBe('Invalid input');
    });

    it('should be instance of HttpError', () => {
      const error = new BadRequestError();
      expect(error).toBeInstanceOf(HttpError);
    });
  });

  describe('ConflictError', () => {
    it('should have default message', () => {
      const error = new ConflictError();
      
      expect(error.message).toBe('Resource already exists');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
      expect(error.name).toBe('ConflictError');
    });

    it('should accept custom message', () => {
      const error = new ConflictError('Short code already taken');
      
      expect(error.message).toBe('Short code already taken');
    });

    it('should be instance of HttpError', () => {
      const error = new ConflictError();
      expect(error).toBeInstanceOf(HttpError);
    });
  });

  describe('ValidationError', () => {
    it('should have default message', () => {
      const error = new ValidationError();
      
      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
    });

    it('should accept custom message', () => {
      const error = new ValidationError('Invalid URL format');
      
      expect(error.message).toBe('Invalid URL format');
    });

    it('should be instance of HttpError', () => {
      const error = new ValidationError();
      expect(error).toBeInstanceOf(HttpError);
    });
  });
});
