require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const db = require('./db');
const { verifyConnection } = require('./config/db');
const { sendMail, loginConfirmationEmail, upgradeConfirmationEmail, forgotIdEmail } = require('./config/mailer');
const { fetchBookCover } = require('./utils/bookCover');
const { startScheduler } = require('./utils/scheduler');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS and logs
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
});

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// Multer disk storage setup for photo and ID uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Serves the main pages directly
app.use(express.static(path.join(__dirname, 'frontend')));
app.use(express.static(__dirname));

// Small helper so every route doesn't need its own try/catch boilerplate.
function asyncRoute(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch(err => {
      console.error('[API Error]', req.method, req.originalUrl, '-', err.message);
      res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
    });
  };
}

function planDaysFromCode(planCode) {
  return { '1w': 7, '1m': 30, '3m': 90, '6m': 180 }[planCode] || 30;
}

// ==========================================
// 1. Temporary Upload Endpoint (Step 1)
// ==========================================
app.post('/api/upload-temp', upload.fields([
  { name: 'userPhoto', maxCount: 1 },
  { name: 'idFile', maxCount: 1 }
]), (req, res) => {
  try {
    const responseData = {};
    if (req.files['userPhoto']) {
      responseData.photoName = req.files['userPhoto'][0].originalname;
      responseData.photoPath = '/uploads/' + req.files['userPhoto'][0].filename;
    }
    if (req.files['idFile']) {
      responseData.idName = req.files['idFile'][0].originalname;
      responseData.idPath = '/uploads/' + req.files['idFile'][0].filename;
    }
    res.json({ success: true, data: responseData });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ success: false, message: "File upload failed." });
  }
});

// ==========================================
// 2. Query Occupied Seats for Selected Slots (Step 3)
// ==========================================
app.get('/api/seats/status', asyncRoute(async (req, res) => {
  const slotsParam = req.query.slots || '';
  if (!slotsParam) {
    return res.json({ success: true, bookedSeats: [] });
  }
  const slotsArray = slotsParam.split(',').map(s => s.trim());
  const bookedSeats = await db.getBookedSeatsBySlots(slotsArray);
  res.json({ success: true, bookedSeats });
}));

// ==========================================
// 3. Complete Registration and Book Seat (Step 5)
// ==========================================
app.post('/api/register', asyncRoute(async (req, res) => {
  const {
    name, phone, email, address, idProofType,
    photoName, photoPath, idName, idPath,
    plan, duration, slot, selectedSeat, totalAmount
  } = req.body;

  if (!name || !phone || !email || !selectedSeat) {
    return res.status(400).json({ success: false, message: "Missing required details." });
  }

  const userId = await db.generateUniqueUserId(name);
  const registeredAt = new Date();
  const days = planDaysFromCode(plan);
  const expiresAt = new Date(registeredAt.getTime() + days * 24 * 60 * 60 * 1000);

  const userObj = {
    userId, name, phone, email, address, idProofType,
    photo: photoPath || null,
    idFile: idName || null,
    plan, duration, slot, selectedSeat,
    totalAmount: parseFloat(totalAmount || 0).toFixed(2),
    registeredAt, expiresAt
  };

  const savedUser = await db.insertUser(userObj);

  // Fire-and-forget confirmation email (never blocks the response on SMTP hiccups).
  const mail = loginConfirmationEmail({ name, userId, seat: selectedSeat });
  sendMail({ to: email, ...mail }).catch(() => {});

  res.json({
    success: true,
    message: "Registration completed successfully!",
    userId,
    user: savedUser
  });
}));

