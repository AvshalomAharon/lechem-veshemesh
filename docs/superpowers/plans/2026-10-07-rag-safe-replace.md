# RAG Safe-Replace Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload screen for pricelist / "other" documents that replaces the bot's knowledge safely: real steps (receive, process, verify, activate), previous version stays live until the new one is verified, partial data is deleted on failure, and a list of active documents.

**Architecture:** One Vercel Function (`api/docs.js`) routes five actions to a pure pipeline module (`lib/docs/pipeline.js`) whose dependencies (Supabase REST, OpenAI, LlamaParse) are injected, so every step is tested with fakes. New chunks go to `documents_staging`; one SQL function swaps them into `documents` (and updates `price_list` for a pricelist) in a single transaction. The browser drives the steps and polls `process` while LlamaParse works.

**Tech Stack:** Vanilla JS (CommonJS, Node 24 built-in `fetch`/`FormData`/`Blob`), `node:test`, Supabase PostgREST + Postgres functions, OpenAI REST, LlamaParse v2 REST. No dependencies, no `package.json`, no build step.

**Spec:** `docs/superpowers/specs/2026-10-07-rag-safe-replace-design.md`

## Global Constraints

* No framework, no bundler, no npm dependencies, no `package.json`. Tests run with `node --test test/`.
* Code style follows `api/login.js`: CommonJS, `function` declarations, `const`/`let`, English code comments, Hebrew user-facing strings.
* Secrets only in Vercel environment variables, read through `lib/env.js` `getEnv(...)`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `LLAMAPARSE_API_KEY`, `OPENAI_MODEL`. Never write them to code, docs or git, and never open `.mcp.json`.
* Supabase project is "Lechem Veshemesh" (`axclrpdtujisqktxvqiu`) only. Never `ai-dev-academy` (`rxsexaxpxafjsyygfubb`).
* Embeddings: OpenAI `text-embedding-3-small`, 1536 dimensions. Chunking: 1000 characters, 100 overlap. Same as the existing n8n workflow.
* Replacement keys (unchanged from today): pricelist = `metadata->>doc = 'מחירון'`; other = `metadata->>doc = 'אחר'` and `metadata->>fileName = <file name>`. Chunk metadata: `doc`, `fileName`, `uploadedAt`, plus new `version_id`.
* Price rules (CLAUDE.md): product price = whole number 1–500 ₪, delivery fee = whole number 0–100 ₪.
* Upload limit 4MB, extensions `.pdf .jpg .jpeg .png .md .txt`. Parse timeout 5 minutes. Abandoned `pending` versions are cleaned after 30 minutes, `failed` rows after 7 days.
* All endpoints require the signed session cookie (`lib/session.js` `readSession`). The `UPLOAD_TOKEN` is used only by the untouched invoice path to n8n.
* UI: Hebrew only, RTL, existing CSS variables, touch targets at least 44px, status never by color alone, dynamic text only through `textContent`, submit disabled while a run is active.
* No `git commit` / `git push` unless the user asks. Never `git add` `לא למחוק.txt` or `.mcp.json`. Where a task says "Checkpoint", run the stated tests and stop.
* Do not change the n8n workflows, the existing invoice flow, `api/index.js`, `api/login.js`, or business rules (prices, hours, delivery area).

## Review Focus

1. A file with no extractable text (empty `.md`, blank scan returning empty markdown): must fail at "receive" or "process" with a clear Hebrew message and leave nothing in `documents_staging` (tests in Tasks 4 and 5).
2. Double click / second `activate` for the same version (or two uploads of the same file): the second attempt must fail with 409 and must not duplicate or delete anything (Task 5, plus SQL test 4).
3. Hebrew file names with spaces, quotes and `%` travelling through the `x-file-name` header: stored unchanged and used as the replacement key (Task 7).
4. Pricelist whose model-extracted values are wrong (out of range, a price that is not in the text, delivery fee missing): must fail at "verify" and leave `documents` and `price_list` untouched (Tasks 3, 5 and SQL test 2).
5. Embedding service returning fewer vectors than chunks, or process being retried after a partial staging insert: no partial or duplicate rows, version marked failed or idempotent (Task 4).

---

## File Structure

| File | Responsibility |
|---|---|
| `docs/rag-pipeline/schema.sql` | Tables, functions, grants, backfill. Run once by the user in the Supabase SQL Editor. |
| `docs/rag-pipeline/schema-test.sql` | Transactional (rolled back) SQL tests for the swap function. Run by the user. |
| `lib/docs/chunker.js` | `splitText` — recursive character splitter, same behavior as the n8n node. |
| `lib/docs/prices.js` | `validatePrices` — rules and "appears in the source text" check. |
| `lib/docs/pipeline.js` | `PipelineError`, `receive`, `processVersion`, `verifyVersion`, `activateVersion`, `listDocuments`. Pure, deps injected. |
| `lib/docs/db.js` | `createDb` — Supabase PostgREST client implementing `deps.db`. |
| `lib/docs/openai.js` | `createEmbedder`, `createPriceExtractor`. |
| `lib/docs/llamaparse.js` | `createParser` — `start` / `poll`. |
| `lib/docs/deps.js` | `buildDeps(getEnv)` — wires the real clients, reports missing env names. |
| `api/docs.js` | Auth, routing by `?action=`, request/response mapping. Exports `createHandler`. |
| `private/admin.html` | Pipeline stage UI, active documents table (invoice path unchanged). |
| `vercel.json` | Block `/docs`, `/lib`, `/test` from static serving, `maxDuration` for `api/docs.js`. |
| `test/*.test.js`, `test/fakes.js`, `test/dev-server.js` | Unit tests, in-memory fakes, local preview server with fakes. |
| `CLAUDE.md` | Document the new pipeline and env vars. |
| `docs/rag-test/*` | Bot test questions, results, evidence. |

## Shared interfaces (referenced by every task)

```js
// deps object injected into lib/docs/pipeline.js
deps = {
  db: {
    insertVersion(row),            // -> version row (with id, created_at)
    getVersion(id),                // -> version row | null
    updateVersion(id, patch),      // -> void
    insertStaging(rows),           // rows: { version_id, content, metadata, embedding:number[] } -> void
    deleteStaging(versionId),      // -> void
    verifyStaged(versionId),       // -> { total, bad_dims, empty }
    activate(versionId),           // -> { chunk_count }   (SQL function, one transaction)
    listActive(),                  // -> [{ id, doc_type, file_name, chunk_count, activated_at, created_at }]
    sweep()                        // -> void
  },
  parser: {
    start(buffer, fileName, mime),  // -> jobId string
    poll(jobId)                     // -> { state: "running" } | { state: "done", markdown } | { state: "failed", message }
  },
  embed(texts),                     // -> number[][] (same length as texts)
  extractPrices(markdown),          // -> { priceSourdough, priceRye, priceChallah, priceBurekas, deliveryFee }
  now()                             // -> Date
}
```

Version row columns: `id, doc_type ('pricelist'|'other'), doc_key, file_name, status ('pending'|'active'|'failed'), stage ('received'|'processed'|'verified'), chunk_count, source_text, extracted, parse_job_id, error_step, error_message, created_at, activated_at`.

API step keys: `receive`, `process`, `verify`, `activate` (Hebrew labels: קבלה, עיבוד, בדיקה, החלפה).

---

### Task 1: SQL schema, SQL tests, static-serving block

**Files:**
- Create: `docs/rag-pipeline/schema.sql`
- Create: `docs/rag-pipeline/schema-test.sql`
- Modify: `vercel.json`

**Interfaces:**
- Produces: tables `document_versions`, `documents_staging`; functions `verify_staged_version(uuid) -> jsonb {total,bad_dims,empty}`, `activate_document_version(uuid) -> jsonb {chunk_count}` (raises `version_not_found`, `version_not_verified`, `staging_count_mismatch`, `invalid_price_<column>`, `invalid_delivery_fee`, `price_list_row_missing`), `sweep_document_versions() -> void`. All executable only by `service_role`.

- [ ] **Step 1: Write the schema**

Create `docs/rag-pipeline/schema.sql`:

```sql
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
```

- [ ] **Step 2: Write the SQL tests**

Create `docs/rag-pipeline/schema-test.sql`:

```sql
-- Tests for the swap functions. Run in the Supabase SQL Editor AFTER schema.sql.
-- Everything runs inside one transaction that ends with ROLLBACK, so nothing is kept.
-- Expected: NOTICE lines "PASS 1" ... "PASS 5". If anything fails, run "rollback;" and send me the error text.

begin;

do $$
declare
  v1 uuid; v2 uuid; v3 uuid; v4 uuid;
  n integer;
  r jsonb;
  old_price integer;
  good jsonb := '{"price_sourdough":41,"price_rye":42,"price_challah":43,"price_burekas":14,"delivery_fee":8}';
begin
  -- 1. "other": replaces only the document with the same file name.
  insert into documents (content, metadata, embedding) values
    ('old A', '{"doc":"אחר","fileName":"t-a.md"}', array_fill(0.1::real, array[1536])::vector),
    ('keep B', '{"doc":"אחר","fileName":"t-b.md"}', array_fill(0.1::real, array[1536])::vector);
  insert into document_versions (doc_type, doc_key, file_name, status, stage, chunk_count)
    values ('other', 't-a.md', 't-a.md', 'pending', 'verified', 2) returning id into v1;
  insert into documents_staging (version_id, content, metadata, embedding)
    select v1, 'new A ' || g, '{"doc":"אחר","fileName":"t-a.md"}', array_fill(0.2::real, array[1536])::vector
      from generate_series(1, 2) g;
  r := activate_document_version(v1);
  assert (r ->> 'chunk_count')::integer = 2, '1: chunk_count should be 2';
  select count(*) into n from documents where metadata ->> 'fileName' = 't-a.md';
  assert n = 2, '1: t-a.md should have exactly the 2 new chunks';
  select count(*) into n from documents where content = 'old A';
  assert n = 0, '1: old A should be gone';
  select count(*) into n from documents where content = 'keep B';
  assert n = 1, '1: the other file must stay';
  select count(*) into n from documents_staging where version_id = v1;
  assert n = 0, '1: staging should be empty';
  assert (select status from document_versions where id = v1) = 'active', '1: version should be active';
  raise notice 'PASS 1: other replaces only its own file';

  -- 2. Invalid price: the whole swap is rolled back (documents and price_list unchanged).
  select price_sourdough into old_price from price_list where id = 1;
  insert into documents (content, metadata, embedding) values
    ('old price chunk', '{"doc":"מחירון","fileName":"t-old.md"}', array_fill(0.1::real, array[1536])::vector);
  insert into document_versions (doc_type, doc_key, file_name, status, stage, chunk_count, extracted)
    values ('pricelist', 'מחירון', 't-bad.md', 'pending', 'verified', 1,
            '{"price_sourdough":9999,"price_rye":36,"price_challah":28,"price_burekas":12,"delivery_fee":0}')
    returning id into v2;
  insert into documents_staging (version_id, content, metadata, embedding)
    values (v2, 'bad price chunk', '{"doc":"מחירון","fileName":"t-bad.md"}', array_fill(0.2::real, array[1536])::vector);
  begin
    perform activate_document_version(v2);
    raise exception 'activation should have failed';
  exception when others then
    if sqlerrm not like 'invalid_price%' then
      raise;
    end if;
  end;
  select count(*) into n from documents where content = 'old price chunk';
  assert n = 1, '2: old pricelist chunk must still be there';
  select count(*) into n from documents where content = 'bad price chunk';
  assert n = 0, '2: bad chunk must not reach documents';
  assert (select price_sourdough from price_list where id = 1) is not distinct from old_price, '2: price_list must be unchanged';
  select count(*) into n from documents_staging where version_id = v2;
  assert n = 1, '2: staging is left for the application to delete';
  raise notice 'PASS 2: invalid price changes nothing';

  -- 3. Valid pricelist: documents and price_list change together.
  insert into document_versions (doc_type, doc_key, file_name, status, stage, chunk_count, extracted)
    values ('pricelist', 'מחירון', 't-good.md', 'pending', 'verified', 1, good) returning id into v3;
  insert into documents_staging (version_id, content, metadata, embedding)
    values (v3, 'good price chunk', '{"doc":"מחירון","fileName":"t-good.md"}', array_fill(0.2::real, array[1536])::vector);
  perform activate_document_version(v3);
  select count(*) into n from documents where metadata ->> 'doc' = 'מחירון';
  assert n = 1, '3: exactly the new pricelist chunk should remain';
  assert (select price_sourdough from price_list where id = 1) = 41, '3: price_list sourdough should be 41';
  assert (select delivery_fee from price_list where id = 1) = 8, '3: delivery_fee should be 8';
  raise notice 'PASS 3: pricelist swaps documents and price_list together';

  -- 4. Second activation of an already active version fails and changes nothing.
  begin
    perform activate_document_version(v3);
    raise exception 'second activation should have failed';
  exception when others then
    if sqlerrm <> 'version_not_verified' then
      raise;
    end if;
  end;
  select count(*) into n from documents where metadata ->> 'doc' = 'מחירון';
  assert n = 1, '4: still exactly one pricelist chunk';
  raise notice 'PASS 4: double activation is rejected';

  -- 5. Sweep: abandoned pending versions are failed and their staging rows removed.
  insert into document_versions (doc_type, doc_key, file_name, status, stage, chunk_count, created_at)
    values ('other', 't-old-pending.md', 't-old-pending.md', 'pending', 'processed', 1, now() - interval '2 hours')
    returning id into v4;
  insert into documents_staging (version_id, content, metadata, embedding)
    values (v4, 'abandoned', '{"doc":"אחר","fileName":"t-old-pending.md"}', array_fill(0.2::real, array[1536])::vector);
  perform sweep_document_versions();
  assert (select status from document_versions where id = v4) = 'failed', '5: abandoned version should be failed';
  select count(*) into n from documents_staging where version_id = v4;
  assert n = 0, '5: abandoned staging rows should be gone';
  raise notice 'PASS 5: sweep cleans abandoned uploads';
end;
$$;

rollback;
```

- [ ] **Step 3: Block internal folders from static serving**

Modify `vercel.json` (current route `{ "src": "^/private(/.*)?$", "status": 404 }` and `functions`):

```json
{
  "routes": [
    { "src": "^/$", "dest": "/api/index" },
    { "src": "^/admin/?$", "dest": "/api/admin" },
    { "src": "^/(private|docs|lib|test)(/.*)?$", "status": 404 },
    { "handle": "filesystem" }
  ],
  "functions": {
    "api/index.js": {
      "includeFiles": "index.html"
    },
    "api/admin.js": {
      "includeFiles": "private/**"
    },
    "api/docs.js": {
      "maxDuration": 60
    }
  }
}
```

- [ ] **Step 4: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json ok')"`
Expected: `vercel.json ok`

- [ ] **Step 5: Checkpoint**

The SQL cannot be run from this machine (Supabase MCP is not authorized and `ai-dev-academy` is forbidden). Hand `schema.sql` then `schema-test.sql` to the user (Task 9 lists the exact instructions). Continue with Task 2 meanwhile; nothing in Tasks 2–8 needs the database.

---

### Task 2: Chunker

**Files:**
- Create: `lib/docs/chunker.js`
- Test: `test/chunker.test.js`

**Interfaces:**
- Produces: `splitText(text: string, chunkSize: number, chunkOverlap: number) -> string[]` (trimmed, non-empty chunks, each `<= chunkSize` characters).

