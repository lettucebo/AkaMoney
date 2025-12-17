-- Create URLs table
CREATE TABLE IF NOT EXISTS urls (
  id TEXT PRIMARY KEY,
  short_code TEXT UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  user_id TEXT,
  title TEXT,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER,
  is_active INTEGER DEFAULT 1,
  click_count INTEGER DEFAULT 0
);

-- Create index for short_code lookup (most common query)
CREATE INDEX IF NOT EXISTS idx_urls_short_code ON urls(short_code);

-- Create index for user_id
CREATE INDEX IF NOT EXISTS idx_urls_user_id ON urls(user_id);

-- Create index for created_at (for sorting)
CREATE INDEX IF NOT EXISTS idx_urls_created_at ON urls(created_at DESC);

-- Create Click Records table
CREATE TABLE IF NOT EXISTS click_records (
  id TEXT PRIMARY KEY,
  url_id TEXT NOT NULL,
  short_code TEXT NOT NULL,
  clicked_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  referer TEXT,
  country TEXT,
  city TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE
);

-- Create indexes for click_records
CREATE INDEX IF NOT EXISTS idx_clicks_url_id ON click_records(url_id);
CREATE INDEX IF NOT EXISTS idx_clicks_short_code ON click_records(short_code);
CREATE INDEX IF NOT EXISTS idx_clicks_clicked_at ON click_records(clicked_at DESC);

-- Create Users table (for JWT authentication)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  entra_id TEXT UNIQUE,
  name TEXT,
  role TEXT DEFAULT 'user',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER,
  is_active INTEGER DEFAULT 1
);

-- Create index for email lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create index for entra_id lookup
CREATE INDEX IF NOT EXISTS idx_users_entra_id ON users(entra_id);
