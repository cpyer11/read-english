import test from "node:test";
import assert from "node:assert/strict";
import { PROVIDERS, getProvider, getProviderProfiles, generateExplanation, listProviderModels } from "../src/providers.js";

test("legacy Gemini settings migrate and provider profiles remain independent", () => {
  const profiles = getProviderProfiles({ geminiApiKey: "old-key", geminiModel: "models/gemini-custom", cachedModels: ["gemini-custom"] });
  assert.equal(profiles.gemini.apiKey, "old-key");
  assert.equal(profiles.gemini.model, "gemini-custom");
  assert.deepEqual(profiles.gemini.cachedModels, ["gemini-custom"]);
  for (const provider of ["claude", "openai", "deepseek", "grok"]) assert.equal(profiles[provider].apiKey, "");
  const updated = getProviderProfiles({
    geminiApiKey: "old-key",
    providerSettings: { gemini: { apiKey: "", model: "gemini-2.5-flash" }, claude: { apiKey: "claude-key", model: "claude-test" } },
  });
  assert.equal(updated.gemini.apiKey, ""); // A cleared key must not reappear from legacy storage.
  assert.equal(updated.claude.apiKey, "claude-key");
  assert.throws(() => getProvider("__proto__"), /INVALID_PROVIDER/);
});

test("each provider uses its own generation URL, headers, schema, and text parser", async () => {
  const originalFetch = globalThis.fetch;
  const results = {
    gemini: { candidates: [{ content: { parts: [{ text: "hidden thought", thought: true }, { text: "Meaning: Hello." }] } }] },
    claude: { content: [{ type: "thinking", thinking: "hidden thought" }, { type: "text", text: "Meaning: Hello." }] },
    openai: { output: [{ type: "reasoning", summary: [] }, { type: "message", content: [{ type: "output_text", text: "Meaning: Hello." }] }] },
    deepseek: { choices: [{ message: { content: "Meaning: Hello.", reasoning_content: "hidden thought" } }] },
    grok: { choices: [{ message: { content: "Meaning: Hello." } }] },
  };
  try {
    for (const provider of Object.keys(PROVIDERS).filter((provider) => provider !== "custom")) {
      let request;
      globalThis.fetch = async (url, options) => {
        request = { url, ...options, body: JSON.parse(options.body) };
        return { ok: true, json: async () => results[provider] };
      };
      assert.equal(await generateExplanation({ provider, apiKey: `${provider}-test-key`, model: PROVIDERS[provider].defaultModel, promptText: "explain this" }), "Meaning: Hello.");
      assert.ok(request.url.startsWith(PROVIDERS[provider].baseUrl));
      assert.equal(request.credentials, "omit");
      assert.equal(request.headers[provider === "gemini" ? "x-goog-api-key" : provider === "claude" ? "x-api-key" : "Authorization"],
        provider === "gemini" || provider === "claude" ? `${provider}-test-key` : `Bearer ${provider}-test-key`);
      if (provider === "gemini") {
        assert.ok(request.url.endsWith(":generateContent"));
        assert.equal(request.body.contents[0].parts[0].text, "explain this");
      } else if (provider === "openai") {
        assert.ok(request.url.endsWith("/responses"));
        assert.equal(request.body.input, "explain this");
        assert.equal(request.body.store, false);
      } else {
        assert.ok(request.url.endsWith(provider === "claude" ? "/messages" : "/chat/completions"));
        assert.equal(request.body.messages[0].content, "explain this");
      }
      if (provider === "claude") assert.equal(request.headers["anthropic-version"], "2023-06-01");
      if (provider === "deepseek") assert.deepEqual(request.body.thinking, { type: "disabled" });
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("model discovery filters non-text models and follows Gemini/Claude pagination", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const provider of Object.keys(PROVIDERS).filter((provider) => provider !== "custom")) {
      const requests = [];
      const id = PROVIDERS[provider].defaultModel;
      globalThis.fetch = async (url, options) => {
        requests.push({ url, ...options });
        const firstPage = requests.length === 1;
        const data = provider === "gemini" ? {
          models: [
            { name: `models/${id}`, supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-test-image", supportedGenerationMethods: ["generateContent"] },
            { name: "models/embedding", supportedGenerationMethods: ["embedContent"] },
          ],
          ...(firstPage ? { nextPageToken: "next-page" } : {}),
        } : {
          data: [{ id }, { id: "embedding-test" }, { id: "gpt-audio-test" }, { id: "grok-imagine-image" }],
          ...(provider === "claude" && firstPage ? { has_more: true, last_id: "next-page" } : {}),
        };
        return { ok: true, json: async () => data };
      };
      assert.deepEqual(await listProviderModels({ provider, apiKey: "test-key" }), [id]);
      assert.equal(requests.length, ["gemini", "claude"].includes(provider) ? 2 : 1);
      if (requests.length === 2) assert.ok(requests[1].url.includes("next-page"));
      assert.ok(requests[0].url.startsWith(PROVIDERS[provider].baseUrl));
      assert.equal(requests[0].method, "GET");
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("API failures, missing credentials and empty answers are actionable and do not leak error bodies", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const args = { provider: "openai", apiKey: "test-key", promptText: "test" };
    globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => "secret test-key" });
    await assert.rejects(generateExplanation(args), { message: "PROVIDER_HTTP_401" });
    await assert.rejects(listProviderModels({ provider: "openai", apiKey: "" }), /MISSING_API_KEY/);
    await assert.rejects(listProviderModels({ provider: "unknown", apiKey: "test-key" }), /INVALID_PROVIDER/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ output: [] }) });
    await assert.rejects(generateExplanation(args), /PROVIDER_EMPTY_RESPONSE/);
  } finally { globalThis.fetch = originalFetch; }
});