// ==========================================
// 4. Authenticated Login (login.html)
// ==========================================
app.post('/api/login', asyncRoute(async (req, res) => {
  const { name, userId } = req.body;

  if (!name || !userId) {
    return res.status(400).json({ success: false, message: "Enter name and User ID." });
  }

  // Admin check (database-backed)
  if (userId.toLowerCase() === 'admin') {
    const admin = await db.findAdminForLogin('admin', name);
    if (admin) {
      return res.json({ success: true, role: 'admin', userId: 'admin', name: admin.name });
    }
    return res.status(401).json({ success: false, message: "Invalid Admin Credentials." });
  }

  // Student check
  const student = await db.getUserById(userId);
  if (!student || student.name.toLowerCase() !== name.toLowerCase()) {
    return res.status(401).json({ success: false, message: "Invalid student credentials. Register if new." });
  }

  if (student.status === 'expired') {
    return res.status(403).json({ success: false, message: "Your membership has expired. Please renew your plan or contact the librarian." });
  }
  if (student.status === 'deactivated') {
    return res.status(403).json({ success: false, message: "This account has been deactivated. Please contact the librarian." });
  }

  return res.json({ success: true, role: 'student', userId: student.userId, name: student.name });
}));

// ==========================================
// Forgot User ID — sent securely via registered email
// ==========================================
app.post('/api/forgot-id', asyncRoute(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: "Please enter your registered email address." });
  }

  const student = await db.getUserByEmail(email);
  // Always respond with the same generic success message regardless of whether
  // the email exists, so this endpoint can't be used to enumerate registered emails.
  if (student) {
    const mail = forgotIdEmail({ name: student.name, userId: student.userId });
    await sendMail({ to: student.email, ...mail });
  }
  res.json({ success: true, message: "If that email is registered, your User ID has been sent to it." });
}));

// ==========================================
// 5. Student Dashboard Profile Load
// ==========================================
app.get('/api/user/profile', asyncRoute(async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing userId." });
  }

  const student = await db.getUserById(userId);
  if (!student) {
    return res.status(404).json({ success: false, message: "Student not found." });
  }

  const issued = await db.getIssuedBooks(userId);
  const notifications = await db.getNotificationsForUser(userId);

  res.json({
    success: true,
    student: { ...student, notifications },
    issuedBooks: issued
  });
}));

// ==========================================
// 5b. Notifications: unread (for auto-popup) + mark-as-read
// ==========================================
app.get('/api/user/notifications/unread', asyncRoute(async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ success: false, message: "Missing userId." });
  const unread = await db.getUnreadNotifications(userId);
  res.json({ success: true, notifications: unread });
}));

app.post('/api/user/notifications/mark-read', asyncRoute(async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: "Missing userId." });
  await db.markAllNotificationsRead(userId);
  res.json({ success: true, message: "Notifications marked as read. They'll auto-clear 24 hours from now." });
}));

// ==========================================
// 6. Admin Dashboard Stats
// ==========================================
app.get('/api/admin/dashboard', asyncRoute(async (req, res) => {
  const users = await db.getUsers();

  const activeUsers = users.filter(u => u.status === 'active');
  const totalActiveMembers = activeUsers.length;
  const occupiedSeatsCount = activeUsers.filter(u => u.selectedSeat).length;

  let revenue = 0;
  users.forEach(u => { revenue += parseFloat(u.totalAmount || 0); });

  const recentSubscriptions = users.slice(0, 25).map(u => ({
    name: u.name,
    userId: u.userId,
    plan: `${u.duration} Hours (${u.plan === '1w' ? '1 Week' : u.plan === '3m' ? '3 Months' : u.plan === '6m' ? '6 Months' : '1 Month'})`,
    seat: u.selectedSeat,
    amount: '₹' + u.totalAmount,
    status: u.status === 'active' ? 'Paid' : (u.status === 'expired' ? 'Expired' : 'Deactivated')
  }));

  const logs = await db.getLogs();

  res.json({
    success: true,
    stats: {
      activeMembers: totalActiveMembers,
      seatsOccupied: `${occupiedSeatsCount} / 120`,
      revenue: '₹' + revenue.toLocaleString('en-IN')
    },
    recentSubscriptions,
    logs
  });
}));

