const test = require("node:test");
const assert = require("node:assert/strict");

process.env.ADMIN_USER = "owner";
process.env.ADMIN_PASSWORD = "correct-horse";
process.env.SESSION_SECRET = "test-secret";

const loginHandler = require("../api/login");

const NOTIFY_URL = "https://avshalom.app.n8n.cloud/webhook/admin-login-success";
let ipCounter = 0;

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

function loginRequest(password) {
  ipCounter += 1;
  return {
    method: "POST",
    headers: { "x-forwarded-for": "10.0.0." + ipCounter, "user-agent": "UA-TEST Chrome/120" },
    body: { username: "owner", password: password }
  };
}

function withFetch(fakeFetch, run) {
  const original = global.fetch;
  global.fetch = fakeFetch;
  return Promise.resolve(run()).finally(function () { global.fetch = original; });
}

test("a successful login notifies n8n once, with the browser's user agent, and still logs in", async function () {
  const calls = [];
  await withFetch(async function (url, init) {
    calls.push({ url: String(url), init: init });
    return { ok: true, status: 200 };
  }, async function () {
    const res = fakeRes();
    await loginHandler(loginRequest("correct-horse"), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.match(String(res.headers["Set-Cookie"]), /ls_session=/);
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, NOTIFY_URL);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(JSON.parse(calls[0].init.body).userAgent, "UA-TEST Chrome/120");
});

test("the notification never contains the username, the password or the IP", async function () {
  let sent = "";
  await withFetch(async function (url, init) {
    sent = String(init.body);
    return { ok: true, status: 200 };
  }, async function () {
    await loginHandler(loginRequest("correct-horse"), fakeRes());
  });
  assert.doesNotMatch(sent, /owner|correct-horse|10\.0\.0\./);
});

test("a failed login sends no notification", async function () {
  let calls = 0;
  await withFetch(async function () { calls += 1; return { ok: true }; }, async function () {
    const res = fakeRes();
    await loginHandler(loginRequest("wrong-password"), res);
    assert.equal(res.statusCode, 401);
  });
  assert.equal(calls, 0);
});

test("if the notification request fails, the login still succeeds", async function () {
  await withFetch(async function () { throw new Error("n8n is down"); }, async function () {
    const res = fakeRes();
    await loginHandler(loginRequest("correct-horse"), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.match(String(res.headers["Set-Cookie"]), /ls_session=/);
  });
});

test("if the notification hangs, the login is not held up for more than a few seconds", async function () {
  const started = Date.now();
  await withFetch(function (url, init) {
    return new Promise(function (resolve, reject) {
      init.signal.addEventListener("abort", function () { reject(new Error("aborted")); });
    });
  }, async function () {
    const res = fakeRes();
    await loginHandler(loginRequest("correct-horse"), res);
    assert.equal(res.statusCode, 200);
  });
  assert.ok(Date.now() - started < 4000, "login waited too long: " + (Date.now() - started));
});
