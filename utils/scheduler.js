// =====================================================================
// Background job scheduler (node-cron)
// =====================================================================
// Two recurring jobs, plus an immediate run of both at server startup
// so nothing waits an hour after a fresh restart:
//
//   1) Membership expiry sweep — every hour. Any user whose expires_at
//      has passed gets status='expired', their seat is released, and
//      they can no longer log in.
//
//   2) Notification cleanup — every hour. Deletes notifications that
//      were marked read more than 24 hours ago.
// =====================================================================
const cron = require('node-cron');
const db = require('../db');

async function runExpirySweep() {
  try {
    const count = await db.expireOverdueUsers();
    if (count > 0) {
      console.log(`[Scheduler] Membership expiry sweep: ${count} account(s) expired and seat(s) released.`);
    }
  } catch (err) {
    console.error('[Scheduler] Membership expiry sweep failed:', err.message);
  }
}

async function runNotificationCleanup() {
  try {
    const count = await db.cleanupReadNotifications();
    if (count > 0) {
      console.log(`[Scheduler] Notification cleanup: removed ${count} read notification(s) older than 24h.`);
    }
  } catch (err) {
    console.error('[Scheduler] Notification cleanup failed:', err.message);
  }
}

function startScheduler() {
  // Run once immediately on boot.
  runExpirySweep();
  runNotificationCleanup();

  // Then every hour, on the hour.
  cron.schedule('0 * * * *', runExpirySweep);
  cron.schedule('15 * * * *', runNotificationCleanup);

  console.log('[Scheduler] Background jobs scheduled: membership expiry (hourly), notification cleanup (hourly).');
}

module.exports = { startScheduler, runExpirySweep, runNotificationCleanup };
