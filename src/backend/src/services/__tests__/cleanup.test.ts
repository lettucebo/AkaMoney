import { describe, it, expect, vi } from 'vitest';
import { cleanupOldClickRecords } from '../cleanup';

// Mock D1Database
const createMockDb = () => {
  const mockFirst = vi.fn();
  const mockRun = vi.fn();
  const mockBind = vi.fn().mockReturnValue({
    first: mockFirst,
    run: mockRun
  });
  const mockPrepare = vi.fn().mockReturnValue({
    bind: mockBind
  });

  return {
    prepare: mockPrepare,
    _mockFirst: mockFirst,
    _mockRun: mockRun,
    _mockBind: mockBind
  };
};

describe('Cleanup Service - cleanupOldClickRecords', () => {
  it('should delete old click records', async () => {
    const mockDb = createMockDb();
    
    // Mock delete result with meta.changes
    mockDb._mockRun.mockResolvedValue({ meta: { changes: 5 } });
    
    const result = await cleanupOldClickRecords(mockDb as any, 365);
    
    expect(result.deleted).toBe(5);
    expect(result.cutoffDate).toBeInstanceOf(Date);
    
    // Should prepare 1 query: delete
    expect(mockDb.prepare).toHaveBeenCalledTimes(1);
    
    // Verify delete query
    expect(mockDb.prepare).toHaveBeenCalledWith(
      'DELETE FROM click_records WHERE clicked_at < ?'
    );
  });

  it('should return 0 when no old records exist', async () => {
    const mockDb = createMockDb();
    
    // Mock delete result with 0 changes
    mockDb._mockRun.mockResolvedValue({ meta: { changes: 0 } });
    
    const result = await cleanupOldClickRecords(mockDb as any, 365);
    
    expect(result.deleted).toBe(0);
    
    // Should prepare and run delete query
    expect(mockDb.prepare).toHaveBeenCalledTimes(1);
    expect(mockDb._mockRun).toHaveBeenCalled();
  });

  it('should use custom retention period', async () => {
    const mockDb = createMockDb();
    
    mockDb._mockRun.mockResolvedValue({ meta: { changes: 3 } });
    
    const customRetentionDays = 180;
    const result = await cleanupOldClickRecords(mockDb as any, customRetentionDays);
    
    expect(result.deleted).toBe(3);
    
    // Verify cutoff date is approximately 180 days ago
    const expectedCutoff = Date.now() - (customRetentionDays * 24 * 60 * 60 * 1000);
    const actualCutoff = result.cutoffDate.getTime();
    
    // Allow 1 second tolerance for test execution time
    expect(Math.abs(actualCutoff - expectedCutoff)).toBeLessThan(1000);
  });

  it('should use default retention period of 365 days', async () => {
    const mockDb = createMockDb();
    
    mockDb._mockRun.mockResolvedValue({ meta: { changes: 10 } });
    
    const result = await cleanupOldClickRecords(mockDb as any);
    
    expect(result.deleted).toBe(10);
    
    // Verify cutoff date is approximately 365 days ago
    const expectedCutoff = Date.now() - (365 * 24 * 60 * 60 * 1000);
    const actualCutoff = result.cutoffDate.getTime();
    
    // Allow 1 second tolerance for test execution time
    expect(Math.abs(actualCutoff - expectedCutoff)).toBeLessThan(1000);
  });

  it('should handle null meta result gracefully', async () => {
    const mockDb = createMockDb();
    
    // Mock result without meta
    mockDb._mockRun.mockResolvedValue({});
    
    const result = await cleanupOldClickRecords(mockDb as any, 365);
    
    expect(result.deleted).toBe(0);
  });

  it('should bind correct timestamp to queries', async () => {
    const mockDb = createMockDb();
    
    mockDb._mockRun.mockResolvedValue({ meta: { changes: 1 } });
    
    const retentionDays = 365;
    const beforeTimestamp = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    
    await cleanupOldClickRecords(mockDb as any, retentionDays);
    
    const afterTimestamp = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    
    // Verify bind was called with a timestamp between before and after
    expect(mockDb._mockBind).toHaveBeenCalled();
    const boundTimestamp = mockDb._mockBind.mock.calls[0][0];
    
    expect(boundTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(boundTimestamp).toBeLessThanOrEqual(afterTimestamp);
  });

  it('should throw error for negative retention days', async () => {
    const mockDb = createMockDb();
    
    await expect(cleanupOldClickRecords(mockDb as any, -1)).rejects.toThrow(
      'retentionDays must be a positive number'
    );
  });

  it('should throw error for zero retention days', async () => {
    const mockDb = createMockDb();
    
    await expect(cleanupOldClickRecords(mockDb as any, 0)).rejects.toThrow(
      'retentionDays must be a positive number'
    );
  });

  it('should throw error for retention days exceeding maximum', async () => {
    const mockDb = createMockDb();
    
    await expect(cleanupOldClickRecords(mockDb as any, 3651)).rejects.toThrow(
      'retentionDays cannot exceed 3650 (10 years)'
    );
  });

  it('should throw error for non-finite retention days', async () => {
    const mockDb = createMockDb();
    
    await expect(cleanupOldClickRecords(mockDb as any, Infinity)).rejects.toThrow(
      'retentionDays must be a positive number'
    );
  });

  it('should throw error for NaN retention days', async () => {
    const mockDb = createMockDb();
    
    await expect(cleanupOldClickRecords(mockDb as any, NaN)).rejects.toThrow(
      'retentionDays must be a positive number'
    );
  });
});
