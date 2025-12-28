-- Create expenses table for account book
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT NOT NULL
);

-- Create index on date for faster queries
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at DESC);

-- Enable Row Level Security (optional, uncomment if needed)
-- ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Example policy to allow all operations (adjust based on your auth requirements)
-- CREATE POLICY "Allow all operations for authenticated users" ON expenses
--   FOR ALL
--   USING (auth.role() = 'authenticated');

