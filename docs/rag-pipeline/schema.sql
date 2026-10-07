-- RAG pipeline: safe replacement of knowledge-base documents.
-- Run ONCE in the Supabase SQL Editor of project "Lechem Veshemesh" (axclrpdtujisqktxvqiu).
-- It does not change the existing "documents" or "price_list" tables; it adds two tables and three functions,
-- and registers the documents that are already in the knowledge base so they appear in the active list.

begin;

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('pricelist', 'other')),
  doc_key text not null,
  file_name text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'failed')),
  stage text not null default 'received' check (stage in ('received', 'processed', 'verified')),
  chunk_count integer,
  source_text text,
  extracted jsonb,
  parse_job_id text,
  error_step text,
  error_message text,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

-- At most one active version per document key (the pricelist, or one file name).
create unique index if not exists document_versions_one_active_per_key
  on public.document_versions (doc_key) where status = 'active';
create index if not exists document_versions_status_created_idx
  on public.document_versions (status, created_at);

alter table public.document_versions enable row level security;

create table if not exists public.documents_staging (
  id bigserial primary key,
  version_id uuid not null references public.document_versions (id) on delete cascade,
  content text,
  metadata jsonb,
  embedding vector(1536)
);

create index if not exists documents_staging_version_idx on public.documents_staging (version_id);

alter table public.documents_staging enable row level security;

-- Register what is already in the knowledge base (one row per document).
insert into public.document_versions (doc_type, doc_key, file_name, status, stage, chunk_count, activated_at)
select
  case when metadata->>'doc' = 'מחירון' then 'pricelist' else 'other' end,
  case when metadata->>'doc' = 'מחירון' then 'מחירון' else coalesce(metadata->>'fileName', 'ללא שם') end,
  coalesce(metadata->>'fileName', 'ללא שם'),
  'active', 'verified', count(*), max((metadata->>'uploadedAt')::timestamptz)
from public.documents
group by 1, 2, 3
on conflict do nothing;

create or replace function public.verify_staged_version(p_version_id uuid)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'total', count(*),
    'bad_dims', count(*) filter (where embedding is null or vector_dims(embedding) <> 1536),
    'empty', count(*) filter (where content is null or btrim(content) = '')
  )
  from public.documents_staging
  where version_id = p_version_id;
$$;

-- The swap. One transaction: a failure anywhere leaves "documents" and "price_list" exactly as they were.
create or replace function public.activate_document_version(p_version_id uuid)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v public.document_versions%rowtype;
  staged integer;
  moved integer;
  p jsonb;
  k text;
begin
  select * into v from public.document_versions where id = p_version_id;
  if not found then
    raise exception 'version_not_found';
  end if;

  -- Serialize activations of the same document, then re-read the row (another activation may just have finished).
  perform pg_advisory_xact_lock(hashtext(v.doc_key));
  select * into v from public.document_versions where id = p_version_id;
  if v.status <> 'pending' or v.stage <> 'verified' then
    raise exception 'version_not_verified';
  end if;

  select count(*) into staged from public.documents_staging where version_id = p_version_id;
  if staged = 0 or staged <> v.chunk_count then
    raise exception 'staging_count_mismatch';
  end if;

  if v.doc_type = 'pricelist' then
    p := v.extracted;
    foreach k in array array['price_sourdough', 'price_rye', 'price_challah', 'price_burekas'] loop
      if coalesce(jsonb_typeof(p -> k), '') <> 'number'
         or (p ->> k)::numeric <> trunc((p ->> k)::numeric)
         or (p ->> k)::numeric not between 1 and 500 then
        raise exception 'invalid_price_%', k;
      end if;
    end loop;
    if coalesce(jsonb_typeof(p -> 'delivery_fee'), '') <> 'number'
       or (p ->> 'delivery_fee')::numeric <> trunc((p ->> 'delivery_fee')::numeric)
       or (p ->> 'delivery_fee')::numeric not between 0 and 100 then
      raise exception 'invalid_delivery_fee';
    end if;
  end if;

  delete from public.documents d
   where d.metadata ->> 'doc' = case when v.doc_type = 'pricelist' then 'מחירון' else 'אחר' end
     and (v.doc_type = 'pricelist' or d.metadata ->> 'fileName' = v.file_name);

  insert into public.documents (content, metadata, embedding)
  select content, metadata, embedding from public.documents_staging where version_id = p_version_id order by id;
  get diagnostics moved = row_count;

  if v.doc_type = 'pricelist' then
    update public.price_list set
      price_sourdough = (p ->> 'price_sourdough')::integer,
      price_rye = (p ->> 'price_rye')::integer,
      price_challah = (p ->> 'price_challah')::integer,
      price_burekas = (p ->> 'price_burekas')::integer,
      delivery_fee = (p ->> 'delivery_fee')::integer,
      updated_at = now()
     where id = 1;
    if not found then
      raise exception 'price_list_row_missing';
    end if;
  end if;

  delete from public.document_versions where doc_key = v.doc_key and status = 'active' and id <> v.id;
  update public.document_versions
     set status = 'active', activated_at = now(), source_text = null, error_step = null, error_message = null
   where id = v.id;
  delete from public.documents_staging where version_id = v.id;

  return jsonb_build_object('chunk_count', moved);
end;
$$;

create or replace function public.sweep_document_versions()
returns void
language plpgsql
set search_path = public, extensions
as $$
begin
  update public.document_versions
     set status = 'failed', error_step = 'abandoned', source_text = null,
         error_message = 'ההעלאה לא הסתיימה ונוקתה אוטומטית.'
   where status = 'pending' and created_at < now() - interval '30 minutes';
  delete from public.documents_staging
   where version_id in (select id from public.document_versions where status = 'failed');
  delete from public.document_versions
   where status = 'failed' and created_at < now() - interval '7 days';
end;
$$;

revoke all on function public.verify_staged_version(uuid) from public, anon, authenticated;
revoke all on function public.activate_document_version(uuid) from public, anon, authenticated;
revoke all on function public.sweep_document_versions() from public, anon, authenticated;
grant execute on function public.verify_staged_version(uuid) to service_role;
grant execute on function public.activate_document_version(uuid) to service_role;
grant execute on function public.sweep_document_versions() to service_role;

commit;
