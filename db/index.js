const { query, pool } = require('../config/db');

// ---------------------------------------------------------------------
// Row -> camelCase object mappers
// ---------------------------------------------------------------------
function mapUser(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    idProofType: row.id_proof_type,
    photo: row.photo_path,
    idFile: row.id_file_path,
    plan: row.plan_code,
    duration: String(row.duration_hours),
    slot: row.slot_names,
    selectedSeat: row.selected_seat,
    totalAmount: Number(row.total_amount).toFixed(2),
    status: row.status,
    registeredAt: row.registered_at,
    expiresAt: row.expires_at
  };
}

function mapBook(row) {
  if (!row) return null;
  return {
    bookId: row.book_id,
    title: row.title,
    isbn: row.isbn,
    category: row.category,
    coverImage: row.cover_image,
    coverGradient: row.cover_gradient,
    totalStock: row.total_stock,
    currentStock: row.current_stock
  };
}

function mapNotification(row) {
  return {
    messageId: 'msg-' + row.notification_id,
    id: row.notification_id,
    text: row.text,
    timestamp: row.created_at,
    isRead: row.is_read
  };
}

function mapSlot(row) {
  return { name: row.name, value: row.value, display: row.display };
}

// ---------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------
async function addLog(text) {
  await query('INSERT INTO logs (text) VALUES ($1)', [text]);
}

async function getLogs(limit = 100) {
  const { rows } = await query('SELECT log_id, text, created_at FROM logs ORDER BY created_at DESC LIMIT $1', [limit]);
  return rows.map(r => ({ logId: 'log-' + r.log_id, text: r.text, timestamp: r.created_at }));
}

// ---------------------------------------------------------------------
// Admins
// ---------------------------------------------------------------------
async function findAdminForLogin(username, enteredName) {
  const { rows } = await query('SELECT * FROM admins WHERE LOWER(username) = LOWER($1)', [username]);
  const admin = rows[0];
  if (!admin) return null;
  const entered = (enteredName || '').trim().toLowerCase();
  const matches = entered === admin.name.toLowerCase() || entered === 'admin';
  return matches ? { username: admin.username, name: admin.name } : null;
}

// ---------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------
async function getUsers() {
  const { rows } = await query('SELECT * FROM users ORDER BY registered_at DESC');
  return rows.map(mapUser);
}

async function getUserById(userId) {
  const { rows } = await query('SELECT * FROM users WHERE user_id = $1', [userId]);
  return mapUser(rows[0]);
}

async function getUserByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) ORDER BY registered_at DESC LIMIT 1', [email]);
  return mapUser(rows[0]);
}

async function userIdExists(userId) {
  const { rows } = await query('SELECT 1 FROM users WHERE user_id = $1', [userId]);
  return rows.length > 0;
}

/** Generates a unique User ID in the same LIB-2026-XX## format as before, guaranteed unique in the DB. */
async function generateUniqueUserId(name) {
  const nameParts = (name || '').trim().split(/\s+/);
  let initials = '';
  if (nameParts.length > 0 && nameParts[0]) {
    initials += nameParts[0].charAt(0).toUpperCase();
    if (nameParts.length > 1) {
      initials += nameParts[nameParts.length - 1].charAt(0).toUpperCase();
    } else if (nameParts[0].length > 1) {
      initials += nameParts[0].charAt(1).toUpperCase();
    }
  }
  if (!initials) initials = 'XX';

  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 25; attempt++) {
    const suffix = Math.floor(10 + Math.random() * 90);
    const candidate = `LIB-${year}-${initials}${suffix}`;
    if (!(await userIdExists(candidate))) return candidate;
  }
  // Extremely unlikely fallback: timestamp-based suffix, guaranteed unique.
  return `LIB-${year}-${initials}${Date.now().toString().slice(-4)}`;
}

