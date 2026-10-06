import test from "node:test";
import assert from "node:assert/strict";
import { generateExplanation, getCustomOriginPattern, getProviderProfiles, listProviderModels, normalizeCustomBaseUrl } from "../src/providers.js";

test("custom service settings preserve manual models, names and API format independently", () => {
  const custom = { name: "My server", baseUrl: "http://localhost:1234/v1", apiKey: "", model: "local/model:latest", apiFormat: "responses", cachedModels: ["local/model:latest"] };
  const profiles = getProviderProfiles({ geminiApiKey: "legacy-key", providerSettings: { custom } });
  assert.deepEqual(profiles.custom, custom);
  assert.equal(profiles.gemini.apiKey, "legacy-key");
  assert.equal(profiles.openai.apiKey, "");
  const empty = getProviderProfiles({}).custom;
  assert.equal(empty.baseUrl, "");
  assert.equal(empty.model, "");
  assert.equal(empty.apiFormat, "chat");
});

test("custom base URL keeps paths and ports while permissions cover only its host", () => {
  assert.equal(normalizeCustomBaseUrl(" https://service.example/proxy/v1/// "), "https://service.example/proxy/v1");
  assert.equal(normalizeCustomBaseUrl("http://localhost:1234/v1/"), "http://localhost:1234/v1");
  assert.equal(getCustomOriginPattern("http://127.0.0.1:1234/v1"), "http://127.0.0.1/*");
  assert.equal(getCustomOriginPattern("https://service.example/proxy/v1"), "https://service.example/*");
  for (const url of ["", "service.example", "file:///tmp/key", "javascript:alert(1)", "https://key@service.example/v1", "https://service.example/v1?api_key=secret", "https://service.example/v1#secret"]) {
    assert.throws(() => normalizeCustomBaseUrl(url), /INVALID_CUSTOM_URL/);
  }
});

test("custom Chat Completions and Responses support arbitrary model IDs and optional keys", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const apiFormat of ["chat", "responses"]) {
      for (const apiKey of ["", "custom-test-key"]) {
        let request;
        globalThis.fetch = async (url, options) => {
          request = { url, ...options, body: JSON.parse(options.body) };
          return { ok: true, json: async () => apiFormat === "chat"
            ? { choices: [{ message: { content: "Meaning: A local answer." } }] }
            : { output: [{ type: "message", content: [{ type: "output_text", text: "Meaning: A local answer." }] }] } };
        };
        assert.equal(await generateExplanation({ provider: "custom", baseUrl: "http://localhost:1234/proxy/v1/", apiFormat, apiKey, model: "org/model:latest", promptText: "test prompt" }), "Meaning: A local answer.");
        assert.equal(request.url, `http://localhost:1234/proxy/v1/${apiFormat === "chat" ? "chat/completions" : "responses"}`);
        assert.equal(request.headers.Authorization, apiKey ? `Bearer ${apiKey}` : undefined);
        assert.equal(request.body.model, "org/model:latest");
        assert.equal(request.body[apiFormat === "chat" ? "messages" : "input"]?.[0]?.content || request.body.input, "test prompt");
        assert.equal(request.credentials, "omit");
        assert.equal(request.redirect, "error");
        assert.equal(request.body.thinking, undefined);
      }
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("custom model discovery accepts provider-specific IDs and invalid settings make no requests", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async (url, options) => {
      requests++;
      assert.equal(url, "https://service.example/api/v1/models");
      assert.equal(options.method, "GET");
      return { ok: true, json: async () => ({ data: [{ id: "qwen/custom" }, { id: "local:latest" }, { id: "qwen/custom" }, { id: " " }, {}] }) };
    };
    assert.deepEqual(await listProviderModels({ provider: "custom", baseUrl: "https://service.example/api/v1/", apiKey: "" }), ["local:latest", "qwen/custom"]);
    assert.equal(requests, 1);
    await assert.rejects(listProviderModels({ provider: "custom", baseUrl: "https://secret@service.example" }), /INVALID_CUSTOM_URL/);
    await assert.rejects(generateExplanation({ provider: "custom", baseUrl: "https://service.example/v1", model: "" }), /CUSTOM_MODEL_REQUIRED/);
    assert.equal(requests, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("background uses the saved custom address, enforces host access and separates server/format caches", async () => {
  const originalFetch = globalThis.fetch;
  let listener;
  let allowed = true;
  const origins = [];
  const requests = [];
  const profile = { baseUrl: "http://localhost:1234/v1", apiFormat: "chat", model: "local-model", apiKey: "" };
  const stored = { aiProvider: "custom", readingLevelConfirmed: true, cefrLevel: "B2", providerSettings: { custom: profile } };
  globalThis.chrome = {
    storage: { local: { get: async () => structuredClone(stored) } },
    permissions: { contains: async (permission) => { origins.push(permission.origins); return allowed; } },
    runtime: {
      onMessage: { addListener: (handler) => { listener = handler; } },
      onInstalled: { addListener() {} }, openOptionsPage: async () => {},
      getURL: (path) => `chrome-extension://test/${path}`,
    },
    action: { onClicked: { addListener() {} } },
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, ...options });
    return { ok: true, json: async () => ({
      data: [{ id: "local-model" }],
      choices: [{ message: { content: "Meaning: A local answer." } }],
      output: [{ type: "message", content: [{ type: "output_text", text: "Meaning: A local answer." }] }],
    }) };
  };
  try {
    await import("../src/background.js?custom-tests");
    const send = (message, sender = {}) => new Promise((resolve) => listener(message, sender, resolve));
    const message = { type: "ULW_GENERATE_EXPLANATION", selectionText: "test", baseUrl: "https://untrusted.example/v1" };
    assert.equal((await send(message)).ok, true);
    assert.equal(requests[0].url, "http://localhost:1234/v1/chat/completions");
    assert.deepEqual(origins[0], ["http://localhost/*"]);
    assert.equal((await send(message)).cached, true);
    profile.baseUrl = "http://localhost:5678/other/v1";
    assert.equal((await send(message)).cached, false);
    assert.equal(requests[1].url, "http://localhost:5678/other/v1/chat/completions");
    profile.apiFormat = "responses";
    assert.equal((await send(message)).cached, false);
    assert.ok(requests[2].url.endsWith("/responses"));
    assert.equal((await send(message)).cached, true);
    allowed = false;
    assert.equal((await send(message)).error, "CUSTOM_ACCESS_REQUIRED");
    assert.equal(requests.length, 3);
    const list = { type: "ULW_LIST_MODELS", provider: "custom", baseUrl: profile.baseUrl, apiKey: "" };
    const optionsSender = { url: "chrome-extension://test/src/options.html" };
    assert.equal((await send(list, { url: "https://untrusted.example" })).error, "OPTIONS_PAGE_REQUIRED");
    assert.equal((await send(list, optionsSender)).error, "CUSTOM_ACCESS_REQUIRED");
    assert.equal(requests.length, 3);
    allowed = true;
    assert.deepEqual((await send(list, optionsSender)).models, ["local-model"]);
    profile.model = "";
    assert.equal((await send(message)).error, "CUSTOM_MODEL_REQUIRED");
    assert.equal(requests.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.chrome;
  }
});
