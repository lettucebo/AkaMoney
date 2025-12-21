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
    
    // Mock count result (5 records to delete)
    mockDb._mockFirst.mockResolvedValue({ count: 5 });
    
    // Mock delete result
    mockDb._mockRun.mockResolvedValue({ success: true });
    
    const result = await cleanupOldClickRecords(mockDb as any, 365);
    
    expect(result.deleted).toBe(5);
    expect(result.cutoffDate).toBeInstanceOf(Date);
    
    // Should prepare 2 queries: count and delete
    expect(mockDb.prepare).toHaveBeenCalledTimes(2);
    
    // Verify count query
    expect(mockDb.prepare).toHaveBeenCalledWith(
      'SELECT COUNT(*) as count FROM click_records WHERE clicked_at < ?'
    );
    
    // Verify delete query
    expect(mockDb.prepare).toHaveBeenCalledWith(
      'DELETE FROM click_records WHERE clicked_at < ?'
    );
  });

  it('should return 0 when no old records exist', async () => {
    const mockDb = createMockDb();
    
    // Mock count result (0 records)
    mockDb._mockFirst.mockResolvedValue({ count: 0 });
    
    const result = await cleanupOldClickRecords(mockDb as any, 365);
    
    expect(result.deleted).toBe(0);
    
    // Should only prepare count query, not delete
    expect(mockDb.prepare).toHaveBeenCalledTimes(1);
    expect(mockDb._mockRun).not.toHaveBeenCalled();
  });

  it('should use custom retention period', async () => {
    const mockDb = createMockDb();
    
    mockDb._mockFirst.mockResolvedValue({ count: 3 });
    mockDb._mockRun.mockResolvedValue({ success: true });
    
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
    
    mockDb._mockFirst.mockResolvedValue({ count: 10 });
    mockDb._mockRun.mockResolvedValue({ success: true });
    
    const result = await cleanupOldClickRecords(mockDb as any);
    
    expect(result.deleted).toBe(10);
    
    // Verify cutoff date is approximately 365 days ago
    const expectedCutoff = Date.now() - (365 * 24 * 60 * 60 * 1000);
    const actualCutoff = result.cutoffDate.getTime();
    
    // Allow 1 second tolerance for test execution time
    expect(Math.abs(actualCutoff - expectedCutoff)).toBeLessThan(1000);
  });

  it('should handle null count result gracefully', async () => {
    const mockDb = createMockDb();
    
    // Mock null result
    mockDb._mockFirst.mockResolvedValue(null);
    
    const result = await cleanupOldClickRecords(mockDb as any, 365);
    
    expect(result.deleted).toBe(0);
    expect(mockDb._mockRun).not.toHaveBeenCalled();
  });

  it('should bind correct timestamp to queries', async () => {
    const mockDb = createMockDb();
    
    mockDb._mockFirst.mockResolvedValue({ count: 1 });
    mockDb._mockRun.mockResolvedValue({ success: true });
    
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
});
