# Hansika Beauty Parlor — Backend

A lightweight Node.js + Express backend for managing appointments, with a password-protected owner dashboard.

---

## 📁 Project Structure

```
hansika-backend/
├── server.js          ← Express API server
├── db.json            ← Auto-created: stores all appointments (JSON)
├── package.json
└── public/
    ├── index.html     ← Customer-facing website (booking form)
    └── owner.html     ← Owner dashboard (password protected)
```

---

## 🚀 Setup & Run

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
node server.js
```

### 3. Open in browser
| URL | Purpose |
|-----|---------|
| `http://localhost:3000` | Customer booking website |
| `http://localhost:3000/owner.html` | Owner appointment dashboard |

---

## 🔐 Owner Password

Default password: **`hansika2025`**

To change it, edit line in `server.js`:
```js
const OWNER_SECRET = 'hansika2025';
```

---

## 📡 API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/appointments` | Book a new appointment |

**POST body:**
```json
{
  "name": "Priya Sharma",
  "phone": "+91 98765 43210",
  "service": "Facial & Skin",
  "date": "2025-05-15",
  "notes": "First visit"
}
```

---

### Owner (require `?secret=hansika2025`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/owner/appointments?secret=` | List all appointments |
| GET | `/api/owner/appointments?secret=&status=pending` | Filter by status |
| GET | `/api/owner/appointments?secret=&date=2025-05-15` | Filter by date |
| GET | `/api/owner/appointments?secret=&search=priya` | Search by name/phone/service |
| PATCH | `/api/owner/appointments/:id?secret=` | Update status |
| DELETE | `/api/owner/appointments/:id?secret=` | Delete appointment |
| GET | `/api/owner/stats?secret=` | Summary stats |

**PATCH body:**
```json
{ "status": "confirmed" }
```
Status values: `pending` | `confirmed` | `done` | `cancelled`

---

## 🌐 Deploying (Optional)

To run on a VPS/cloud server:
```bash
# Install PM2 process manager
npm install -g pm2

# Start and keep alive
pm2 start server.js --name hansika

# Auto-start on reboot
pm2 save && pm2 startup
```

Then point your domain to port 3000 (or use Nginx reverse proxy).
