import test from "node:test";
import assert from "node:assert/strict";
import { CEFR_LEVELS, buildPrompt, normalizeLevel } from "../src/learningLevel.js";
import { READING_SAMPLES } from "../src/readingSamples.js";

test("six offline reading samples cover A1–C2 at about 200 words", () => {
  assert.deepEqual(READING_SAMPLES.map((sample) => sample.level), CEFR_LEVELS);
  for (const sample of READING_SAMPLES) {
    const count = sample.text.trim().split(/\s+/).length;
    assert.ok(count >= 180 && count <= 220, `${sample.level}: ${count} words`);
    assert.ok(sample.title && sample.text.includes("\n\n"));
  }
});

test("all six levels use the fixed 80/20 balance with support for new expressions", () => {
  for (const cefrLevel of CEFR_LEVELS) {
    const prompt = buildPrompt({ selectionText: "give it a try", cefrLevel });
    assert.ok(prompt.includes(`anchored at ${cefrLevel}`));
    assert.ok(prompt.includes(`about 80% vocabulary and expressions familiar at CEFR ${cefrLevel}`));
    assert.ok(prompt.includes("about 20% slightly new expressions"));
    assert.ok(prompt.includes("Support every new expression"));
    assert.ok(prompt.includes("approximate target"));
    assert.ok(prompt.includes("do not move it up a whole CEFR level"));
    assert.ok(prompt.endsWith("give it a try"));
  }
  const legacy = buildPrompt({ selectionText: "test", cefrLevel: "B2", smallChallenge: false });
  assert.equal(legacy, buildPrompt({ selectionText: "test", cefrLevel: "B2" }));
  assert.ok(buildPrompt({ selectionText: "test", cefrLevel: "C2" }).includes("finer nuances"));
  assert.equal(normalizeLevel("C3"), "B1");
});

test("background applies 80/20 despite legacy flags and separates reading-level caches", async () => {
  let messageListener;
  let installListener;
  let actionListener;
  let opens = 0;
  const stored = { cefrLevel: "B2", geminiApiKey: "test-key", geminiModel: "test-model", smallChallenge: false };
  const requests = [];
  globalThis.chrome = {
    storage: { local: { get: async (defaults) => ({ ...defaults, ...stored }) } },
    runtime: {
      onMessage: { addListener: (listener) => { messageListener = listener; } },
      onInstalled: { addListener: (listener) => { installListener = listener; } },
      openOptionsPage: async () => { opens++; },
      getURL: (path) => `chrome-extension://test/${path}`,
    },
    action: { onClicked: { addListener: (listener) => { actionListener = listener; } } },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    if (options.method === "GET") return { ok: true, json: async () => ({
      models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }],
    }) };
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({
      candidates: [{ content: { parts: [{ text: "Meaning: Try something.\nExample: Give it a try." }] } }],
      output: [{ type: "message", content: [{ type: "output_text", text: "Meaning: Try something.\nExample: Give it a try." }] }],
    }) };
  };
  try {
    await import("../src/background.js");
    const send = (message, sender = {}) => new Promise((resolve) => {
      assert.equal(messageListener(message, sender, resolve), true);
    });
    const message = { type: "ULW_GENERATE_EXPLANATION", selectionText: "give it a try" };
    assert.equal((await send(message)).error, "READING_LEVEL_REQUIRED");
    assert.equal(requests.length, 0);
    const settings = (await send({ type: "ULW_GET_SETTINGS" })).settings;
    assert.equal(settings.cefrLevel, "B2");
    assert.equal(settings.readingLevelConfirmed, false);
    assert.equal(settings.geminiApiKey, undefined);
    assert.equal(settings.apiKey, undefined);
    assert.equal(settings.providerSettings, undefined);
    const modelRequest = { type: "ULW_LIST_MODELS", provider: "gemini", apiKey: "test-key" };
    assert.equal((await send(modelRequest, { url: "https://example.com" })).error, "OPTIONS_PAGE_REQUIRED");
    const modelList = await send(modelRequest, { url: "chrome-extension://test/src/options.html", tab: { id: 123 } });
    assert.equal(modelList.ok, true);
    assert.deepEqual(modelList.models, ["gemini-2.5-flash"]);
    stored.readingLevelConfirmed = true;
    assert.equal((await send(message)).cached, false);
    assert.equal((await send(message)).cached, true);
    stored.smallChallenge = true;
    assert.equal((await send(message)).cached, true);
    assert.equal(requests.length, 1);
    assert.ok(requests[0].contents[0].parts[0].text.includes("about 80%"));
    assert.ok(requests[0].contents[0].parts[0].text.includes("about 20%"));
    stored.cefrLevel = "A2";
    assert.equal((await send(message)).cached, false);
    assert.ok(requests[1].contents[0].parts[0].text.includes("anchored at A2"));
    stored.geminiApiKey = "";
    assert.equal((await send(message)).error, "MISSING_API_KEY");
    stored.aiProvider = "openai";
    stored.providerSettings = { openai: { apiKey: "openai-test-key", model: "test-model" } };
    assert.equal((await send(message)).cached, false);
    assert.equal((await send(message)).provider, "openai");
    assert.equal(requests[2].input.includes("anchored at A2"), true);
    assert.equal((await send({ ...message, selectionText: "" })).error, "NO_SELECTION");
    assert.equal((await send({ ...message, selectionText: "x".repeat(1001) })).error, "SELECTION_TOO_LONG");
    installListener({ reason: "update" });
    assert.equal(opens, 0);
    installListener({ reason: "install" });
    actionListener();
    assert.equal(opens, 2);
    assert.equal((await send({ type: "ULW_OPEN_OPTIONS" })).ok, true);
    assert.equal(opens, 3);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.chrome;
  }
});
