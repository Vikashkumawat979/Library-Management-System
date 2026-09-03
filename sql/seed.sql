-- ---------------------------------------------------------------------
-- Admin (bcrypt hash of "Admin@123", 10 rounds)
-- ---------------------------------------------------------------------
INSERT INTO admins (username, name, password_hash) VALUES
('admin', 'Vikash Kumawat', '$2b$10$3euP9Z1v0Y8n7X2mHneWBOe1s0i5T2Hh2s0y0lYQezT2Zc6Tf8fMq');

-- ---------------------------------------------------------------------
-- Plans (exactly four — no "Add Plan" feature; edit here via pgAdmin)
-- ---------------------------------------------------------------------
INSERT INTO plans (plan_code, label, days, sort_order) VALUES
('1w', '1 Week',   7,   1),
('1m', '1 Month',  30,  2),
('3m', '3 Months', 90,  3),
('6m', '6 Months', 180, 4);

-- ---------------------------------------------------------------------
-- Slots (exactly four — the "Late Night" slot has been permanently
-- removed and the admin "Add Slot" feature has been retired)
-- ---------------------------------------------------------------------
INSERT INTO slots (name, value, display, sort_order) VALUES
('Morning',   '6-12', 'Morning (06:00 AM - 12:00 PM)', 1),
('Afternoon', '12-6', 'Afternoon (12:00 PM - 06:00 PM)', 2),
('Evening',   '6-24', 'Evening (06:00 PM - 12:00 AM)', 3),
('Night',     '24-6', 'Night (12:00 AM - 06:00 AM)', 4);

-- ---------------------------------------------------------------------
-- Pricing matrix
-- ---------------------------------------------------------------------
INSERT INTO pricing (duration_hours, plan_code, price) VALUES
(6,  '1w', 300),  (6,  '1m', 500),  (6,  '3m', 1300), (6,  '6m', 2500),
(12, '1w', 600),  (12, '1m', 1000), (12, '3m', 2600), (12, '6m', 5000),
(18, '1w', 900),  (18, '1m', 1500), (18, '3m', 3900), (18, '6m', 7500),
(24, '1w', 1200), (24, '1m', 2000), (24, '3m', 5200), (24, '6m', 10000);

-- ---------------------------------------------------------------------
-- Sample book catalog (covers are auto-fetched on server start /
-- via the "Refresh Covers" admin button — see bookCover.js)
-- ---------------------------------------------------------------------
INSERT INTO books (book_id, title, isbn, category, total_stock, current_stock) VALUES
('101', 'Core Python Programming',            '9788131721471', 'computer', 3, 3),
('102', 'Introduction to Algorithms',         '9780262033848', 'computer', 2, 2),
('103', 'Clean Code',                         '9780132350884', 'computer', 2, 2),
('201', 'Concepts of Physics Part 1',         '8177091877',    'science',  4, 4),
('202', 'Organic Chemistry',                  '9780470646465', 'science',  2, 2),
('301', 'Campbell Biology',                   '9780134093413', 'biology',  2, 2),
('401', 'The Alchemist',                      '9780062315007', 'story',    5, 5),
('402', 'Sapiens: A Brief History of Humankind','9780062316097','story',   3, 3)
ON CONFLICT (book_id) DO NOTHING;