// ==========================================
// 7. Admin Student Directory CRUD
// ==========================================
app.get('/api/admin/users', asyncRoute(async (req, res) => {
  res.json({ success: true, users: await db.getUsers() });
}));

app.post('/api/admin/users/update', asyncRoute(async (req, res) => {
  const { userId, name, phone, email, selectedSeat, slot, plan, idProofType, address } = req.body;
  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing User ID." });
  }

  const student = await db.getUserById(userId);
  if (!student) {
    return res.status(404).json({ success: false, message: "Student not found." });
  }

  const updatedFields = { name, phone, email, selectedSeat, slot, plan, idProofType, address };

  if (plan) {
    const days = await db.getPlanDays(plan);
    const regDate = new Date(student.registeredAt);
    const expiresAtDate = new Date(regDate.getTime() + days * 24 * 60 * 60 * 1000);
    updatedFields.expiresAt = expiresAtDate;

    const prices = await db.getPrices();
    const hrs = String(student.duration || '12');
    updatedFields.totalAmount = (prices[hrs] && prices[hrs][plan] !== undefined)
      ? prices[hrs][plan].toFixed(2)
      : student.totalAmount;
  }

  const updated = await db.updateUser(userId, updatedFields);
  if (updated) {
    res.json({ success: true, user: updated });
  } else {
    res.status(404).json({ success: false, message: "Student not found." });
  }
}));

app.delete('/api/admin/users/:uid', asyncRoute(async (req, res) => {
  const userId = req.params.uid;
  const deleted = await db.deleteUser(userId);
  if (deleted) {
    res.json({ success: true, message: "Student permanently deleted from the database. They can no longer log in." });
  } else {
    res.status(404).json({ success: false, message: "Student not found." });
  }
}));

// // ==========================================
// // 8. Book Actions APIs
// // ==========================================
// app.get('/api/books', asyncRoute(async (req, res) => {
//   res.json({ success: true, books: await db.getBooks() });
// }));

// app.post('/api/admin/books/action', asyncRoute(async (req, res) => {
//   const { userId, bookCode, actionType } = req.body;

//   if (!userId || !bookCode || !actionType) {
//     return res.status(400).json({ success: false, message: "Missing parameter fields." });
//   }

//   try {
//     if (actionType === 'assign') {
//       const result = await db.issueBook(userId, bookCode);
//       res.json({ success: true, message: `Book issued successfully to ${result.user.name}.` });
//     } else if (actionType === 'return') {
//       const result = await db.returnBook(userId, bookCode);
//       res.json({ success: true, message: `Book returned successfully by ${result.user.name}.` });
//     } else {
//       res.status(400).json({ success: false, message: "Invalid action type." });
//     }
//   } catch (err) {
//     res.status(400).json({ success: false, message: err.message });
//   }
// }));

