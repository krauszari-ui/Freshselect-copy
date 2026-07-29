# Project TODO

- [x] Set up warm Brooklyn/kosher color theme (earth tones, greens, oranges)
- [x] Add Google Fonts for warm readable typography
- [x] Create backend tRPC procedure for secure ClickUp API submission
- [x] Store ClickUp API key as server-side secret
- [x] Capture ?ref= URL parameter for referral routing
- [x] Build 3-step wizard with progress indicator
- [x] Step 1: Supermarket selection cards (Foodoo, Rosemary Kosher, Chestnut, Central Market)
- [x] Step 2: Personal info (First Name, Last Name, DOB, Medicaid ID with validation)
- [x] Step 2: Contact info (Phone, Email with validation)
- [x] Step 2: Address fields pre-filled with Brooklyn/NY defaults
- [x] Step 2: Health categories checkboxes
- [x] Step 2: Benefits questions (Employed, Spouse Employed, WIC, SNAP)
- [x] Step 2: New Applicant dropdown
- [x] Step 2: Household members dropdown (1-9) with dynamic member fields
- [x] Step 3: Meal focus multi-select (Breakfast, Lunch, Dinner, Snacks) with conditional text fields
- [x] Step 3: Required text box for healthy meals from deli/counter
- [x] Step 3: Optional specific items text box
- [x] Step 3: Household appliances questions (Refrigerator, Microwave, Cooking Utensils)
- [x] Form validation with real-time error messages
- [x] Submit button with loading spinner and double-submit prevention
- [x] Success confirmation page with reference number
- [x] Hero section with headline, subheadline, and trust line
- [x] Header with logo and CTA button
- [x] Mobile responsive design
- [x] Write vitest tests for backend submission procedure
- [x] Map referral parameter to ClickUp list ID 901414869527 for referral submissions
- [x] Add 'sha' referral key routing to ClickUp list 901414869527
- [x] Add conditional "Due date" field when Pregnant is checked
- [x] Add conditional "Date of Miscarriage" field when Had a Miscarriage is checked
- [x] Add conditional "Infant Name", "Infant Date of Birth", "Infant Medicaid ID (CIN)" fields when Postpartum is checked
- [x] Add owner notification on each form submission
- [x] Update backend to include new conditional fields in ClickUp task description
- [x] Update tests for new fields and notification (19 tests passing)
- [x] Removed owner notification; applicant email included in ClickUp task for ClickUp Automation-based email
- [x] Remove Deli / Counter Selections section from Step 3
- [x] Remove healthyMealsRequest and specificItems fields from backend and frontend
- [x] Update tests for removed fields and email notification change (19 tests passing)
- [x] Add required HIPAA consent checkbox at bottom of Step 3 above Submit button
- [x] Add Zod validation for consent (z.boolean().refine(val => val === true))
- [x] Record consent with timestamp in ClickUp task under "Legal & Compliance" heading
- [x] Rename "Personal Information" heading to "Mother's Personal Information" in Step 2

## Login & Tracking System
- [x] Create submissions table in database schema
- [x] Run database migration for submissions table
- [x] Store submissions in DB on form submit (alongside ClickUp, DB-first resilience)
- [x] Add admin tRPC procedures: list submissions, get detail, update status
- [x] Build admin login page (Manus OAuth)
- [x] Build admin dashboard with submissions table (search, filter, sort)
- [x] Build application detail view with full data and status management
- [x] Add status workflow: New → In Review → Approved → Rejected → On Hold
- [x] Add admin route protection (admin role only)
- [x] Write tests for new admin procedures (12 admin tests + 34 total passing)

## Major Update - Landing Page, Form Restructure, Workers, Email
- [x] Restructure form flow: Landing page → Form (with screening questions + uploads) → Grocery selection
- [x] Build landing page from pasted SCN content (eligibility, programs, how it works, contact info)
- [x] Add all 16 SCN screening questions to form (from image)
- [x] Add Food Allergies / Dietary Restrictions section to form
- [x] Add document upload fields: mother's Medicaid card, birth certificate, marriage license
- [x] Add per-child document uploads: Medicaid card, birth certificate for each child
- [x] Move grocery/supermarket selection to AFTER the form
- [x] Add worker login system with admin-controlled permissions
- [x] Add CSV export button on admin dashboard
- [x] Create Privacy Policy page based on NYS HIPAA laws
- [x] Link HIPAA consent checkbox to Privacy Policy page
- [x] Set up email notifications: send form copy to applicant's email
- [x] Set up email notifications: send every application to info@freshselectmeals.com
- [x] Update contact information to info@freshselectmeals.com
- [x] Update DB schema for file uploads and worker roles

## CareFlow-Style Admin Dashboard Rebuild
- [x] Update DB schema: add client stages, tasks, case notes, documents tables
- [x] Build dark sidebar admin layout matching CareFlow design
- [x] Build Dashboard page: stats cards, client journey pipeline, recent clients, tasks
- [x] Build Agency Overview page: stats, stage breakdown, recently added/updated, ineligible, outstanding tasks
- [x] Build Clients list page: search, filters (stage, status, supermarket), sortable table, CSV export
- [x] Build Client Detail page: intake journey progress, overview/assessment/services/tasks tabs
- [x] Build Client Overview tab: info, household, addresses, phones, emails, health categories, case notes
- [x] Build Client Assessment tab: SCN Screening Questionnaire display
- [x] Build Client Services tab
- [x] Build Tasks page: search, filters, open/completed/verified tabs, task cards
- [x] Build Document Library page: category filter, document cards, upload/download
- [x] Worker permissions: admin controls worker access levels (Staff Management page)

## Exact CareFlow Clone
- [x] Deep analysis of every CareFlow page (Dashboard, Clients, Client Detail, Tasks, Documents, Agency, Settings)
- [x] Exact clone of Dashboard page with all details
- [x] Exact clone of Clients list page with all filters and options
- [x] Exact clone of Client Detail page with all tabs (Overview, Assessment, Services, Completed Tasks)
- [x] Exact clone of Tasks page
- [x] Exact clone of Document Library page
- [x] Exact clone of Agency Overview page
- [x] Match all sidebar navigation, colors, icons, and layout exactly

## Bug Fixes & Improvements (User Feedback)
- [x] Match admin pages to original green color theme (not dark navy CareFlow colors)
- [x] Fix Add Client button - make it functional
- [x] Remove mother's birth certificate upload from form (keep only kids' birth certificates)
- [x] Make Household Members required (not optional)
- [x] Fix duplicate SNAP question (removed from benefits, kept in screening)
- [x] Fix duplicate WIC question (removed from benefits, kept in screening)
- [x] Fix duplicate "Enrolled in Health Home" question (removed from health categories, kept in screening)
- [x] Fix grocery/supermarket address display (added Bingo Wholesale)
- [x] Update "New Applicant" to "New application or transfer from different agency"
- [x] Add phone number 718-307-4664 to the site (header, contact section, success page, error page, emails)

## Round 2 - Fix All Broken Buttons & Referral System
- [x] Audit and fix ALL broken buttons across Dashboard, Clients, Client Detail, Tasks, Documents, Agency pages
- [x] Fix form-to-client-list connection (submissions appear correctly in admin client list)
- [x] Fix Client Detail page: Edit button, delete button, stage outcome dropdown, all tab interactions
- [x] Fix Client Detail: Add Household Member, Add Address, Add Phone, Add Email dialogs
- [x] Fix Client Detail: Add Task, Add Note, Upload Document interactions
- [x] Fix Client Detail: Services tab - Add Service dialog
- [x] Fix Dashboard: clickable stat cards navigate to correct filtered views
- [x] Fix Tasks page: create task, update task status, filter/search
- [x] Fix Documents page: upload document, delete document, category filter
- [x] Fix Agency page: all interactive elements
- [x] Build referral link system: admin can create referral links for people
- [x] Track which referrer brought each client (show on client list and detail)
- [x] Referral management page or section in admin

## Round 3 - Submission Fix, Grocery Update, Referral Logins
- [x] Fix form submission error ("Something went wrong" on submit) - email failures now non-blocking
- [x] Update grocery store names and addresses to correct values
- [x] Add grocery store logos from their websites
- [x] Build referral person login system (each referral link person gets a login)
- [x] Referral person can view their referred clients (read-only, no edit)
- [x] Referral person dashboard showing their referral stats and client list

## Round 4 - Fix Persistent Form Submission Error
- [x] Diagnose and fix the form submission error - ROOT CAUSE: hasWic/hasSnap Zod validation rejected empty strings after UI fields were removed. Fixed Zod schema to optional, auto-populate from screening, moved household validation to correct step.

