ALTER TABLE daily_sales DROP CONSTRAINT daily_sales_line_key_key;
CREATE UNIQUE INDEX daily_sales_active_line_unique ON daily_sales(line_key) WHERE active;
