import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { initialState } from '../src/lib/server/store';
import { validateState } from '../src/lib/server/validation';
import { FIXED_CLINIC_ID } from '../src/lib/server/config';

async function main() {
  loadEnvConfig(process.cwd());
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required. Load the server environment before running db:seed.');
  const state = await initialState();
  validateState(state);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: existing, error: readError } = await client.from('demo_state').select('version').eq('clinic_id', FIXED_CLINIC_ID).maybeSingle();
  if (readError) throw new Error(`Migration must be applied first (${readError.code}).`);
  if (existing) throw new Error('A demo state already exists. Refusing to overwrite visits or recordings.');
  const { data: version, error } = await client.rpc('hani_commit_state', { p_clinic_id: FIXED_CLINIC_ID, p_expected_version: 0, p_state: state });
  if (error) throw new Error(`Seed failed (${error.code}): ${error.message}`);
  const { count, error: verifyError } = await client.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', FIXED_CLINIC_ID);
  if (verifyError || count !== 2) throw new Error('Seed verification failed: expected exactly 2 patients.');
  console.log(`Seeded 2 fictional patients / ${state.visits.length} visits. Version ${version}.`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : 'Seed failed.'); process.exitCode = 1; });
