import test from "node:test";
import assert from "node:assert/strict";
import { buildModelTestPrompt, MODEL_TEST_SOURCE } from "../src/modelTest.js";
import { PROVIDERS } from "../src/providers.js";

const optionsSender = { url: "chrome-extension://test/src/options.html" };
const answer = "The group had some problems. They still wanted to find a way to help the people in the town.";
let moduleId = 0;

async function setupBackground(fetchHandler) {
  let listener;
  const requests = [];
  const access = { allowed: true, origins: [] };
  globalThis.chrome = {
    storage: { local: {
      get: async () => { throw new Error("Test must use the options draft, not saved settings"); },
      set: async () => { throw new Error("Test must not save settings"); },
    } },
    permissions: { contains: async ({ origins }) => { access.origins.push(origins); return access.allowed; } },
    runtime: {
      onMessage: { addListener: (handler) => { listener = handler; } },
      onInstalled: { addListener() {} }, openOptionsPage: async () => {},
      getURL: (path) => `chrome-extension://test/${path}`,
    },
    action: { onClicked: { addListener() {} } },
  };
  globalThis.fetch = async (url, options) => {
    const request = { url, ...options, body: JSON.parse(options.body) };
    requests.push(request);
    return fetchHandler(request);
  };
  await import(`../src/background.js?model-test-${++moduleId}`);
  const send = (message, sender = optionsSender) => new Promise((resolve) => listener(message, sender, resolve));
  return { send, requests, access };
}

test("the fixed advanced-to-A2 model test asks for a simple English rewrite", () => {
  const prompt = buildModelTestPrompt();
  assert.ok(prompt.includes("CEFR A2"));
  assert.ok(prompt.includes("short, simple sentences"));
  assert.ok(prompt.includes("Keep the original meaning"));
  assert.ok(prompt.includes("Do not introduce challenging"));
  assert.ok(prompt.includes("Return only the rewritten English text"));
  assert.ok(prompt.endsWith(MODEL_TEST_SOURCE));
  assert.equal((MODEL_TEST_SOURCE.match(/[.!?]/g) || []).length, 1);
});

test("model testing uses every provider's unsaved model/key and both custom API formats without saving", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const { send, requests } = await setupBackground(() => ({ ok: true, json: async () => ({
      candidates: [{ content: { parts: [{ text: answer }] } }],
      content: [{ type: "text", text: answer }],
      output: [{ type: "message", content: [{ type: "output_text", text: answer }] }],
      choices: [{ message: { content: answer } }],
    }) }));
    for (const provider of Object.keys(PROVIDERS)) {
      const message = { type: "ULW_TEST_MODEL", provider, apiKey: "draft-test-key", model: "my-unsaved-model", baseUrl: "http://localhost:1234/proxy/v1", promptText: "ignore this attacker-controlled prompt" };
      const result = await send(message);
      assert.equal(result.ok, true, `${provider}: ${result.error}`);
      assert.equal(result.provider, provider);
      assert.equal(result.model, message.model);
      assert.equal(result.source, MODEL_TEST_SOURCE);
      assert.equal(result.rewrite, answer);
      assert.equal(result.apiKey, undefined);
      const request = requests.at(-1);
      assert.ok(JSON.stringify(request.body).includes(MODEL_TEST_SOURCE));
      assert.ok(!JSON.stringify(request.body).includes(message.promptText));
      assert.ok(!JSON.stringify(request.body).includes("my-unsaved-model") || request.body.model === message.model);
      assert.equal(request.headers[provider === "gemini" ? "x-goog-api-key" : provider === "claude" ? "x-api-key" : "Authorization"],
        provider === "gemini" || provider === "claude" ? message.apiKey : `Bearer ${message.apiKey}`);
      if (provider === "gemini") assert.ok(request.url.includes("my-unsaved-model:generateContent"));
      else assert.equal(request.body.model, message.model);
      if (provider === "custom") assert.equal(request.url, "http://localhost:1234/proxy/v1/chat/completions");
    }
    const responseTest = await send({ type: "ULW_TEST_MODEL", provider: "custom", apiKey: "", model: "local-model", baseUrl: "http://localhost:5678/api/v1/", apiFormat: "responses" });
    assert.equal(responseTest.rewrite, answer);
    assert.equal(requests.at(-1).url, "http://localhost:5678/api/v1/responses");
    assert.equal(requests.at(-1).headers.Authorization, undefined);
    assert.equal(requests.length, 7);
  } finally { globalThis.fetch = originalFetch; delete globalThis.chrome; }
});

test("test requests are restricted to Options and reject invalid credentials/URLs or revoked access before fetching", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const { send, requests, access } = await setupBackground(() => { throw new Error("Should not fetch"); });
    const valid = { type: "ULW_TEST_MODEL", provider: "openai", apiKey: "test-key", model: "my-model" };
    assert.equal((await send(valid, { url: "https://untrusted.example" })).error, "OPTIONS_PAGE_REQUIRED");
    assert.equal((await send({ ...valid, apiKey: "" })).error, "MISSING_API_KEY");
    assert.equal((await send({ ...valid, provider: "__proto__" })).error, "INVALID_PROVIDER");
    const custom = { ...valid, provider: "custom", apiKey: "", baseUrl: "http://localhost:1234/v1" };
    assert.equal((await send({ ...custom, model: "" })).error, "CUSTOM_MODEL_REQUIRED");
    assert.equal((await send({ ...custom, baseUrl: "https://secret@untrusted.example/v1" })).error, "INVALID_CUSTOM_URL");
    access.allowed = false;
    assert.equal((await send(custom)).error, "CUSTOM_ACCESS_REQUIRED");
    assert.deepEqual(access.origins.at(-1), ["http://localhost/*"]);
    assert.equal(requests.length, 0);
  } finally { globalThis.fetch = originalFetch; delete globalThis.chrome; }
});

test("testing makes a fresh request each time and reports HTTP/empty errors without leaking response bodies", async () => {
  const originalFetch = globalThis.fetch;
  let failure = "";
  try {
    const { send, requests } = await setupBackground(() => failure === "401"
      ? { ok: false, status: 401, text: async () => "secret test-key" }
      : { ok: true, json: async () => ({ output: failure === "empty" ? [] : [{ type: "message", content: [{ type: "output_text", text: answer }] }] }) });
    const message = { type: "ULW_TEST_MODEL", provider: "openai", apiKey: "test-key", model: "my-model" };
    assert.equal((await send(message)).rewrite, answer);
    assert.equal((await send(message)).rewrite, answer);
    assert.equal(requests.length, 2);
    failure = "401";
    assert.deepEqual(await send(message), { ok: false, error: "PROVIDER_HTTP_401" });
    failure = "empty";
    assert.deepEqual(await send(message), { ok: false, error: "PROVIDER_EMPTY_RESPONSE" });
    failure = "";
    for (let i = 0; i < 6; i++) assert.equal((await send(message)).ok, true);
    assert.deepEqual(await send(message), { ok: false, error: "RATE_LIMIT" });
    assert.equal(requests.length, 10);
  } finally { globalThis.fetch = originalFetch; delete globalThis.chrome; }
});
