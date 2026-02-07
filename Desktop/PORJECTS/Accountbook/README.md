# Accountbook (React + Supabase)

This is a Khatabook-style starter app:
- Auth (username + password)
- Parties (contacts)
- Ledger entries (`gave` / `got`)
- Per-party running balance

## Backend choice
Use **Supabase as backend**:
- Postgres DB for data
- Supabase Auth for user accounts
- Row Level Security (RLS) for multi-tenant isolation
- Optional: Supabase Edge Functions later for notifications/reports

You do not need a separate Node/Express backend for MVP.

## Setup
1. Create a Supabase project.
2. In Supabase SQL editor, run `supabase/schema.sql`.
3. Copy env file and set values:

```bash
cp .env.example .env
```

4. Install and run:

```bash
npm install
npm run dev
```

## Supabase Auth settings
In Supabase dashboard:
- Enable Email provider
- Disable email confirmation for development convenience
- Username login is implemented by mapping username to an internal email (`username@accountbook.local`)

## Deploy on Vercel
1. Push this project to GitHub.
2. In Vercel, click `Add New -> Project` and import your repo.
3. In Vercel project settings, add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy (Vercel will run `npm run build` and serve `dist`).
5. After first deploy, if needed, redeploy once after confirming env vars are set.

## Auto deploy from GitHub Actions
This repo includes `.github/workflows/vercel-production.yml`, which deploys to Vercel on every push to `main`.

Add these GitHub repository secrets:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

How to get IDs:
1. Run `vercel login`
2. Run `vercel link` in this project once
3. Open `.vercel/project.json` and copy `orgId` and `projectId` into GitHub secrets

## Next features
- Add payment reminders (Edge Functions + cron)
- WhatsApp/SMS integration
- Business/team accounts with role-based access
- PDF statement export
