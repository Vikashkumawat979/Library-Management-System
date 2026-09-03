require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const LEGACY_PATH = path.join(__dirname, '..', 'legacy-data-backup', 'database.json');

async function run() {
  if (!fs.existsSync(LEGACY_PATH)) {
    console.log(`No legacy data file found at ${LEGACY_PATH} — nothing to migrate. Skipping.`);
    process.exit(0);
  }

  const legacy = JSON.parse(fs.readFileSync(LEGACY_PATH, 'utf8'));
  const client = await pool.connect();

  try {
    console.log('Starting legacy data migration...');

    // ---- Users ----
    let userCount = 0;
    for (const u of legacy.users || []) {
      if (!u.name || !u.userId) continue; // skip incomplete seed stubs
      // await client.query(
      //   `INSERT INTO users
      //     (user_id, name, phone, email, address, id_proof_type, photo_path, id_file_path,
      //      plan_code, duration_hours, slot_names, selected_seat, total_amount,
      //      registered_at, expires_at, status)
      //    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
      //            CASE WHEN $14::timestamptz < now() THEN 'expired' ELSE 'active' END)
      //    ON CONFLICT (user_id) DO NOTHING`,
      //   [
      //     u.userId, u.name, u.phone || '', u.email || '', u.address || null, u.idProofType || null,
      //     u.photo || null, u.idFile || null, u.plan || '1m', parseInt(u.duration || '12', 10),
      //     u.slot || null, u.selectedSeat || null, parseFloat(u.totalAmount || 0),
      //     u.registeredAt || new Date().toISOString(), u.expiresAt || new Date().toISOString()
      //   ]
      // );
      await client.query(
        `INSERT INTO payments
      (user_id, type, plan_code, duration_hours, amount, payment_method, paid_at)
   SELECT
     $1::varchar(30),
     'registration',
     $2::varchar(5),
     $3::smallint,
     $4::numeric,
     'legacy_import',
     $5::timestamptz
   WHERE EXISTS (
       SELECT 1 FROM users WHERE user_id = $1::varchar(30)
   )
   AND NOT EXISTS (
       SELECT 1
       FROM payments
       WHERE user_id = $1::varchar(30)
       AND type = 'registration'
   )`,
        [
          u.userId,
          u.plan || '1m',
          parseInt(u.duration || '12', 10),
          parseFloat(u.totalAmount || 0),
          u.registeredAt || new Date().toISOString()
        ]
      );
      userCount++;

      // Registration payment record
      await client.query(
        `INSERT INTO payments (user_id, type, plan_code, duration_hours, amount, payment_method, paid_at)
         SELECT $1,'registration',$2,$3,$4,'legacy_import',$5
         WHERE EXISTS (SELECT 1 FROM users WHERE user_id = $1)
           AND NOT EXISTS (SELECT 1 FROM payments WHERE user_id = $1 AND type = 'registration')`,
        [u.userId, u.plan || '1m', parseInt(u.duration || '12', 10), parseFloat(u.totalAmount || 0), u.registeredAt || new Date().toISOString()]
      );

      // Notifications attached to this user
      for (const n of u.notifications || []) {
        await client.query(
          `INSERT INTO notifications (user_id, text, is_broadcast, created_at)
           VALUES ($1,$2,false,$3)`,
          [u.userId, n.text, n.timestamp || new Date().toISOString()]
        );
      }
    }
    console.log(`  Users migrated: ${userCount}`);

    // ---- Books ----
    let bookCount = 0;
    for (const b of legacy.books || []) {
      await client.query(
        `INSERT INTO books (book_id, title, category, cover_image, cover_gradient, total_stock, current_stock)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (book_id) DO NOTHING`,
        [b.bookId, b.title, b.category, b.coverImage || null, b.coverGradient || null, b.totalStock || 1, b.currentStock ?? b.totalStock ?? 1]
      );
      bookCount++;
    }
    console.log(`  Books migrated: ${bookCount}`);

    // ---- Issued books ----
    let issuedCount = 0;
    for (const ib of legacy.issuedBooks || []) {
      await client.query(
        `INSERT INTO issued_books (transaction_id, user_id, book_id, issued_at)
         SELECT $1,$2,$3,$4
         WHERE EXISTS (SELECT 1 FROM users WHERE user_id = $2)
           AND EXISTS (SELECT 1 FROM books WHERE book_id = $3)
         ON CONFLICT (transaction_id) DO NOTHING`,
        [ib.transactionId, ib.userId, ib.bookId, ib.timestamp || new Date().toISOString()]
      );
      issuedCount++;
    }
    console.log(`  Issued-book records migrated: ${issuedCount}`);

    // ---- Logs ----
    let logCount = 0;
    for (const l of legacy.logs || []) {
      await client.query('INSERT INTO logs (text, created_at) VALUES ($1,$2)', [l.text, l.timestamp || new Date().toISOString()]);
      logCount++;
    }
    console.log(`  Log entries migrated: ${logCount}`);

    console.log('\nLegacy data migration complete!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