- [ ] **Step 1: Write the failing tests**

Create `test/chunker.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { splitText } = require("../lib/docs/chunker");

function words(count) {
  const out = [];
  for (let i = 1; i <= count; i++) out.push("w" + String(i).padStart(4, "0"));
  return out;
}

test("empty or whitespace text gives no chunks", function () {
  assert.deepEqual(splitText("", 1000, 100), []);
  assert.deepEqual(splitText("  \n\n  ", 1000, 100), []);
});

test("short text is one trimmed chunk", function () {
  assert.deepEqual(splitText("  שלום עולם  ", 1000, 100), ["שלום עולם"]);
});

test("CRLF is treated like LF", function () {
  assert.deepEqual(splitText("א\r\n\r\nב", 1000, 100), ["א\n\nב"]);
});

test("long text: every chunk fits, nothing is lost, neighbours overlap", function () {
  const list = words(600);
  const chunks = splitText(list.join(" "), 1000, 100);
  assert.ok(chunks.length >= 4);
  chunks.forEach(function (chunk) { assert.ok(chunk.length <= 1000, "chunk too long: " + chunk.length); });
  const joined = chunks.join(" ");
  list.forEach(function (word) { assert.ok(joined.includes(word), "lost " + word); });
  for (let i = 0; i < chunks.length - 1; i++) {
    const firstWordOfNext = chunks[i + 1].split(" ")[0];
    assert.ok(chunks[i].includes(firstWordOfNext), "no overlap between chunk " + i + " and " + (i + 1));
  }
});

test("paragraphs are kept together when they fit", function () {
  const paragraph = words(60).join(" "); // ~360 chars
  const chunks = splitText([paragraph, paragraph, paragraph, paragraph].join("\n\n"), 1000, 100);
  chunks.forEach(function (chunk) { assert.ok(chunk.length <= 1000); });
  assert.ok(chunks[0].includes("\n\n"));
});

test("a single huge word without spaces is still split to fit", function () {
  const chunks = splitText("x".repeat(2500), 1000, 100);
  assert.ok(chunks.length >= 3);
  chunks.forEach(function (chunk) { assert.ok(chunk.length <= 1000); });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/chunker.test.js`
Expected: FAIL — `Cannot find module '../lib/docs/chunker'`.

- [ ] **Step 3: Implement**

Create `lib/docs/chunker.js`:

```js
// Recursive character splitter. Mirrors the behaviour of the RecursiveCharacterTextSplitter node used in the
// n8n invoice workflow (chunk 1000, overlap 100, separators paragraph > line > space > character).
const DEFAULT_SEPARATORS = ["\n\n", "\n", " ", ""];

function mergeSplits(splits, separator, chunkSize, chunkOverlap) {
  const separatorLength = separator.length;
  const docs = [];
  let current = [];
  let total = 0;

  for (const piece of splits) {
    const length = piece.length;
    const addedSeparator = current.length > 0 ? separatorLength : 0;
    if (total + length + addedSeparator > chunkSize && current.length > 0) {
      const doc = current.join(separator).trim();
      if (doc) docs.push(doc);
      // Drop pieces from the front until the kept tail fits the overlap and the next piece fits the chunk.
      while (total > chunkOverlap || (total + length + (current.length > 0 ? separatorLength : 0) > chunkSize && total > 0)) {
        total -= current[0].length + (current.length > 1 ? separatorLength : 0);
        current.shift();
      }
    }
    current.push(piece);
    total += length + (current.length > 1 ? separatorLength : 0);
  }

  const last = current.join(separator).trim();
  if (last) docs.push(last);
  return docs;
}

function recursiveSplit(text, separators, chunkSize, chunkOverlap) {
  let separator = separators[separators.length - 1];
  let remaining = [];
  for (let i = 0; i < separators.length; i++) {
    if (separators[i] === "") {
      separator = "";
      break;
    }
    if (text.includes(separators[i])) {
      separator = separators[i];
      remaining = separators.slice(i + 1);
      break;
    }
  }

  const splits = (separator === "" ? Array.from(text) : text.split(separator)).filter(function (piece) {
    return piece !== "";
  });

  const chunks = [];
  let small = [];
  function flush() {
    if (small.length > 0) {
      mergeSplits(small, separator, chunkSize, chunkOverlap).forEach(function (doc) { chunks.push(doc); });
      small = [];
    }
  }

  for (const piece of splits) {
    if (piece.length < chunkSize) {
      small.push(piece);
    } else {
      flush();
      if (remaining.length === 0) {
        chunks.push(piece);
      } else {
        recursiveSplit(piece, remaining, chunkSize, chunkOverlap).forEach(function (doc) { chunks.push(doc); });
      }
    }
  }
  flush();
  return chunks;
}

function splitText(text, chunkSize, chunkOverlap) {
  const source = String(text || "").replace(/\r\n/g, "\n");
  return recursiveSplit(source, DEFAULT_SEPARATORS, chunkSize, chunkOverlap)
    .map(function (chunk) { return chunk.trim(); })
    .filter(function (chunk) { return chunk.length > 0; });
}

module.exports = { splitText };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/chunker.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Checkpoint** — run `node --test test/` and stop (no commit unless asked).

---

### Task 3: Pricelist validation

**Files:**
- Create: `lib/docs/prices.js`
- Test: `test/prices.test.js`

**Interfaces:**
- Produces: `validatePrices(raw, sourceText) -> { ok: true, values: { price_sourdough, price_rye, price_challah, price_burekas, delivery_fee } } | { ok: false, message: string }`. `raw` is the extractor output (`priceSourdough`, `priceRye`, `priceChallah`, `priceBurekas`, `deliveryFee`); a missing or null `deliveryFee` means 0.

- [ ] **Step 1: Write the failing tests**

Create `test/prices.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePrices } = require("../lib/docs/prices");

const TEXT_V1 = [
  "| לחם כפרי מחמצת | 32 ₪ | |",
  "| לחם שיפון | 36 ₪ | |",
  "| חלה | 28 ₪ | זמינה בימי שישי בלבד |",
  "| בורקס גבינה | 12 ₪ | ליחידה |"
].join("\n");
const RAW_V1 = { priceSourdough: 32, priceRye: 36, priceChallah: 28, priceBurekas: 12, deliveryFee: null };

test("valid prices pass and a missing delivery fee becomes 0", function () {
  const result = validatePrices(RAW_V1, TEXT_V1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.values, { price_sourdough: 32, price_rye: 36, price_challah: 28, price_burekas: 12, delivery_fee: 0 });
});

test("a delivery fee that appears in the text is accepted", function () {
  const text = TEXT_V1 + "\n| דמי משלוח להזמנה | 8 ₪ |";
  const result = validatePrices(Object.assign({}, RAW_V1, { deliveryFee: 8 }), text);
  assert.equal(result.ok, true);
  assert.equal(result.values.delivery_fee, 8);
});

test("out of range, fractional and missing prices fail and are named", function () {
  const bad = { priceSourdough: 9999, priceRye: 36.5, priceChallah: null, priceBurekas: 12, deliveryFee: 0 };
  const result = validatePrices(bad, TEXT_V1);
  assert.equal(result.ok, false);
  assert.match(result.message, /לחם כפרי מחמצת/);
  assert.match(result.message, /לחם שיפון/);
  assert.match(result.message, /חלה/);
  assert.match(result.message, /שום דבר לא הוחלף/);
});

test("a price the model invented (not in the text) fails", function () {
  const result = validatePrices(Object.assign({}, RAW_V1, { priceSourdough: 33 }), TEXT_V1);
  assert.equal(result.ok, false);
  assert.match(result.message, /לחם כפרי מחמצת/);
});

test("a price must not match inside a longer number", function () {
  const text = "לחם כפרי מחמצת 132 ₪, לחם שיפון 36 ₪, חלה 28 ₪, בורקס 12 ₪";
  const result = validatePrices(RAW_V1, text);
  assert.equal(result.ok, false);
});

test("delivery fee above 100 or fractional fails", function () {
  assert.equal(validatePrices(Object.assign({}, RAW_V1, { deliveryFee: 101 }), TEXT_V1 + " 101").ok, false);
  assert.equal(validatePrices(Object.assign({}, RAW_V1, { deliveryFee: 7.5 }), TEXT_V1 + " 7.5").ok, false);
});

