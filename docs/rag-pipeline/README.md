# Rollout checklist (done by the project owner)

1. Supabase (project "Lechem Veshemesh") → SQL Editor → paste `schema.sql` → Run. Expect "Success".
2. Same editor → paste `schema-test.sql` → Run. Expect NOTICE lines PASS 1 … PASS 5 (nothing is saved, it ends with ROLLBACK). If it errors, run `rollback;` and send the error text.
3. Vercel → Project → Settings → Environment Variables (Production and Preview): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the service_role key), `OPENAI_API_KEY`, `LLAMAPARSE_API_KEY`, `OPENAI_MODEL`. Never paste them into code, chat or git.
4. Deploy (push to the connected branch) and open `/admin`: the active documents table should show the documents that were already in the bot's knowledge base.
5. Upload `מחירונים/v1.md` as "מחירון": the four steps finish and the table shows the new date.

Local checks (no keys needed): `node --test "test/*.test.js"`, and `node test/dev-server.js [success|verify-fail|process-fail]` for a preview of `/admin` with fake services on http://localhost:3100/admin.