## FreshSelect 2.0 - Complete Architectural Refactor
- [x] Audit all ClickUp integration code and map removal points
- [x] Audit all Manus OAuth code and map removal points
- [x] Audit all external service dependencies (Forge API, Manus-specific env vars)
- [x] Design new local auth schema (email/password for admins and workers)
- [x] Update drizzle schema with proper users table for local auth
- [x] Apply database migrations for new auth tables (passwordHash on users, drop clickupTaskId)
- [x] Build local email/password authentication system (register, login, sessions)
- [x] Replace Manus OAuth routes with local auth routes
- [x] Remove all ClickUp API calls from submission flow
- [x] Store all order data exclusively in local database
- [x] Update admin dashboard to read from local DB only (no ClickUp)
- [x] Build admin login page (email/password)
- [x] Build worker login page (email/password)
- [x] Strip Manus OAuth hooks and providers from frontend
- [x] Fix referral system: 30-day cookie, proper worker attribution in local DB
- [x] Fix household relationship dropdown in new architecture
- [x] Fix grocery store selections in new architecture
- [x] Fix all TypeScript errors (0 errors)
- [x] Write tests for new local auth system
- [x] Write tests for new submission flow (no ClickUp) - 25 tests covering local DB, emails, referrals
- [x] Full end-to-end testing of all pages - 75 tests passing
- [x] Ensure app is fully standalone and deployable to Vercel/anywhere
- [x] Delete clickup.test.ts
- [x] Rewrite submission.test.ts (remove all ClickUp-specific tests, add local-only tests)
- [x] Fix admin.test.ts (remove clickupTaskId references, update loginMethod to 'local')
- [x] Add 30-day referral cookie tracking in Home.tsx
- [x] Clean up ManusDialog references and Manus OAuth comments
- [x] Generate and apply migration for removed clickupTaskId column

## Production Launch Prep (freshselectmeals.com)
- [x] PlanetScale DB compatibility: SSL pool connection via URL param, no FK constraints in schema
- [x] Replace Manus Forge storage proxy with direct AWS S3 (SigV4) implementation
- [x] Update index.html with production SEO metadata and OG tags for freshselectmeals.com
- [x] Remove Manus analytics script from index.html
- [x] Create vercel.json for Express+React deployment
- [x] Remove ComponentShowcase route from App.tsx (dev-only page)
- [x] Verify admin auth protection (adminProcedure guards all admin routes)
- [x] Referral links use window.location.origin (auto-resolves to freshselectmeals.com in prod)
- [x] 75 tests passing, 0 TypeScript errors

## Electronic Signature & Attestation
- [x] Install signature_pad library
- [x] Build reusable SignaturePad component (canvas draw + clear + typed fallback)
- [x] Add Household Attestation block near HIPAA checkbox in Step 3
- [x] Add Acknowledgment block with Member/Parent/Guardian Name field
- [x] Add electronic signature canvas (draw or type name)
- [x] Update Zod schema to include signatureDataUrl and guardianName fields
- [x] Signature stored in formData JSON (no separate column needed)
- [x] Update backend Zod schema to validate signature fields
- [x] Update tests for new signature fields (75 passing)

## UI/Form Changes (April 2026)
- [x] Rename "Mother's Personal Information" to "Primary Member Information"
- [x] Remove Required Documents section
- [x] Remove screening questions 5, 6, 7, 8, 9, 10, 11, 15
- [x] Make Health Categories required field
- [x] Add agency name field when "Transfer" is selected for new applicant
- [x] Rename "Choose Your Supermarket" to "Choose Your Vendor"
- [x] Remove word "Supermarket" from Foodoo, Rosemary, Chestnut names
- [x] Remove Bingo Wholesale from vendor options
- [x] Full review and test of all buttons and flows (75 tests passing)

