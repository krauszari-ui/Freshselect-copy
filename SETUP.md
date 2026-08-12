# FreshSelect Meals — Deployment Setup

This runbook gets a **fresh deployment** (e.g. `freshselect-copy` on Vercel)
working, including admin login. If admin login shows **"Invalid email or
password"** on a brand‑new deployment, it's almost always because the project has
**no environment variables** — so there is no database, no users, and nothing to
log in against. Follow the steps below.

> The app never stores plaintext passwords (bcrypt only). The super‑admin account
> is created by the seed script in step 4 — there is no built‑in default account.

---

## 1. Provision a database

The app targets **MySQL 8 / TiDB Cloud**. The easiest free option is
**TiDB Cloud Serverless**:

1. Create a free TiDB Cloud Serverless cluster.
2. Open **Connect** and copy the connection string. It looks like:
   ```
   mysql://<user>:<password>@<host>:4000/<database>?ssl={"rejectUnauthorized":true}
   ```
   The `ssl` part matters — `server/db.ts` enables TLS for any non‑localhost host.
   (PlanetScale or any managed MySQL 8 also work.)

> Use a **new, separate** database for this deployment so it doesn't touch live
> production data.

---

## 2. Configure your local environment

```bash
cp .env.example .env
# edit .env and set DATABASE_URL to the string from step 1
pnpm install
```

`.env.example` documents every variable. For login you only need `DATABASE_URL`
and `JWT_SECRET`; the rest (Resend email, R2 storage, cron) are optional.

---

## 3. Create the database tables (migrations)

`drizzle.config.ts` reads `DATABASE_URL`, so make sure your `.env` is set first.

**Core app tables** (everything login and the existing app needs):
```bash
npx drizzle-kit migrate
```
This applies the committed migrations (`drizzle/0000_*.sql` … `0036_*.sql`).

**Compliance & Audit module tables** (optional — only if you plan to enable
`COMPLIANCE_MODULE`; the module is OFF by default). Either:
- Apply the additive SQL directly against your database:
  ```bash
  # e.g. with the mysql client:
  mysql "$DATABASE_URL" < drizzle/manual/0037_compliance_foundation.sql
  mysql "$DATABASE_URL" < drizzle/manual/0038_compliance_phase3.sql
  mysql "$DATABASE_URL" < drizzle/manual/0039_compliance_guidance.sql
  mysql "$DATABASE_URL" < drizzle/manual/0040_compliance_sessions.sql
  mysql "$DATABASE_URL" < drizzle/manual/0041_compliance_notifications.sql
  mysql "$DATABASE_URL" < drizzle/manual/0042_compliance_normalization.sql
  ```
- **or** let Drizzle generate + apply them from the schema:
  ```bash
  pnpm db:push   # = drizzle-kit generate && drizzle-kit migrate
  ```

The compliance tables are additive and safe to skip until you're ready.

---

## 4. Seed the super‑admin account

```bash
node scripts/seed-superadmin.mjs
```

This creates (or updates) the super‑admin using your `DATABASE_URL`:

- **Email:** `a.krausz@levelupresources.org`
- **Password:** `hatzlacha`

Change the email/password at the top of `scripts/seed-superadmin.mjs` before
running if you want different credentials, and **change the password after first
login** via **"Forgot your password?"** on the admin login page.

---

## 5. Set the environment variables in Vercel

Vercel → your project → **Settings → Environment Variables → Production**:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | the **same** connection string from step 1 |
| `JWT_SECRET` | a long random string — generate with `openssl rand -base64 48` |

(`NODE_ENV=production` is set automatically by Vercel for production builds.)
Add the optional email/storage/cron variables from `.env.example` later if you
want those features.

Then **redeploy** — environment variables only take effect on a **new**
deployment (Vercel → Deployments → ⋯ → Redeploy, or push a commit).

---

## 6. Verify

1. `https://<your-app>.vercel.app/api/health` → `{"status":"ok",...}` (function is up).
2. Go to `/admin`, log in with the seeded credentials.
   - If you still get **"Invalid email or password"**, the seed didn't run against
     the DB that `DATABASE_URL` points to — re‑run step 4 against the exact same
     connection string, or double‑check the Vercel `DATABASE_URL` matches.
   - If you get an HTML/`Unexpected token '<'` error, that's a different layer
     (CORS/500) — check the Vercel **function logs** for the real exception.

---

## Troubleshooting quick reference

| Symptom | Likely cause | Fix |
|--------|--------------|-----|
| "Invalid email or password" on a fresh deploy | `DATABASE_URL` unset, or super‑admin not seeded | Set `DATABASE_URL` in Vercel + run `scripts/seed-superadmin.mjs`; redeploy |
| `Unexpected token '<', "<!DOCTYPE…"` | API returned an HTML error page (CORS reject or 500) | Read Vercel function logs; confirm your domain is allowed in `server/_core/security.ts` `ALLOWED_ORIGINS` |
| Login hangs / times out | DB unreachable (IP allowlist / wrong host / TLS) | Ensure the DB accepts connections from Vercel and the string includes TLS |
| Compliance nav missing | `COMPLIANCE_MODULE` not enabled | Set `COMPLIANCE_MODULE=1` (after creating the compliance tables) and redeploy |
