import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScheduledEvent, ExecutionContext } from '@cloudflare/workers-types';
import type { Env } from '../types';

// Mock the cleanup service
vi.mock('../services/cleanup', () => ({
  cleanupOldClickRecords: vi.fn()
}));

import { cleanupOldClickRecords } from '../services/cleanup';
import workerExports from '../index';

// Create mock environment
const createMockEnv = (): Env => ({
  DB: {} as any,
  BUCKET: {} as any,
  JWT_SECRET: 'test-secret',
  JWT_EXPIRES_IN: '7d',
  ENVIRONMENT: 'test',
  ENTRA_ID_TENANT_ID: 'test-tenant',
  ENTRA_ID_CLIENT_ID: 'test-client',
  SHORT_DOMAIN: 'test.com'
});

// Create mock scheduled event
const createMockScheduledEvent = (): ScheduledEvent => ({
  scheduledTime: Date.now(),
  cron: '0 2 * * *'
});

// Create mock execution context
const createMockExecutionContext = (): ExecutionContext => ({
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn()
});

describe('Scheduled Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should call cleanupOldClickRecords with 365 days retention', async () => {
    const mockEnv = createMockEnv();
    const mockEvent = createMockScheduledEvent();
    const mockCtx = createMockExecutionContext();

    const mockCleanup = vi.mocked(cleanupOldClickRecords);
    mockCleanup.mockResolvedValue({
      deleted: 100,
      cutoffDate: new Date()
    });

    await workerExports.scheduled(mockEvent, mockEnv, mockCtx);

    expect(mockCleanup).toHaveBeenCalledWith(mockEnv.DB, 365);
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });

  it('should log cron trigger time', async () => {
    const mockEnv = createMockEnv();
    const mockEvent = createMockScheduledEvent();
    const mockCtx = createMockExecutionContext();

    const mockCleanup = vi.mocked(cleanupOldClickRecords);
    mockCleanup.mockResolvedValue({
      deleted: 50,
      cutoffDate: new Date()
    });

    const consoleSpy = vi.spyOn(console, 'log');

    await workerExports.scheduled(mockEvent, mockEnv, mockCtx);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Cron trigger fired:',
      expect.any(String)
    );
  });

  it('should log cleanup summary with results', async () => {
    const mockEnv = createMockEnv();
    const mockEvent = createMockScheduledEvent();
    const mockCtx = createMockExecutionContext();

    const cutoffDate = new Date();
    const mockCleanup = vi.mocked(cleanupOldClickRecords);
    mockCleanup.mockResolvedValue({
      deleted: 150,
      cutoffDate
    });

    const consoleSpy = vi.spyOn(console, 'log');

    await workerExports.scheduled(mockEvent, mockEnv, mockCtx);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Cleanup summary:',
      expect.objectContaining({
        deleted: 150,
        cutoffDate: cutoffDate.toISOString(),
        scheduledTime: expect.any(String),
        cron: '0 2 * * *'
      })
    );
  });

  it('should handle errors without throwing', async () => {
    const mockEnv = createMockEnv();
    const mockEvent = createMockScheduledEvent();
    const mockCtx = createMockExecutionContext();

    const mockCleanup = vi.mocked(cleanupOldClickRecords);
    mockCleanup.mockRejectedValue(new Error('Database error'));

    const consoleErrorSpy = vi.spyOn(console, 'error');

    // Should not throw
    await expect(
      workerExports.scheduled(mockEvent, mockEnv, mockCtx)
    ).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Cleanup failed:',
      expect.any(Error)
    );
  });

  it('should not retry on failure (no exception thrown)', async () => {
    const mockEnv = createMockEnv();
    const mockEvent = createMockScheduledEvent();
    const mockCtx = createMockExecutionContext();

    const mockCleanup = vi.mocked(cleanupOldClickRecords);
    mockCleanup.mockRejectedValue(new Error('Connection timeout'));

    // Execute and verify no exception is thrown
    let errorThrown = false;
    try {
      await workerExports.scheduled(mockEvent, mockEnv, mockCtx);
    } catch (error) {
      errorThrown = true;
    }

    expect(errorThrown).toBe(false);
  });

  it('should handle zero deletions gracefully', async () => {
    const mockEnv = createMockEnv();
    const mockEvent = createMockScheduledEvent();
    const mockCtx = createMockExecutionContext();

    const mockCleanup = vi.mocked(cleanupOldClickRecords);
    mockCleanup.mockResolvedValue({
      deleted: 0,
      cutoffDate: new Date()
    });

    const consoleSpy = vi.spyOn(console, 'log');

    await workerExports.scheduled(mockEvent, mockEnv, mockCtx);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Cleanup summary:',
      expect.objectContaining({
        deleted: 0
      })
    );
  });
});
