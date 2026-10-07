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