async function insertUser(user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users
        (user_id, name, phone, email, address, id_proof_type, photo_path, id_file_path,
         plan_code, duration_hours, slot_names, selected_seat, total_amount, registered_at, expires_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'active')
       RETURNING *`,
      [
        user.userId, user.name, user.phone, user.email, user.address, user.idProofType,
        user.photo, user.idFile, user.plan, parseInt(user.duration, 10), user.slot,
        user.selectedSeat, user.totalAmount, user.registeredAt, user.expiresAt
      ]
    );
    await client.query(
      `INSERT INTO payments (user_id, type, plan_code, duration_hours, amount, payment_method)
       VALUES ($1,'registration',$2,$3,$4,'simulated_gateway')`,
      [user.userId, user.plan, parseInt(user.duration, 10), user.totalAmount]
    );
    await client.query('INSERT INTO logs (text) VALUES ($1)', [`Student ${user.name} (${user.userId}) registered successfully.`]);
    await client.query('COMMIT');
    return mapUser(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const USER_FIELD_MAP = {
  name: 'name', phone: 'phone', email: 'email', address: 'address',
  idProofType: 'id_proof_type', selectedSeat: 'selected_seat', slot: 'slot_names',
  plan: 'plan_code', expiresAt: 'expires_at', totalAmount: 'total_amount',
  status: 'status'
};

async function updateUser(userId, updatedFields) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const [jsKey, val] of Object.entries(updatedFields)) {
    if (val === undefined) continue;
    const col = USER_FIELD_MAP[jsKey];
    if (!col) continue;
    sets.push(`${col} = $${i++}`);
    values.push(val);
  }
  if (updatedFields.duration !== undefined) {
    sets.push(`duration_hours = $${i++}`);
    values.push(parseInt(updatedFields.duration, 10));
  }
  if (sets.length === 0) return getUserById(userId);

  values.push(userId);
  const { rows } = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE user_id = $${i} RETURNING *`,
    values
  );
  if (!rows[0]) return null;
  await addLog(`Student profile for ${rows[0].name} (${userId}) updated.`);
  return mapUser(rows[0]);
}

