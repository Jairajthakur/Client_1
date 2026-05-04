const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Image upload setup ────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'service-images');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const service = (req.query.service || 'general').replace(/[^a-z0-9]/gi, '_');
    const ext = path.extname(file.originalname);
    cb(null, `${service}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// ── Database setup ────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      phone      TEXT NOT NULL,
      service    TEXT NOT NULL,
      date       TEXT NOT NULL,
      notes      TEXT DEFAULT '',
      status     TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✦ Database ready');
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['https://jairajthakur.github.io', 'http://localhost:3000', 'http://localhost:5500'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));
app.use(express.json());
app.use('/service-images', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname)));

// ── Helpers ───────────────────────────────────────────────────────────────────
const OWNER_SECRET = 'hansika2025';

function ownerAuth(req, res, next) {
  const secret = req.query.secret || req.headers['x-owner-secret'];
  if (secret !== OWNER_SECRET)
    return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  next();
}

function rowToAppt(r) {
  return { id: r.id, name: r.name, phone: r.phone, service: r.service,
           date: r.date, notes: r.notes, status: r.status, createdAt: r.created_at };
}

// ── IMAGE ROUTES ──────────────────────────────────────────────────────────────

// GET /api/images?service=Hair+Styling  → list images for a service (public)
app.get('/api/images', (req, res) => {
  const service = (req.query.service || '').replace(/[^a-z0-9]/gi, '_');
  const files = fs.readdirSync(UPLOADS_DIR)
    .filter(f => !service || f.startsWith(service))
    .map(f => `/service-images/${f}`);
  res.json({ ok: true, images: files });
});

// POST /api/owner/images?service=Hair+Styling  → upload image (owner only)
app.post('/api/owner/images', ownerAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No image uploaded.' });
  res.json({ ok: true, url: `/service-images/${req.file.filename}` });
});

// DELETE /api/owner/images?file=filename.jpg  → delete image (owner only)
app.delete('/api/owner/images', ownerAuth, (req, res) => {
  const file = req.query.file;
  if (!file) return res.status(400).json({ ok: false, error: 'No file specified.' });
  const filePath = path.join(UPLOADS_DIR, path.basename(file));
  if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: 'Not found.' });
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// ── PUBLIC ROUTES ─────────────────────────────────────────────────────────────

app.post('/api/appointments', async (req, res) => {
  const { name, phone, service, date, notes } = req.body;
  if (!name || !phone || !service || !date)
    return res.status(400).json({ ok: false, error: 'name, phone, service and date are required.' });
  if (phone.replace(/\D/g, '').length < 6)
    return res.status(400).json({ ok: false, error: 'Invalid phone number.' });
  if (isNaN(new Date(date)))
    return res.status(400).json({ ok: false, error: 'Invalid date.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO appointments (name, phone, service, date, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name.trim(), phone.trim(), service, date, notes ? notes.trim() : '']
    );
    return res.status(201).json({ ok: true, appointment: rowToAppt(rows[0]) });
  } catch (e) { console.error(e); return res.status(500).json({ ok: false, error: 'Database error.' }); }
});

// ── OWNER ROUTES ──────────────────────────────────────────────────────────────

app.get('/api/owner/appointments', ownerAuth, async (req, res) => {
  const { status, date, search } = req.query;
  let query = 'SELECT * FROM appointments WHERE 1=1';
  const params = [];
  if (status && status !== 'all') { params.push(status); query += ` AND status=$${params.length}`; }
  if (date) { params.push(date); query += ` AND date=$${params.length}`; }
  if (search) { params.push(`%${search.toLowerCase()}%`); query += ` AND (LOWER(name) LIKE $${params.length} OR phone LIKE $${params.length} OR LOWER(service) LIKE $${params.length})`; }
  query += ' ORDER BY created_at DESC';
  try {
    const { rows } = await pool.query(query, params);
    return res.json({ ok: true, count: rows.length, appointments: rows.map(rowToAppt) });
  } catch (e) { console.error(e); return res.status(500).json({ ok: false, error: 'Database error.' }); }
});

app.patch('/api/owner/appointments/:id', ownerAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  const allowed = ['pending', 'confirmed', 'done', 'cancelled'];
  if (!allowed.includes(status))
    return res.status(400).json({ ok: false, error: `Status must be one of: ${allowed.join(', ')}` });
  try {
    const { rows } = await pool.query('UPDATE appointments SET status=$1 WHERE id=$2 RETURNING *', [status, id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Not found.' });
    return res.json({ ok: true, appointment: rowToAppt(rows[0]) });
  } catch (e) { console.error(e); return res.status(500).json({ ok: false, error: 'Database error.' }); }
});

app.delete('/api/owner/appointments/:id', ownerAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { rows } = await pool.query('DELETE FROM appointments WHERE id=$1 RETURNING id', [id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Not found.' });
    return res.json({ ok: true, message: `Appointment #${id} deleted.` });
  } catch (e) { console.error(e); return res.status(500).json({ ok: false, error: 'Database error.' }); }
});

app.get('/api/owner/stats', ownerAuth, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='pending')   AS pending,
        COUNT(*) FILTER (WHERE status='confirmed') AS confirmed,
        COUNT(*) FILTER (WHERE status='done')      AS done,
        COUNT(*) FILTER (WHERE status='cancelled') AS cancelled,
        COUNT(*) FILTER (WHERE date=$1)            AS today,
        COUNT(*)                                   AS total
      FROM appointments
    `, [today]);
    const s = rows[0];
    return res.json({ ok: true, stats: {
      total: +s.total, pending: +s.pending, confirmed: +s.confirmed,
      done: +s.done, cancelled: +s.cancelled, today: +s.today
    }});
  } catch (e) { console.error(e); return res.status(500).json({ ok: false, error: 'Database error.' }); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n✦ Hansika Backend running on port ${PORT}`);
    console.log(`  Owner secret: hansika2025\n`);
  });
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });
