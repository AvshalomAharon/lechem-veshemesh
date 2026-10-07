// Supabase PostgREST client (service role, server only) implementing deps.db.
const STAGING_BATCH = 50;

function createDb(baseUrl, serviceKey, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const root = String(baseUrl).replace(/\/+$/, "") + "/rest/v1";

  // The legacy service_role key is a JWT and goes in both headers. The new sb_secret_ keys are not JWTs:
  // they go only in the apikey header (the gateway adds the authorization itself).
  const authHeaders = String(serviceKey).startsWith("sb_")
    ? { apikey: serviceKey }
    : { apikey: serviceKey, Authorization: "Bearer " + serviceKey };

  async function request(method, pathAndQuery, body, extraHeaders) {
    const response = await doFetch(root + pathAndQuery, {
      method: method,
      headers: Object.assign({}, authHeaders, { "Content-Type": "application/json" }, extraHeaders),
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
