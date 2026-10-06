// Reads an environment variable by name in upper case (ADMIN_USER) or lower case (admin_user),
// so it works whichever way the name was typed in the Vercel dashboard.
function getEnv(name) {
  return process.env[name.toUpperCase()] || process.env[name.toLowerCase()] || "";
}

module.exports = { getEnv };