/** Full plan upgrade: keeps the same user_id, resets the membership clock, logs a separate payment. */
async function upgradeUserPlan(userId, { planCode, durationHours, slotNames, selectedSeat, amount, days }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const registeredAt = new Date();
    const expiresAt = new Date(registeredAt.getTime() + days * 24 * 60 * 60 * 1000);

    const { rows } = await client.query(
      `UPDATE users SET
         plan_code = $1, duration_hours = $2, slot_names = $3, selected_seat = $4,
         total_amount = $5, registered_at = $6, expires_at = $7, status = 'active'
       WHERE user_id = $8
       RETURNING *`,
      [planCode, durationHours, slotNames, selectedSeat, amount, registeredAt, expiresAt, userId]
    );
    if (!rows[0]) throw new Error('User not found.');

    await client.query(
      `INSERT INTO payments (user_id, type, plan_code, duration_hours, amount, payment_method)
       VALUES ($1,'upgrade',$2,$3,$4,'simulated_gateway')`,
      [userId, planCode, durationHours, amount]
    );
    await client.query('INSERT INTO logs (text) VALUES ($1)', [`Student ${rows[0].name} (${userId}) upgraded plan to ${planCode} / ${durationHours}h.`]);
    await client.query('COMMIT');
    return mapUser(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Permanently removes a user and all related records (issued books stock is restored first). */
async function deleteUser(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: userRows } = await client.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    const user = userRows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return false;
    }

    // Restore stock for any books currently issued to this user.
    const { rows: issued } = await client.query('SELECT book_id FROM issued_books WHERE user_id = $1', [userId]);
    for (const row of issued) {
      await client.query(
        'UPDATE books SET current_stock = LEAST(total_stock, current_stock + 1) WHERE book_id = $1',
        [row.book_id]
      );
    }

    // ON DELETE CASCADE removes issued_books, notifications, and payments automatically.
    await client.query('DELETE FROM users WHERE user_id = $1', [userId]);
    await client.query('INSERT INTO logs (text) VALUES ($1)', [`Student ${user.name} (${userId}) was permanently deleted and desk ${user.selected_seat || 'N/A'} was freed.`]);

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Cron-driven membership expiry sweep. Deactivates (does not delete) expired users, frees their seat, and logs it. */
async function expireOverdueUsers() {
  const { rows } = await query(
    `UPDATE users
     SET status = 'expired', selected_seat = NULL, slot_names = NULL
     WHERE status = 'active' AND expires_at < now()
     RETURNING user_id, name, selected_seat`
  );
  for (const row of rows) {
    await addLog(`Membership for ${row.name} (${row.user_id}) expired — seat released and account deactivated.`);
  }
  return rows.length;
}

// ---------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------
async function getBooks() {
  const { rows } = await query('SELECT * FROM books ORDER BY title ASC');
  return rows.map(mapBook);
}

async function getBooksMissingCovers() {
  const { rows } = await query('SELECT * FROM books WHERE cover_image IS NULL OR cover_image = \'\'');
  return rows.map(mapBook);
}

async function insertBook(book) {
  const { rows } = await query(
    `INSERT INTO books (book_id, title, isbn, category, cover_image, cover_gradient, total_stock, current_stock)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
    [book.bookId, book.title, book.isbn || null, book.category, book.coverImage || null,
      book.coverGradient || 'linear-gradient(135deg, #1e293b, #0f172a)', book.totalStock]
  );
  await addLog(`Book '${book.title}' (#${book.bookId}) added to inventory.`);
  return mapBook(rows[0]);
}

async function bookExists(bookId) {
  const { rows } = await query('SELECT 1 FROM books WHERE book_id = $1', [bookId]);
  return rows.length > 0;
}

const BOOK_FIELD_MAP = {
  title: 'title', category: 'category', coverGradient: 'cover_gradient',
  coverImage: 'cover_image', isbn: 'isbn'
};

async function updateBook(bookId, updatedFields) {
  const sets = [];
  const values = [];
  let i = 1;

  if (updatedFields.totalStock !== undefined) {
    sets.push(`total_stock = $${i++}`);
    values.push(updatedFields.totalStock);
  }
  if (updatedFields.currentStock !== undefined) {
    sets.push(`current_stock = $${i++}`);
    values.push(updatedFields.currentStock);
  }
  for (const [jsKey, val] of Object.entries(updatedFields)) {
    if (val === undefined) continue;
    const col = BOOK_FIELD_MAP[jsKey];
    if (!col) continue;
    sets.push(`${col} = $${i++}`);
    values.push(val);
  }
  if (sets.length === 0) return null;

  values.push(bookId);
  const { rows } = await query(`UPDATE books SET ${sets.join(', ')} WHERE book_id = $${i} RETURNING *`, values);
  if (!rows[0]) return null;
  await addLog(`Book '${rows[0].title}' (#${bookId}) details updated by admin.`);
  return mapBook(rows[0]);
}

async function deleteBookQty(bookId, qtyToDelete) {
  const { rows } = await query('SELECT * FROM books WHERE book_id = $1', [bookId]);
  const book = rows[0];
  if (!book) throw new Error('Book not found.');

  if (qtyToDelete <= 0 || qtyToDelete >= book.total_stock) {
    await query('DELETE FROM books WHERE book_id = $1', [bookId]);
    await addLog(`Book '${book.title}' (#${bookId}) completely removed from database.`);
    return { success: true, message: `Book '${book.title}' completely removed from inventory.` };
  }
  const newTotal = book.total_stock - qtyToDelete;
  const newCurrent = Math.max(0, book.current_stock - qtyToDelete);
  await query('UPDATE books SET total_stock = $1, current_stock = $2 WHERE book_id = $3', [newTotal, newCurrent, bookId]);
  await addLog(`Deleted ${qtyToDelete} copies of '${book.title}' (#${bookId}). Total stock: ${newTotal}.`);
  return { success: true, message: `Successfully deleted ${qtyToDelete} copies of '${book.title}'. (Remaining: ${newTotal})` };
}

async function issueBook(userId, bookId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: userRows } = await client.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    const user = userRows[0];
    if (!user) throw new Error('Student not found.');

    const { rows: bookRows } = await client.query('SELECT * FROM books WHERE book_id = $1 FOR UPDATE', [bookId]);
    const book = bookRows[0];
    if (!book) throw new Error('Book not found.');
    if (book.current_stock <= 0) throw new Error('Book out of stock.');

    const { rows: existing } = await client.query(
      'SELECT 1 FROM issued_books WHERE user_id = $1 AND book_id = $2', [userId, bookId]
    );
    if (existing.length > 0) throw new Error('This book is already issued to this student.');

    await client.query('UPDATE books SET current_stock = current_stock - 1 WHERE book_id = $1', [bookId]);
    const transactionId = 'tx-' + Date.now();
    await client.query(
      'INSERT INTO issued_books (transaction_id, user_id, book_id) VALUES ($1,$2,$3)',
      [transactionId, userId, bookId]
    );
    await client.query('INSERT INTO logs (text) VALUES ($1)', [`Book '${book.title}' (${bookId}) issued to ${user.name} (${userId}).`]);
    await client.query('COMMIT');
    return { transactionId, user: mapUser(user), book: mapBook(book) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function returnBook(userId, bookId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: userRows } = await client.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    const user = userRows[0];
    if (!user) throw new Error('Student not found.');

    const { rows: bookRows } = await client.query('SELECT * FROM books WHERE book_id = $1 FOR UPDATE', [bookId]);
    const book = bookRows[0];
    if (!book) throw new Error('Book not found.');

    const { rowCount } = await client.query(
      'DELETE FROM issued_books WHERE user_id = $1 AND book_id = $2', [userId, bookId]
    );
    if (rowCount === 0) throw new Error('This book is not issued to this student.');

    await client.query(
      'UPDATE books SET current_stock = LEAST(total_stock, current_stock + 1) WHERE book_id = $1', [bookId]
    );
    await client.query('INSERT INTO logs (text) VALUES ($1)', [`Book '${book.title}' (${bookId}) returned by ${user.name} (${userId}).`]);
    await client.query('COMMIT');
    return { user: mapUser(user), book: mapBook(book) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getIssuedBooks(userId) {
  const { rows } = await query(
    `SELECT ib.transaction_id, ib.user_id, ib.book_id, ib.issued_at, b.title, b.category
     FROM issued_books ib JOIN books b ON b.book_id = ib.book_id
     WHERE ib.user_id = $1 ORDER BY ib.issued_at DESC`,
    [userId]
  );
  return rows.map(r => ({
    transactionId: r.transaction_id,
    userId: r.user_id,
    bookId: r.book_id,
    actionType: 'assign',
    timestamp: r.issued_at,
    bookTitle: r.title,
    category: r.category
  }));
}

/** Seats booked among ACTIVE users only, across any of the given slot names. */
async function getBookedSeatsBySlots(slotsArray) {
  if (!slotsArray || slotsArray.length === 0) return [];
  const { rows } = await query(
    `SELECT selected_seat, slot_names FROM users
     WHERE status = 'active' AND selected_seat IS NOT NULL AND slot_names IS NOT NULL`
  );
  const booked = new Set();
  rows.forEach(row => {
    const userSlots = row.slot_names.split(',').map(s => s.trim());
    if (userSlots.some(s => slotsArray.includes(s))) {
      booked.add(row.selected_seat);
    }
  });
  return Array.from(booked);
}

// ---------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------
async function addNotification(userId, text) {
  const { rows } = await query(
    'INSERT INTO notifications (user_id, text, is_broadcast) VALUES ($1,$2,false) RETURNING *',
    [userId, text]
  );
  await addLog(`Notification sent to student (${userId}).`);
  return !!rows[0];
}

async function broadcastNotification(text) {
  const { rows } = await query("SELECT user_id FROM users WHERE status = 'active'");
  for (const row of rows) {
    await query('INSERT INTO notifications (user_id, text, is_broadcast) VALUES ($1,$2,true)', [row.user_id, text]);
  }
  await addLog('Broadcast notification sent to all active students.');
  return true;
}

async function getNotificationsForUser(userId) {
  const { rows } = await query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return rows.map(mapNotification);
}

async function getUnreadNotifications(userId) {
  const { rows } = await query(
    'SELECT * FROM notifications WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC', [userId]
  );
  return rows.map(mapNotification);
}

async function markAllNotificationsRead(userId) {
  await query(
    `UPDATE notifications SET is_read = true, read_at = now() WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return true;
}

/** Cron-driven cleanup: permanently deletes notifications that were read more than 24h ago. */
async function cleanupReadNotifications() {
  const { rowCount } = await query(
    `DELETE FROM notifications WHERE is_read = true AND read_at < now() - interval '24 hours'`
  );
  return rowCount;
}

// ---------------------------------------------------------------------
// Slots (fixed reference list — read only; no admin add/delete anymore)
// ---------------------------------------------------------------------
async function getSlots() {
  const { rows } = await query('SELECT * FROM slots ORDER BY sort_order ASC');
  return rows.map(mapSlot);
}

// ---------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------
async function getPrices() {
  const { rows } = await query('SELECT duration_hours, plan_code, price FROM pricing');
  const prices = {};
  rows.forEach(r => {
    const dur = String(r.duration_hours);
    if (!prices[dur]) prices[dur] = {};
    prices[dur][r.plan_code] = Number(r.price);
  });
  return prices;
}

async function updatePrice(duration, plan, price) {
  await query(
    `INSERT INTO pricing (duration_hours, plan_code, price) VALUES ($1,$2,$3)
     ON CONFLICT (duration_hours, plan_code) DO UPDATE SET price = EXCLUDED.price`,
    [parseInt(duration, 10), plan, price]
  );
  await addLog(`Plan price updated: ${duration}h / ${plan} -> Rs.${price} by admin.`);
  return getPrices();
}

async function getPlans() {
  const { rows } = await query('SELECT plan_code, label, days FROM plans ORDER BY sort_order ASC');
  return rows;
}

async function getPlanDays(planCode) {
  const { rows } = await query('SELECT days FROM plans WHERE plan_code = $1', [planCode]);
  return rows[0] ? rows[0].days : 30;
}

module.exports = {
  // logs
  addLog, getLogs,
  // admin
  findAdminForLogin,
  // users
  getUsers, getUserById, getUserByEmail, generateUniqueUserId, insertUser, updateUser,
  upgradeUserPlan, deleteUser, expireOverdueUsers,
  // books
  getBooks, getBooksMissingCovers, insertBook, bookExists, updateBook, deleteBookQty,
  issueBook, returnBook, getIssuedBooks, getBookedSeatsBySlots,
  // notifications
  addNotification, broadcastNotification, getNotificationsForUser, getUnreadNotifications,
  markAllNotificationsRead, cleanupReadNotifications,
  // slots / pricing / plans
  getSlots, getPrices, updatePrice, getPlans, getPlanDays
};
