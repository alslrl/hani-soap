#!/usr/bin/env bash
set -euo pipefail
# Always creates and stops its own disposable cluster. Never connects to an existing database.
python3 - <<'PY'
import copy, concurrent.futures, json, os, pathlib, shutil, socket, subprocess, tempfile
root=pathlib.Path.cwd()
postgres=shutil.which('postgres')
if not postgres: raise SystemExit('Install local PostgreSQL to run the isolated database checks.')
bindir=pathlib.Path(os.environ.get('HANI_PG_BINDIR',str(pathlib.Path(postgres).resolve().parent)))
for tool in ['initdb','pg_ctl','psql','postgres']:
 if not (bindir/tool).exists(): raise SystemExit(f'Matching PostgreSQL tool missing: {bindir/tool}. Set HANI_PG_BINDIR to a complete server installation.')
with socket.socket() as sock:
 sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
temporary=pathlib.Path(tempfile.mkdtemp(prefix='hani-postgres-test-'))
cluster=temporary/'cluster'
started=False
checks=0
def cmd(args,**kwargs):return subprocess.run([str(v) for v in args],capture_output=True,text=True,**kwargs)
def sql(query,expect=True):
 result=cmd([bindir/'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-d','postgres'],input=query)
 if expect and result.returncode: raise RuntimeError(result.stderr.strip())
 return result
def check(condition,message):
 global checks
 if not condition: raise AssertionError(message)
 checks+=1
CLINIC='6c8ad2ac-7ed0-5688-9784-cd287f2a7b51'
def commit(state,version):
 encoded=json.dumps(state,ensure_ascii=False).replace("'","''")
 return f"set role service_role; select public.hani_commit_state('{CLINIC}',{version},'{encoded}'::jsonb);"
try:
 init=cmd([bindir/'initdb','-D',cluster,'--auth=trust','--encoding=UTF8','--no-locale'])
 if init.returncode:raise RuntimeError(init.stderr.strip())
 start=cmd([bindir/'pg_ctl','-D',cluster,'-l',temporary/'postgres.log','-o',f'-p {port} -h 127.0.0.1 -k {temporary}','-w','start'])
 if start.returncode:raise RuntimeError(start.stderr.strip())
 started=True
 sql('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);')
 for migration in sorted((root/'supabase/migrations').glob('*.sql')):sql(migration.read_text())
 check(True,'migration applied')
 seed=json.loads((root/'data/demo/patients.seed.json').read_text())
 seed.update(annotations=[],recordings=[],jobs=[],audioSessions=[],live_events=[],liveProcedureEvents=[])
 check(sql(commit(seed,0)).stdout.strip()=='1','initial commit version')
 sql((root/'supabase/tests/security.test.sql').read_text())
 check(True,'RLS/grants/bucket/count assertions')
 for role in ['anon','authenticated']:
  denial=sql(f'set role {role}; select * from public.patients;',expect=False)
  check(denial.returncode!=0 and 'permission denied' in denial.stderr,f'{role} cannot read patients')
 stale=sql(commit(seed,0),expect=False)
 check(stale.returncode!=0 and 'VERSION_CONFLICT' in stale.stderr,'stale version rejected')
 changed=copy.deepcopy(seed);changed['soap_documents'][0]['sections']['s']='illegal overwrite'
 immutable=sql(commit(changed,1),expect=False)
 check(immutable.returncode!=0 and 'IMMUTABLE_APPROVED_DOCUMENT' in immutable.stderr,'approved SOAP immutable')
 changed=copy.deepcopy(seed);changed['patients'][0]['notes']='updated in atomic test'
 check(sql(commit(changed,1)).stdout.strip()=='2','patient note persists')
 invalid=copy.deepcopy(changed);invalid['visits'][0]['patient_id']='11111111-1111-4111-8111-111111111111'
 foreign=sql(commit(invalid,2),expect=False)
 check(foreign.returncode!=0 and 'foreign key constraint' in foreign.stderr,'foreign patient rejected')
 check(sql(f"select version from public.demo_state where clinic_id='{CLINIC}';").stdout.strip()=='2','failed FK transaction atomic')
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
  results=list(executor.map(lambda _:sql(commit(changed,2),expect=False),range(2)))
 check(sum(v.returncode==0 for v in results)==1 and sum('VERSION_CONFLICT' in v.stderr for v in results)==1,'concurrent compare-and-swap has one winner')
 check(sql('select count(*) from public.demo_state_revisions;').stdout.strip()=='2','prior versions archived')
 for _ in range(5):check(sql("set role service_role; select public.hani_check_access_attempt('test-ip',false);").stdout.strip()=='t','failed PIN counted')
 check(sql("set role service_role; select public.hani_check_access_attempt('test-ip',true);").stdout.strip()=='f','correct PIN blocked after shared limit')
 sql("set role service_role; do $$ begin for i in 1..45 loop if not public.hani_check_access_attempt('global-'||i,false) then raise exception 'early global rate limit'; end if; end loop; end $$;")
 check(sql("set role service_role; select public.hani_check_access_attempt('fresh-ip',true);").stdout.strip()=='f','global 50/hour PIN limit')
 session='9265dd65-bdb7-461f-9d5d-d85af14dc931'
 sql(f"insert into public.demo_sessions values('{session}','hash','version',now(),now()+interval '1 hour');")
 for _ in range(5):check(sql(f"set role service_role; select public.hani_check_ai_rate('{session}');").stdout.strip()=='t','AI rate counted')
 check(sql(f"set role service_role; select public.hani_check_ai_rate('{session}');").stdout.strip()=='f','AI rate shared limit')
 check(sql('select count(*) from public.visit_documents;').stdout.strip()=='4','normalized SOAP rows preserved')
 print(f'{checks} isolated PostgreSQL checks passed (migration, seed, CAS, immutable records, FKs, RLS/grants, private storage, shared rate limits).')
finally:
 if started:
  stopped=cmd([bindir/'pg_ctl','-D',cluster,'-m','fast','-w','stop'])
  if stopped.returncode:raise RuntimeError('Could not stop the disposable PostgreSQL cluster: '+stopped.stderr)
 shutil.rmtree(temporary,ignore_errors=True)
PY
