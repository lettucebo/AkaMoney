import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateToken, verifyToken } from '../jwt';

describe('JWT Service', () => {
  const secret = 'test-secret-key-12345';
  const payload = {
    userId: 'user-123',
    email: 'test@example.com',
    role: 'user'
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', async () => {
      const token = await generateToken(payload, secret);
      
      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include payload in the token', async () => {
      const token = await generateToken(payload, secret);
      const parts = token.split('.');
      const tokenPayload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      
      expect(tokenPayload.userId).toBe(payload.userId);
      expect(tokenPayload.email).toBe(payload.email);
      expect(tokenPayload.role).toBe(payload.role);
    });

    it('should include iat and exp in the token', async () => {
      const token = await generateToken(payload, secret, '1h');
      const parts = token.split('.');
      const tokenPayload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      
      expect(tokenPayload.iat).toBeDefined();
      expect(tokenPayload.exp).toBeDefined();
      expect(tokenPayload.exp).toBeGreaterThan(tokenPayload.iat);
    });

    it('should handle different expiration formats', async () => {
      const now = Math.floor(Date.now() / 1000);
      
      // Test seconds
      const tokenSec = await generateToken(payload, secret, '60s');
      let parts = tokenSec.split('.');
      let tokenPayload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      expect(tokenPayload.exp - tokenPayload.iat).toBe(60);
      
      // Test minutes
      const tokenMin = await generateToken(payload, secret, '5m');
      parts = tokenMin.split('.');
      tokenPayload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      expect(tokenPayload.exp - tokenPayload.iat).toBe(300);
      
      // Test hours
      const tokenHour = await generateToken(payload, secret, '2h');
      parts = tokenHour.split('.');
      tokenPayload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      expect(tokenPayload.exp - tokenPayload.iat).toBe(7200);
      
      // Test days
      const tokenDay = await generateToken(payload, secret, '1d');
      parts = tokenDay.split('.');
      tokenPayload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      expect(tokenPayload.exp - tokenPayload.iat).toBe(86400);
    });
  });

  describe('verifyToken', () => {
    it('should verify and return payload for valid token', async () => {
      const token = await generateToken(payload, secret, '1h');
      const result = await verifyToken(token, secret);
      
      expect(result).not.toBeNull();
      expect(result?.userId).toBe(payload.userId);
      expect(result?.email).toBe(payload.email);
      expect(result?.role).toBe(payload.role);
    });

    it('should return null for invalid token format', async () => {
      const result = await verifyToken('invalid-token', secret);
      expect(result).toBeNull();
    });

    it('should return null for token with wrong number of parts', async () => {
      const result = await verifyToken('part1.part2', secret);
      expect(result).toBeNull();
    });

    it('should return null for token with invalid signature', async () => {
      const token = await generateToken(payload, secret);
      const parts = token.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.invalidSignature`;
      
      const result = await verifyToken(tamperedToken, secret);
      expect(result).toBeNull();
    });

    it('should return null for token with wrong secret', async () => {
      const token = await generateToken(payload, secret);
      const result = await verifyToken(token, 'wrong-secret');
      
      expect(result).toBeNull();
    });

    it('should return null for expired token', async () => {
      const token = await generateToken(payload, secret, '1h');
      
      // Advance time past expiration
      vi.advanceTimersByTime(2 * 60 * 60 * 1000); // 2 hours
      
      const result = await verifyToken(token, secret);
      expect(result).toBeNull();
    });

    it('should return payload for token that is not yet expired', async () => {
      const token = await generateToken(payload, secret, '1h');
      
      // Advance time but not past expiration
      vi.advanceTimersByTime(30 * 60 * 1000); // 30 minutes
      
      const result = await verifyToken(token, secret);
      expect(result).not.toBeNull();
      expect(result?.userId).toBe(payload.userId);
    });
  });
});