## Production Launch (April 2026)
- [x] Push database schema to PlanetScale via drizzle-kit push (7 tables created)
- [x] Create seed-production script (scripts/seed-production.mjs)
- [x] Run seed script against production database (2 users + 1 referral link)
- [x] Verify Admin and Referrer dashboard UI is professional and intact
- [x] Search and replace all manus.computer / manus.config references (none found)
- [x] Verify referral link logic uses window.location.origin
- [x] Verify vercel.json routing config (/api/* -> server, all else -> SPA)
- [x] Final sync to GitHub for Vercel deployment

## Export Feature (April 2026)
- [x] Add Export to Excel (.xlsx) button on Admin Clients page
- [x] Add Export to CSV option
- [x] Include all client fields in export (name, CIN, DOB, address, language, household, health categories, stage, vendor, referral, guardian name, etc.)

## Vendor/Neighborhood Restructuring (April 2026)
- [x] Restructure vendors by neighborhood (Williamsburg, Borough Park, Flatbush, Monsey, Monroe)
- [x] Williamsburg: Foodoo Kosher, Rosemary Kosher, Chestnut, Central Market
- [x] Borough Park: KRM, Certo Market, Breadberry
- [x] Flatbush: Pomegranate, Moisha's Discount
- [x] Monsey: Evergreen, Hatzlacha
- [x] Monroe: Refresh, Landau's
- [x] Find logos and correct addresses for all vendors
- [x] Add neighborhood filter dropdown to Admin Clients page
- [x] Add vendor filter dropdown to Admin Clients page
- [x] Make export (Excel/CSV) respect all active filters including neighborhood
- [x] Update vendor selection UI in Home.tsx to group by neighborhood
- [x] Update AdminClients Add Client dialog with neighborhood + vendor dropdowns
- [x] 75 tests passing, 0 TypeScript errors

## Form Submission Error Fix (April 2026)
- [x] Root cause: Resend email API returns 403 (domain not verified), error leaked into response
- [x] Fix: Use setTimeout(0) to fully detach email/referral tracking from request lifecycle
- [x] Add .passthrough() to Zod submissionInputSchema to prevent unknown field rejections
- [x] Add additionalMembersCount field to Zod schema (sent by frontend but not in schema)
- [x] Wrap email sends with individual .catch() handlers for granular error logging
- [x] DB save returns success IMMEDIATELY; emails fire in background and never block user
- [x] Update tests to use vi.useFakeTimers() to properly handle setTimeout(0) in tests
- [x] email.ts already has defensive try-catch wrappers (no changes needed)
- [x] 75 tests passing, 0 TypeScript errors

## Neighborhood Column Migration (April 2026)
- [x] Add neighborhood column to Drizzle schema (varchar 64, nullable)
- [x] Push schema to PlanetScale production database via drizzle-kit push
- [x] Verify neighborhood column exists in production (confirmed)
- [x] Update createSubmission in routers.ts to save neighborhood to DB column
- [x] Update getAllSubmissions in db.ts to filter by DB column instead of client-side JSON filtering
- [x] 75 tests passing, 0 TypeScript errors

## Persistent Form Submission Error Investigation (April 2026)
- [x] Check 1: Schema alignment — all frontend fields match Zod schema exactly, .passthrough() active
- [x] Check 2: Zod validation — .passthrough() confirmed, all field names match, additionalMembersCount present
- [x] Check 3: Database URL and SSL — PlanetScale connection works, test insert/delete succeeded, neighborhood column confirmed
- [x] Added server-side logging for submission processing (success/failure with ref numbers)
- [x] Improved frontend error display to show actual backend error message
- [x] 75 tests passing, 0 TypeScript errors
- [x] Sync to GitHub for redeployment (checkpoint 4d9abf27)

## Add additionalMembersCount Column (April 2026)
- [x] Add additionalMembersCount column to Drizzle schema (int, default 0)
- [x] Push schema to PlanetScale via drizzle-kit push — verified column exists (type: int, default: 0)
- [x] Update submit logic in routers.ts to map form field to new column (parseInt with fallback to 0)
- [x] Run tests — 75 passing, 0 TypeScript errors
- [x] Sync to GitHub for Vercel redeployment (checkpoint 16bc7f7c)

## Root Cause: DATABASE_URL Missing on Render (April 2026)
- [x] Confirmed additionalMembersCount is NULL with DEFAULT 0 — not the issue
- [x] Confirmed all direct PlanetScale inserts succeed from sandbox
- [x] Confirmed production server (Render) returns 500 on every submit
- [x] Root cause: DATABASE_URL env var is not set on Render deployment
- [x] Improved error logging in db.ts and routers.ts to surface this clearly
- [x] 75 tests passing, 0 TypeScript errors
- [ ] User must add DATABASE_URL to Render environment variables

## Production DB Migration — TiDB (April 2026)
- [x] Identified production DB is TiDB Cloud (gateway05.us-east-1.prod.aws.tidbcloud.com), not PlanetScale
- [x] Added neighborhood varchar(64) NULL column to production TiDB submissions table
- [x] Added additionalMembersCount int NULL DEFAULT 0 column to production TiDB submissions table
- [x] Verified test insert with 6-char ref number succeeds with all columns
- [x] 75 tests passing, 0 TypeScript errors
- [ ] Sync to GitHub and redeploy on Render

## Vercel 404 Fix
- [x] Inspected package.json build scripts — build outputs dist/index.js + dist/public/
- [x] Fixed vercel.json: removed broken static asset route, route all traffic through dist/index.js
- [x] Fixed server/_core/vite.ts: replaced import.meta.dirname with fileURLToPath(__filename) for Vercel ESM compatibility
- [x] 75 tests passing, 0 TypeScript errors, production build verified
- [ ] Sync to GitHub for Vercel rebuild

## Vercel Serverless Entry Fix
- [x] Created api/index.ts — Express app exported without listen() for Vercel serverless
- [x] Updated vercel.json with functions config (nodejs20.x) pointing to api/index.js
- [x] Updated build script to compile api/index.ts → api/index.js via esbuild
- [x] Fixed serveStatic path resolution to handle both dist/ and api/ entry contexts
- [x] 75 tests passing, 0 TypeScript errors, build verified
- [ ] Sync to GitHub for Vercel redeploy

## Vercel Correct Fix — api/ Directory (April 2026)
- [x] Created api/index.js via esbuild from src/index.ts — exports Express app (no listen()), includes serveStatic
- [x] Updated vercel.json: rewrites all traffic to /api/index, no functions block
- [x] Updated build script: esbuild src/index.ts → api/index.js as part of pnpm build
- [x] serveStatic path resolution: api/__dirname → ../dist/public (correct for Vercel Lambda at /var/task/api/)
- [x] 75 tests passing, 0 TypeScript errors, build verified (api/index.js 71.6kb)
- [ ] Sync to GitHub for Vercel redeploy

## FINAL Vercel Fix — Zero Config Express Detection
- [x] Deleted vercel.json entirely — Vercel auto-detects Express from src/index.ts
- [x] Deleted api/index.js — not needed, Vercel compiles src/index.ts itself
- [x] src/index.ts exports default Express app (no listen())
- [x] Build script: vite build + esbuild dist/index.js + cp dist/public to public/
- [x] public/ created by build for Vercel CDN static assets (express.static() ignored by Vercel)
- [x] 75 tests passing, 0 TypeScript errors
- [ ] Sync to GitHub for Vercel redeploy

## DEFINITIVE Vercel Fix — @vercel/node Runtime (April 2026)
- [ ] Create api/index.js as CommonJS serverless function entry point
- [ ] Create vercel.json with functions (@vercel/node runtime) and rewrites
- [ ] Ensure dist/public is bundled correctly for frontend assets
- [ ] Verify build and tests pass after changes
- [ ] Sync to GitHub for Vercel redeploy

## Definitive Vercel Fix Round 2 (April 17 2026)
- [ ] Read and understand every file in the build chain
- [ ] Create api/index.js compiled entry point with @vercel/node builds config
- [ ] Create vercel.json with explicit builds + routes (NOT rewrites)
- [ ] Stop build from creating public/ (prevents Vercel static site detection)
- [ ] Test build locally, verify all paths
- [ ] Push and verify live deployment

## Definitive Vercel Fix Round 3 — Express Auto-Detection (April 17 2026)
- [x] Fix vercel.json: add outputDirectory pointing to dist/public
- [x] Fix build script: compile index.mjs at root for Vercel Express auto-detection
- [x] Fix build script: remove cp -r dist/public public (prevents Vercel static site detection)
- [x] Fix .gitignore: remove 'public' entry so Vercel can see build output if needed
- [x] Verify build works locally
- [x] Verify dev server still works
- [ ] Push and verify live deployment

## Fix Vercel API Routing (April 17 2026)
- [ ] Diagnose: tRPC API calls return HTML instead of JSON on production
- [ ] Fix API routing so Express serverless function handles /api/* requests
- [ ] Verify form submission works on live site

## Definitive Vercel Fix Round 4 — Build Output API (April 17 2026)
- [x] Create scripts/vercel-build.sh with Build Output API structure
- [x] Create scripts/copy-deps.mjs for selective dependency copying (pnpm-aware)
- [x] Update vercel.json: buildCommand → bash scripts/vercel-build.sh, outputDirectory → .vercel/output
- [x] Update .gitignore for .vercel/output/
- [x] Verify all imports resolve in the function bundle (12 packages + 83 transitive deps)
- [x] Verify function size under 250MB Vercel limit (45MB total)
- [x] Verify dev server still works (200 on / and /api/trpc)
- [ ] Push and verify live deployment

## Admin Login & Referral Program Audit (April 17 2026)
- [ ] Test admin login on live site (freshselectmeals.com/admin/login)
- [ ] Test referral link generation and tracking
- [ ] Test referral person login and dashboard
- [ ] Fix any issues found

## Fix SPA Routing — Remove serveStatic from Serverless Function (April 17 2026)
- [x] Remove serveStatic() call from src/index.ts (Express function must not serve static files on Vercel — use VERCEL env check)
- [x] Vercel config.json routes /(.*) → /index.html — SPA routing handled by CDN
- [x] Rebuild Vercel bundle and verify static/index.html + assets/ are correct
- [x] Verify /api/* routes still work (tRPC + OAuth) — dev server returns 200
- [x] Push and redeploy on Vercel

## Admin Dashboard Enhancements (Apr 2026)

- [x] Show vendor/supermarket in AdminClientDetail Overview tab (Client Information card)
- [x] Add editable adminNotes (Assessment notes) to AdminClientDetail Assessment tab with Save button
- [x] Add server-side PDF generation endpoint for Household Attestation + HIPAA document
- [x] Add "Download PDF" button in AdminClientDetail to download Household Attestation + HIPAA PDF

## Document Upload Fix & Household Form (Apr 2026)

- [x] Fix document upload: replace broken custom AWS S3 with Manus built-in storage (storagePut via Forge API)
- [x] Fix household member count dropdown: remove None, add "Please select..." placeholder, make required
- [x] Add marriage license upload field when Husband is selected as relationship
- [x] Verify uploaded documents appear in admin portal Documents section (confirmed end-to-end)
- [x] Remove PDF generation feature (pdfkit CJS/ESM conflict broke Vercel bundle) — restore clean ESM build
- [x] 79 tests passing, 0 TypeScript errors, Vercel bundle verified clean

## Household Attestation + HIPAA PDF Generation (April 19, 2026)
- [x] Install pdf-lib (pure ESM, no CJS conflicts) for server-side PDF generation
- [x] Create server/generateAttestationPdf.ts helper that produces a 1-page professional PDF
- [x] Integrate PDF generation into submission flow with try/catch error isolation (never blocks form submission)
- [x] Store generated PDF in Manus built-in storage and save URL in documents table
- [x] Add signature validation — form cannot submit without a signature
- [x] Add admin dashboard button to view/download the signed attestation PDF
- [x] Verify Vercel ESM bundle builds and starts cleanly with pdf-lib
- [x] End-to-end test: submit form → verify PDF appears in admin portal

## Production Issues (April 19, 2026 - Session 2)
- [x] Fix document uploads not working on production (storage.ts now falls back to VITE_FRONTEND_FORGE_API_KEY; Vercel needs BUILT_IN_FORGE_API_KEY env var added manually)
- [x] Fix custom domain https://www.freshselectmeals.com/ not working (domain resolves correctly to Vercel; upload fix is the real issue)
- [x] Add "Wife" relationship option that also triggers marriage license upload

## Platform Independence Migration (April 19, 2026)
- [x] Rewrite email.ts: retry logic (3 attempts, exponential backoff), idempotency keys, RESEND_FROM_EMAIL env var
- [x] Rewrite storage.ts: Cloudflare R2 primary (AWS SDK v3), Manus Forge fallback for local dev
- [x] Update env.ts: add R2 config fields, resendFromEmail field, keep Forge as optional fallback
- [x] Update security.ts: remove manus.space from ALLOWED_ORIGINS, remove manus.im from CSP, add R2 CDN domains
- [x] Add @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner to copy-deps.mjs for Vercel bundle
- [ ] User action: Set up Cloudflare R2 bucket and add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL to Vercel env vars
- [ ] User action: Verify freshselectmeals.com domain in Resend dashboard (add SPF + DKIM DNS records)
- [ ] User action: After domain verification, set RESEND_FROM_EMAIL = "FreshSelect Meals <noreply@freshselectmeals.com>" in Vercel env vars
- [ ] User action: Add BUILT_IN_FORGE_API_KEY to Vercel env vars (temporary, until R2 is configured)
- [ ] Optional: Set up Sentry or BetterStack for error monitoring
- [ ] Optional: Set up BetterStack Uptime for uptime monitoring and alerting

## Admin Dashboard Improvements (April 19, 2026 - Session 3)
- [x] Show uploaded documents (with download links) in client application detail view
- [x] Add filter by referral source to admin clients list
- [x] Add bulk select + select-all checkbox + bulk delete to admin clients list
- [x] Show total household members count in admin dashboard stats card
- [x] Trigger Vercel redeploy to activate RESEND_FROM_EMAIL env var (done via browser)
- [ ] Set up Sentry error monitoring (frontend + backend)
- [x] Add GitHub Actions CI workflow (.github/workflows/ci.yml — runs type check + tests + build on every push/PR)

## Admin User Management System (April 19, 2026 - Session 4)
- [x] Update DB schema: add super_admin/viewer roles, passwordResetToken, passwordResetExpires fields to users table
- [x] Build forgot password flow: generate secure token, send reset email via Resend
- [x] Build reset password page: validate token, set new password
- [x] Build admin user management page: list workers, add new worker, edit role, deactivate/reactivate
- [x] Add permission guards: super_admin can do everything, admin can manage clients, viewer is read-only
- [x] Add Forgot Password link to admin login page
- [x] Seed super-admin account: a.krausz@levelupresources.org (password: hatzlacha — change after first login)
- [x] Add createStaff procedure (create staff accounts without OAuth)

## Sidebar & Navigation
- [x] Add Staff Management link to sidebar (visible to super_admin and admin only)

## Members & Referrer Notifications
- [x] Add Members column to Clients list (primary member + household count, e.g. "1 + 3")
- [x] Add Total Members stat card to Referral Links page
- [x] Create referrer_messages table in DB schema (id, senderId, referrerId, clientId, message, createdAt, readAt)
- [x] Add DB migration for referrer_messages table
- [x] Add tRPC procedures: sendMessage, listMessages, markRead
- [x] Build notification inbox UI on Referral Links page (bell icon + unread count per referrer)
- [x] Build message compose dialog: @mention referrer, link to a client, free-text message
- [x] Show unread notification badge on referrer rows in Referral Links table

## Referrer Portal & Client Messaging
- [x] Add Total Members stat to referrer portal (/referrer) myStats endpoint and UI
- [x] Add Referrer Notes section to client detail page (AdminApplicationDetail), next to Case Notes
- [x] Referrer Notes: admin can write a message tagged to this client, sends via referrerMessages table
- [x] Show referrer messages on /referrer portal page so referrers can see action items from admin

## Referrer Messages UX
- [x] Include client firstName + lastName in referrer message list (join submissions table in listReferrerMessages)
- [x] Display "Re: Client Name" label on each message in the referrer portal Messages tab

## Referrer Reply & Client Email Thread
- [x] Add referrer reply to portal: referrer can type a reply in the Messages tab, stored in referrerMessages with direction=referrer
- [x] Show reply thread in admin Referral Links page (admin sees referrer's reply inline)
- [x] Create clientEmails table (id, submissionId, direction, subject, body, fromEmail, toEmail, attachmentUrls, sentAt, messageId, threadId)
- [x] Add DB migration for clientEmails table
- [x] Add sendClientEmail tRPC procedure (sends via Resend from info@freshselectmeals.com, stores in DB)
- [x] Add inbound email webhook endpoint to receive client replies via Resend
- [x] Build email thread UI on client detail page (compose with file attach, view thread with sent/received bubbles)

## Messaging & Email Thread Improvements
- [x] Add delete referrer note by admin (deleteReferrerNote procedure)
- [x] Add delete referrer note by referrer in portal (referrerPortal.deleteMessage procedure)
- [x] Auto-mark all messages as read when referrer opens Messages tab
- [x] Unify admin notes + referrer replies into one chronological thread log (single list, both directions)
- [x] Add attachment support to referrer notes (admin can attach file when sending note)
- [x] Client email replies (inbound) appear in the Email Thread log on client detail page
- [x] Confirm /api/inbound-email webhook correctly stores inbound emails in clientEmails table

## Staff Permissions — Sidebar Control
- [x] Add showReferralLinks to permissions JSON field (no migration needed — uses existing permissions column)
- [x] Update all permissions schemas in routers.ts (promote, updatePermissions, createStaff, updateStaff) to include showReferralLinks
- [x] Add showReferralLinks toggle to Staff Management page PERM_LIST (checkbox in create/edit modals)
- [x] Show 'No Referral Links' amber badge on worker rows in Staff Management when showReferralLinks is false
- [x] Hide Referral Links sidebar item for workers where showReferralLinks is false (AdminLayout filter)

## Email Reply Fix & Assessment Edits (April 20, 2026)
- [x] Fix client email reply-to: change from noreply@ to info@freshselectmeals.com so replies don't bounce
- [x] Add delete email procedure (admin.deleteClientEmail) and delete button in Email Thread UI
- [x] Make SCN assessment questions editable on client detail Assessment tab
- [x] Add "Mark Assessment Completed" toggle/button on Assessment tab
- [x] Store assessmentCompletedAt timestamp in submissions table

## SCN Assessment Editing Fix (April 20, 2026)
- [ ] Fix errors when saving SCN screening questionnaire edits
- [ ] Make screener name editable in Assessment tab
- [ ] Make screening date editable in Assessment tab
- [ ] Ensure all 16 SCN questions are editable and save correctly
- [ ] Verify save/cancel flow works end-to-end without errors

## Assessor Role (continued)
- [x] AdminClients: auto-lock to assessment-completed clients when viewed by assessor (hide filters that don't apply, lock assessmentCompleted=true in query)
- [x] Expose assessmentCompleted param in admin.list tRPC procedure so the DB-level filter works for assessors

## Assessor Role
- [x] Expand Edit Client dialog to include DOB, address (street, apt, city, state, zip), borough, neighborhood, vendor/supermarket, referral source
- [x] Add assessor role to user enum (DB migration applied)
- [x] Add assessorProcedure guard in routers.ts (assessor + admin + super_admin)
- [x] Add assessorList procedure: returns only assessment-completed clients
- [x] Add approveClient procedure: sets status to approved (assessor + admin)
- [x] Build AssessorPortal page at /assessor: shows assessment-completed clients, Approve button with confirmation dialog
- [x] Add /assessor route to App.tsx

## Pagination & Edit Client Fixes (Apr 21)
- [x] Fix pagination for "Assessment Completed" filter — currently treated as client-side virtual stage so DB returns all pages unfiltered; move to DB-level assessmentCompleted param
- [x] Add household member editing to Edit Client dialog (add/edit/remove members with name, DOB, Medicaid ID, relationship)

## Household Member Count Sync (Apr 21)
- [x] Sync additionalMembersCount when household members are edited via Edit Client dialog or Add Household Member action

## Email Setup - Resend Domain Verified (Apr 21)
- [x] Update outbound sender FROM address to use verified domain (noreply@freshselectmeals.com)
- [x] Verify inbound webhook route exists and parses Resend inbound payload correctly
- [x] Set inbound webhook URL in Resend dashboard
- [x] Add Svix webhook signature verification to inbound email handler
- [x] Write vitest for outbound email send (gracefully skips on network-restricted sandbox)
- [x] Write vitest for inbound webhook parsing (signed payload + missing headers rejection)
- [x] Update RESEND_API_KEY to krauszari account where both domains are verified
- [x] 99/99 tests passing

## Email Reply-To & Inbound Fix (Apr 21)
- [x] Fix inbound webhook to use correct Resend email.received payload format (data.to array, fetch body via API)
- [x] 99/99 tests passing with real outbound email send confirmed
- [ ] Test full round-trip: send email → client replies → reply appears in thread (requires live test)

## Fix Vercel 404 for /api/inbound-email (Apr 21)
- [x] Add inbound email webhook handler to src/index.ts (Vercel serverless entry point)
- [x] Add svix to copy-deps.mjs REQUIRED list so it's bundled into the Vercel function
- [x] Add --external:svix to vercel-build.sh esbuild command
- [x] 99/99 tests passing
- [ ] Push to GitHub to trigger Vercel redeploy
- [ ] Verify Resend webhook deliveries return 200 after redeploy

## Assessment Report & Bulk PDF Export

- [ ] Assessment Completion Report page (stats by stage/vendor/neighborhood)
- [ ] Bulk client selection on AdminClients page
- [ ] Export selected clients as one combined PDF (client info + assessment answers)

## Regressions to fix (Apr 22)
- [ ] Filter option counts missing on Clients page (vendor, neighborhood, stage counts)
- [ ] Zipcode filter not working
- [ ] Transfer agency name not showing in client list

## Notification Bell System (April 2026)
- [ ] notifications DB table (id, type, title, body, link, isRead, createdAt)
- [ ] tRPC procedures: notifications.list, notifications.markRead, notifications.markAllRead, notifications.unreadCount
- [ ] Auto-create notification on inbound client email reply
- [ ] Auto-create notification on referrer message reply
- [ ] Auto-create notification on new form submission
- [ ] Auto-create notification on task status change
- [ ] AdminNotifications.tsx page with full list, read/unread state, click-to-navigate
- [ ] Bell icon in AdminLayout sidebar with live unread count badge

## Notification Bell System (April 2026)
- [ ] notifications DB table (id, type, title, body, link, isRead, createdAt)
- [ ] tRPC procedures: notifications.list, notifications.markRead, notifications.markAllRead, notifications.unreadCount
- [ ] Auto-create notification on inbound client email reply
- [ ] Auto-create notification on referrer message reply
- [ ] Auto-create notification on new form submission
- [ ] Auto-create notification on task status change
- [ ] AdminNotifications.tsx page with full list, read/unread state, click-to-navigate
- [ ] Bell icon in AdminLayout sidebar with live unread count badge

## Health Categories Conditional Required Fields
- [x] Add "Health Conditions" section to Assessment tab: for HIV/AIDS, Hypertension, Chronic Condition, Substance Use Disorder, Diabetes, SMI — show client name for that condition + document upload fields (required)
- [x] Add "Other" health category follow-up answer field (required when Other is selected)
- [x] Add "Pregnant" follow-up fields in health categories section (due date already exists in SCN, but also show in health categories section)
- [x] Update canMarkCompleted validation to require conditionClientName + conditionDocuments for each medical condition category selected
- [x] Update updateScreeningAnswers tRPC procedure to save conditionDetails (name + doc URLs per condition)
- [x] Run tests and save checkpoint

## Assessment Tab Fixes (Round 2)
- [x] Remove Health Categories card from Assessment tab (condition details belong on intake form only)
- [x] Remove conditionDetails validation from canMarkCompleted (not an admin-side requirement)
- [x] Fix Q10 (wants school help/training) not clearing missing-field flag when answered
- [x] Fix SCN edit mode answers disappearing after save

## Admin Audit Log (Apr 24)
- [x] Add audit_log table to Drizzle schema and apply migration SQL
- [x] Add logAudit and getAuditLogs helpers to server/db.ts
- [x] Wire logAudit into key admin mutations: stage_changed, assessment_completed/incomplete, scn_edited, notes_edited, client_deleted, client_approved, client_rejected
- [x] Add auditLog.list tRPC procedure (admin-only, with action/actorId/clientId filters + pagination)
- [x] Build AdminAuditLog page with color-coded action badges, timestamp, staff name, client link, details column, filters, and pagination
- [x] Add Audit Log nav item to AdminLayout (admin-only section)
- [x] Update submission.test.ts mock to include createNotification, logAudit, getAuditLogs
- [x] 115/115 tests passing

## Assessment Bug Fixes (Round 3)
- [x] Fix numeric SCN answers jumping to wrong value on save (e.g. 10 → 9)
- [x] Fix Pregnant/health categories not showing in assessment tab when selected in intake form

## Assessment & Overview Fixes (Round 4)
- [x] Fix Q8 (members with Medicaid) to read from screeningQuestions first, not stale intake value
- [x] Add Postpartum infant sub-fields (infant name, DOB, Medicaid ID) to admin Overview tab Health Categories section

## Full QA Sweep Fixes (Apr 24)
- [x] AdminTasks: Wire Intake Rep filter (hard-coded value="all", no onValueChange)
- [x] AdminTasks: Wire Assigned Worker filter (hard-coded value="all", no onValueChange)
- [x] AdminTasks: Wire Completed From / To date filters (no state binding)
- [x] AdminTasks: Add assignedTo + completedFrom/completedTo to tasks.list tRPC procedure and listTasks DB helper
- [x] AdminClients: Remove broken "Zipcode Eligibility" placeholder filter
- [x] AdminClients: Fix AddClientDialog hardcoded dummy household member and healthCategories
- [x] ReferrerPortal: Fix null-safety crash in client search (firstName/lastName/email/cellPhone may be null)
- [x] AdminDocuments: Fix upload button state — setUploading(false) fires before mutation completes

## Sequential Changes (Apr 24)
- [ ] Change 1: Remove SCN Q5 and Q6 from assessment questionnaire
- [ ] Change 2: Display health category responses on client detail page
- [ ] Change 3: Pre-fill assessment answers from intake form data
- [ ] Change 4: Change supporting documents from required to preferred
- [ ] Change 5: Fix document/image upload errors

## Export Completed Assessments
- [ ] Add exportAssessments tRPC procedure returning all completed assessments with full client data
- [ ] Add Export CSV button to assessment reports page
- [ ] Run tests and save checkpoint
- [x] Fix daily QA scheduled task: add /api/scheduled/qa-health endpoint to deployed site, update scheduled task to use API instead of local files
- [x] Add priority tag (Low/Normal/High/Urgent) to clients list with filter and editable from client detail
- [x] Full responsive design audit and fixes (mobile hamburger nav, fluid padding, scrollable tables, responsive headers on all pages)
- [x] Email conversation subject made optional (server + UI)
- [x] Admin client list filters persisted in URL query string (browser back restores filters)
- [x] Per-client Activity tab on Client Detail page (full audit log with icons, pagination)
- [x] Clear All Filters button on Admin Clients list (appears when any filter is active)
- [x] Fix timezone off-by-one date bug: added parseLocalDate/formatLocalDate helpers in utils.ts, replaced all new Date(userDateStr).toLocaleDateString() calls in AdminClientDetail and AdminClients with timezone-safe formatLocalDate/formatLocalDateShort
- [x] Security fix: referrer message deletion ownership check (deleteReferrerMessage now verifies referralLinkId)
- [x] Security fix: qa-health endpoint now requires valid session cookie (was unauthenticated)
- [x] Security: rate-limit referrer portal login endpoint
- [x] Security: MIME type whitelist on file uploads (PDF, JPG, PNG, DOCX only)
- [x] Security: Content Security Policy header in Express security middleware
- [x] Security: rate-limit assessor portal login endpoint
- [x] Security: tighten login rate limits (10 attempts = 1hr lockout, 15 = permanent block until manual reset)
- [x] Security: failed login audit logging for admin, referrer, and assessor portals
- [x] Per-user notification read state: notificationReads join table, per-user markRead/markAllRead/unreadCount
- [x] Comprehensive audit logging: added logAudit to all unlogged mutations (logout, client_edited with field diffs, assignment_changed, status_changed, task_created, task_status_changed, case_note_added, document_uploaded, document_deleted, service_created, service_status_changed, email_sent, email_deleted, bulk_deleted, duplicate_deleted, referral_link_created/updated/deleted, worker_promoted/demoted/activated/deactivated/permissions_updated, password_reset)
- [x] Enhanced Audit Log page: rich detail rendering with before/after diffs, icons, grouped action filter, expandable raw JSON rows
- [x] 1-hour inactivity auto-logout for staff: warning at 55min, logout at 60min
- [x] Fix non-editable HOUSEHOLD APPLIANCE / COOKING NEEDS and health category sections on assessment/client detail page
- [x] Add Q: "Do you struggle with paying for housing or find yourself falling behind on payments?" (Yes/No) to SCN assessment admin view
- [x] Add Q: "Do you have problems with any of the following?" (multi-select checkboxes: Pests, Mold, Lead paint or pipes, Lack of heat, Oven or stove not working, Smoke detectors missing or not working, Water leaks) to SCN assessment admin view
- [x] Add Q: "Does the member have difficulty climbing stairs or bathing?" (Yes/No) to SCN assessment admin view
- [x] Add "None / I live alone" (value 0) option to household members count dropdown on intake form
- [x] Make household member name required — block form submission if any member row has an empty name
- [x] Make Medicaid ID and Date of Birth required for every household member row on intake form
- [x] Security: enforce isActive check on admin login so deactivated staff cannot log in
- [x] Security: HTML-escape email body in sendClientEmail to prevent HTML injection
- [x] Security: add rate limiter on password reset (forgotPassword) endpoint
- [x] Add "Assessment Recorded" stage option to all admin stage dropdowns
- [x] Auto-update stage to "assessment_recorded" when marking assessment complete
- [x] Add "Pending Assessment" and "Assessment Recorded" tabs to assessor client list page
- [x] Add "Missing Information" tab to Assessor Portal with note dialog
- [x] Add "Not Eligible" tab to Assessor Portal with reason dialog
- [x] Email client when flagged as Missing Information with the note included
- [x] Show Missing Info note and Not Eligible reason on admin client detail page
- [x] Update intake form confirmation message to say "a few business days"
- [x] Replace DOB calendar picker with text input on intake form
- [x] Auto-format DOB fields as user types (MM/DD/YYYY)
- [x] Fix auto-stage on assessment complete to use 'assessment' instead of 'assessment_recorded'
- [x] Fix existing DB records incorrectly set to 'assessment_recorded' by auto-stage bug — reset to 'assessment'
- [x] Preserve Admin Clients list state (page, search, filters, scroll) when navigating back from Client Detail
- [x] Add three new fields to SCN Screening Questionnaire: Enrolled in Health Home, Household Members, Household Members with Medicaid
- [x] Fix back navigation from Client Detail to restore exact page/filters on Admin Clients list (still broken)
- [x] Show all intake form fields in Health Categories section of assessment page (miscarriage date, due date, infant details, condition names, etc.) and fix display for existing applications
- [x] Make all Client Overview and Assessment tab fields editable (personal info, address, household, employment, food preferences, health category sub-fields)
- [x] Add edit for health categories themselves in Assessment tab (add/remove categories inline)
- [x] Warn before removing a health category that has sub-data (confirmation dialog listing what will be hidden)
- [x] Add structured session activity logs to Audit Log page (session grouping, page views, expandable session timeline per login)

## Security Audit Fixes
- [x] SECURITY BUG 1: viewer/assessor role can call staffProcedure mutations (edit/delete client data) - enforce canEdit/canDelete server-side
- [x] SECURITY BUG 2: upload.document is publicProcedure - unauthenticated users can upload files to S3 (NOTE: intentional for intake form - kept public but hardened)
- [x] SECURITY BUG 3: file extension now derived from MIME type, not user-supplied filename
- [x] SECURITY BUG 4: category parameter sanitized to alphanumeric+hyphens only
- [x] SECURITY BUG 5: logPageView rate-limited to 60 page views per user per minute

## Security Hardening Steps
- [x] Step 1: Login brute-force rate limiter — 10 attempts / 15 min per IP (Tier 1), 15 attempts / 24 hr hard block (Tier 2), applied to admin login and referrer portal login. Verified with dedicated unit test (11th attempt → 429, different IP still allowed). 116/116 tests pass.
- [x] Step 2: HTTPS-only cookies in production + HTTP→HTTPS redirect via vercel.json — Secure flag already set via x-forwarded-proto header (Vercel-compatible). Added HTTP→HTTPS redirect rule in vercel.json. Verified with 4 unit tests covering all proxy scenarios. 120/120 tests pass.
- [x] Step 3: Content Security Policy header via vercel.json — strict script-src 'self', style-src with Google Fonts, img-src with https: for CDN images, connect-src with forge.manus.ai, frame/object-src 'none'. Also added X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy. Verified with 8-test suite (csp.test.ts). 128/128 tests pass.

## UX Improvements
- [x] Replace DOB text input with three-dropdown (Month/Day/Year) picker on main applicant field and household member rows — DobPicker component with leap-year-aware day clamping, verified with 16 unit tests. 144/144 tests pass.
- [x] Bug: DobPicker dropdowns not selectable — fixed by switching SelectContent to position="item-aligned" + max-h-60. Root cause: popper position set viewport height = trigger height (~36px), making items invisible. 144/144 tests pass.

## Deep Security Audit Fixes (May 2026)
- [x] BUG-SEC-A: referrer portal myClients/myStats/myMessages/reply/markAllRead/deleteMessage — added referrerCodeLimiter (60 req/15 min per IP) to all 6 endpoints in index.ts
- [x] BUG-SEC-B: admin documents.upload — added MAX_ADMIN_UPLOAD_BYTES (10 MB) server-side check on decoded buffer before S3 write
- [x] BUG-SEC-C: admin documents.upload — replaced user-supplied extension with MIME_TO_EXT map; S3 key now always uses MIME-derived extension (safeExt)
- [x] BUG-SEC-D: cookies.ts — SameSite now set to 'lax' on HTTP and 'none' only when Secure=true (HTTPS). 9 regression tests added, 153/153 total tests pass.

## Second-Pass Security Audit Fixes (May 2026)
- [x] BUG-SEC2-A: email.ts buildEmailHtml — added esc() helper and applied to all 15+ user-supplied fields. 6 regression tests confirm XSS payloads are neutralised.
- [x] BUG-SEC2-B: referrerPortal.reply — attachmentUrl now validated with z.string().url().startsWith('https://'); server-side double-check strips non-https values before DB write. 5 regression tests pass.
- [x] BUG-SEC2-C: password reset token now stored as SHA-256 hash. Raw token sent in email link; hash stored in DB. resetPassword and validateToken both hash the incoming token before lookup. 4 regression tests confirm one-way property. 168/168 tests pass.

## Third-Pass Security Audit Fixes (May 2026)
- [x] BUG-SEC3-A: Deactivated staff sessions remain valid — fixed by adding isActive === 0 check in sdk.ts authenticateRequest(). Now every request rejects deactivated accounts immediately. 3 regression tests added.
- [x] BUG-SEC3-B: signatureDataUrl has no max length — added .max(500_000) to submissionInputSchema. 4 regression tests confirm oversized signatures are rejected with a clear error message.
- [x] BUG-SEC3-C: S3 keys use Math.random() — replaced with crypto.randomBytes(16).toString('hex') in both public upload.document and admin documents.upload endpoints. 128-bit keyspace vs ~31-bit Math.random. 4 regression tests confirm uniqueness and key format. 179/179 tests pass.

## Fourth-Pass Security Audit Fixes (May 2026)
- [x] BUG-SEC4-A: Inbound email webhook skipped Svix signature verification when RESEND_WEBHOOK_SECRET was absent — attacker could POST fake email.received events to inject messages into any client record by guessing a submission ID. Fixed: fail CLOSED — if secret is not set, endpoint returns 500 immediately. 4 regression tests confirm old open behaviour vs new closed behaviour.
- [x] BUG-SEC4-B: recentClients/recentlyUpdated/addedCount had no bounds on days/limit — a compromised staff account could pass limit=999999 to dump the entire submissions table. Fixed: added .int().min(1).max(200) on limit and .int().min(1).max(365) on days. 7 regression tests confirm bounds. 189/190 tests pass (1 pre-existing failure: Resend domain not yet verified in dashboard).

## Fifth-Pass Security Audit Fixes (May 2026)
- [x] BUG-SEC5-A: passwordHash and passwordResetToken leaked in user list responses — listWorkers(), listStaffUsers(), listAllUsers() all used db.select() with no column projection, returning full user rows including passwordHash and passwordResetToken to any admin. Fixed by adding SAFE_USER_COLUMNS projection that explicitly excludes all sensitive fields. 5 regression tests confirm no sensitive fields are returned.
- [x] BUG-SEC5-B: public upload.document missing server-side file size check — the public (no-auth) upload endpoint had no size validation on the decoded buffer, allowing an attacker to POST 10 MB base64 payloads repeatedly (20x per 15 min = 200 MB S3 writes per window per IP). Fixed by adding MAX_PUBLIC_UPLOAD_BYTES (10 MB) check before the storagePut call. 5 regression tests confirm boundary behavior. 199/200 tests pass (1 pre-existing Resend domain failure).

## Email Blast Replies Inbox Fix (May 2026)
- [x] Fix inbound webhook in src/index.ts to parse blast-{blastId}-{submissionId}@ reply-to addresses (was only parsing reply-{id}@ format)
- [x] Fix cron endpoint to save outbound blast emails to clientEmails table with blastId set (was not recording sent emails)
- [x] Update security-audit.test.ts and security-audit5.test.ts to reflect 3MB upload limit (reduced from 10MB for Vercel compatibility)
- [x] 200/200 tests passing

## Blast Stuck-in-Sending Fix (May 2026)
- [x] Fix cron endpoint: wrap each blast in its own try/catch so one failure doesn't block others
- [x] Fix cron endpoint: mark blast as "failed" (not leave as "sending") when an error occurs mid-send
- [x] Fix cron endpoint: auto-recover stale "sending" blasts (stuck >5 min) on next cron tick
- [x] Add emailBlast.retry tRPC procedure (super_admin only) to re-queue failed/stuck blasts
- [x] Add Retry button in AdminEmailBlast UI for failed/sending blasts
- [x] Add auto-refresh (every 30s) to blast list when any blast is in scheduled/sending state
- [x] 199/200 tests passing (1 pre-existing live Resend network test fails in sandbox)

## Blast Retry Deduplication (May 2026)
- [x] Add getBlastAlreadySentIds DB helper — returns set of submissionIds that already have an outbound clientEmails row for a given blastId
- [x] Update cron send loop to skip clients already in that set (idempotent sends)

## Security Audit Fixes (2026-05-15)

- [x] Fix: 7 rate limiters missing from production src/index.ts (referrer login, referrer code endpoints, password reset, admin login hard-block)
- [x] Fix: Atomic blast claim in cron to prevent concurrent double-send race condition
- [x] Fix: dbStatus public endpoint exposed user count — now returns only connection health
- [x] Fix: updatePriority and sendClientEmail used staffProcedure (viewer/assessor could mutate) — changed to editProcedure
- [x] Fix: updateEmailBlastStatus now returns boolean for atomic claim support
- [x] Doc: CRON_SECRET added to env.ts — must be set in Vercel env vars to protect cron endpoint

## Assessor Portal Filters
- [x] Add Priority filter (All / Urgent / High / Normal / Low) to /assessor
- [x] Add New/Transfer filter to /assessor
- [x] Filters reset when switching tabs
- [x] "Clear filters" button shown when any filter is active
- [x] Tab count badges remain unfiltered (always show total)

## Assessor Assignment Feature
- [x] DB migration: add assessorId (nullable FK to users) column to submissions table
- [x] Backend: add admin.assignAssessor tRPC procedure (editProcedure, validates assessor role)
- [x] Backend: add admin.listAssessors procedure to fetch all active assessor-role users
- [x] Backend: update assessor portal myClients query to filter by assessorId = ctx.user.id
- [x] Backend: send in-app notification to assessor when assigned a client
- [x] Backend: audit log entry for assessor assignment/reassignment
- [x] Frontend: assessor dropdown on client detail page assignment section
- [x] Frontend: reassignment warning dialog when client already has an assessor assigned
- [x] Frontend: assessor column on admin client list table
- [x] Frontend: filter by assessor on admin client list
- [x] Frontend: assessor portal scoped to only show assigned clients

## Staff Impersonation Feature
- [x] Backend: IMPERSONATION_COOKIE constant added to routers.ts
- [x] Backend: getUserById helper added to db.ts
- [x] Backend: impersonate.start procedure (super_admin only, cannot impersonate super_admin or inactive accounts)
- [x] Backend: impersonate.stop procedure (restores original admin session from cookie)
- [x] Backend: impersonate.status procedure (checks if current session is impersonation)
- [x] Backend: audit log entries for impersonation start/stop
- [x] Frontend: Login As button (indigo, LogIn icon) on each active staff row in AdminWorkers
- [x] Frontend: ImpersonationBanner component (fixed top, indigo, shows current user + Exit button)
- [x] Frontend: ImpersonationBanner rendered globally in App.tsx
- [x] Tests: 10 impersonation business rule tests passing

## Not Interested Soft-Delete Feature (July 2026)
- [x] Add notInterested, notInterestedAt, notInterestedBy columns to submissions table
- [x] Run migration for new columns
- [x] Add canMarkNotInterested to WorkerPermissions type in db.ts
- [x] Add notInterested filter to listSubmissions in db.ts
- [x] Add markNotInterested procedure (permission-gated: admin/super_admin always; worker if canMarkNotInterested)
- [x] Add restoreClient procedure (same permission gate)
- [x] Add notInterested param to admin.list query schema
- [x] Add canMarkNotInterested to all worker permission schemas in routers.ts
- [x] Add tab switcher (Active Clients / Not Interested) to AdminClients.tsx
- [x] Add Not Interested button per row (visible only to permitted users)
- [x] Add Restore button on Not Interested tab
- [x] Add info banner on Not Interested tab
- [x] Context-aware empty state for Not Interested tab
- [x] Add canMarkNotInterested to PERM_LIST and DEFAULT_PERMISSIONS in AdminWorkers.tsx
- [x] Add EyeOff icon to AdminWorkers.tsx imports
- [x] Fix listStaffUsers to use SAFE_USER_COLUMNS projection (security test compliance)

## Self-Service Password Reset (July 2026)
- [x] Add passwordResetToken and passwordResetExpiry columns to users table, run migration
- [x] Add requestPasswordReset and resetPassword db helpers
- [x] Add auth.requestPasswordReset and auth.resetPassword tRPC procedures
- [x] Build ForgotPassword page (email input, success message)
- [x] Build ResetPassword page (token from URL, new password + confirm)
- [x] Add "Forgot password?" link to admin/worker login page
- [x] Wire routes in App.tsx
- [x] Write e2e tests for the full reset flow
- [x] Add "Send Reset Link" button (KeyRound icon) to Staff Management page per staff member
- [x] Add "Download PDF" button to client detail page — generates comprehensive PDF with all client info and assessment data using pdf-lib (client-side)
- [x] Add re-upload button for legacy URL-only documents (no fileKey) in AdminClientDetail — allows admins to replace expired docs with a fresh upload in-place
- [ ] Chat: Create client_messages and message_reads DB tables with migration
- [ ] Chat: tRPC procedures — send, list (paginated), mark-read, unread counts
- [ ] Chat: SSE endpoint for real-time message delivery per client thread
- [ ] Chat: Per-client Chat tab in AdminClientDetail with WhatsApp/Teams-style bubble UI
- [ ] Chat: Message bubbles — sender on right (green), others on left (white), avatar initials, timestamps
- [ ] Chat: Typing indicator and auto-scroll to latest message
- [ ] Chat: File/image attachment support in chat
- [ ] Chat: @mention support with staff autocomplete
- [ ] Chat: Global Chat Inbox page (/admin/chat) in sidebar with all active threads
- [ ] Chat: Unread badge on sidebar Chat nav item and per-thread in inbox
- [ ] Chat: Real-time unread count polling with SSE updates
- [ ] Chat: Message search within a thread
- [ ] Chat: Emoji reactions on messages
- [x] Chat: @mention autocomplete — type @ in chat input to get a dropdown of all staff users, click to tag them
- [x] Chat: @mention notification — when a message containing @username is sent, dispatch an in-app notification to the tagged user (fixed trailing-space name bug in DB)
- [x] Chat: Download PDF — button to export full chat thread as a formatted PDF (client name, date, all messages with sender/timestamp)

## Chat Improvements (July 22, 2026)
- [x] Chat: Filter @mention dropdown to only show active (non-deactivated) staff users
- [x] Chat: Restrict "Export PDF" button to admin users only (hide for workers/assessors)

## Security Audit & Bug Fixes (July 22, 2026)

- [x] BUG-CRASH-1: Service list crashes page — `parseLocalDate` called with `Date` object (not string) from DB — fixed `utils.ts` to handle `Date` instances
- [x] BUG-PERM-1: Assessors blocked from writing case notes — `notes.create` used `editProcedure` — changed to `staffProcedure` with assessor scope check
- [x] BUG-DATA-1: Case notes show "Staff" instead of author name — `caseNotes` table had no `authorName` column — added column, migration applied, `notes.create` now stores `ctx.user.name`
- [x] SEC-IDOR-1: Assessors could call `exportCsv` and download ALL client PII — added explicit role check blocking assessors and viewers
- [x] SEC-UPLOAD-1: Chat `uploadAttachment` had no MIME type whitelist and no server-side size limit — added MIME whitelist (PDF/JPG/PNG/WEBP/GIF/DOC/DOCX/TXT) and 10 MB decoded size cap

## Organization Referral System

- [ ] SCHEMA: Add `organizations` table (id, name, contactEmail, contactPhone, notes, isActive, createdAt)
- [ ] SCHEMA: Add `orgId` column to `users` table (nullable FK to organizations)
- [ ] SCHEMA: Add `referredOrgId`, `referredOrgAt`, `referredOrgNote` columns to `submissions` table
- [ ] SCHEMA: Add `orgChatGroups` table (id, orgId, createdAt) for per-org group chat channels
- [ ] SCHEMA: Extend `clientMessages` or add `orgGroupMessages` table for org group chat
- [ ] MIGRATION: Generate and apply all schema migrations

- [ ] SERVER: org.list — list all organizations (admin only)
- [ ] SERVER: org.create — create organization (admin only)
- [ ] SERVER: org.update — update organization details (admin only)
- [ ] SERVER: org.delete — deactivate organization (admin only)
- [ ] SERVER: org.listMembers — list users belonging to an org (admin only)
- [ ] SERVER: org.assignUser — assign a user to an org (admin only)
- [ ] SERVER: org.removeUser — remove a user from an org (admin only)
- [ ] SERVER: admin.referToOrg — refer a client to an org with a note (admin only, replaces existing org referral)
- [ ] SERVER: admin.removeOrgReferral — remove org referral from a client (admin only)
- [ ] SERVER: Scope client list/detail for org staff — org staff only see clients where referredOrgId = their orgId
- [ ] SERVER: Scope case notes for org staff — org staff only see notes by their own org members + notes where they were @tagged
- [ ] SERVER: Org group chat — create/list/send messages in org group channel
- [ ] SERVER: @OrgName mention — notify all members of that org
- [ ] SERVER: @mention in org group chat — notify specific org worker

- [ ] ADMIN UI: Organizations management page (/admin/organizations) — list, create, edit, deactivate orgs
- [ ] ADMIN UI: Org members management — assign/remove users from an org on the org detail page
- [ ] ADMIN UI: "Refer to Organization" button on client detail page — opens modal with org dropdown + referral note
- [ ] ADMIN UI: Show referred org badge on client detail and client list
- [ ] ADMIN UI: Remove org referral action on client detail
- [ ] ADMIN UI: Org group chats visible in Chat Inbox for FreshSelect staff
- [ ] ADMIN UI: @OrgName autocomplete in chat input

- [ ] ORG PORTAL: Org staff login routes to org-scoped client list (/org/clients)
- [ ] ORG PORTAL: Org staff client list — only shows clients referred to their org
- [ ] ORG PORTAL: Org staff client detail — same tabs as assessor (overview, assessment, services, chat)
- [ ] ORG PORTAL: Case notes filtered — org staff only see their org's notes + @tagged notes
- [ ] ORG PORTAL: Org group chat — org staff see only their org's group channel
- [ ] ORG PORTAL: @mention in org group chat — autocomplete shows org members + FreshSelect workers

## Organization Referral System — Completion (July 22, 2026)

- [x] SCHEMA: organizations table created (id, name, contactEmail, contactPhone, notes, isActive, createdAt)
- [x] SCHEMA: orgId added to users table (nullable FK to organizations)
- [x] SCHEMA: referredOrgId, referredOrgAt, referredOrgNote added to submissions table
- [x] SCHEMA: orgGroupMessages table created (id, orgId, senderId, senderName, senderRole, senderOrgName, content, attachmentUrl, attachmentName, attachmentType, reactions, isDeleted, createdAt)
- [x] SCHEMA: orgMessageReads table created (id, userId, orgId, lastReadMessageId, updatedAt)
- [x] SCHEMA: userId added to notifications table for targeted per-user notifications
- [x] MIGRATION: Migrations 0033 (org tables) and 0034 (notifications.userId) applied to DB

- [x] SERVER: org.list — list all organizations (staff can see active, admin can see inactive)
- [x] SERVER: org.get — get org with members (admin only)
- [x] SERVER: org.create — create organization (admin only)
- [x] SERVER: org.update — update organization details (admin only)
- [x] SERVER: org.addMember — assign a user to an org (admin only)
- [x] SERVER: org.removeMember — remove a user from an org (admin only)
- [x] SERVER: org.referClient — refer a client to an org with a note (staff procedure with scope check)
- [x] SERVER: org.myOrg — get own org info (for org staff portal header)
- [x] SERVER: org.listReferredClients — list clients referred to caller's org (org staff only)
- [x] SERVER: org.groupMessages — list messages in an org group channel (staff + org staff)
- [x] SERVER: org.sendGroupMessage — send a message to an org group channel (with @mention notifications)
- [x] SERVER: org.markGroupRead — mark org group chat as read
- [x] SERVER: org.groupUnreadCount — get unread count for a specific org channel
- [x] SERVER: org.allGroupsWithUnread — list all org channels with unread counts (admin sees all, org staff sees only theirs)

- [x] ADMIN UI: AdminOrganizations page (/admin/organizations) — list, create, edit, deactivate orgs + member management
- [x] ADMIN UI: "Refer to Organization" button + dialog on AdminClientDetail page
- [x] ADMIN UI: Organizations link in admin sidebar (ADMIN_ONLY_NAV_ITEMS)
- [x] ADMIN UI: Org Group Chats inbox page (/admin/org-chats) — two-panel layout with org channel list + active chat with @mention support
- [x] ADMIN UI: Org Group Chats link in admin sidebar

- [x] ORG PORTAL: OrgPortal.tsx page (/org) — org staff see their referred clients + org group chat
- [x] ORG PORTAL: /org/clients/:id route for org staff to view client details
- [x] ORG PORTAL: Org staff auto-redirect — login routes org staff (users with orgId) to /org instead of /admin/dashboard
- [x] ORG PORTAL: AdminLayout redirects org staff to /org if they land on any admin page

## E2E Bug Fixes (July 22 2026)
- [x] BUG FIX: AdminLogin.tsx — assessor login now reloads the login page (not /assessor) so auth.me resolves with full user object (including orgId) before redirect. The useEffect then correctly sends org staff to /org.
- [x] BUG FIX: AdminClientDetail.tsx — detect /org/ URL context via location.startsWith("/org/") and user.orgId to set correct back link (/org vs /assessor)
- [x] BUG FIX: server/routers.ts getById — assessors with orgId can now view clients referred to their org (not just their assigned clients)
- [x] BUG FIX: server/routers.ts — added canAssessorAccessClient() helper; updated all 14 assessor access checks (notes, tasks, services, docs, assessment, email, chat, referrer notes, document URL) to allow org-referred client access

## Org Visibility - Option A (July 22 2026)
- [x] SERVER: listSubmissionsByOrg — also include clients where assessorId is any staff member of the org (not just referredOrgId)
- [x] SERVER: canAssessorAccessClient helper — also allow access if submission.assessorId belongs to any member of the user's org
- [x] SERVER: org.listReferredClients procedure — update label/description to reflect "org clients" not just "referred"
- [x] OrgPortal UI — update heading from "Referred Clients" to "Your Clients" to reflect the broader scope

## Org Filter Dropdown on Admin Client List (July 22 2026)
- [x] SERVER: add optional orgId filter to listSubmissions db query (include clients where referredOrgId=orgId OR assessorId IN org staff)
- [x] SERVER: expose orgId param on submissions.list tRPC procedure
- [x] UI: add org dropdown (All Orgs + each org by name) to AdminClientList page, wired to the orgId filter

## Reply-to-Specific-Message Feature (July 22 2026)
- [x] DB: add replyToId, replyToSenderName, replyToContent columns to clientMessages table
- [x] DB: add replyToId, replyToSenderName, replyToContent columns to orgGroupMessages table
- [x] SERVER: update chat.send procedure to accept optional replyToId, look up replied-to message, store denormalised preview
- [x] SERVER: update org.sendGroupMessage procedure same way
- [x] SERVER: add getClientMessageById and getOrgGroupMessageById helpers to db.ts
- [x] UI: create shared ReplyBar.tsx component (ReplyBar, ReplyButton, ReplyQuote)
- [x] UI: wire reply into ClientChatTab.tsx (hover button, ReplyBar above input, ReplyQuote in bubble)
- [x] UI: wire reply into AdminOrgChats.tsx OrgChatPanel (hover button, ReplyBar, ReplyQuote)
- [x] UI: wire reply into OrgPortal.tsx OrgGroupChatPanel (hover button, ReplyBar, ReplyQuote)

## Chat Bug Fixes (July 28 2026)
- [x] FIX: Messages disappearing after send (added optimistic message state; message appears instantly, cleared after server confirms)
- [x] FIX: @mention turns entire message text blue (fixed regex to match only @Name or @First Last token, not trailing words)

## WhatsApp-Style Chat Redesign (July 28 2026)
- [x] SERVER: add getThreadReadWatermarks and getOrgGroupReadWatermarks to db.ts (watermark-based read tracking)
- [x] SERVER: add chat.readWatermarks and org.readWatermarks procedures to routers.ts
- [x] UI ClientChatTab: dark teal (#075E54) header, ECE5DD wallpaper with subtle pattern, DCF8C6 my-bubbles, white other-bubbles
- [x] UI ClientChatTab: ✓✓ read receipt ticks (grey = sent, blue = seen by all participants via watermarks)
- [x] UI ClientChatTab: time-only timestamps inline in bubble footer (HH:MM)
- [x] UI ClientChatTab: rounded-3xl white pill input, dark teal send button, light grey (#F0F0F0) composer bg
- [x] UI AdminOrgChats OrgChatPanel: matching WhatsApp design, reply-on-hover button repositioned outside bubble
- [x] UI OrgPortal OrgGroupChatPanel: matching WhatsApp design, FreshSelect badge on non-org senders

## E2E Audit Fixes (July 28 2026)
- [x] BUG FIX: AssessorPortal.tsx — add orgId redirect guard so org staff who navigate directly to /assessor are immediately redirected to /org via window.location.replace
- [x] BUG FIX: OrgPortal.tsx — fix notifications bell link from /admin/notifications (uses AdminLayout, would redirect org staff back to /org) to /org/notifications (standalone page)
- [x] NEW: OrgNotifications.tsx — standalone notifications page for org staff at /org/notifications, with back button to /org, notification link rewriting (/admin/clients/ → /org/clients/)
- [x] NEW: /org/notifications route added to App.tsx
- [x] IMPROVEMENT: OrgPortal Group Chat tab now shows unread badge (red dot with count) when there are unread messages in the org group channel

## New Features - Create Task from Message, Progress Tracking, Daily Digest (July 28 2026)
- [x] SCHEMA: Add title, dueDate, priority, sourceMessageId, sourceMessageType columns to tasks table
- [x] SCHEMA: Add stageUpdatedAt column to submissions table
- [x] DB: Run migration for new tasks + submissions columns
- [x] DB: Add getTasksBySubmissionWithDetails helper (includes assignee name)
- [x] DB: Add getDailyDigestData helper (audit logs, new clients, stage changes, tasks, messages for a date range)
- [x] BACKEND: Update tasks.create procedure to accept title, dueDate, priority, sourceMessageId, sourceMessageType
- [x] BACKEND: Add tasks.updateTask procedure (edit title, description, dueDate, priority, assignedTo)
- [x] BACKEND: Add tasks.deleteTask procedure
- [x] BACKEND: Add admin.checkDuplicate procedure (check phone/CIN for duplicates)
- [x] BACKEND: Add /api/scheduled/daily-digest endpoint in server/_core/index.ts
- [x] BACKEND: Add getDailyDigestData function in db.ts
- [ ] BACKEND: Register Heartbeat cron for daily digest (8 AM UTC = 4 AM ET)
- [x] FRONTEND: Create CreateTaskFromMessageDialog component (pre-filled from message, title/description/assignee/dueDate/priority)
- [x] FRONTEND: Add "Create Task" button to ClientChatTab message bubble hover actions
- [x] FRONTEND: Add "Create Task" button to AdminOrgChats message bubble hover actions
- [x] FRONTEND: Add "Create Task" button to OrgPortal group chat message bubble hover actions
- [ ] FRONTEND: Show linked task card below message after task is created (clickable, shows status)
- [x] FRONTEND: SLA badge on AdminClients list — yellow after 7 days in stage, red after 14 days
- [ ] FRONTEND: "Days in stage" shown on client row in AdminClients
- [x] FRONTEND: Stage timeline section on AdminClientDetail (full history with timestamps and actor names)
- [x] FRONTEND: Required field completion checklist on AdminClientDetail overview tab
- [x] FRONTEND: Overdue task badge (red "Overdue" label) on tasks past dueDate
- [x] FRONTEND: Stage change confirmation dialog for terminal stages (not_eligible, ineligible, flagged)
- [x] FRONTEND: Duplicate phone/CIN warning on Add Client and Edit Client dialogs
- [x] TESTS: Write vitest tests for new task procedures (title, dueDate, priority, sourceMessage)
- [x] TESTS: Write vitest test for daily digest data query