// ==========================================
// Helper Function: Google Books API se cover nikalna
// ==========================================
async function getCoverByTitle(title) {
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}`);
    const data = await response.json();
    if (data.items && data.items[0]?.volumeInfo?.imageLinks?.thumbnail) {
      return data.items[0].volumeInfo.imageLinks.thumbnail.replace('http://', 'https://');
    }
  } catch (err) {
    console.error("Error fetching cover for title:", title);
  }
  return 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c';
}

// ==========================================
// 8. Book Actions APIs
// ==========================================
app.get('/api/books', asyncRoute(async (req, res) => {
  const rawBooks = await db.getBooks();

  const booksWithCovers = await Promise.all(
    rawBooks.map(async (book) => {
      let cover = book.coverImage || book.cover_image;
      if (!cover) {
        cover = await getCoverByTitle(book.title);
      }
      return {
        ...book,
        coverImage: cover
      };
    })
  );

  res.json({ success: true, books: booksWithCovers });
}));

app.post('/api/admin/books/action', asyncRoute(async (req, res) => {
  const { userId, bookCode, actionType } = req.body;

  if (!userId || !bookCode || !actionType) {
    return res.status(400).json({ success: false, message: "Missing parameter fields." });
  }

  try {
    if (actionType === 'assign') {
      const result = await db.issueBook(userId, bookCode);
      res.json({ success: true, message: `Book issued successfully to ${result.user.name}.` });
    } else if (actionType === 'return') {
      const result = await db.returnBook(userId, bookCode);
      res.json({ success: true, message: `Book returned successfully by ${result.user.name}.` });
    } else {
      res.status(400).json({ success: false, message: "Invalid action type." });
    }
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}));

// ==========================================
// 9. Admin Add & Delete Books APIs (+ auto cover fetch)
// ==========================================
app.post('/api/admin/books', asyncRoute(async (req, res) => {
  const { title, bookId, category, coverGradient, coverImage, totalStock, isbn } = req.body;
  if (!title || !bookId || !category) {
    return res.status(400).json({ success: false, message: "Missing title, book ID, or category." });
  }

  if (await db.bookExists(bookId)) {
    return res.status(400).json({ success: false, message: "A book with this ID already exists." });
  }

  // Auto-fetch a real cover from Open Library / Google Books unless the
  // admin already supplied one manually.
  let resolvedCover = coverImage || null;
  if (!resolvedCover) {
    resolvedCover = await fetchBookCover({ title, isbn });
  }

  const bookObj = {
    bookId, title, category, isbn: isbn || null,
    coverGradient: coverGradient || "linear-gradient(135deg, #1e293b, #0f172a)",
    coverImage: resolvedCover,
    totalStock: parseInt(totalStock || 1, 10)
  };

  const saved = await db.insertBook(bookObj);
  res.json({ success: true, book: saved, coverAutoFetched: !coverImage && !!resolvedCover });
}));

app.delete('/api/admin/books/:bookId', asyncRoute(async (req, res) => {
  const bookId = req.params.bookId;
  const qty = parseInt(req.query.qty || 0, 10);
  const result = await db.deleteBookQty(bookId, qty);
  res.json({ success: true, message: result.message });
}));

// ==========================================
// 9b. Backfill covers for all existing books that don't have one yet
// ==========================================
app.post('/api/admin/books/backfill-covers', asyncRoute(async (req, res) => {
  const missing = await db.getBooksMissingCovers();
  let updatedCount = 0;

  for (const book of missing) {
    const cover = await fetchBookCover({ title: book.title, isbn: book.isbn });
    if (cover) {
      await db.updateBook(book.bookId, { coverImage: cover });
      updatedCount++;
    }
  }

  res.json({
    success: true,
    message: `Checked ${missing.length} book(s) without a cover. Updated ${updatedCount} with a fetched cover.`,
    checked: missing.length,
    updated: updatedCount
  });
}));

// ==========================================
// 10. Admin Send Message & Broadcast APIs
// ==========================================
app.post('/api/admin/users/message', asyncRoute(async (req, res) => {
  const { userId, text } = req.body;
  if (!userId || !text) {
    return res.status(400).json({ success: false, message: "Missing User ID or message text." });
  }
  const sent = await db.addNotification(userId, text);
  if (sent) {
    res.json({ success: true, message: "Message sent successfully." });
  } else {
    res.status(404).json({ success: false, message: "Student not found." });
  }
}));

app.post('/api/admin/users/broadcast', asyncRoute(async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ success: false, message: "Missing message text." });
  }
  await db.broadcastNotification(text);
  res.json({ success: true, message: "Broadcast notice sent successfully." });
}));

// ==========================================
// 11. Update Book Details (Edit book)
// ==========================================
app.post('/api/admin/books/update', asyncRoute(async (req, res) => {
  const { title, bookId, category, coverGradient, coverImage, totalStock, isbn } = req.body;
  if (!bookId) {
    return res.status(400).json({ success: false, message: "Missing book ID." });
  }

  const books = await db.getBooks();
  const existing = books.find(b => b.bookId === bookId);
  if (!existing) {
    return res.status(404).json({ success: false, message: "Book not found." });
  }

  const updatedFields = {};
  if (title) updatedFields.title = title;
  if (category) updatedFields.category = category;
  if (isbn !== undefined) updatedFields.isbn = isbn;
  if (coverGradient !== undefined) updatedFields.coverGradient = coverGradient;
  if (coverImage !== undefined) updatedFields.coverImage = coverImage;
  if (totalStock !== undefined) {
    const newTotal = parseInt(totalStock || 1, 10);
    updatedFields.totalStock = newTotal;
    const diff = newTotal - existing.totalStock;
    updatedFields.currentStock = Math.max(0, existing.currentStock + diff);
  }

  const updated = await db.updateBook(bookId, updatedFields);
  res.json({ success: true, book: updated });
}));

// ==========================================
// 12. Plan Prices APIs
// ==========================================
app.get('/api/plans/prices', asyncRoute(async (req, res) => {
  res.json({ success: true, prices: await db.getPrices() });
}));

app.post('/api/plans/update-price', asyncRoute(async (req, res) => {
  const { duration, plan, price } = req.body;
  if (!duration || !plan || price === undefined) {
    return res.status(400).json({ success: false, message: "Missing duration, plan, or price." });
  }
  const updatedPrices = await db.updatePrice(String(duration), plan, parseFloat(price));
  res.json({ success: true, prices: updatedPrices, message: "Price updated successfully." });
}));

// ==========================================
// 13. Slots API (read-only — fixed at 4 shifts; manage via pgAdmin)
// ==========================================
app.get('/api/slots', asyncRoute(async (req, res) => {
  res.json({ success: true, slots: await db.getSlots() });
}));

// ==========================================
// 14. Plan Upgrade (User Dashboard -> Upgrade button)
// ==========================================
// Takes the user straight from seat re-selection to a payment charging
// ONLY the new plan's price, keeping the same User ID and account.
app.post('/api/user/upgrade', asyncRoute(async (req, res) => {
  const { userId, plan, duration, slot, selectedSeat, totalAmount } = req.body;
  if (!userId || !plan || !duration || !selectedSeat) {
    return res.status(400).json({ success: false, message: "Missing upgrade details." });
  }

  const existing = await db.getUserById(userId);
  if (!existing) {
    return res.status(404).json({ success: false, message: "Account not found." });
  }
  if (existing.status !== 'active') {
    return res.status(403).json({ success: false, message: "This account is not active and cannot be upgraded. Please contact the librarian." });
  }

  const days = await db.getPlanDays(plan);
  const updated = await db.upgradeUserPlan(userId, {
    planCode: plan,
    durationHours: parseInt(duration, 10),
    slotNames: slot,
    selectedSeat,
    amount: parseFloat(totalAmount || 0).toFixed(2),
    days
  });

  const mail = upgradeConfirmationEmail({ name: updated.name, userId: updated.userId, plan, seat: selectedSeat });
  sendMail({ to: updated.email, ...mail }).catch(() => {});

  res.json({ success: true, message: "Plan upgraded successfully!", user: updated });
}));

// ==========================================
// Health check
// ==========================================
app.get('/api/health', asyncRoute(async (req, res) => {
  res.json({ success: true, status: 'ok', time: new Date().toISOString() });
}));

// Start express application only after confirming the database is reachable.
(async () => {
  const connected = await verifyConnection();
  if (!connected) {
    console.error('\nServer NOT started — fix the database connection above and try again.\n');
    process.exit(1);
  }

  startScheduler();

  app.listen(PORT, () => {
    console.log(`Smart Library backend running at http://localhost:${PORT}`);
  });
})();
