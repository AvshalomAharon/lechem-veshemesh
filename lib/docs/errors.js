// Errors from the outside services carry a `detail` text (service, request, status) that never contains keys.
// api/docs.js shows it to the logged-in admin, so a failure can be diagnosed without opening server logs.
function detailedError(message) {
  const error = new Error(message);
  error.detail = message;
  return error;
}

module.exports = { detailedError };
