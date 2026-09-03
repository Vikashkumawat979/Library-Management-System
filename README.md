# 📚 Smart Library Management System

A full-stack Library / Study-Room Membership Management System — student
registration, seat booking, plan-based memberships, book inventory with
auto-fetched covers, admin dashboard, automated emails, and a real
PostgreSQL database behind everything.

<p>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green">
</p>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
- [Environment Variables](#-environment-variables)
- [Database Schema](#-database-schema)
- [API Reference](#-api-reference)
- [Background Jobs](#-background-jobs)
- [Screens / Pages](#-screens--pages)
- [Roadmap Ideas](#-roadmap-ideas)
- [License](#-license)

---

## 🧭 Overview

Smart Library is a self-service portal for a paid library / reading-room
business. Students register online, choose a membership plan and daily
time slot, book a physical seat, and pay — all tracked against a real
seat map. Admins get a full dashboard to manage students, books, pricing,
and notices. Everything is backed by PostgreSQL with proper relationships
and constraints, so data integrity holds up in production.

---

## ✨ Features

### For Students
- 📝 Guided multi-step registration (details → plan → seat → review → payment)
- 💺 Live seat availability per time-slot, so no double-booking
- 💳 Simulated payment gateway with instant confirmation
- 📧 Automatic email with User ID + login link after payment
- 🔑 Login with just Full Name + User ID — no password to remember
- 📩 **Forgot ID?** — recover your User ID securely via your registered email
- 🔔 New notices pop up automatically on first login each session, and
  auto-clear 24 hours after being read
- ⬆️ **Upgrade Plan** — jump straight to seat selection for a new plan;
  pay only the difference, same User ID, same account
- ⏳ Automatic membership expiry — seat is released and login blocked the
  moment your plan runs out, no manual admin action needed

### For Admins
- 📊 Live dashboard: active members, seats occupied, revenue, activity log
- 👥 Full student directory — edit details, change plan, or permanently
  delete an account (cascades cleanly through all related data)
- 📚 Book inventory management — issue/return tracking, stock control
- 🖼️ **Automatic book cover fetching** from Open Library / Google Books by
  ISBN or title — plus a one-click "Refresh Covers" for older entries
- 💰 Editable pricing matrix (per duration × per plan)
- 📢 Send a notice to one student or broadcast to everyone
- 🔒 Four fixed daily shifts and four fixed plan durations — no accidental
  sprawl of ad-hoc slots/plans

### Under the Hood
- 🐘 Full PostgreSQL schema with foreign keys, constraints, and cascades
- ✉️ Real transactional email via Nodemailer (SMTP, e.g. Gmail App Password)
- ⏰ Hourly cron jobs for membership expiry + notification cleanup
- 🎨 Smooth, animated login page (User ↔ Admin tab switch)

---

## 🛠 Tech Stack

| Layer          | Technology                                   |
|----------------|-----------------------------------------------|
| Frontend       | HTML5, CSS3, Vanilla JavaScript               |
| Backend        | Node.js, Express.js                           |
| Database       | PostgreSQL (managed via pgAdmin)              |
| Email          | Nodemailer (SMTP)                             |
| Scheduling     | node-cron                                     |
| File Uploads   | Multer                                        |
| External APIs  | Open Library Covers API, Google Books API     |
| HTTP Client    | Axios                                         |

---

## 📂 Project Structure

```
Library_Management_System/
├── server.js                   # Express app — all API routes
├── package.json
├── .env.example                 # Copy to .env and fill in your values
│
├── db/
│   ├── index.js                  # PostgreSQL data access layer
│   └── migrate-legacy-data.js    # One-time import of old database.json
│
├── config/
│   ├── db.js                     # PostgreSQL connection pool
│   └── mailer.js                 # Nodemailer email service + templates
│
├── utils/
│   ├── bookCover.js               # Open Library / Google Books cover lookup
│   └── scheduler.js               # Cron jobs: expiry sweep, notification cleanup
│
├── sql/
│   ├── schema.sql                  # Table definitions, constraints, indexes
│   └── seed.sql                    # Fixed plans/slots/pricing/admin/sample books
│
├── frontend/                        # All pages (served statically by Express)
│   ├── login.html
│   ├── registration.html
│   ├── plan.html
│   ├── slot.html
│   ├── review.html
│   ├── payment.html
│   ├── user-dashbord.html
│   ├── admin-dashbord.html
│   ├── script.js
│   └── style.css
│
├── uploads/                          # Student photo / ID document uploads
├── legacy-data-backup/
│   └── database.json                 # Original data, used by the migration script
│
└── SETUP_GUIDE.md                    # Full install walkthrough (PostgreSQL, pgAdmin, etc.)
```

---

## 🚀 Quick Start

> For a full walkthrough (installing PostgreSQL, configuring pgAdmin, Gmail
> App Passwords, etc.) see **[SETUP_GUIDE.md](./SETUP_GUIDE.md)**. This is
> the condensed version.

```bash
# 1. Install dependencies
npm install

# 2. Set up your environment
cp .env.example .env
# then edit .env with your PostgreSQL + SMTP details

# 3. Create the database schema (run in pgAdmin's Query Tool, or via psql)
psql -U postgres -d smart_library -f sql/schema.sql
psql -U postgres -d smart_library -f sql/seed.sql

# 4. (Optional) Import your old JSON data, if you have any
npm run migrate-data

# 5. Start the server
npm start
```

Then open **http://localhost:3000/login.html** in your browser.

**Default admin login:** Name `Vikash Kumawat` (or `admin`) · Admin ID `admin`

---

## 🔐 Environment Variables

All configuration lives in `.env` (see `.env.example` for the template).

| Variable                | Description                                        |
|--------------------------|-----------------------------------------------------|
| `PORT`                   | Port the server runs on (default `3000`)             |
| `APP_LOGIN_URL`           | Full URL to the login page, used in emails           |
| `DB_HOST` / `DB_PORT`      | PostgreSQL host & port                              |
| `DB_USER` / `DB_PASSWORD`  | PostgreSQL credentials                              |
| `DB_NAME`                  | Database name (`smart_library`)                     |
| `SMTP_HOST` / `SMTP_PORT`   | SMTP server details (e.g. `smtp.gmail.com`, `587`) |
| `SMTP_USER` / `SMTP_PASS`   | SMTP login (use a Gmail **App Password**, not your real password) |
| `SMTP_FROM`                 | "From" name/address shown on outgoing emails        |
| `GOOGLE_BOOKS_API_KEY`      | Optional — only needed if you hit rate limits        |

> If SMTP isn't configured yet, the app still works end-to-end — emails
> are printed to the server console instead of being sent, so you can test
> everything locally before wiring up real email.

---

## 🗄 Database Schema

| Table            | Purpose                                                        |
|-------------------|-----------------------------------------------------------------|
| `admins`           | Admin login accounts                                            |
| `plans`             | Fixed membership durations (1 Week / 1 Month / 3 Months / 6 Months) |
| `slots`             | Fixed daily shifts (Morning / Afternoon / Evening / Night)        |
| `pricing`           | Price matrix: hours-per-day × plan → price                       |
| `users`             | Student accounts, membership status, assigned seat                |
| `books`             | Book catalog, stock counts, cover images                          |
| `issued_books`      | Currently checked-out book copies                                 |
| `payments`          | Full transaction history (registrations + upgrades)               |
| `notifications`     | Per-student notices, read/unread state                             |
| `logs`              | System activity log shown on the admin dashboard                   |

All foreign keys use `ON DELETE CASCADE` where appropriate (e.g. deleting a
student cleanly removes their issued books, notifications, and payment
history). Full definitions are in [`sql/schema.sql`](./sql/schema.sql).

---

## 🔌 API Reference

| Method | Endpoint                                | Description                              |
|--------|-------------------------------------------|--------------------------------------------|
| POST   | `/api/upload-temp`                          | Upload photo / ID during registration        |
| GET    | `/api/seats/status?slots=...`                | Get booked seats for given time slots         |
| POST   | `/api/register`                              | Complete registration + book seat + email     |
| POST   | `/api/login`                                 | Student / Admin login                          |
| POST   | `/api/forgot-id`                             | Email a student their User ID                  |
| GET    | `/api/user/profile?userId=...`                 | Get a student's dashboard data                |
| GET    | `/api/user/notifications/unread?userId=...`     | Unread notices for auto-popup                 |
| POST   | `/api/user/notifications/mark-read`             | Mark all notices as read                      |
| POST   | `/api/user/upgrade`                             | Upgrade a student's plan (same User ID)       |
| GET    | `/api/admin/dashboard`                          | Admin stats + activity log                    |
| GET    | `/api/admin/users`                               | List all students                             |
| POST   | `/api/admin/users/update`                        | Edit a student's details/plan                 |
| DELETE | `/api/admin/users/:uid`                          | Permanently delete a student                  |
| GET    | `/api/books`                                     | List all books                                |
| POST   | `/api/admin/books`                               | Add a book (auto-fetches cover)               |
| POST   | `/api/admin/books/update`                        | Edit a book                                   |
| DELETE | `/api/admin/books/:bookId?qty=...`                | Remove book copies / whole title             |
| POST   | `/api/admin/books/backfill-covers`                | Fetch covers for books missing one            |
| POST   | `/api/admin/books/action`                         | Issue / return a book                        |
| POST   | `/api/admin/users/message`                         | Send a notice to one student                 |
| POST   | `/api/admin/users/broadcast`                       | Send a notice to all students                |
| GET    | `/api/plans/prices`                                | Get the pricing matrix                       |
| POST   | `/api/plans/update-price`                          | Update a plan's price                        |
| GET    | `/api/slots`                                       | List the four fixed shifts                   |
| GET    | `/api/health`                                       | Health check                                 |

---

## ⏰ Background Jobs

Two `node-cron` jobs run automatically once the server starts (and once
immediately at boot):

- **Membership expiry sweep** (hourly) — releases the seat and blocks login
  for any account past its `expires_at`.
- **Notification cleanup** (hourly) — permanently deletes notices that were
  read more than 24 hours ago.

See [`utils/scheduler.js`](./utils/scheduler.js).

---

## 🖥 Screens / Pages

| Page                    | Purpose                                  |
|---------------------------|--------------------------------------------|
| `login.html`               | User / Admin login (animated tab switch)     |
| `registration.html`        | Step 1 — student details + document upload   |
| `plan.html`                 | Step 2 — choose plan + duration               |
| `slot.html`                  | Step 3 — pick an available seat               |
| `review.html`                 | Step 4 — review before payment               |
| `payment.html`                 | Step 5 — payment + confirmation             |
| `user-dashbord.html`             | Student dashboard, plans, notices          |
| `admin-dashbord.html`             | Admin dashboard, users, books, pricing    |

---

## 🗺 Roadmap Ideas

- [ ] Real payment gateway integration (Razorpay / Stripe) in place of the simulated flow
- [ ] Password-based admin auth (the `admins.password_hash` column is already in place for this)
- [ ] A dedicated time-slot picker step in the Upgrade flow
- [ ] SMS notifications alongside email
- [ ] Seat-level analytics / occupancy heatmap

---

## 📄 License

This project is provided as-is for personal / educational use. Add your
preferred license here (e.g. MIT) if you plan to distribute it publicly.

---

<p align="center">Built with ❤️ for Smart Library</p>
