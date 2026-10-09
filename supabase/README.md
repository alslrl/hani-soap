# HaniSOAP database

Apply the migration to the intended Supabase project before running `npm run db:seed`. The seed script loads `.env.local` through Next.js's environment loader and refuses to overwrite an existing state. It requires server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted).

The PIN-authenticated server reads `demo_state` and commits changes using `hani_commit_state`. A single transaction checks the state version, preserves previous snapshots, and updates the patient, visit, document, procedure, follow-up, care and runtime tables. This materialized snapshot keeps PC/iPad polling consistent; indexed relational rows support follow-up and clinical queries without parsing the snapshot. SOAP documents map to `visit_documents`, treatments to `treatment_entries`. All clinical tables enable RLS, and `anon` / `authenticated` have no table or RPC privileges. Only the PIN-checking server uses the privileged secret. The `hani-recordings` bucket is private.

Local development uses `.hani-data` when Supabase credentials are absent. `HANI_DATA_DIR` selects an isolated directory; `HANI_STORAGE_MODE=local` forces this adapter for tests even if cloud environment values exist. Vercel refuses local storage. Both adapters preserve prior state revisions and reject stale versions. Do not use a temporary local adapter for a deployed multi-device demo.

`DEMO_PIN_HASH` uses `scrypt$salt$hex` (32-byte derived key). `hashPin` in `src/lib/server/auth.ts` generates this form. Production requires a configured hash; the development-only default PIN is 1234. Set `APP_ORIGIN` to the deployed HTTPS origin. Successful PIN entry issues an opaque HttpOnly, Secure, SameSite=Strict cookie with an eight-hour server session. PIN changes revoke previous session versions; logout deletes the stored token hash.

Validation:

- `npm run test:server`: state transitions, provenance/version preservation, questionnaire and measurement consistency, care approval/contact lifecycle, annotations, PIN/origin/session/rate validation.
- `scripts/test-database.sh`: creates its own temporary PostgreSQL cluster, applies the migration with Supabase roles and a Storage bucket-table stub, seeds exactly two fictional patients, verifies relational constraints, rollback, compare-and-swap races, RLS/grants, private bucket, and shared request limits, then stops/removes the cluster. It never connects to an existing database. A matching PostgreSQL server installation is required; set `HANI_PG_BINDIR` if discovery cannot find one.

The isolated PostgreSQL check verifies the SQL itself. Supabase hosted connectivity, Storage uploads and deployment credentials require separate end-to-end verification after provisioning.