test("missing extractor output fails cleanly", function () {
  assert.equal(validatePrices(null, TEXT_V1).ok, false);
  assert.equal(validatePrices(undefined, TEXT_V1).ok, false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/prices.test.js`
Expected: FAIL — `Cannot find module '../lib/docs/prices'`.

- [ ] **Step 3: Implement**

Create `lib/docs/prices.js`:

```js
// Validation of the prices the model extracted from an uploaded pricelist. Same limits as the n8n workflow:
// product price = whole shekels 1-500, delivery fee = whole shekels 0-100. On top of that, every non-zero value
// must literally appear in the document text, which catches values the model made up.
const MAX_PRICE = 500;
const MAX_DELIVERY_FEE = 100;

const PRODUCT_FIELDS = [
  { raw: "priceSourdough", out: "price_sourdough", label: "לחם כפרי מחמצת" },
  { raw: "priceRye", out: "price_rye", label: "לחם שיפון" },
  { raw: "priceChallah", out: "price_challah", label: "חלה" },
  { raw: "priceBurekas", out: "price_burekas", label: "בורקס גבינה" }
];

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

// True when the number appears as a standalone number in the text (not inside 132, 32.5 or 1,32).
function appearsInText(value, text) {
  const pattern = new RegExp("(?<![\\d.,])" + value + "(?!\\d|[.,]\\d)");
  return pattern.test(String(text || ""));
}

function validatePrices(raw, sourceText) {
  const input = raw || {};
  const values = {};
  const problems = [];

  PRODUCT_FIELDS.forEach(function (field) {
    const n = toNumber(input[field.raw]);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PRICE) {
      problems.push(field.label + " (ערך לא תקין)");
    } else if (!appearsInText(n, sourceText)) {
      problems.push(field.label + " (המחיר לא מופיע במסמך)");
    } else {
      values[field.out] = n;
    }
  });

  // A pricelist without a delivery fee means no delivery fee.
  const rawFee = input.deliveryFee;
  const fee = (rawFee === undefined || rawFee === null || rawFee === "") ? 0 : toNumber(rawFee);
  if (!Number.isInteger(fee) || fee < 0 || fee > MAX_DELIVERY_FEE) {
    problems.push("דמי משלוח (ערך לא תקין)");
  } else if (fee > 0 && !appearsInText(fee, sourceText)) {
    problems.push("דמי משלוח (הסכום לא מופיע במסמך)");
  } else {
    values.delivery_fee = fee;
  }

  if (problems.length > 0) {
    return {
      ok: false,
      message: "המערכת לא זיהתה בביטחון ערכים תקינים (מחיר מוצר: מספר שלם בין 1 ל-" + MAX_PRICE +
        " ₪, דמי משלוח: מספר שלם בין 0 ל-" + MAX_DELIVERY_FEE + " ₪) עבור: " + problems.join(", ") +
        ". כדי למנוע עדכון שגוי, שום דבר לא הוחלף."
    };
  }
  return { ok: true, values: values };
}

module.exports = { validatePrices };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/prices.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Checkpoint** — run `node --test test/`.

---

### Task 4: Fakes and pipeline — receive and process

**Files:**
- Create: `test/fakes.js`
- Create: `lib/docs/pipeline.js` (receive, process, shared helpers)
- Test: `test/pipeline.receive-process.test.js`

**Interfaces:**
- Consumes: `splitText` (Task 2), `validatePrices` (Task 3).
- Produces: `PipelineError(step, message, status)` with `.step`, `.status`, `.versionId`; `receive(deps, { docType, fileName, buffer }) -> { versionId, fileName, docType, needsParsing }`; `processVersion(deps, versionId) -> { state: "running" } | { state: "done", chunkCount }`; constants `MAX_BYTES`, `EXTENSIONS`. Task 5 adds `verifyVersion`, `activateVersion`, `listDocuments` to the same file. `test/fakes.js` exports `createFakeDeps(options) -> { deps, state }`.

- [ ] **Step 1: Write the fakes**

Create `test/fakes.js`:

```js
// In-memory stand-ins for Supabase, OpenAI and LlamaParse. Test-only. The "swap" mirrors docs/rag-pipeline/schema.sql.
const DEFAULT_MARKDOWN = "# מחירון\n\n| מוצר | מחיר |\n|---|---|\n| לחם כפרי מחמצת | 32 ₪ |\n| לחם שיפון | 36 ₪ |\n| חלה | 28 ₪ |\n| בורקס גבינה | 12 ₪ |\n";
const GOOD_PRICES = { priceSourdough: 32, priceRye: 36, priceChallah: 28, priceBurekas: 12, deliveryFee: 0 };
const FAKE_DIMENSIONS = 3;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// options: documents, priceList, seedActive, parsePolls, markdown, prices, embedFail, embedShort,
//          failInsertStaging, failActivate
function createFakeDeps(options) {
  const opts = options || {};
  let nowMs = Date.parse("2026-10-07T10:00:00Z");
  const polls = (opts.parsePolls || []).slice();

  const state = {
    versions: new Map(),
    staging: [],
    documents: (opts.documents || []).map(clone),
    priceList: Object.assign({}, opts.priceList || {}),
    parseStarts: [],
    extractCalls: 0,
    sweeps: 0,
    nextId: 1,
    advance: function (ms) { nowMs += ms; }
  };

  (opts.seedActive || []).forEach(function (seed) {
    const id = "seed" + (state.nextId++);
    state.versions.set(id, Object.assign({
      id: id, doc_type: "other", doc_key: seed.file_name, status: "active", stage: "verified",
      chunk_count: 1, source_text: null, extracted: null, parse_job_id: null,
      created_at: "2026-10-01T08:00:00.000Z", activated_at: "2026-10-01T08:00:00.000Z"
    }, seed));
  });

  const db = {
    insertVersion: async function (row) {
      const id = "v" + (state.nextId++);
      const version = Object.assign({
        id: id, status: "pending", stage: "received", chunk_count: null, extracted: null,
        parse_job_id: null, source_text: null, created_at: new Date(nowMs).toISOString(), activated_at: null
      }, row);
      state.versions.set(id, version);
      return clone(version);
    },
    getVersion: async function (id) {
      const version = state.versions.get(id);
      return version ? clone(version) : null;
    },
    updateVersion: async function (id, patch) {
      Object.assign(state.versions.get(id), patch);
    },
    insertStaging: async function (rows) {
      if (opts.failInsertStaging) throw new Error("insert failed");
      rows.forEach(function (row) { state.staging.push(clone(row)); });
    },
    deleteStaging: async function (versionId) {
      state.staging = state.staging.filter(function (row) { return row.version_id !== versionId; });
    },
    verifyStaged: async function (versionId) {
      const rows = state.staging.filter(function (row) { return row.version_id === versionId; });
      return {
        total: rows.length,
        bad_dims: rows.filter(function (row) { return !row.embedding || row.embedding.length !== FAKE_DIMENSIONS; }).length,
        empty: rows.filter(function (row) { return !row.content || !row.content.trim(); }).length
      };
    },
    activate: async function (versionId) {
      if (opts.failActivate) throw new Error("activate failed");
      const version = state.versions.get(versionId);
      if (!version || version.status !== "pending" || version.stage !== "verified") throw new Error("version_not_verified");
      const rows = state.staging.filter(function (row) { return row.version_id === versionId; });
      const label = version.doc_type === "pricelist" ? "מחירון" : "אחר";
      state.documents = state.documents.filter(function (doc) {
        return !(doc.metadata.doc === label && (version.doc_type === "pricelist" || doc.metadata.fileName === version.file_name));
      });
      rows.forEach(function (row) {
        state.documents.push({ content: row.content, metadata: clone(row.metadata), embedding: row.embedding });
      });
      if (version.doc_type === "pricelist") Object.assign(state.priceList, version.extracted);
      Array.from(state.versions.entries()).forEach(function (entry) {
        if (entry[1].doc_key === version.doc_key && entry[1].status === "active") state.versions.delete(entry[0]);
      });
      version.status = "active";
      version.activated_at = new Date(nowMs).toISOString();
      version.source_text = null;
      state.staging = state.staging.filter(function (row) { return row.version_id !== versionId; });
      return { chunk_count: rows.length };
    },
    listActive: async function () {
      return Array.from(state.versions.values()).filter(function (v) { return v.status === "active"; }).map(clone);
    },
    sweep: async function () {
      state.sweeps += 1;
    }
  };

  const parser = {
    start: async function (buffer, fileName, mime) {
      state.parseStarts.push({ fileName: fileName, mime: mime, size: buffer.length });
      return "job-" + state.parseStarts.length;
    },
    poll: async function () {
      return polls.shift() || { state: "done", markdown: opts.markdown || DEFAULT_MARKDOWN };
    }
  };

  const deps = {
    db: db,
    parser: parser,
    embed: async function (texts) {
      if (opts.embedFail) throw new Error("openai 500");
      const list = opts.embedShort ? texts.slice(1) : texts;
      return list.map(function () { return [0.1, 0.2, 0.3]; });
    },
    extractPrices: async function () {
      state.extractCalls += 1;
      return opts.prices || GOOD_PRICES;
    },
    now: function () { return new Date(nowMs); }
  };

  return { deps: deps, state: state };
}

module.exports = { createFakeDeps, DEFAULT_MARKDOWN, GOOD_PRICES };
```

- [ ] **Step 2: Write the failing tests**

Create `test/pipeline.receive-process.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const pipeline = require("../lib/docs/pipeline");
const { createFakeDeps } = require("./fakes");

const INFO_TEXT = "# מידע ללקוחות\n\nמשלוחים בימי ראשון עד שישי, בין 06:30 ל-08:30.\n";

function mdInput(fileName, text, docType) {
  return { docType: docType || "other", fileName: fileName, buffer: Buffer.from(text, "utf8") };
}

async function rejectsWith(promise, step, status) {
  await assert.rejects(promise, function (err) {
    assert.ok(err instanceof pipeline.PipelineError, "expected PipelineError, got " + err);
    assert.equal(err.step, step);
    if (status) assert.equal(err.status, status);
    return true;
  });
}

test("receive rejects bad input before writing anything", async function () {
  const { deps, state } = createFakeDeps();
  await rejectsWith(pipeline.receive(deps, mdInput("a.md", "x", "invoice")), "receive", 400);
  await rejectsWith(pipeline.receive(deps, mdInput("a.exe", "x")), "receive", 400);
  await rejectsWith(pipeline.receive(deps, { docType: "other", fileName: "", buffer: Buffer.from("x") }), "receive", 400);
  await rejectsWith(pipeline.receive(deps, { docType: "other", fileName: "a.md", buffer: Buffer.alloc(0) }), "receive", 400);
  await rejectsWith(pipeline.receive(deps, mdInput("a.md", "  \n \n ")), "receive", 422);
  await rejectsWith(pipeline.receive(deps, { docType: "other", fileName: "big.pdf", buffer: Buffer.alloc(pipeline.MAX_BYTES + 1) }), "receive", 413);
  assert.equal(state.versions.size, 0);
  assert.equal(state.parseStarts.length, 0);
});

test("receive of a text file stores the text and does not start the parser", async function () {
  const { deps, state } = createFakeDeps();
  const result = await pipeline.receive(deps, mdInput("מידע ללקוחות.md", "﻿" + INFO_TEXT));
  assert.equal(result.needsParsing, false);
  const version = state.versions.get(result.versionId);
  assert.equal(version.doc_key, "מידע ללקוחות.md");
  assert.equal(version.source_text, INFO_TEXT);
  assert.equal(state.parseStarts.length, 0);
});

test("the pricelist key is fixed, whatever the file name", async function () {
  const { deps, state } = createFakeDeps();
  const result = await pipeline.receive(deps, mdInput("v7.md", INFO_TEXT, "pricelist"));
  assert.equal(state.versions.get(result.versionId).doc_key, "מחירון");
});

test("receive of a PDF starts LlamaParse and remembers the job", async function () {
  const { deps, state } = createFakeDeps();
  const result = await pipeline.receive(deps, { docType: "pricelist", fileName: "scan.pdf", buffer: Buffer.from("%PDF-1.4 fake") });
  assert.equal(result.needsParsing, true);
  assert.deepEqual(state.parseStarts.map(function (s) { return s.mime; }), ["application/pdf"]);
  assert.equal(state.versions.get(result.versionId).parse_job_id, "job-1");
});

test("process of a text upload chunks, embeds and stages with full metadata", async function () {
  const { deps, state } = createFakeDeps();
  const { versionId } = await pipeline.receive(deps, mdInput("info.md", INFO_TEXT));
  const result = await pipeline.processVersion(deps, versionId);
  assert.deepEqual(result, { state: "done", chunkCount: 1 });
  assert.equal(state.staging.length, 1);
  assert.equal(state.staging[0].metadata.doc, "אחר");
  assert.equal(state.staging[0].metadata.fileName, "info.md");
  assert.equal(state.staging[0].metadata.version_id, versionId);
  assert.match(state.staging[0].metadata.uploadedAt, /^2026-10-07T10:00:00/);
  const version = state.versions.get(versionId);
  assert.equal(version.stage, "processed");
  assert.equal(version.chunk_count, 1);
  assert.equal(state.extractCalls, 0);
});

test("process of a pricelist also extracts prices", async function () {
  const { deps, state } = createFakeDeps();
  const { versionId } = await pipeline.receive(deps, mdInput("v1.md", INFO_TEXT, "pricelist"));
  await pipeline.processVersion(deps, versionId);
  assert.equal(state.extractCalls, 1);
  assert.equal(state.versions.get(versionId).extracted.priceSourdough, 32);
  assert.equal(state.staging[0].metadata.doc, "מחירון");
});

test("process of a PDF reports running until LlamaParse is done", async function () {
  const { deps, state } = createFakeDeps({ parsePolls: [{ state: "running" }, { state: "running" }] });
  const { versionId } = await pipeline.receive(deps, { docType: "other", fileName: "scan.pdf", buffer: Buffer.from("%PDF") });
  assert.deepEqual(await pipeline.processVersion(deps, versionId), { state: "running" });
  assert.deepEqual(await pipeline.processVersion(deps, versionId), { state: "running" });
  assert.equal(state.staging.length, 0);
  assert.equal(state.versions.get(versionId).status, "pending");
  const done = await pipeline.processVersion(deps, versionId);
  assert.equal(done.state, "done");
  assert.ok(done.chunkCount >= 1);
});

test("a parse job that runs longer than 5 minutes fails the version", async function () {
  const polls = [{ state: "running" }];
  const { deps, state } = createFakeDeps({ parsePolls: polls });
  const { versionId } = await pipeline.receive(deps, { docType: "other", fileName: "scan.pdf", buffer: Buffer.from("%PDF") });
  state.advance(5 * 60 * 1000 + 1000);
  await rejectsWith(pipeline.processVersion(deps, versionId), "process", 504);
  const version = state.versions.get(versionId);
  assert.equal(version.status, "failed");
  assert.equal(version.error_step, "process");
});

test("a failed LlamaParse job fails the version with its reason", async function () {
  const { deps, state } = createFakeDeps({ parsePolls: [{ state: "failed", message: "bad scan" }] });
  const { versionId } = await pipeline.receive(deps, { docType: "other", fileName: "scan.png", buffer: Buffer.from("png") });
  await assert.rejects(pipeline.processVersion(deps, versionId), function (err) {
    assert.equal(err.step, "process");
    assert.match(err.message, /bad scan/);
    return true;
  });
  assert.equal(state.versions.get(versionId).status, "failed");
});

test("a document with no extractable text fails at process and stages nothing", async function () {
  const { deps, state } = createFakeDeps({ parsePolls: [{ state: "done", markdown: "   \n  " }] });
  const { versionId } = await pipeline.receive(deps, { docType: "other", fileName: "blank.jpg", buffer: Buffer.from("jpg") });
  await rejectsWith(pipeline.processVersion(deps, versionId), "process", 422);
  assert.equal(state.staging.length, 0);
  assert.equal(state.versions.get(versionId).status, "failed");
});

test("embedding service failure cleans staging, fails the version, keeps documents", async function () {
  const existing = [{ content: "old", metadata: { doc: "אחר", fileName: "info.md" }, embedding: [1, 1, 1] }];
  const { deps, state } = createFakeDeps({ embedFail: true, documents: existing });
  const { versionId } = await pipeline.receive(deps, mdInput("info.md", INFO_TEXT));
  await assert.rejects(pipeline.processVersion(deps, versionId), function (err) {
    assert.equal(err.step, "process");
    assert.equal(err.versionId, versionId);
    assert.doesNotMatch(err.message, /openai/i);
    return true;
  });
  assert.equal(state.staging.length, 0);
  assert.equal(state.documents.length, 1);
  assert.equal(state.versions.get(versionId).status, "failed");
});

test("fewer embeddings than chunks fails the version (no partial staging)", async function () {
  const longText = new Array(400).fill("מילה").join(" ");
  const { deps, state } = createFakeDeps({ embedShort: true });
  const { versionId } = await pipeline.receive(deps, mdInput("long.md", longText));
  await rejectsWith(pipeline.processVersion(deps, versionId), "process", 502);
  assert.equal(state.staging.length, 0);
});

test("a staging insert failure after embedding cleans up", async function () {
  const { deps, state } = createFakeDeps({ failInsertStaging: true });
  const { versionId } = await pipeline.receive(deps, mdInput("info.md", INFO_TEXT));
  await rejectsWith(pipeline.processVersion(deps, versionId), "process");
  assert.equal(state.staging.length, 0);
  assert.equal(state.versions.get(versionId).status, "failed");
});

test("process is idempotent: calling it again after done does not duplicate staging", async function () {
  const { deps, state } = createFakeDeps();
  const { versionId } = await pipeline.receive(deps, mdInput("info.md", INFO_TEXT));
  await pipeline.processVersion(deps, versionId);
  const again = await pipeline.processVersion(deps, versionId);
  assert.deepEqual(again, { state: "done", chunkCount: 1 });
  assert.equal(state.staging.length, 1);
});

test("stale staging rows of the same version are replaced, not duplicated", async function () {
  const { deps, state } = createFakeDeps();
  const { versionId } = await pipeline.receive(deps, mdInput("info.md", INFO_TEXT));
  state.staging.push({ version_id: versionId, content: "leftover", metadata: {}, embedding: [1, 2, 3] });
  await pipeline.processVersion(deps, versionId);
  assert.equal(state.staging.length, 1);
  assert.notEqual(state.staging[0].content, "leftover");
});

test("process of an unknown or finished version is a 404/409 and never marks anything failed", async function () {
  const { deps, state } = createFakeDeps({ seedActive: [{ file_name: "old.md" }] });
  await rejectsWith(pipeline.processVersion(deps, "nope"), "process", 404);
  const activeId = Array.from(state.versions.keys())[0];
  await rejectsWith(pipeline.processVersion(deps, activeId), "process", 409);
  assert.equal(state.versions.get(activeId).status, "active");
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test test/pipeline.receive-process.test.js`
Expected: FAIL — `Cannot find module '../lib/docs/pipeline'`.

- [ ] **Step 4: Implement receive and process**

Create `lib/docs/pipeline.js`:

```js
// The safe-replace pipeline for knowledge-base documents: receive -> process -> verify -> activate.
// Every function takes `deps` (db, parser, embed, extractPrices, now) so it can be tested with fakes.
// New chunks live in documents_staging; only activate (one SQL transaction) touches the live documents table.
const { splitText } = require("./chunker");
const { validatePrices } = require("./prices");

const MAX_BYTES = 4 * 1024 * 1024; // Vercel rejects request bodies above ~4.5MB
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;
const PARSE_TIMEOUT_MS = 5 * 60 * 1000;

const EXTENSIONS = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".md": "text/markdown",
  ".txt": "text/plain"
};
const TEXT_EXTENSIONS = [".md", ".txt"];
const DOC_TYPES = ["pricelist", "other"];

const FALLBACK_MESSAGES = {
  receive: "קליטת הקובץ נכשלה. נסו שוב.",
  process: "עיבוד המסמך נכשל. נסו שוב בעוד רגע.",
  verify: "בדיקת המסמך נכשלה. נסו שוב.",
  activate: "ההחלפה נכשלה. נסו שוב."
};

class PipelineError extends Error {
  constructor(step, message, status) {
    super(message);
    this.name = "PipelineError";
    this.step = step;
    this.status = status || 400;
    this.versionId = null;
  }
}

function fileExtension(fileName) {
  const index = fileName.lastIndexOf(".");
  return index < 0 ? "" : fileName.slice(index).toLowerCase();
}

// Only PipelineError messages and errors that carry a userMessage are safe to show; everything else is logged.
function safeMessage(err, step) {
  if (err instanceof PipelineError) return err.message;
  if (err && typeof err.userMessage === "string") return err.userMessage;
  return FALLBACK_MESSAGES[step];
}

// Removes every partial row of the version, marks it failed, and returns the error to throw.
// The live documents / price_list tables are never touched here.
async function failVersion(deps, versionId, step, err) {
  const known = err instanceof PipelineError || (err && typeof err.userMessage === "string");
  if (!known) console.error("docs pipeline failed at " + step + ":", err && err.message);
  const message = safeMessage(err, step);
  try {
    await deps.db.deleteStaging(versionId);
  } catch (cleanupError) {
    console.error("docs pipeline: staging cleanup failed:", cleanupError && cleanupError.message);
  }
  try {
    await deps.db.updateVersion(versionId, { status: "failed", error_step: step, error_message: message, source_text: null });
  } catch (markError) {
    console.error("docs pipeline: marking version failed did not work:", markError && markError.message);
  }
  const failure = new PipelineError(step, message, err instanceof PipelineError ? err.status : 500);
  failure.versionId = versionId;
  return failure;
}

async function guarded(deps, versionId, step, work) {
  try {
    return await work();
  } catch (err) {
    throw await failVersion(deps, versionId, step, err);
  }
}

// Loads a version that may still be worked on. These errors are not failures of the version itself.
async function loadPending(deps, versionId, step) {
  const version = versionId ? await deps.db.getVersion(versionId) : null;
  if (!version) throw new PipelineError(step, "הגרסה לא נמצאה.", 404);
  if (version.status !== "pending") throw new PipelineError(step, "הגרסה כבר לא ממתינה (היא הוחלפה או נכשלה). אפשר להתחיל העלאה חדשה.", 409);
  return version;
}

async function receive(deps, input) {
  const docType = input && input.docType;
  if (!DOC_TYPES.includes(docType)) throw new PipelineError("receive", "סוג המסמך לא תקין.", 400);

  const fileName = String((input && input.fileName) || "").trim();
  if (!fileName) throw new PipelineError("receive", "חסר שם קובץ.", 400);

  const extension = fileExtension(fileName);
  if (!EXTENSIONS[extension]) {
    throw new PipelineError("receive", "סוג הקובץ לא נתמך. אפשר להעלות PDF, תמונה (JPG או PNG) או קובץ טקסט (MD או TXT).", 400);
  }

  const buffer = input.buffer;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new PipelineError("receive", "הקובץ ריק.", 400);
  if (buffer.length > MAX_BYTES) {
    throw new PipelineError("receive", "הקובץ גדול מדי (מעל 4MB). אפשר לשלוח PDF או תמונה קטנה יותר.", 413);
  }

  const isText = TEXT_EXTENSIONS.includes(extension);
  let sourceText = null;
  if (isText) {
    sourceText = buffer.toString("utf8").replace(/^﻿/, "");
    if (!sourceText.trim()) throw new PipelineError("receive", "בקובץ אין טקסט.", 422);
  }

  const version = await deps.db.insertVersion({
    doc_type: docType,
    doc_key: docType === "pricelist" ? "מחירון" : fileName,
    file_name: fileName,
    source_text: sourceText
  });

  if (!isText) {
    await guarded(deps, version.id, "receive", async function () {
      const jobId = await deps.parser.start(buffer, fileName, EXTENSIONS[extension]);
      await deps.db.updateVersion(version.id, { parse_job_id: jobId });
    });
  }

  return { versionId: version.id, fileName: fileName, docType: docType, needsParsing: !isText };
}

async function processVersion(deps, versionId) {
  const version = await loadPending(deps, versionId, "process");
  if (version.stage === "processed") return { state: "done", chunkCount: version.chunk_count };
  if (version.stage !== "received") throw new PipelineError("process", "שלב העיבוד כבר הסתיים.", 409);

  return guarded(deps, versionId, "process", async function () {
    let text = version.source_text;

    if (!text) {
      const job = await deps.parser.poll(version.parse_job_id);
      if (job.state === "failed") {
        throw new PipelineError("process", "פענוח המסמך נכשל: " + (job.message || "לא צוינה סיבה") + ". ייתכן שהתמונה לא ברורה מספיק.", 422);
      }
      if (job.state === "running") {
        if (deps.now().getTime() - new Date(version.created_at).getTime() > PARSE_TIMEOUT_MS) {
          throw new PipelineError("process", "פענוח המסמך נמשך יותר מ-5 דקות ולא הסתיים.", 504);
        }
        return { state: "running" };
      }
      text = job.markdown || "";
      await deps.db.updateVersion(versionId, { source_text: text });
    }

    const chunks = splitText(text, CHUNK_SIZE, CHUNK_OVERLAP);
    if (chunks.length === 0) throw new PipelineError("process", "לא נמצא טקסט במסמך.", 422);

    const extracted = version.doc_type === "pricelist" ? await deps.extractPrices(text) : null;

    // Start from a clean slate so a retry can never leave duplicates.
    await deps.db.deleteStaging(versionId);
    const embeddings = await deps.embed(chunks);
    if (!Array.isArray(embeddings) || embeddings.length !== chunks.length) {
      throw new PipelineError("process", "שירות ה-embeddings החזיר מספר תוצאות שגוי.", 502);
    }

    const uploadedAt = deps.now().toISOString();
    const doc = version.doc_type === "pricelist" ? "מחירון" : "אחר";
    await deps.db.insertStaging(chunks.map(function (content, index) {
      return {
        version_id: versionId,
        content: content,
        metadata: { doc: doc, fileName: version.file_name, uploadedAt: uploadedAt, version_id: versionId },
        embedding: embeddings[index]
      };
    }));
    await deps.db.updateVersion(versionId, { chunk_count: chunks.length, extracted: extracted, stage: "processed" });
    return { state: "done", chunkCount: chunks.length };
  });
}

module.exports = {
  PipelineError, MAX_BYTES, EXTENSIONS,
  receive, processVersion,
  // internal helpers shared with the second half of the file (added in the next task)
  loadPending, guarded, validatePrices
};
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test test/pipeline.receive-process.test.js`
Expected: PASS, 16 tests.

- [ ] **Step 6: Checkpoint** — run `node --test test/`.

---

### Task 5: Pipeline — verify, activate, list

**Files:**
- Modify: `lib/docs/pipeline.js` (add three functions, extend exports, drop the temporary `loadPending, guarded, validatePrices` helper exports)
- Test: `test/pipeline.verify-activate.test.js`

**Interfaces:**
- Consumes: Task 4 helpers (`loadPending`, `guarded`, `PipelineError`), `deps.db.verifyStaged`, `deps.db.activate`, `deps.db.sweep`, `deps.db.listActive`.
- Produces: `verifyVersion(deps, versionId) -> { ok: true, chunkCount }` (also writes normalized prices to `extracted` and sets `stage = "verified"`); `activateVersion(deps, versionId) -> { ok: true, chunkCount }`; `listDocuments(deps) -> { documents: [{ id, name, type, chunkCount, updatedAt }] }`.

- [ ] **Step 1: Write the failing tests**

Create `test/pipeline.verify-activate.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const pipeline = require("../lib/docs/pipeline");
const { createFakeDeps } = require("./fakes");

const PRICELIST_V1 = "| לחם כפרי מחמצת | 32 ₪ |\n| לחם שיפון | 36 ₪ |\n| חלה | 28 ₪ |\n| בורקס גבינה | 12 ₪ |\n";
const OLD_PRICELIST = { content: "old prices", metadata: { doc: "מחירון", fileName: "v3.md" }, embedding: [1, 1, 1] };
const OLD_INFO = { content: "old info", metadata: { doc: "אחר", fileName: "info.md" }, embedding: [1, 1, 1] };
const OTHER_FILE = { content: "other file", metadata: { doc: "אחר", fileName: "keep.md" }, embedding: [1, 1, 1] };

async function upload(deps, fileName, text, docType) {
  const received = await pipeline.receive(deps, { docType: docType || "other", fileName: fileName, buffer: Buffer.from(text, "utf8") });
  await pipeline.processVersion(deps, received.versionId);
  return received.versionId;
}

async function rejectsWith(promise, step, status) {
  await assert.rejects(promise, function (err) {
    assert.ok(err instanceof pipeline.PipelineError, "expected PipelineError, got " + err);
    assert.equal(err.step, step);
    if (status) assert.equal(err.status, status);
    return true;
  });
}

test("full run for 'other' replaces only the same file name", async function () {
  const { deps, state } = createFakeDeps({ documents: [OLD_INFO, OTHER_FILE] });
  const versionId = await upload(deps, "info.md", "מידע חדש על משלוחים");
  assert.deepEqual(await pipeline.verifyVersion(deps, versionId), { ok: true, chunkCount: 1 });
  assert.deepEqual(await pipeline.activateVersion(deps, versionId), { ok: true, chunkCount: 1 });

  const contents = state.documents.map(function (d) { return d.content; }).sort();
  assert.deepEqual(contents, ["מידע חדש על משלוחים", "other file"].sort());
  assert.equal(state.staging.length, 0);
  assert.equal(state.versions.get(versionId).status, "active");
});

test("full run for a pricelist swaps documents and price_list together", async function () {
  const { deps, state } = createFakeDeps({ documents: [OLD_PRICELIST, OLD_INFO], priceList: { price_sourdough: 30 } });
  const versionId = await upload(deps, "v1.md", PRICELIST_V1, "pricelist");
  await pipeline.verifyVersion(deps, versionId);
  await pipeline.activateVersion(deps, versionId);

  assert.equal(state.documents.some(function (d) { return d.content === "old prices"; }), false);
  assert.equal(state.documents.some(function (d) { return d.content === "old info"; }), true);
  assert.deepEqual(state.priceList, { price_sourdough: 32, price_rye: 36, price_challah: 28, price_burekas: 12, delivery_fee: 0 });
});

test("pricelist with an invalid price fails at verify and changes nothing live", async function () {
  const bad = { priceSourdough: 9999, priceRye: 36, priceChallah: 28, priceBurekas: 12, deliveryFee: 0 };
  const { deps, state } = createFakeDeps({ documents: [OLD_PRICELIST], priceList: { price_sourdough: 30 }, prices: bad });
  const versionId = await upload(deps, "v-bad.md", PRICELIST_V1, "pricelist");
  assert.equal(state.staging.length, 1); // the failure really happens in the middle, after staging
  await assert.rejects(pipeline.verifyVersion(deps, versionId), function (err) {
    assert.equal(err.step, "verify");
    assert.equal(err.versionId, versionId);
    assert.match(err.message, /שום דבר לא הוחלף/);
    return true;
  });
  assert.equal(state.staging.length, 0);
  assert.deepEqual(state.documents.map(function (d) { return d.content; }), ["old prices"]);
  assert.deepEqual(state.priceList, { price_sourdough: 30 });
  assert.equal(state.versions.get(versionId).status, "failed");
  assert.equal(state.versions.get(versionId).error_step, "verify");
});

test("a price missing from the document text fails at verify", async function () {
  const invented = { priceSourdough: 33, priceRye: 36, priceChallah: 28, priceBurekas: 12, deliveryFee: 0 };
  const { deps, state } = createFakeDeps({ prices: invented });
  const versionId = await upload(deps, "v1.md", PRICELIST_V1, "pricelist");
  await rejectsWith(pipeline.verifyVersion(deps, versionId), "verify", 422);
  assert.equal(state.versions.get(versionId).status, "failed");
});

test("verify fails when the staged row count differs from the expected one", async function () {
  const { deps, state } = createFakeDeps();
  const versionId = await upload(deps, "info.md", "טקסט");
  state.staging.length = 0;
  await rejectsWith(pipeline.verifyVersion(deps, versionId), "verify", 422);
  assert.equal(state.versions.get(versionId).status, "failed");
});

test("verify fails when an embedding has the wrong size", async function () {
  const { deps, state } = createFakeDeps();
  const versionId = await upload(deps, "info.md", "טקסט");
  state.staging[0].embedding = [1];
  await rejectsWith(pipeline.verifyVersion(deps, versionId), "verify", 422);
});

test("steps cannot be skipped, and a skip does not mark the version failed", async function () {
  const { deps, state } = createFakeDeps();
  const received = await pipeline.receive(deps, { docType: "other", fileName: "info.md", buffer: Buffer.from("טקסט") });
  await rejectsWith(pipeline.verifyVersion(deps, received.versionId), "verify", 409);
  await pipeline.processVersion(deps, received.versionId);
  await rejectsWith(pipeline.activateVersion(deps, received.versionId), "activate", 409);
  assert.equal(state.versions.get(received.versionId).status, "pending");
  assert.equal(state.staging.length, 1);
});

test("an activation failure cleans staging, keeps the old documents, and marks the version failed", async function () {
  const { deps, state } = createFakeDeps({ documents: [OLD_INFO], failActivate: true });
  const versionId = await upload(deps, "info.md", "מידע חדש");
  await pipeline.verifyVersion(deps, versionId);
  await assert.rejects(pipeline.activateVersion(deps, versionId), function (err) {
    assert.equal(err.step, "activate");
    assert.doesNotMatch(err.message, /activate failed/);
    return true;
  });
  assert.equal(state.staging.length, 0);
  assert.deepEqual(state.documents.map(function (d) { return d.content; }), ["old info"]);
  assert.equal(state.versions.get(versionId).status, "failed");
});

test("a second activate of the same version is rejected and changes nothing", async function () {
  const { deps, state } = createFakeDeps({ documents: [OLD_INFO] });
  const versionId = await upload(deps, "info.md", "מידע חדש");
  await pipeline.verifyVersion(deps, versionId);
  await pipeline.activateVersion(deps, versionId);
  const before = JSON.stringify(state.documents);
  await rejectsWith(pipeline.activateVersion(deps, versionId), "activate", 409);
  assert.equal(JSON.stringify(state.documents), before);
  assert.equal(state.versions.get(versionId).status, "active");
});

test("verify is idempotent once verified", async function () {
  const { deps } = createFakeDeps();
  const versionId = await upload(deps, "info.md", "טקסט");
  await pipeline.verifyVersion(deps, versionId);
  assert.deepEqual(await pipeline.verifyVersion(deps, versionId), { ok: true, chunkCount: 1 });
});

test("listDocuments sweeps first and maps active versions", async function () {
  const { deps, state } = createFakeDeps({
    seedActive: [
      { doc_type: "pricelist", doc_key: "מחירון", file_name: "v3.md", chunk_count: 1, activated_at: "2026-10-06T19:00:00.000Z" },
      { doc_type: "other", file_name: "מידע ללקוחות.md", chunk_count: 2, activated_at: null, created_at: "2026-10-05T08:00:00.000Z" }
    ]
  });
  const result = await pipeline.listDocuments(deps);
  assert.equal(state.sweeps, 1);
  assert.equal(result.documents.length, 2);
  const info = result.documents.find(function (d) { return d.name === "מידע ללקוחות.md"; });
  assert.deepEqual(info, { id: info.id, name: "מידע ללקוחות.md", type: "other", chunkCount: 2, updatedAt: "2026-10-05T08:00:00.000Z" });
});

test("listDocuments still lists when the sweep fails", async function () {
  const { deps } = createFakeDeps({ seedActive: [{ file_name: "a.md" }] });
  deps.db.sweep = async function () { throw new Error("sweep down"); };
  const result = await pipeline.listDocuments(deps);
  assert.equal(result.documents.length, 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/pipeline.verify-activate.test.js`
Expected: FAIL — `pipeline.verifyVersion is not a function`.

- [ ] **Step 3: Implement**

In `lib/docs/pipeline.js`, add before `module.exports`:

```js
async function verifyVersion(deps, versionId) {
  const version = await loadPending(deps, versionId, "verify");
  if (version.stage === "verified") return { ok: true, chunkCount: version.chunk_count };
  if (version.stage !== "processed") throw new PipelineError("verify", "אי אפשר לבדוק לפני שהעיבוד הסתיים.", 409);

  return guarded(deps, versionId, "verify", async function () {
    const stats = await deps.db.verifyStaged(versionId);
    if (stats.total !== version.chunk_count) {
      throw new PipelineError("verify", "מספר החתיכות שנשמרו (" + stats.total + ") שונה מהצפוי (" + version.chunk_count + ").", 422);
    }
    if (stats.bad_dims > 0) throw new PipelineError("verify", "בחלק מהחתיכות חסר embedding או שהוא בגודל לא תקין.", 422);
    if (stats.empty > 0) throw new PipelineError("verify", "חלק מהחתיכות ריקות.", 422);

    const patch = { stage: "verified" };
    if (version.doc_type === "pricelist") {
      const result = validatePrices(version.extracted, version.source_text);
      if (!result.ok) throw new PipelineError("verify", result.message, 422);
      patch.extracted = result.values;
    }
    await deps.db.updateVersion(versionId, patch);
    return { ok: true, chunkCount: version.chunk_count };
  });
}

async function activateVersion(deps, versionId) {
  const version = await loadPending(deps, versionId, "activate");
  if (version.stage !== "verified") throw new PipelineError("activate", "אי אפשר להחליף לפני שהגרסה נבדקה.", 409);

  return guarded(deps, versionId, "activate", async function () {
    const result = await deps.db.activate(versionId);
    return { ok: true, chunkCount: result.chunk_count };
  });
}

async function listDocuments(deps) {
  try {
    await deps.db.sweep();
  } catch (err) {
    console.error("docs pipeline: sweep failed:", err && err.message);
  }
  const rows = await deps.db.listActive();
  return {
    documents: rows.map(function (row) {
      return {
        id: row.id,
        name: row.file_name,
        type: row.doc_type,
        chunkCount: row.chunk_count,
        updatedAt: row.activated_at || row.created_at
      };
    })
  };
}
```

and replace the exports with:

```js
module.exports = {
  PipelineError, MAX_BYTES, EXTENSIONS,
  receive, processVersion, verifyVersion, activateVersion, listDocuments
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test "test/*.test.js"`
Expected: PASS (chunker 6, prices 7, receive-process 16, verify-activate 11).

- [ ] **Step 5: Checkpoint** — all tests green; no commit unless asked.

---

### Task 6: Real clients (Supabase, OpenAI, LlamaParse) and wiring

**Files:**
- Create: `lib/docs/db.js`, `lib/docs/openai.js`, `lib/docs/llamaparse.js`, `lib/docs/deps.js`
- Test: `test/clients.test.js`

**Interfaces:**
- Consumes: the `deps` contract from "Shared interfaces".
- Produces: `createDb(baseUrl, serviceKey, fetchImpl?) -> deps.db`; `createEmbedder(apiKey, fetchImpl?) -> deps.embed`; `createPriceExtractor(apiKey, model, fetchImpl?) -> deps.extractPrices`; `createParser(apiKey, fetchImpl?) -> deps.parser`; `buildDeps(getEnv, fetchImpl?) -> deps` (throws an `Error` with `userMessage` and `code = "not_configured"` listing missing variable names).

- [ ] **Step 1: Write the failing tests**

Create `test/clients.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb } = require("../lib/docs/db");
const { createEmbedder, createPriceExtractor } = require("../lib/docs/openai");
const { createParser } = require("../lib/docs/llamaparse");
const { buildDeps } = require("../lib/docs/deps");

function fakeFetch(responses) {
  const calls = [];
  async function fetchImpl(url, init) {
    calls.push({ url: String(url), init: init || {} });
    const next = responses.shift() || { status: 200, body: "" };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: async function () { return typeof next.body === "string" ? next.body : JSON.stringify(next.body); },
      json: async function () { return next.body; }
    };
  }
  return { fetchImpl: fetchImpl, calls: calls };
}

const KEY = "secret-service-key";

test("db: insertVersion posts to PostgREST with the service key and returns the row", async function () {
  const { fetchImpl, calls } = fakeFetch([{ status: 201, body: [{ id: "abc", status: "pending" }] }]);
  const db = createDb("https://x.supabase.co/", KEY, fetchImpl);
  const row = await db.insertVersion({ doc_type: "other", doc_key: "a.md", file_name: "a.md" });
  assert.equal(row.id, "abc");
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/document_versions");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.apikey, KEY);
  assert.equal(calls[0].init.headers.Authorization, "Bearer " + KEY);
  assert.equal(calls[0].init.headers.Prefer, "return=representation");
});

test("db: getVersion filters by id and returns null when missing", async function () {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: [] }]);
  const db = createDb("https://x.supabase.co", KEY, fetchImpl);
  assert.equal(await db.getVersion("id with/odd chars"), null);
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/document_versions?id=eq.id%20with%2Fodd%20chars&select=*");
});

test("db: updateVersion patches by id", async function () {
  const { fetchImpl, calls } = fakeFetch([{ status: 204, body: "" }]);
  const db = createDb("https://x.supabase.co", KEY, fetchImpl);
  await db.updateVersion("abc", { stage: "processed" });
  assert.equal(calls[0].init.method, "PATCH");
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/document_versions?id=eq.abc");
  assert.deepEqual(JSON.parse(calls[0].init.body), { stage: "processed" });
});

test("db: insertStaging sends embeddings as pgvector text, in batches of 50", async function () {
  const { fetchImpl, calls } = fakeFetch([{ status: 201, body: "" }, { status: 201, body: "" }]);
  const db = createDb("https://x.supabase.co", KEY, fetchImpl);
  const rows = [];
  for (let i = 0; i < 51; i++) rows.push({ version_id: "v", content: "c" + i, metadata: { n: i }, embedding: [0.5, 0.25] });
  await db.insertStaging(rows);
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].init.body).length, 50);
  assert.equal(JSON.parse(calls[1].init.body).length, 1);
  assert.equal(JSON.parse(calls[0].init.body)[0].embedding, "[0.5,0.25]");
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/documents_staging");
});

test("db: deleteStaging, rpc calls and listActive use the expected endpoints", async function () {
  const { fetchImpl, calls } = fakeFetch([
    { status: 204, body: "" },
    { status: 200, body: { total: 2, bad_dims: 0, empty: 0 } },
    { status: 200, body: { chunk_count: 2 } },
    { status: 200, body: [{ id: "1" }] },
    { status: 200, body: "" }
  ]);
  const db = createDb("https://x.supabase.co", KEY, fetchImpl);
  await db.deleteStaging("abc");
  assert.deepEqual(await db.verifyStaged("abc"), { total: 2, bad_dims: 0, empty: 0 });
  assert.deepEqual(await db.activate("abc"), { chunk_count: 2 });
  assert.deepEqual(await db.listActive(), [{ id: "1" }]);
  await db.sweep();
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/documents_staging?version_id=eq.abc");
  assert.equal(calls[0].init.method, "DELETE");
  assert.equal(calls[1].url, "https://x.supabase.co/rest/v1/rpc/verify_staged_version");
  assert.deepEqual(JSON.parse(calls[1].init.body), { p_version_id: "abc" });
  assert.equal(calls[2].url, "https://x.supabase.co/rest/v1/rpc/activate_document_version");
  assert.match(calls[3].url, /document_versions\?status=eq\.active&select=.*&order=activated_at\.desc\.nullslast$/);
  assert.equal(calls[4].url, "https://x.supabase.co/rest/v1/rpc/sweep_document_versions");
});

test("db: an error response throws without leaking the key", async function () {
  const { fetchImpl } = fakeFetch([{ status: 400, body: { message: "version_not_verified" } }]);
  const db = createDb("https://x.supabase.co", KEY, fetchImpl);
  await assert.rejects(db.activate("abc"), function (err) {
    assert.match(err.message, /version_not_verified/);
    assert.doesNotMatch(err.message, new RegExp(KEY));
    return true;
  });
});

test("embedder: batches of 64, keeps order, uses text-embedding-3-small", async function () {
  const { fetchImpl, calls } = fakeFetch([
    { status: 200, body: { data: Array.from({ length: 64 }, function (_, i) { return { index: i, embedding: [i] }; }) } },
    { status: 200, body: { data: [{ index: 0, embedding: [64] }] } }
  ]);
  const embed = createEmbedder("sk-test", fetchImpl);
  const result = await embed(Array.from({ length: 65 }, function (_, i) { return "t" + i; }));
  assert.equal(result.length, 65);
  assert.deepEqual(result[64], [64]);
  assert.equal(calls[0].url, "https://api.openai.com/v1/embeddings");
  assert.equal(JSON.parse(calls[0].init.body).model, "text-embedding-3-small");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-test");
});

test("embedder: an API error throws a generic error without the key", async function () {
  const { fetchImpl } = fakeFetch([{ status: 401, body: { error: { message: "bad key sk-test" } } }]);
  const embed = createEmbedder("sk-test", fetchImpl);
  await assert.rejects(embed(["a"]), function (err) {
    assert.match(err.message, /401/);
    return true;
  });
});

test("price extractor: strict JSON schema request, parsed result", async function () {
  const content = JSON.stringify({ priceSourdough: 32, priceRye: 36, priceChallah: 28, priceBurekas: 12, deliveryFee: null });
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: content } }] } }]);
  const extract = createPriceExtractor("sk-test", "some-model", fetchImpl);
  const result = await extract("מחירון");
  assert.equal(result.priceRye, 36);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "some-model");
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.messages[1].content, "מחירון");
});

test("price extractor without a model gives a user-facing configuration error", async function () {
  const extract = createPriceExtractor("sk-test", "", fakeFetch([]).fetchImpl);
  await assert.rejects(extract("x"), function (err) {
    assert.match(err.userMessage, /OPENAI_MODEL/);
    return true;
  });
});

test("parser: start uploads multipart with the agentic configuration", async function () {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: { id: "job-9" } }]);
  const parser = createParser("llx-test", fetchImpl);
  const jobId = await parser.start(Buffer.from("%PDF"), "מחירון.pdf", "application/pdf");
  assert.equal(jobId, "job-9");
  assert.equal(calls[0].url, "https://api.cloud.llamaindex.ai/api/v2/parse/upload");
  assert.equal(calls[0].init.headers.Authorization, "Bearer llx-test");
  assert.ok(calls[0].init.body instanceof FormData);
  assert.deepEqual(JSON.parse(calls[0].init.body.get("configuration")), { tier: "agentic", version: "latest" });
  assert.equal(calls[0].init.body.get("file").name, "מחירון.pdf");
});

test("parser: poll maps COMPLETED / FAILED / running", async function () {
  const { fetchImpl, calls } = fakeFetch([
    { status: 200, body: { job: { status: "COMPLETED" }, markdown_full: "# שלום" } },
    { status: 200, body: { job: { status: "COMPLETED" }, markdown: { pages: [{ markdown: "א" }, { markdown: "ב" }] } } },
    { status: 200, body: { job: { status: "FAILED", error_message: "unreadable" } } },
    { status: 200, body: { job: { status: "RUNNING" } } }
  ]);
  const parser = createParser("llx-test", fetchImpl);
  assert.deepEqual(await parser.poll("j1"), { state: "done", markdown: "# שלום" });
  assert.deepEqual(await parser.poll("j1"), { state: "done", markdown: "א\n\nב" });
  assert.deepEqual(await parser.poll("j1"), { state: "failed", message: "unreadable" });
  assert.deepEqual(await parser.poll("j1"), { state: "running" });
  assert.equal(calls[0].url, "https://api.cloud.llamaindex.ai/api/v2/parse/j1?expand=markdown");
});

test("parser without a key gives a user-facing configuration error", async function () {
  const parser = createParser("", fakeFetch([]).fetchImpl);
  await assert.rejects(parser.start(Buffer.from("x"), "a.pdf", "application/pdf"), function (err) {
    assert.match(err.userMessage, /LLAMAPARSE_API_KEY/);
    return true;
  });
});

test("buildDeps lists exactly the missing variable names", function () {
  assert.throws(function () { buildDeps(function () { return ""; }); }, function (err) {
    assert.equal(err.code, "not_configured");
    assert.match(err.userMessage, /SUPABASE_URL/);
    assert.match(err.userMessage, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(err.userMessage, /OPENAI_API_KEY/);
    return true;
  });
  const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", OPENAI_API_KEY: "o" };
  const deps = buildDeps(function (name) { return env[name] || ""; });
  ["db", "parser", "embed", "extractPrices", "now"].forEach(function (name) { assert.ok(deps[name], name); });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/clients.test.js`
Expected: FAIL — `Cannot find module '../lib/docs/db'`.

- [ ] **Step 3: Implement `lib/docs/db.js`**

```js
// Supabase PostgREST client (service role, server only) implementing deps.db.
const STAGING_BATCH = 50;

function createDb(baseUrl, serviceKey, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const root = String(baseUrl).replace(/\/+$/, "") + "/rest/v1";

  async function request(method, pathAndQuery, body, extraHeaders) {
    const response = await doFetch(root + pathAndQuery, {
      method: method,
      headers: Object.assign({
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json"
      }, extraHeaders),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error("supabase " + method + " " + pathAndQuery.split("?")[0] + " " + response.status + ": " + text.slice(0, 300));
    }
    return text ? JSON.parse(text) : null;
  }

  function byId(id) {
    return "id=eq." + encodeURIComponent(id);
  }

  return {
    async insertVersion(row) {
      const rows = await request("POST", "/document_versions", row, { Prefer: "return=representation" });
      return rows[0];
    },
    async getVersion(id) {
      const rows = await request("GET", "/document_versions?" + byId(id) + "&select=*");
      return rows && rows.length > 0 ? rows[0] : null;
    },
    async updateVersion(id, patch) {
      await request("PATCH", "/document_versions?" + byId(id), patch, { Prefer: "return=minimal" });
    },
    async insertStaging(rows) {
      for (let i = 0; i < rows.length; i += STAGING_BATCH) {
        const batch = rows.slice(i, i + STAGING_BATCH).map(function (row) {
          return Object.assign({}, row, { embedding: "[" + row.embedding.join(",") + "]" });
        });
        await request("POST", "/documents_staging", batch, { Prefer: "return=minimal" });
      }
    },
    async deleteStaging(versionId) {
      await request("DELETE", "/documents_staging?version_id=eq." + encodeURIComponent(versionId), undefined, { Prefer: "return=minimal" });
    },
    verifyStaged(versionId) {
      return request("POST", "/rpc/verify_staged_version", { p_version_id: versionId });
    },
    activate(versionId) {
      return request("POST", "/rpc/activate_document_version", { p_version_id: versionId });
    },
    listActive() {
      return request("GET", "/document_versions?status=eq.active&select=id,doc_type,file_name,chunk_count,activated_at,created_at&order=activated_at.desc.nullslast");
    },
    async sweep() {
      await request("POST", "/rpc/sweep_document_versions", {});
    }
  };
}

module.exports = { createDb };
```

- [ ] **Step 4: Implement `lib/docs/openai.js`**

```js
// OpenAI REST calls: embeddings (same model as the n8n workflow and the agent's search) and pricelist extraction.
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBED_BATCH = 64;

const PRICE_SYSTEM_PROMPT =
  "את/ה עוזר שמחלץ מחירים ממחירון של מאפייה. חלץ את מחיר היחידה של כל אחד מארבעת המוצרים: לחם כפרי מחמצת, לחם שיפון, חלה, בורקס גבינה. " +
  "בנוסף חלץ את דמי המשלוח להזמנה אחת, אם הם מופיעים (אם אין במסמך דמי משלוח, החזר null). " +
  "חלץ רק מחירים שמופיעים במפורש בטקסט. אם מחיר של מוצר לא מופיע או לא ברור, אל תנחש - החזר null. דיוק המחירים קריטי ביותר.";

const NUMBER_OR_NULL = { type: ["number", "null"] };
const PRICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["priceSourdough", "priceRye", "priceChallah", "priceBurekas", "deliveryFee"],
  properties: {
    priceSourdough: NUMBER_OR_NULL,
    priceRye: NUMBER_OR_NULL,
    priceChallah: NUMBER_OR_NULL,
    priceBurekas: NUMBER_OR_NULL,
    deliveryFee: NUMBER_OR_NULL
  }
};

async function postJson(doFetch, url, apiKey, body) {
  const response = await doFetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    // The response text is not included: it may echo request details.
    throw new Error("openai " + url.split("/v1/")[1] + " " + response.status);
  }
  return response.json();
}

function createEmbedder(apiKey, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  return async function embed(texts) {
    const vectors = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const data = await postJson(doFetch, "https://api.openai.com/v1/embeddings", apiKey, {
        model: EMBEDDING_MODEL,
        input: texts.slice(i, i + EMBED_BATCH)
      });
      data.data.slice().sort(function (a, b) { return a.index - b.index; }).forEach(function (item) {
        vectors.push(item.embedding);
      });
    }
    return vectors;
  };
}

function createPriceExtractor(apiKey, model, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  return async function extractPrices(markdown) {
    if (!model) {
      const error = new Error("OPENAI_MODEL missing");
      error.userMessage = "OPENAI_MODEL לא הוגדר בשרת, ולכן אי אפשר לחלץ מחירים ממחירון.";
      throw error;
    }
    const data = await postJson(doFetch, "https://api.openai.com/v1/chat/completions", apiKey, {
      model: model,
      messages: [
        { role: "system", content: PRICE_SYSTEM_PROMPT },
        { role: "user", content: markdown }
      ],
      response_format: { type: "json_schema", json_schema: { name: "bakery_prices", strict: true, schema: PRICE_SCHEMA } }
    });
    return JSON.parse(data.choices[0].message.content);
  };
}

module.exports = { createEmbedder, createPriceExtractor };
```

- [ ] **Step 5: Implement `lib/docs/llamaparse.js`**

```js
// LlamaParse v2 (same service and settings as the n8n invoice workflow): upload a file, then poll the job.
const BASE_URL = "https://api.cloud.llamaindex.ai/api/v2/parse";

function missingKeyError() {
  const error = new Error("LLAMAPARSE_API_KEY missing");
  error.userMessage = "LLAMAPARSE_API_KEY לא הוגדר בשרת, ולכן אי אפשר לפענח PDF או תמונה. אפשר להעלות קובץ טקסט (MD או TXT).";
  return error;
}

function createParser(apiKey, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  return {
    async start(buffer, fileName, mime) {
      if (!apiKey) throw missingKeyError();
      const form = new FormData();
      form.append("file", new Blob([buffer], { type: mime }), fileName);
      form.append("configuration", JSON.stringify({ tier: "agentic", version: "latest" }));
      const response = await doFetch(BASE_URL + "/upload", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey },
        body: form
      });
      if (!response.ok) throw new Error("llamaparse upload " + response.status);
      const data = await response.json();
      return data.id;
    },
    async poll(jobId) {
      if (!apiKey) throw missingKeyError();
      const response = await doFetch(BASE_URL + "/" + encodeURIComponent(jobId) + "?expand=markdown", {
        headers: { Authorization: "Bearer " + apiKey }
      });
      if (!response.ok) throw new Error("llamaparse status " + response.status);
      const data = await response.json();
      const status = data.job && data.job.status;
      if (status === "COMPLETED") {
        const pages = (data.markdown && data.markdown.pages) || [];
        const markdown = data.markdown_full != null ? data.markdown_full : pages.map(function (page) { return page.markdown || ""; }).join("\n\n");
        return { state: "done", markdown: markdown };
      }
      if (status === "FAILED" || status === "CANCELLED") {
        return { state: "failed", message: (data.job && data.job.error_message) || "" };
      }
      return { state: "running" };
    }
  };
}

module.exports = { createParser };
```

- [ ] **Step 6: Implement `lib/docs/deps.js`**

```js
// Wires the real services into the deps object used by lib/docs/pipeline.js.
const { createDb } = require("./db");
const { createEmbedder, createPriceExtractor } = require("./openai");
const { createParser } = require("./llamaparse");

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"];

// getEnv(name) -> string (see lib/env.js). LLAMAPARSE_API_KEY and OPENAI_MODEL are checked only when needed.
function buildDeps(getEnv, fetchImpl) {
  const missing = REQUIRED.filter(function (name) { return !getEnv(name); });
  if (missing.length > 0) {
    const error = new Error("missing env: " + missing.join(", "));
    error.code = "not_configured";
    error.userMessage = "חסרים משתני סביבה בשרת: " + missing.join(", ") + ".";
    throw error;
  }
  return {
    db: createDb(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), fetchImpl),
    parser: createParser(getEnv("LLAMAPARSE_API_KEY"), fetchImpl),
    embed: createEmbedder(getEnv("OPENAI_API_KEY"), fetchImpl),
    extractPrices: createPriceExtractor(getEnv("OPENAI_API_KEY"), getEnv("OPENAI_MODEL"), fetchImpl),
    now: function () { return new Date(); }
  };
}

module.exports = { buildDeps };
```

- [ ] **Step 7: Run to verify it passes**

Run: `node --test "test/*.test.js"`
Expected: PASS for all files (clients: 14 tests).

- [ ] **Step 8: Checkpoint.**

---

### Task 7: HTTP handler `api/docs.js`

**Files:**
- Create: `api/docs.js`
- Test: `test/docs-handler.test.js`

**Interfaces:**
- Consumes: `readSession` (`lib/session.js`), `getEnv` (`lib/env.js`), pipeline functions (Tasks 4–5), `buildDeps` (Task 6).
- Produces: `module.exports = handler` (a Vercel function) with `module.exports.createHandler(getDeps) -> handler`. Contract:
  * `POST /api/docs?action=upload` — raw body, headers `x-doc-type`, `x-file-name` (URI-encoded). Response `{ ok:true, versionId, fileName, docType, needsParsing }`.
  * `POST ?action=process|verify|activate` — JSON `{ versionId }`. Responses `{ ok:true, state, chunkCount? }`, `{ ok:true, chunkCount }`, `{ ok:true, chunkCount }`.
  * `GET ?action=list` — `{ ok:true, documents:[...] }`.
  * Errors: `{ ok:false, step, message, versionId?, previousKept:true }` with the error status; 401 `{ ok:false, code:"unauthorized", message }`; 500 `{ ok:false, code:"not_configured", message }`.

- [ ] **Step 1: Write the failing tests**

Create `test/docs-handler.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SESSION_SECRET = "test-secret";
const { createSessionCookie } = require("../lib/session");
const { createHandler } = require("../api/docs");
const { createFakeDeps } = require("./fakes");

const COOKIE = createSessionCookie("admin", "test-secret").split(";")[0];

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader: function (name, value) { this.headers[name] = value; },
    status: function (code) { this.statusCode = code; return this; },
    json: function (payload) { this.body = payload; return this; }
  };
}

function request(options) {
  return {
    method: options.method || "POST",
    headers: Object.assign({ cookie: options.cookie === undefined ? COOKIE : options.cookie }, options.headers),
    query: { action: options.action },
    body: options.body
  };
}

function json(body) {
  return { headers: { "content-type": "application/json" }, body: body };
}

test("no session cookie -> 401 and nothing runs", async function () {
  let built = false;
  const handler = createHandler(function () { built = true; return createFakeDeps().deps; });
  const res = fakeRes();
  await handler(request({ action: "list", method: "GET", cookie: "" }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "unauthorized");
  assert.equal(built, false);
});

test("a forged cookie is rejected", async function () {
  const handler = createHandler(function () { return createFakeDeps().deps; });
  const res = fakeRes();
  await handler(request({ action: "list", method: "GET", cookie: "ls_session=abc.def" }), res);
  assert.equal(res.statusCode, 401);
});

test("unknown action -> 400, wrong method -> 405", async function () {
  const handler = createHandler(function () { return createFakeDeps().deps; });
  let res = fakeRes();
  await handler(request({ action: "nope" }), res);
  assert.equal(res.statusCode, 400);
  res = fakeRes();
  await handler(request({ action: "upload", method: "GET" }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
  res = fakeRes();
  await handler(request({ action: "list", method: "POST" }), res);
  assert.equal(res.statusCode, 405);
});

test("missing configuration -> 500 with the variable names", async function () {
  const handler = createHandler(function () {
    const error = new Error("x");
    error.code = "not_configured";
    error.userMessage = "חסרים משתני סביבה בשרת: OPENAI_API_KEY.";
    throw error;
  });
  const res = fakeRes();
  await handler(request({ action: "list", method: "GET" }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.code, "not_configured");
  assert.match(res.body.message, /OPENAI_API_KEY/);
});

test("upload keeps a Hebrew file name with spaces, quotes and % unchanged", async function () {
  const { deps, state } = createFakeDeps();
  const handler = createHandler(function () { return deps; });
  const name = 'מידע ללקוחות "חדש" 100%.md';
  const res = fakeRes();
  await handler(request({
    action: "upload",
    headers: { "x-doc-type": "other", "x-file-name": encodeURIComponent(name), "content-type": "application/octet-stream" },
    body: Buffer.from("שלום", "utf8")
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(state.versions.get(res.body.versionId).file_name, name);
  assert.equal(state.versions.get(res.body.versionId).doc_key, name);
});

test("a malformed file-name header is a clean 400, not a crash", async function () {
  const { deps } = createFakeDeps();
  const handler = createHandler(function () { return deps; });
  const res = fakeRes();
  await handler(request({
    action: "upload",
    headers: { "x-doc-type": "other", "x-file-name": "%E0%A4%A" },
    body: Buffer.from("x")
  }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
});

test("process / verify / activate over HTTP, then list", async function () {
  const { deps } = createFakeDeps();
  const handler = createHandler(function () { return deps; });

  let res = fakeRes();
  await handler(request({ action: "upload", headers: { "x-doc-type": "other", "x-file-name": encodeURIComponent("a.md") }, body: Buffer.from("טקסט") }), res);
  const versionId = res.body.versionId;

  res = fakeRes();
  await handler(request(Object.assign({ action: "process" }, json({ versionId: versionId }))), res);
  assert.deepEqual([res.statusCode, res.body.state, res.body.chunkCount], [200, "done", 1]);

  res = fakeRes();
  await handler(request(Object.assign({ action: "verify" }, json({ versionId: versionId }))), res);
  assert.deepEqual([res.statusCode, res.body.ok, res.body.chunkCount], [200, true, 1]);

  res = fakeRes();
  await handler(request(Object.assign({ action: "activate" }, json({ versionId: versionId }))), res);
  assert.deepEqual([res.statusCode, res.body.ok, res.body.chunkCount], [200, true, 1]);

  res = fakeRes();
  await handler(request({ action: "list", method: "GET" }), res);
  assert.equal(res.body.documents.length, 1);
  assert.equal(res.body.documents[0].name, "a.md");
});

test("a JSON body sent as a string is accepted", async function () {
  const { deps } = createFakeDeps();
  const handler = createHandler(function () { return deps; });
  const res = fakeRes();
  await handler(request({ action: "process", body: JSON.stringify({ versionId: "nope" }) }), res);
  assert.equal(res.statusCode, 404);
});

test("pipeline errors map to status, step, message and previousKept", async function () {
  const { deps } = createFakeDeps({ embedFail: true });
  const handler = createHandler(function () { return deps; });
  let res = fakeRes();
  await handler(request({ action: "upload", headers: { "x-doc-type": "other", "x-file-name": "a.md" }, body: Buffer.from("טקסט") }), res);
  const versionId = res.body.versionId;
  res = fakeRes();
  await handler(request(Object.assign({ action: "process" }, json({ versionId: versionId }))), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.step, "process");
  assert.equal(res.body.versionId, versionId);
  assert.equal(res.body.previousKept, true);
  assert.ok(res.body.message.length > 0);
});

test("an unexpected error is a generic 500 without internals", async function () {
  const { deps } = createFakeDeps();
  deps.db.listActive = async function () { throw new Error("connection string leaked here"); };
  const handler = createHandler(function () { return deps; });
  const res = fakeRes();
  await handler(request({ action: "list", method: "GET" }), res);
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /connection string/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/docs-handler.test.js`
Expected: FAIL — `Cannot find module '../api/docs'`.

- [ ] **Step 3: Implement `api/docs.js`**

```js
// /api/docs?action=upload|process|verify|activate|list  - the safe-replace pipeline for pricelists and
// "other" documents. Logged-in session only. The browser drives the steps one request at a time.
const { readSession } = require("../lib/session");
const { getEnv } = require("../lib/env");
const pipeline = require("../lib/docs/pipeline");
const { buildDeps } = require("../lib/docs/deps");

const PipelineError = pipeline.PipelineError;
const MAX_BODY_BYTES = pipeline.MAX_BYTES + 1024 * 1024;

function getAction(req) {
  if (req.query && req.query.action) return String(req.query.action);
  try {
    return new URL(req.url || "", "http://localhost").searchParams.get("action") || "";
  } catch (error) {
    return "";
  }
}

function header(req, name) {
  const value = req.headers && req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new PipelineError("receive", "הקובץ גדול מדי (מעל 4MB).", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function readJson(req) {
  const body = req.body;
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) return body;
  try {
    return JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : (body || "{}"));
  } catch (error) {
    return {};
  }
}

function decodeFileName(raw) {
  try {
    return decodeURIComponent(raw || "");
  } catch (error) {
    throw new PipelineError("receive", "שם הקובץ לא תקין.", 400);
  }
}

const ACTIONS = {
  upload: { method: "POST", run: async function (deps, req) {
    return pipeline.receive(deps, {
      docType: header(req, "x-doc-type"),
      fileName: decodeFileName(header(req, "x-file-name")),
      buffer: await readRawBody(req)
    });
  } },
  process: { method: "POST", run: function (deps, req) { return pipeline.processVersion(deps, readJson(req).versionId); } },
  verify: { method: "POST", run: function (deps, req) { return pipeline.verifyVersion(deps, readJson(req).versionId); } },
  activate: { method: "POST", run: function (deps, req) { return pipeline.activateVersion(deps, readJson(req).versionId); } },
  list: { method: "GET", run: function (deps) { return pipeline.listDocuments(deps); } }
};

function createHandler(getDeps) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    const session = readSession(req, getEnv("SESSION_SECRET"));
    if (!session) {
      return res.status(401).json({ ok: false, code: "unauthorized", message: "פג תוקף הכניסה. יש להתחבר מחדש." });
    }

    const action = ACTIONS[getAction(req)];
    if (!action) return res.status(400).json({ ok: false, code: "unknown_action", message: "פעולה לא מוכרת." });
    if (req.method !== action.method) {
      res.setHeader("Allow", action.method);
      return res.status(405).json({ ok: false, code: "method_not_allowed", message: "שיטת בקשה לא נתמכת." });
    }

    let deps;
    try {
      deps = getDeps();
    } catch (error) {
      return res.status(500).json({ ok: false, code: "not_configured", message: error.userMessage || "השרת לא הוגדר." });
    }

    try {
      const result = await action.run(deps, req);
      return res.status(200).json(Object.assign({ ok: true }, result));
    } catch (error) {
      if (error instanceof PipelineError) {
        return res.status(error.status).json({
          ok: false,
          step: error.step,
          message: error.message,
          versionId: error.versionId || undefined,
          previousKept: true
        });
      }
      console.error("api/docs unexpected error:", error && error.message);
      return res.status(500).json({ ok: false, code: "server_error", message: "אירעה שגיאה בשרת. נסו שוב." });
    }
  };
}

module.exports = createHandler(function () { return buildDeps(getEnv); });
module.exports.createHandler = createHandler;
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test "test/*.test.js"`
Expected: PASS for all files (handler: 10 tests).

- [ ] **Step 5: Checkpoint.**

---

### Task 8: Admin screen — pipeline stage, active documents, local preview server

**Files:**
- Modify: `private/admin.html`
- Create: `test/dev-server.js`
- Modify: `test/fakes.js` (nothing; it already supports the options the dev server uses)

**Interfaces:**
- Consumes: the HTTP contract of Task 7.
- Produces: UI behavior — for `pricelist` / `other`: 4 visible steps with real states, result box (success with chunk count, or failure with step + message + "הגרסה הקודמת נשארה פעילה."), retry and "בחירה מחדש"/"מסמך נוסף" buttons, active documents table. `invoice` path unchanged.

- [ ] **Step 1: Header text, file input, hints**

In `private/admin.html`:

Replace
```html
  <p>חשבונית ספק, מחירון או מסמך אחר — בחרו סוג, צלמו או העלו קובץ, ותקבלו אישור למייל.</p>
```
with
```html
  <p>חשבונית ספק, מחירון או מסמך אחר — בחרו סוג, צלמו או העלו קובץ. חשבונית מקבלת אישור במייל; מחירון ומסמך אחר מתעדכנים בבוט רק אחרי בדיקה.</p>
```

Replace
```html
    <input type="file" id="fileInput" accept="image/*,application/pdf" capture="environment">
```
with
```html
    <input type="file" id="fileInput" accept="image/*,application/pdf,.md,.txt,text/markdown,text/plain">
```
(the `capture` attribute is removed so desktop and mobile can both pick files, including text files)

Replace the `TYPE_HINTS` object with:
```js
const TYPE_HINTS = {
  invoice: 'תתויק בדרייב ותירשם בטבלת החשבוניות.',
  pricelist: 'יחליף את המחירון הפעיל רק אחרי שהחדש נבדק. המחירים באתר ובבוט מתעדכנים יחד.',
  other: 'יחליף קובץ באותו שם, או יתווסף לחנות הידע של הבוט, רק אחרי בדיקה.'
};
```

- [ ] **Step 2: CSS** — add before `footer{` in the `<style>` block:

```css
  /* ---- צינור ההחלפה ---- */
  .pipeline-wrap{display:none;}
  .pipeline-wrap.active{display:block;}
  .pipeline-title{font-family:var(--font-display);font-weight:400;font-size:20px;margin:0 0 14px;}
  .step-list{list-style:none;margin:0;padding:0;display:grid;gap:8px;}
  .step-list li{
    display:flex;align-items:center;justify-content:space-between;gap:12px;
    min-height:48px;padding:10px 14px;
    border:1.5px solid var(--color-border);border-radius:12px;background:#fff;
  }
  .step-name{font-weight:700;font-size:15px;}
  .step-state{font-size:13px;color:var(--color-text-soft);}
  .step-list li[data-state="running"]{border-color:var(--color-accent);background:var(--color-bg-alt);}
  .step-list li[data-state="done"]{border-color:var(--color-olive);}
  .step-list li[data-state="done"] .step-name::before{content:"✓ ";color:var(--color-olive);}
  .step-list li[data-state="failed"]{border-color:var(--color-error);background:var(--color-error-bg);}
  .step-list li[data-state="failed"] .step-name::before{content:"✗ ";color:var(--color-error);}
  .step-list li[data-state="failed"] .step-state{color:var(--color-error);font-weight:700;}
  .pipeline-note{margin:12px 0 0;font-size:13px;color:var(--color-text-soft);line-height:1.6;}
  .result-box{display:none;margin-top:14px;padding:12px 14px;border-radius:10px;font-size:14px;line-height:1.6;}
  .result-box.active{display:block;}
  .result-box.ok{background:var(--color-olive-soft);color:var(--color-text);border:1px solid var(--color-olive);}
  .result-box.fail{background:var(--color-error-bg);color:var(--color-error);border:1px solid #F3C6C3;}
  .result-box strong{display:block;margin-bottom:2px;}
  .pipeline-actions{display:none;}
  .pipeline-actions.active{display:block;}

  /* ---- מסמכים פעילים ---- */
  .docs-card{
    width:100%;max-width:480px;margin-top:18px;background:#fff;
    border:1px solid var(--color-border);border-radius:18px;padding:18px 18px 12px;
    box-shadow:0 2px 4px rgba(74,53,37,.04);
  }
  .docs-card h2{font-family:var(--font-display);font-weight:400;font-size:18px;margin:0 0 10px;}
  .docs-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13.5px;}
  .docs-table th{text-align:start;font-weight:700;color:var(--color-text-soft);padding:6px 4px;border-bottom:1.5px solid var(--color-border);}
  .docs-table td{padding:9px 4px;border-bottom:1px solid var(--color-border);overflow-wrap:anywhere;vertical-align:top;}
  .docs-table th:nth-child(1){width:38%;}
  .docs-table th:nth-child(2){width:15%;}
  .docs-table th:nth-child(3){width:30%;}
  .docs-table th:nth-child(4){width:17%;}
  .docs-status{margin:8px 0 0;font-size:13px;color:var(--color-text-soft);}
```

- [ ] **Step 3: Markup** — after the `sendingStage` block and before the `successStage` block add:

```html
  <!-- שלב 3ב: צינור ההחלפה (מחירון / אחר) -->
  <div class="pipeline-wrap" id="pipelineStage">
    <h2 class="pipeline-title">מעדכנים את חנות הידע</h2>
    <ol class="step-list" id="stepList">
      <li data-step="receive" data-state="pending"><span class="step-name">קבלה</span><span class="step-state">ממתין</span></li>
      <li data-step="process" data-state="pending"><span class="step-name">עיבוד</span><span class="step-state">ממתין</span></li>
      <li data-step="verify" data-state="pending"><span class="step-name">בדיקה</span><span class="step-state">ממתין</span></li>
      <li data-step="activate" data-state="pending"><span class="step-name">החלפה</span><span class="step-state">ממתין</span></li>
    </ol>
    <p class="pipeline-note">הגרסה הקודמת נשארת פעילה עד שהחדשה נבדקה.</p>
    <div class="result-box" id="resultBox" role="status" aria-live="polite"></div>
    <div class="pipeline-actions" id="pipelineActions">
      <button class="btn btn-primary" id="retryBtn" type="button">ניסיון נוסף</button>
      <button class="btn btn-secondary" id="pipelineReselectBtn" type="button">בחירה מחדש</button>
      <button class="btn btn-primary" id="pipelineAnotherBtn" type="button">מסמך נוסף</button>
    </div>
  </div>
```

and after `</main>` add:

```html
<section class="docs-card" aria-labelledby="docsTitle">
  <h2 id="docsTitle">מסמכים פעילים בחנות הידע</h2>
  <table class="docs-table">
    <thead><tr><th scope="col">מסמך</th><th scope="col">סוג</th><th scope="col">עודכן</th><th scope="col">חתיכות</th></tr></thead>
    <tbody id="docsBody"></tbody>
  </table>
  <p class="docs-status" id="docsStatus" role="status">טוען...</p>
</section>
```

- [ ] **Step 4: Script** — in the `<script>` block:

(a) Replace the existing `submitBtn.addEventListener('click', async () => { ... });` with a dispatcher plus the unchanged invoice code renamed:

```js
submitBtn.addEventListener('click', () => {
  if (docTypeSelect.value === 'invoice') sendInvoice(); else runPipeline();
});

async function sendInvoice() {
  if (!selectedFile) return;
  if (!UPLOAD_TOKEN || UPLOAD_TOKEN.indexOf('__') === 0) {
    errorBox.textContent = 'ההעלאה עוד לא הוגדרה במערכת (חסר קוד העלאה בשרת).';
    errorBox.classList.add('active');
    return;
  }
  showStage('sending');
  errorBox.classList.remove('active');

  try {
    const fd = new FormData();
    fd.append('token', UPLOAD_TOKEN);
    fd.append('docType', docTypeSelect.value);
    // The file field keeps the name "invoice" - the n8n workflow reads it under that name for every document type.
    fd.append('invoice', selectedFile, selectedFile.name);

    const res = await fetch(SUBMIT_URL, { method: 'POST', body: fd });
    if (!res.ok) throw new Error('קוד תשובה ' + res.status);

    showStage('success');
  } catch (err) {
    showStage('preview');
    errorBox.textContent = 'השליחה נכשלה: ' + err.message + '. בדקו את החיבור לאינטרנט ונסו שוב.';
    errorBox.classList.add('active');
  }
}
```

(b) Replace `showStage` with:

```js
function showStage(stage) {
  typeField.classList.toggle('hidden', stage === 'sending' || stage === 'success' || stage === 'pipeline');
  pickStage.style.display = stage === 'pick' ? 'block' : 'none';
  previewStage.classList.toggle('active', stage === 'preview');
  sendingStage.classList.toggle('active', stage === 'sending');
  successStage.classList.toggle('active', stage === 'success');
  pipelineStage.classList.toggle('active', stage === 'pipeline');
}
```

(c) Add near the other element lookups: `const pipelineStage = document.getElementById('pipelineStage');`

(d) Append before `</script>`:

```js
// ---- Pricelist / other: safe replace in the knowledge base (api/docs.js) ----
const DOCS_API = '/api/docs';
const STEP_ORDER = ['receive', 'process', 'verify', 'activate'];
const STATE_LABELS = { pending: 'ממתין', running: 'רץ...', done: 'הושלם', failed: 'נכשל' };
const POLL_INTERVAL_MS = 2500;
const POLL_LIMIT_MS = 6 * 60 * 1000;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const stepList = document.getElementById('stepList');
const resultBox = document.getElementById('resultBox');
const pipelineActions = document.getElementById('pipelineActions');
const retryBtn = document.getElementById('retryBtn');
const pipelineReselectBtn = document.getElementById('pipelineReselectBtn');
const pipelineAnotherBtn = document.getElementById('pipelineAnotherBtn');
const docsBody = document.getElementById('docsBody');
const docsStatus = document.getElementById('docsStatus');

let pipelineRunning = false;
let currentStep = 'receive';

class StepError extends Error {
  constructor(step, message) {
    super(message);
    this.step = step;
  }
}

function setStep(step, state) {
  const item = stepList.querySelector('[data-step="' + step + '"]');
  item.dataset.state = state;
  item.querySelector('.step-state').textContent = STATE_LABELS[state];
}

function resetPipelineUi() {
  STEP_ORDER.forEach((step) => setStep(step, 'pending'));
  resultBox.className = 'result-box';
  resultBox.textContent = '';
  pipelineActions.classList.remove('active');
}

function showResult(ok, title, text) {
  resultBox.className = 'result-box active ' + (ok ? 'ok' : 'fail');
  resultBox.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = title;
  resultBox.appendChild(strong);
  resultBox.appendChild(document.createTextNode(text));
  pipelineActions.classList.add('active');
  retryBtn.style.display = ok ? 'none' : 'block';
  pipelineReselectBtn.style.display = ok ? 'none' : 'block';
  pipelineAnotherBtn.style.display = ok ? 'block' : 'none';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callDocs(action, step, init) {
  let res;
  try {
    res = await fetch(DOCS_API + '?action=' + action, Object.assign({ credentials: 'same-origin' }, init));
  } catch (err) {
    throw new StepError(step, 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.');
  }
  let data = null;
  try { data = await res.json(); } catch (err) { /* not JSON */ }
  if (res.status === 401) throw new StepError(step, 'פג תוקף הכניסה. יש לרענן את הדף ולהתחבר מחדש.');
  if (!res.ok || !data || !data.ok) {
    throw new StepError((data && data.step) || step, (data && data.message) || 'שגיאה בשרת (' + res.status + ').');
  }
  return data;
}

function jsonPost(payload) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}

async function pollProcess(versionId) {
  const started = Date.now();
  for (;;) {
    const result = await callDocs('process', 'process', jsonPost({ versionId: versionId }));
    if (result.state === 'done') return result;
    if (Date.now() - started > POLL_LIMIT_MS) throw new StepError('process', 'העיבוד נמשך יותר מדי זמן. נסו שוב.');
    await sleep(POLL_INTERVAL_MS);
  }
}

async function runPipeline() {
  if (pipelineRunning || !selectedFile) return;
  pipelineRunning = true;
  errorBox.classList.remove('active');
  resetPipelineUi();
  showStage('pipeline');

  try {
    currentStep = 'receive';
    if (selectedFile.size > MAX_UPLOAD_BYTES) {
      throw new StepError('receive', 'הקובץ גדול מדי (מעל 4MB). אפשר לשלוח PDF או תמונה קטנה יותר.');
    }
    setStep('receive', 'running');
    const received = await callDocs('upload', 'receive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-doc-type': docTypeSelect.value,
        'x-file-name': encodeURIComponent(selectedFile.name)
      },
      body: selectedFile
    });
    setStep('receive', 'done');

    currentStep = 'process';
    setStep('process', 'running');
    await pollProcess(received.versionId);
    setStep('process', 'done');

    currentStep = 'verify';
    setStep('verify', 'running');
    await callDocs('verify', 'verify', jsonPost({ versionId: received.versionId }));
    setStep('verify', 'done');

    currentStep = 'activate';
    setStep('activate', 'running');
    const activated = await callDocs('activate', 'activate', jsonPost({ versionId: received.versionId }));
    setStep('activate', 'done');

    showResult(true, 'המסמך הוחלף בהצלחה', 'נשמרו ' + activated.chunkCount + ' חתיכות. הבוט משתמש עכשיו בגרסה החדשה.');
    loadActiveDocs();
  } catch (err) {
    const failedStep = (err && err.step) || currentStep;
    setStep(failedStep, 'failed');
    showResult(false, 'ההחלפה נכשלה בשלב ' + stepLabel(failedStep), err.message + ' הגרסה הקודמת נשארה פעילה, ושום דבר חלקי לא נשמר.');
  } finally {
    pipelineRunning = false;
  }
}

function stepLabel(step) {
  const item = stepList.querySelector('[data-step="' + step + '"] .step-name');
  return item ? item.textContent : step;
}

retryBtn.addEventListener('click', runPipeline);
pipelineReselectBtn.addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  showStage('pick');
});
pipelineAnotherBtn.addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  showStage('pick');
});

const TYPE_LABELS = { pricelist: 'מחירון', other: 'אחר' };

function renderDocs(documents) {
  docsBody.textContent = '';
  documents.forEach((doc) => {
    const row = document.createElement('tr');
    const cells = [
      doc.name,
      TYPE_LABELS[doc.type] || doc.type,
      doc.updatedAt ? new Date(doc.updatedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—',
      String(doc.chunkCount == null ? '—' : doc.chunkCount)
    ];
    cells.forEach((text) => {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.appendChild(cell);
    });
    docsBody.appendChild(row);
  });
  docsStatus.textContent = documents.length ? '' : 'אין מסמכים פעילים.';
}

async function loadActiveDocs() {
  try {
    const res = await fetch(DOCS_API + '?action=list', { credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error('list failed');
    renderDocs(data.documents);
  } catch (err) {
    docsStatus.textContent = 'לא הצלחנו לטעון את רשימת המסמכים.';
  }
}
loadActiveDocs();
```

- [ ] **Step 5: Local preview server with fakes**

Create `test/dev-server.js`:

```js
// Local preview of /admin with FAKE back-end services (no network, no keys, nothing real is touched).
// Usage (from the project root):  node test/dev-server.js [success|verify-fail|process-fail]
// Then open http://localhost:3100/admin  (a signed dev session cookie is added to every request).
const http = require("http");

process.env.SESSION_SECRET = "dev-secret";
process.env.UPLOAD_TOKEN = "dev-token";

const { createSessionCookie } = require("../lib/session");
const adminHandler = require("../api/admin");
const { createHandler } = require("../api/docs");
const { createFakeDeps } = require("./fakes");

const scenario = process.argv[2] || "success";
const BAD_PRICES = { priceSourdough: 9999, priceRye: 36, priceChallah: 28, priceBurekas: 12, deliveryFee: 0 };

const fake = createFakeDeps({
  seedActive: [
    { doc_type: "pricelist", doc_key: "מחירון", file_name: "v1.md", chunk_count: 1, activated_at: "2026-10-06T19:00:00.000Z" },
    { doc_type: "other", file_name: "מידע ללקוחות.md", chunk_count: 2, activated_at: "2026-10-06T16:30:00.000Z" }
  ],
  parsePolls: [{ state: "running" }, { state: "running" }],
  prices: scenario === "verify-fail" ? BAD_PRICES : undefined,
  embedFail: scenario === "process-fail"
});
const docsHandler = createHandler(function () { return fake.deps; });
const sessionCookie = createSessionCookie("dev", "dev-secret").split(";")[0];

function decorate(res) {
  res.status = function (code) { res.statusCode = code; return res; };
  res.json = function (payload) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
    return res;
  };
  res.send = function (text) { res.end(text); return res; };
}

async function attachBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  const type = req.headers["content-type"] || "";
  req.body = type.includes("application/json") ? JSON.parse(raw.toString("utf8") || "{}") : raw;
}

http.createServer(async function (req, res) {
  decorate(res);
  const url = new URL(req.url, "http://localhost");
  req.query = Object.fromEntries(url.searchParams);
  req.headers.cookie = sessionCookie;
  try {
    if (url.pathname === "/admin") return adminHandler(req, res);
    if (url.pathname === "/api/docs") {
      if (req.method === "POST") await attachBody(req);
      return docsHandler(req, res);
    }
    res.status(404).end("not found");
  } catch (error) {
    res.status(500).end(String(error && error.message));
  }
}).listen(3100, function () {
  console.log("dev server (" + scenario + ") on http://localhost:3100/admin");
});
```

- [ ] **Step 6: Run the whole suite**

Run: `node --test "test/*.test.js"`
Expected: PASS (dev-server.js is not a test file; `node --test test/` only runs `*.test.js`).

- [ ] **Step 7: Check the UI in a browser (webapp-testing / Playwright MCP)**

Run in the background: `node test/dev-server.js success`. With Playwright: open `http://localhost:3100/admin`, resize to 390×844, then:
1. The active documents table shows 2 rows with dates and chunk counts.
2. Choose type "מחירון", upload `מחירונים/v1.md`, click "שליחה לעיבוד". Expect the 4 steps to go ממתין → רץ... → הושלם, then the green result "המסמך הוחלף בהצלחה — נשמרו 1 חתיכות", and the table to refresh (still 2 rows, pricelist date updated).
3. Upload `מחירונים/v1.pdf`-style file: any file named `x.pdf` (e.g. create a tiny text file renamed `x.pdf` in the scratchpad) with type "אחר". Expect the process step to stay "רץ..." for about 5 seconds (two fake "running" polls) and then complete.
4. Stop the server; restart with `node test/dev-server.js verify-fail`; upload `מחירונים/v1.md` as מחירון. Expect "בדיקה" marked ✗ נכשל, red box "ההחלפה נכשלה בשלב בדיקה ... שום דבר לא הוחלף ... הגרסה הקודמת נשארה פעילה", buttons "ניסיון נוסף" and "בחירה מחדש"; the table unchanged.
5. Restart with `process-fail`; upload any `.md` as אחר. Expect "עיבוד" ✗ with the generic Hebrew message (not "openai 500").
6. Invoice type: pick "חשבונית", the old flow is unchanged (sends to n8n; do NOT actually submit during this check, only verify the hint text and that the submit path is reachable).
7. Check at 390px and 1280px: no horizontal scroll, buttons at least 44px high, keyboard Tab order reaches all buttons with a visible focus ring.
Fix anything found, then stop the server.

- [ ] **Step 8: Checkpoint** — screenshots from this task are development checks only. The final evidence is captured in Task 10 against the real deployment.

---

### Task 9: Documentation and rollout checklist (needs the user)

**Files:**
- Modify: `CLAUDE.md`
- Create: `docs/rag-pipeline/README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: accurate project documentation and a numbered checklist the user follows.

- [ ] **Step 1: Update `CLAUDE.md`**

In the project structure block add after the `lib/session.js` line:

```
api/docs.js          /api/docs?action=upload|process|verify|activate|list — העלאת מחירון/מסמך "אחר" לחנות הידע עם החלפה בטוחה (דורש session)
lib/docs/            הלוגיקה של ההחלפה הבטוחה (pipeline, chunker, prices, לקוחות Supabase/OpenAI/LlamaParse)
docs/                תיעוד פנימי ובדיקות (חסום ב-vercel.json, לא מוגש לציבור): rag-pipeline (SQL), rag-test (מבחן הבוט), superpowers (תכנון)
test/                בדיקות node:test ושרת תצוגה מקומי עם שירותים מדומים (node --test test/)
```

Append to the section "מערכת המאפייה — כניסה מוגנת" a bullet list:

```
* **העלאת מחירון / "אחר" (החלפה בטוחה):** `private/admin.html` שולח ל-`/api/docs` (לא ל-n8n). ארבעה שלבים אמיתיים: קבלה, עיבוד (פענוח LlamaParse, חיתוך 1000/100, embeddings `text-embedding-3-small`, הכנסה ל-`documents_staging`), בדיקה (ספירת חתיכות, גודל embedding, ולמחירון כללי המחירים ובדיקה שכל מחיר מופיע בטקסט), החלפה (`activate_document_version` — טרנזקציה אחת שמעדכנת `documents` ו-`price_list` יחד). הבוט קורא רק מ-`documents`, ולכן אף פעם לא רואה גרסה שלא אומתה. בכישלון מוחקים את שורות ה-staging והגרסה הקודמת נשארת. חשבוניות עדיין עוברות ל-n8n.
* **משתני סביבה ב-Vercel (בנוסף לקיימים):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `LLAMAPARSE_API_KEY`, `OPENAI_MODEL` (מודל חילוץ המחירים). אסור לכתוב אותם בקוד או ב-git. ה-SQL נמצא ב-`docs/rag-pipeline/schema.sql` ומורץ ידנית ב-SQL Editor.
* הצמתים של מחירון ו"אחר" ב-workflow "פענוח חשבוניות" ב-n8n כבר לא נקראים מהמסך; אין למחוק אותם בלי לשאול.
```

- [ ] **Step 2: Write the rollout README**

Create `docs/rag-pipeline/README.md`:

```markdown
# Rollout checklist (done by the project owner)

1. Supabase (project "Lechem Veshemesh") → SQL Editor → paste `schema.sql` → Run. Expect "Success".
2. Same editor → paste `schema-test.sql` → Run. Expect NOTICE lines PASS 1 … PASS 5 (nothing is saved, it ends with ROLLBACK). If it errors, run `rollback;` and send the error text.
3. Vercel → Project → Settings → Environment Variables (Production and Preview): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the service_role key), `OPENAI_API_KEY`, `LLAMAPARSE_API_KEY`, `OPENAI_MODEL`. Never paste them into code, chat or git.
4. Deploy (push to the connected branch) and open `/admin`: the active documents table should show the documents that were already in the bot's knowledge base.
5. Upload `מחירונים/v1.md` as "מחירון": the four steps finish and the table shows the new date.
```

- [ ] **Step 3: Hand the user items 1–3** (SQL and environment variables are the only things only the user can do). Wait for confirmation before Task 10.

- [ ] **Step 4: Checkpoint.**

---

### Task 10: Live verification and homework evidence

**Files:**
- Create: `מחירונים/v5-invalid.md` (a pricelist with an invalid price, for the failure screenshot)
- Create: `docs/rag-test/evidence/*.png`

**Interfaces:**
- Consumes: the deployed site, the user's logged-in browser session.

- [ ] **Step 1: Create the invalid pricelist fixture**

Create `מחירונים/v5-invalid.md`:

```markdown
# מחירון לחם ושמש – גרסה 5 (לבדיקת כישלון בלבד)

## מחירי מוצרים

| מוצר | מחיר | הערה |
|---|---|---|
| לחם כפרי מחמצת | 9999 ₪ | |
| לחם שיפון | 36 ₪ | |
| חלה | 28 ₪ | זמינה בימי שישי בלבד |
| בורקס גבינה | 12 ₪ | ליחידה |
```

- [ ] **Step 2: Log in** — open the deployed `/admin` in the Playwright browser and ask the user to type the credentials in that window (never ask for or read them).

- [ ] **Step 3: Success evidence** — upload `מחירונים/v1.md` as מחירון. Screenshot the four ✓ steps and the "נשמרו N חתיכות" message to `docs/rag-test/evidence/01-success.png`. Also upload `מידע לסוכן/מידע ללקוחות.md` as אחר (baseline for the bot test).

- [ ] **Step 4: Failure evidence** — upload `מחירונים/v5-invalid.md` as מחירון. Expected: "בדיקה" ✗, message "…שום דבר לא הוחלף…", "הגרסה הקודמת נשארה פעילה". Screenshot to `02-failure-midway.png`. Then prove nothing changed: reload `/admin`, screenshot the active documents table (the pricelist row still shows v1 and its earlier date) to `03-active-documents.png`, and check the live site `/` still shows the v1 prices (32/36/28/12).

- [ ] **Step 5: Evidence of staging cleanup** — ask the user to run in the SQL Editor: `select count(*) from documents_staging;` Expected `0`; and `select status, error_step, file_name from document_versions order by created_at desc limit 5;` Expected: the failed row `v5-invalid.md` with `error_step = verify`. Save the result text in `docs/rag-test/evidence/04-staging-empty.txt`.

- [ ] **Step 6: Checkpoint.**

---

### Task 11: Bot test (10 questions, two sets, logs)

**Files:**
- Create: `docs/rag-test/questions.md` (written BEFORE any run)
- Create: `docs/rag-test/results.md`

**Interfaces:**
- Consumes: the n8n workflow "סוכן מאפייה – לחם ושמש" (`T07EX0e61OXuGTyy`) through the n8n MCP, and the upload screen for the two sets.

- [ ] **Step 1: Write the questions with the expected answers first**

Create `docs/rag-test/questions.md`:

```markdown
# מבחן הבוט — שאלות ותשובות נכונות (נכתב לפני ההרצה)

סט 1 = מידע ללקוחות + מחירון v1. סט 2 = מידע ללקוחות + מחירון v2 (מחירים +1, דמי משלוח 8 ₪).

| # | שאלה | תשובה נכונה בסט 1 | תשובה נכונה בסט 2 |
|---|---|---|---|
| 1 | כמה עולה לחם כפרי מחמצת? | 32 ₪ | 33 ₪ |
| 2 | כמה עולה לחם שיפון? | 36 ₪ | 37 ₪ |
| 3 | כמה עולה חלה, ומתי היא זמינה? | 28 ₪, בימי שישי בלבד | 29 ₪, בימי שישי בלבד |
| 4 | כמה עולה בורקס גבינה? | 12 ₪ ליחידה | 13 ₪ ליחידה |
| 5 | כמה עולים דמי המשלוח? | אין מידע במסמכים ("אין לי את המידע הזה") | 8 ₪ להזמנה |
| 6 | מה מינימום ההזמנה? | 40 ₪ | 40 ₪ |
| 7 | עד מתי צריך להזמין כדי לקבל למחרת בבוקר? | עד 20:00 בערב שלפני | עד 20:00 בערב שלפני |
| 8 | האם אתם מגיעים עם משלוח לרחוב ביאליק? | כן | כן |
| 9 | איך משלמים? | בדלת, במזומן או בהעברה. אין תשלום מקוון | זהה |
| 10 | האם יש לכם לחם ללא גלוטן? | אין מידע ("אין לי את המידע הזה. אפשר לפנות למאפייה ישירות.") | זהה |

שאלה 10 היא השאלה שאין לה תשובה במסמכים בשני הסטים. שאלה 5 משתנה בין הסטים בכוונה (בסט 1 אין דמי משלוח במסמכים).
```

- [ ] **Step 2: Baseline** — confirm via the list in `/admin` that the active documents are exactly `v1.md` (מחירון) and `מידע ללקוחות.md` (Task 10 steps 3).

- [ ] **Step 3: Run set 1** — for each question call `mcp__claude_ai_n8n__execute_workflow` on `T07EX0e61OXuGTyy` with `triggerNodeName: "When chat message received"` and `inputs: { chatInput: <question>, sessionId: "test-set1-q<N>" }`. If the tool ignores `sessionId`, the agent's 6-message memory would leak between questions: in that case verify from the execution data that each run had an empty chat history, otherwise ask the user to run each question from the site chat in a fresh browser tab. Record the answer and the execution id.

- [ ] **Step 4: Pull the logs** — for every run use `get_workflow_execution` to read what `bakery_knowledge` was called with (the search text) and the chunks it returned. Keep the search text and a one-line summary of the returned chunks for each wrong answer.

- [ ] **Step 5: Change the price** — upload `מחירונים/v2.md` as מחירון through the screen (all four steps ✓). Verify the active list shows the new date and the live site shows 33/37/29/13 and delivery fee 8 within about a minute.

- [ ] **Step 6: Run set 2** — repeat Steps 3–4 with `sessionId: "test-set2-q<N>"`.

- [ ] **Step 7: Write `docs/rag-test/results.md`** with the table: שאלה | תשובה נכונה (סט 1 / סט 2) | תשובת הבוט לפני | תשובת הבוט אחרי | מה הבוט חיפש | מה קיבל (לכל טעות), a verdict column (✓ / ✗), and two lines of summary (how many correct before and after; what the errors had in common). Report failures honestly, including a stale answer after the price change.

- [ ] **Step 8: Checkpoint** — the table is done; the user writes the submission email themselves.

---

## Self-review

**Spec coverage** (spec section → task): §4 data model → Task 1; §5 API (upload/process/verify/activate/list, failure cleanup, sweep, session auth, maxDuration) → Tasks 4–7, 1; §6 UI (steps, success only after activate, failure with step and previous-kept, active table, 44px, no double submit) → Task 8; §7 security → Tasks 6–7 (env only, session-gated, no key in errors tested in `clients.test.js`); §8 tests and evidence → Tasks 2–8 and 10; §9 bot test → Task 11; §10 rollout order → Task 9; CLAUDE.md update → Task 9; `/docs` 404 → Task 1. Two details beyond the spec text and now part of the design: the `stage` column (enforces receive → process → verify → activate order) and `/lib`, `/test` added to the 404 route.

**Placeholder scan:** none left.

**Type consistency:** `deps.db` method names match across `fakes.js`, `pipeline.js`, `db.js` and the clients test; `{ state, chunkCount }`, `{ ok, chunkCount }`, `documents[].{id,name,type,chunkCount,updatedAt}` match between pipeline, handler tests, and UI; step keys `receive|process|verify|activate` match across pipeline, handler, UI; `extracted` raw (camelCase) at process time, normalized snake_case after verify, which is what `activate_document_version` reads.
