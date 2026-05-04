const express = require('express');
const cors = require('cors');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database setup ────────────────────────────────────────────────────────────
const adapter = new FileSync(path.join(__dirname, 'db.json'));
const db = low(adapter);

db.defaults({
  appointments: [],
  _nextId: 1
}).write();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'https://jairajthakur.github.io',  // GitHub Pages site
    'http://localhost:3000',
    'http://localhost:5500',
  ],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Helper ────────────────────────────────────────────────────────────────────
const OWNER_SECRET = 'hansika2025';

function nextId() {
  const id = db.get('_nextId').value();
  db.set('_nextId', id + 1).write();
  return id;
}

// ── PUBLIC ROUTES ─────────────────────────────────────────────────────────────

// POST /api/appointments
app.post('/api/appointments', (req, res) => {
  const { name, phone, service, date, notes } = req.body;

  if (!name || !phone || !service || !date) {
    return res.status(400).json({ ok: false, error: 'name, phone, service and date are required.' });
  }
  if (phone.replace(/\D/g, '').length < 6) {
    return res.status(400).json({ ok: false, error: 'Invalid phone number.' });
  }
  const apptDate = new Date(date);
  if (isNaN(apptDate)) {
    return res.status(400).json({ ok: false, error: 'Invalid date.' });
  }

  const appointment = {
    id: nextId(),
    name: name.trim(),
    phone: phone.trim(),
    service,
    date,
    notes: notes ? notes.trim() : '',
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  db.get('appointments').push(appointment).write();
  return res.status(201).json({ ok: true, appointment });
});

// ── OWNER ROUTES ──────────────────────────────────────────────────────────────

function ownerAuth(req, res, next) {
  const secret = req.query.secret || req.headers['x-owner-secret'];
  if (secret !== OWNER_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  }
  next();
}

// GET /api/owner/appointments
app.get('/api/owner/appointments', ownerAuth, (req, res) => {
  let appts = db.get('appointments').value();

  const { status, date, search } = req.query;
  if (status && status !== 'all') appts = appts.filter(a => a.status === status);
  if (date)   appts = appts.filter(a => a.date === date);
  if (search) {
    const q = search.toLowerCase();
    appts = appts.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.phone.includes(q) ||
      a.service.toLowerCase().includes(q)
    );
  }

  appts = [...appts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.json({ ok: true, count: appts.length, appointments: appts });
});

// PATCH /api/owner/appointments/:id
app.patch('/api/owner/appointments/:id', ownerAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  const allowed = ['pending', 'confirmed', 'done', 'cancelled'];

  if (!allowed.includes(status)) {
    return res.status(400).json({ ok: false, error: `Status must be one of: ${allowed.join(', ')}` });
  }
  const appt = db.get('appointments').find({ id }).value();
  if (!appt) return res.status(404).json({ ok: false, error: 'Not found.' });

  db.get('appointments').find({ id }).assign({ status }).write();
  return res.json({ ok: true, appointment: db.get('appointments').find({ id }).value() });
});

// DELETE /api/owner/appointments/:id
app.delete('/api/owner/appointments/:id', ownerAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const appt = db.get('appointments').find({ id }).value();
  if (!appt) return res.status(404).json({ ok: false, error: 'Not found.' });

  db.get('appointments').remove({ id }).write();
  return res.json({ ok: true, message: `Appointment #${id} deleted.` });
});

// GET /api/owner/stats
app.get('/api/owner/stats', ownerAuth, (req, res) => {
  const all = db.get('appointments').value();
  const today = new Date().toISOString().split('T')[0];

  return res.json({
    ok: true,
    stats: {
      total:     all.length,
      pending:   all.filter(a => a.status === 'pending').length,
      confirmed: all.filter(a => a.status === 'confirmed').length,
      done:      all.filter(a => a.status === 'done').length,
      cancelled: all.filter(a => a.status === 'cancelled').length,
      today:     all.filter(a => a.date === today).length,
    }
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✦ Hansika Backend running on port ${PORT}`);
  console.log(`  Owner secret: hansika2025\n`);
});
