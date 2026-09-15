-- Composite indexes for the account-scoped URL list.
--
-- Every list, count and counts query filters by `user_id` first and then orders
-- by one of created_at / updated_at / click_count, so each sort option gets a
-- covering (user_id, <sort column>) index instead of a per-user filesort.
--
-- Note: the search filter uses `LIKE '%term%'`, which no B-tree index can
-- serve. Search therefore scans the user's partition; these indexes keep the
-- unsearched (and the far more common) paths cheap.

CREATE INDEX IF NOT EXISTS idx_urls_user_created ON urls(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_urls_user_updated ON urls(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_urls_user_clicks ON urls(user_id, click_count DESC);
CREATE INDEX IF NOT EXISTS idx_urls_user_active ON urls(user_id, is_active);
