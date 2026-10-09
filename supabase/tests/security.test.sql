-- Run after the migration and fictional seed, as the database administrator.
begin;
do $$
declare item record; role_name text; privilege_name text;
begin
  if (select count(*) from public.patients) <> 2 then raise exception 'expected 2 patients'; end if;
  if (select count(*) from public.visits) <> 6 then raise exception 'expected 6 visits'; end if;
  for item in select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
  loop
    if not item.relrowsecurity then raise exception 'RLS missing: %',item.relname; end if;
    foreach role_name in array array['anon','authenticated'] loop
      foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE'] loop
        if has_table_privilege(role_name,item.oid,privilege_name) then raise exception 'browser privilege % on %',privilege_name,item.relname; end if;
      end loop;
    end loop;
  end loop;
  foreach role_name in array array['anon','authenticated'] loop
    if has_function_privilege(role_name,'public.hani_commit_state(uuid,bigint,jsonb)','EXECUTE') or
       has_function_privilege(role_name,'public.hani_check_access_attempt(text,boolean)','EXECUTE') or
       has_function_privilege(role_name,'public.hani_check_ai_rate(uuid)','EXECUTE') then raise exception 'browser can execute privileged RPC'; end if;
  end loop;
  if (select public from storage.buckets where id='hani-recordings') then raise exception 'audio bucket is public'; end if;
end $$;
rollback;
