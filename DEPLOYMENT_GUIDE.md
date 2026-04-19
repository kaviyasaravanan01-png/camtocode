# CamToCode — Deployment Guide

Full deployment: Vercel (frontend) + Railway (backend) + Supabase (DB/Auth/Storage)

---

## Prerequisites

- Node.js 18+ installed locally
- Python 3.11+ installed locally
- Accounts: [Vercel](https://vercel.com), [Railway](https://railway.app), [Supabase](https://supabase.com)
- Git repo (GitHub recommended)

---

## Step 1: Supabase Setup

1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a region close to your users
3. Wait for project to be ready (~2 min)
4. Open **SQL Editor** and run all queries from `SUPABASE_SETUP.md`
5. Note down your keys from **Project Settings → API**:
   - Project URL
   - anon/public key
   - service_role key
   - JWT Secret

---

## Step 2: Deploy Backend to Railway

### 2a. Push backend to GitHub

Make sure your `backend/` folder has:
```
backend/
├── main.py
├── requirements.txt
├── Dockerfile
└── .env.example
```

If you have `eng_best.traineddata`, add it to `backend/` too for better OCR accuracy.

### 2b. Create Railway project

1. Go to [railway.app](https://railway.app) → New Project
2. Deploy from GitHub repo
3. Select your repo, set **Root Directory** to `backend`
4. Railway auto-detects the `Dockerfile`

### 2c. Set environment variables in Railway

Go to your Railway service → **Variables** tab, add:

```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...  (service_role key)
SUPABASE_JWT_SECRET=your-jwt-secret
ANTHROPIC_API_KEY=sk-ant-api03-...
FRONTEND_URL=https://your-app.vercel.app   (set after Vercel deploy)
SECRET_KEY=your-random-secret-string
PORT=5000
```

### 2d. Get your Railway backend URL

After deployment, Railway gives you a URL like:
`https://camtocode-production.up.railway.app`

Keep this — you'll need it for the frontend.

---

## Step 3: Deploy Frontend to Vercel

### 3a. Push frontend to GitHub

Make sure your `frontend/` folder has all files and `package.json`.

### 3b. Create Vercel project

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repo
3. Set **Root Directory** to `frontend`
4. Framework: **Next.js** (auto-detected)

### 3c. Set environment variables in Vercel

Go to **Settings → Environment Variables**, add:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...  (anon/public key)
NEXT_PUBLIC_BACKEND_URL=https://your-backend.railway.app
```

### 3d. Deploy

Click **Deploy**. Vercel builds and deploys automatically.

Your frontend URL will be: `https://your-app.vercel.app`

---

## Step 4: Wire Things Together

1. **Update Railway `FRONTEND_URL`** to your Vercel URL:
   - Railway → Variables → `FRONTEND_URL=https://your-app.vercel.app`
   - Railway redeploys automatically

2. **Update Supabase Auth redirect URLs**:
   - Supabase → Authentication → URL Configuration
   - Site URL: `https://your-app.vercel.app`
   - Add redirect URL: `https://your-app.vercel.app/app`

3. **Enable Google OAuth** (optional):
   - Supabase → Authentication → Providers → Google
   - Add OAuth credentials from Google Cloud Console
   - Add authorized redirect: `https://your-project.supabase.co/auth/v1/callback`

---

## Step 5: Verify Everything Works

1. Open `https://your-app.vercel.app`
2. Sign up with email or Google
3. You're redirected to `/app`
4. Allow camera access
5. Point phone at code → Start → Stop
6. Code appears in output
7. Export session → file saved to Supabase Storage
8. Visit `/history` → see your exports with download links

---

## Local Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # Fill in your values
python main.py
```

Backend runs at `http://localhost:5000`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local  # Fill in your values
npm run dev
```

Frontend runs at `http://localhost:3000`

---

## File Structure

```
camtocode/
├── backend/                    ← Railway deployment
│   ├── main.py                 ← Flask+SocketIO server (multi-user)
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   └── eng_best.traineddata    ← (optional) better Tesseract model
├── frontend/                   ← Vercel deployment
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── globals.css
│   │   │   ├── page.tsx        ← Login page
│   │   │   ├── app/page.tsx    ← Camera app (authenticated)
│   │   │   └── history/page.tsx← Export history
│   │   ├── components/
│   │   │   ├── CameraApp.tsx   ← Main camera UI
│   │   │   └── HistoryPage.tsx ← Download history
│   │   ├── lib/
│   │   │   └── supabase.ts     ← Supabase client helpers
│   │   └── middleware.ts       ← Auth route protection
│   ├── package.json
│   ├── next.config.js
│   ├── tsconfig.json
│   └── .env.example
├── SUPABASE_SETUP.md           ← SQL queries for DB/Storage setup
├── DEPLOYMENT_GUIDE.md         ← This file
├── backend.py                  ← Original single-user version (untouched)
└── static/index.html           ← Original frontend (untouched)
```

---

## Architecture Overview

```
User's Phone (Browser)
      │
      │  HTTPS + Socket.IO (long-polling)
      ▼
Vercel (Next.js 14)
  - Login/Signup (Supabase Auth)
  - Camera UI (React)
  - JWT from Supabase passed to backend
      │
      │  Socket.IO + REST
      ▼
Railway (Flask + SocketIO)
  - Per-user session state (UserSession class)
  - Tesseract OCR (server-side)
  - Claude Vision API (Anthropic)
  - JWT verification (PyJWT)
      │
      ├──► Supabase Storage
      │    - live_buffer.txt (per user, active session)
      │    - exports/{filename} (permanent downloads)
      │
      └──► Supabase DB
           - captures table (export history)
```

---

## Environment Variables Reference

### Backend (Railway)

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_KEY` | service_role key (secret!) | Yes |
| `SUPABASE_JWT_SECRET` | JWT secret for token verification | Yes |
| `ANTHROPIC_API_KEY` | Claude API key | Yes |
| `FRONTEND_URL` | Vercel URL for CORS | Yes |
| `SECRET_KEY` | Flask session secret | Yes |
| `PORT` | Server port (Railway sets this) | Auto |
| `TESSERACT_CMD` | Tesseract binary path (Linux: not needed) | Dev only |

### Frontend (Vercel)

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Yes |
| `NEXT_PUBLIC_BACKEND_URL` | Railway backend URL | Yes |

---

## Pricing Estimates

| Service | Free Tier | Paid |
|---------|-----------|------|
| Vercel | 100GB bandwidth/month | $20/month Pro |
| Railway | $5 credit/month | ~$5-20/month (usage-based) |
| Supabase | 500MB DB, 1GB storage, 50K MAU | $25/month Pro |
| Anthropic | None | ~$0.25 per 1M tokens (Haiku) |

For a small product (< 1000 users), total cost is roughly **$0-30/month**.

---

## Troubleshooting

**Camera not opening:**
- Must be served over HTTPS (Vercel handles this automatically)
- Allow camera permissions in browser

**Socket.IO connection fails:**
- Check `NEXT_PUBLIC_BACKEND_URL` is correct (no trailing slash)
- Check Railway is running (`railway logs`)
- Ensure CORS allows your Vercel domain

**Vision OCR errors:**
- Check `ANTHROPIC_API_KEY` is set in Railway
- Check Railway logs for detailed error

**Exports not saving:**
- Check `SUPABASE_SERVICE_KEY` is set (not anon key)
- Run the SQL from `SUPABASE_SETUP.md` again
- Check Storage bucket `camtocode` exists

**Auth not working:**
- Check Supabase Auth redirect URLs include your Vercel domain
- Check `SUPABASE_JWT_SECRET` matches the one in Supabase dashboard
