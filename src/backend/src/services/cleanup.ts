import type { D1Database } from '@cloudflare/workers-types';

/**
 * Clean up old click records
 * @param db D1 Database instance
 * @param retentionDays Number of days to retain records (default: 365)
 * @returns Number of records deleted
 */
export async function cleanupOldClickRecords(
  db: D1Database,
  retentionDays: number = 365
): Promise<{ deleted: number; cutoffDate: Date }> {
  // Validate retentionDays parameter
  if (retentionDays <= 0 || !Number.isFinite(retentionDays)) {
    throw new Error('retentionDays must be a positive number');
  }
  
  // Prevent extremely large values that could cause issues
  if (retentionDays > 3650) { // Max 10 years
    throw new Error('retentionDays cannot exceed 3650 (10 years)');
  }

  const cutoffTimestamp = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  const cutoffDate = new Date(cutoffTimestamp);

  console.log(`Starting cleanup: deleting click records older than ${cutoffDate.toISOString()}`);

  // Count records to be deleted (for logging)
  const countResult = await db
    .prepare('SELECT COUNT(*) as count FROM click_records WHERE clicked_at < ?')
    .bind(cutoffTimestamp)
    .first<{ count: number }>();

  const recordsToDelete = countResult?.count || 0;

  if (recordsToDelete === 0) {
    console.log('No old records to delete');
    return { deleted: 0, cutoffDate };
  }

  // Delete old records
  const result = await db
    .prepare('DELETE FROM click_records WHERE clicked_at < ?')
    .bind(cutoffTimestamp)
    .run();

  console.log(`Cleanup completed: ${recordsToDelete} records deleted`);

  return {
    deleted: recordsToDelete,
    cutoffDate
  };
}
