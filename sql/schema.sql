DROP TABLE IF EXISTS payments        CASCADE;
DROP TABLE IF EXISTS notifications   CASCADE;
DROP TABLE IF EXISTS issued_books    CASCADE;
DROP TABLE IF EXISTS logs            CASCADE;
DROP TABLE IF EXISTS users           CASCADE;
DROP TABLE IF EXISTS books           CASCADE;
DROP TABLE IF EXISTS pricing         CASCADE;
DROP TABLE IF EXISTS slots           CASCADE;
DROP TABLE IF EXISTS plans           CASCADE;
DROP TABLE IF EXISTS admins          CASCADE;

-- ---------------------------------------------------------------------
-- ADMINS
-- ---------------------------------------------------------------------
CREATE TABLE admins (
    admin_id       SERIAL PRIMARY KEY,
    username       VARCHAR(50)  NOT NULL UNIQUE,
    name           VARCHAR(100) NOT NULL,
    password_hash  TEXT         NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- PLANS (fixed reference list — exactly four membership durations)
-- ---------------------------------------------------------------------
CREATE TABLE plans (
    plan_code   VARCHAR(5)  PRIMARY KEY,           -- '1w','1m','3m','6m'
    label       VARCHAR(30) NOT NULL,              -- '1 Week', '1 Month' ...
    days        INTEGER     NOT NULL CHECK (days > 0),
    sort_order  SMALLINT    NOT NULL
);

-- ---------------------------------------------------------------------
-- SLOTS (fixed reference list — exactly four daily shifts)
-- ---------------------------------------------------------------------
CREATE TABLE slots (
    slot_id     SERIAL PRIMARY KEY,
    name        VARCHAR(30) NOT NULL UNIQUE,       -- 'Morning'
    value       VARCHAR(20) NOT NULL UNIQUE,       -- '6-12'
    display     VARCHAR(80) NOT NULL,              -- 'Morning (06:00 AM - 12:00 PM)'
    sort_order  SMALLINT    NOT NULL
);

-- ---------------------------------------------------------------------
-- PRICING MATRIX (duration hours x plan code -> price)
-- ---------------------------------------------------------------------
CREATE TABLE pricing (
    pricing_id      SERIAL PRIMARY KEY,
    duration_hours  SMALLINT    NOT NULL CHECK (duration_hours IN (6, 12, 18, 24)),
    plan_code       VARCHAR(5)  NOT NULL REFERENCES plans(plan_code) ON DELETE CASCADE,
    price           NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    UNIQUE (duration_hours, plan_code)
);

-- ---------------------------------------------------------------------
-- USERS (library members)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id         VARCHAR(30)  PRIMARY KEY,       -- e.g. LIB-2026-AB12
    name            VARCHAR(100) NOT NULL,
    phone           VARCHAR(20)  NOT NULL,
    email           VARCHAR(120) NOT NULL,
    address         TEXT,
    id_proof_type   VARCHAR(40),
    photo_path      TEXT,
    id_file_path    TEXT,
    plan_code       VARCHAR(5)   NOT NULL REFERENCES plans(plan_code),
    duration_hours  SMALLINT     NOT NULL CHECK (duration_hours IN (6, 12, 18, 24)),
    slot_names      VARCHAR(120),                   -- e.g. "Morning, Afternoon"
    selected_seat   VARCHAR(10),
    total_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
    status          VARCHAR(15)  NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'expired', 'deactivated')),
    registered_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ  NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email  ON users (LOWER(email));
CREATE INDEX idx_users_status ON users (status);
CREATE INDEX idx_users_seat   ON users (selected_seat) WHERE selected_seat IS NOT NULL;

-- ---------------------------------------------------------------------
-- BOOKS
-- ---------------------------------------------------------------------
CREATE TABLE books (
    book_id        VARCHAR(20) PRIMARY KEY,
    title          VARCHAR(200) NOT NULL,
    isbn           VARCHAR(20),
    category       VARCHAR(40)  NOT NULL,
    cover_image    TEXT,
    cover_gradient TEXT DEFAULT 'linear-gradient(135deg, #1e293b, #0f172a)',
    total_stock    INTEGER NOT NULL CHECK (total_stock >= 0),
    current_stock  INTEGER NOT NULL CHECK (current_stock >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- ISSUED BOOKS (currently checked-out copies)
-- ---------------------------------------------------------------------
CREATE TABLE issued_books (
    transaction_id VARCHAR(30) PRIMARY KEY,
    user_id        VARCHAR(30) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    book_id        VARCHAR(20) NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
    issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, book_id)
);

-- ---------------------------------------------------------------------
-- PAYMENTS / TRANSACTION HISTORY
-- ---------------------------------------------------------------------
CREATE TABLE payments (
    payment_id      SERIAL PRIMARY KEY,
    user_id         VARCHAR(30) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type            VARCHAR(15) NOT NULL CHECK (type IN ('registration', 'upgrade')),
    plan_code       VARCHAR(5)  NOT NULL REFERENCES plans(plan_code),
    duration_hours  SMALLINT    NOT NULL,
    amount          NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    payment_method  VARCHAR(20) DEFAULT 'simulated_gateway',
    paid_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_user ON payments (user_id);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id         VARCHAR(30) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    text            TEXT NOT NULL,
    is_broadcast    BOOLEAN NOT NULL DEFAULT false,
    is_read         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at         TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user_unread ON notifications (user_id, is_read);
CREATE INDEX idx_notifications_read_at     ON notifications (read_at) WHERE read_at IS NOT NULL;

-- ---------------------------------------------------------------------
-- ACTIVITY LOGS
-- ---------------------------------------------------------------------
CREATE TABLE logs (
    log_id      SERIAL PRIMARY KEY,
    text        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Trigger: keep users.updated_at fresh
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
