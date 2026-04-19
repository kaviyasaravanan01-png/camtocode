# Supabase Setup Guide for CamToCode

Run all SQL statements below in your Supabase dashboard:
**SQL Editor → New Query → Paste each section → Run**

---

## 1. Database Tables

### captures table — tracks every exported session per user

```sql
CREATE TABLE IF NOT EXISTS public.captures (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename        text NOT NULL,
    language        text NOT NULL DEFAULT 'unknown',
    blocks          integer NOT NULL DEFAULT 0,
    storage_path    text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Row Level Security: users can only see their own captures
ALTER TABLE public.captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own captures"
    ON public.captures FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own captures"
    ON public.captures FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS captures_user_id_idx ON public.captures(user_id);
CREATE INDEX IF NOT EXISTS captures_created_at_idx ON public.captures(created_at DESC);
```

---

## 2. Storage Bucket

### Create the camtocode bucket

```sql
-- Run in SQL Editor
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'camtocode',
    'camtocode',
    false,
    10485760,  -- 10 MB max per file
    ARRAY['text/plain', 'application/octet-stream', 'text/x-python', 'application/javascript']
)
ON CONFLICT (id) DO NOTHING;
```

Or in the Storage UI:
1. Storage → New bucket
2. Name: `camtocode`
3. Public: OFF (private)
4. File size limit: 10 MB

---

## 3. Storage RLS Policies

### Allow users to access only their own folder

```sql
-- Policy: users can upload to their own folder (user_id/*)
CREATE POLICY "Users can upload own files"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'camtocode'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Policy: users can read their own files
CREATE POLICY "Users can read own files"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'camtocode'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Policy: users can update (overwrite) their own files
CREATE POLICY "Users can update own files"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'camtocode'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Policy: users can delete their own files
CREATE POLICY "Users can delete own files"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'camtocode'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Policy: service_role can access everything (used by backend)
-- (service_role bypasses RLS by default — no extra policy needed)
```

---

## 4. Enable Google OAuth (optional but recommended)

In Supabase Dashboard:
1. Authentication → Providers → Google
2. Enable Google
3. Add your Google OAuth credentials:
   - Client ID: from Google Cloud Console
   - Client Secret: from Google Cloud Console
4. Add redirect URL to Google: `https://your-project.supabase.co/auth/v1/callback`

---

## 5. Configure Auth Settings

In Supabase Dashboard → Authentication → URL Configuration:
- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/app`

---

## 6. Get Your Keys

From **Project Settings → API**:

| Key | Where to use |
|-----|-------------|
| `Project URL` | `SUPABASE_URL` in both backend and frontend |
| `anon / public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` in frontend |
| `service_role` (keep secret!) | `SUPABASE_SERVICE_KEY` in backend only |
| `JWT Secret` (under JWT Settings) | `SUPABASE_JWT_SECRET` in backend |

---

## 7. Verify Setup

Run this query to confirm everything is set up correctly:

```sql
-- Should return 0 (empty captures table for fresh install)
SELECT count(*) FROM public.captures;

-- Should return 1 (camtocode bucket exists)
SELECT count(*) FROM storage.buckets WHERE id = 'camtocode';

-- List RLS policies on captures
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'captures';

-- List RLS policies on storage.objects for camtocode bucket
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage';
```

---

## Storage Structure

```
camtocode/                       ← bucket
├── {user_uuid}/
│   ├── live_buffer.txt          ← active capture session (overwritten each time)
│   └── exports/
│       ├── 20241215_143022_python_session1.py
│       ├── 20241215_150300_javascript_session2.js
│       └── ...
```

Files in `exports/` are permanent until the user deletes them.
`live_buffer.txt` is a temporary scratchpad reset at each Start.
