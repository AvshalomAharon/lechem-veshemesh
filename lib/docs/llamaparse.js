// LlamaParse v2 (same service and settings as the n8n invoice workflow): upload a file, then poll the job.
const { detailedError } = require("./errors");

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
      if (!response.ok) throw detailedError("llamaparse upload " + response.status);
      const data = await response.json();
      return data.id;
    },
    async poll(jobId) {
      if (!apiKey) throw missingKeyError();
      const response = await doFetch(BASE_URL + "/" + encodeURIComponent(jobId) + "?expand=markdown", {
        headers: { Authorization: "Bearer " + apiKey }
      });
      if (!response.ok) throw detailedError("llamaparse status " + response.status);
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
