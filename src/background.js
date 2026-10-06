import { buildPrompt, normalizeLevel } from "./learningLevel.js";
import { generateExplanation, getCustomOriginPattern, getProvider, getProviderProfiles, listProviderModels, normalizeCustomBaseUrl, normalizeModel, normalizeProvider } from "./providers.js";
import { buildModelTestPrompt, MODEL_TEST_SOURCE } from "./modelTest.js";

const DEFAULT_SETTINGS = {
  cefrLevel: "B1",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  readingLevelConfirmed: false,
  aiProvider: "gemini",
  providerSettings: {},
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

const RATE_LIMIT = {
  maxTokens: 10,
  refillMs: 6000,
};

const cache = new Map();
let rateState = { tokens: RATE_LIMIT.maxTokens, lastRefillMs: Date.now() };

async function getSettings() {
  const stored = { ...DEFAULT_SETTINGS, ...await chrome.storage.local.get(null) };
  const provider = normalizeProvider(stored.aiProvider);
  const profile = getProviderProfiles(stored)[provider];
  return {
    cefrLevel: normalizeLevel(stored.cefrLevel),
    provider,
    apiKey: profile.apiKey,
    model: profile.model,
    baseUrl: profile.baseUrl,
    apiFormat: profile.apiFormat,
    readingLevelConfirmed: stored.readingLevelConfirmed === true,
  };
}

async function checkCustomAccess(provider, baseUrl) {
  if (provider !== "custom") return baseUrl;
  const normalized = normalizeCustomBaseUrl(baseUrl);
  if (!await chrome.permissions.contains({ origins: [getCustomOriginPattern(normalized)] })) {
    throw new Error("CUSTOM_ACCESS_REQUIRED");
  }
  return normalized;
}

function getCached(cacheKey) {
  const hit = cache.get(cacheKey);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(cacheKey);
    return null;
  }
  return hit.value;
}

function setCached(cacheKey, value) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function consumeTokenOrThrow() {
  const now = Date.now();
  const elapsed = now - rateState.lastRefillMs;

  if (elapsed > 0) {
    const refill = Math.floor(elapsed / RATE_LIMIT.refillMs);
    if (refill > 0) {
      rateState.tokens = Math.min(RATE_LIMIT.maxTokens, rateState.tokens + refill);
      rateState.lastRefillMs += refill * RATE_LIMIT.refillMs;
    }
  }

  if (rateState.tokens <= 0) {
    throw new Error("RATE_LIMIT");
  }

  rateState.tokens -= 1;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || typeof msg !== "object") throw new Error("INVALID_MESSAGE");

      if (msg.type === "ULW_OPEN_OPTIONS") {
        await chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
        return;
      }

       if (msg.type === "ULW_GET_SETTINGS") {
         const settings = await getSettings();
         sendResponse({
           ok: true,
           settings: {
             cefrLevel: settings.cefrLevel,
             provider: settings.provider,
             model: settings.model,
             readingLevelConfirmed: settings.readingLevelConfirmed,
           },
         });
         return;
       }

       if (msg.type === "ULW_LIST_MODELS" || msg.type === "ULW_LIST_GEMINI_MODELS") {
         // Listing uses credentials from the extension's options page only.
         if (sender.url !== chrome.runtime.getURL("src/options.html")) {
           throw new Error("OPTIONS_PAGE_REQUIRED");
         }
         const provider = msg.type === "ULW_LIST_GEMINI_MODELS" ? "gemini" : msg.provider;
         const baseUrl = await checkCustomAccess(provider, msg.baseUrl);
         const models = await listProviderModels({ provider, apiKey: msg.apiKey, baseUrl, apiFormat: msg.apiFormat });
         sendResponse({ ok: true, provider, models });
         return;
       }

      if (msg.type === "ULW_TEST_MODEL") {
        // Test only the options page's draft. Never load/save learning settings or use the explanation cache.
        if (sender.url !== chrome.runtime.getURL("src/options.html")) throw new Error("OPTIONS_PAGE_REQUIRED");
        const provider = msg.provider;
        getProvider(provider, { baseUrl: msg.baseUrl, apiFormat: msg.apiFormat });
        const apiKey = String(msg.apiKey || "").trim();
        const model = normalizeModel(provider, msg.model);
        if (!apiKey && provider !== "custom") throw new Error("MISSING_API_KEY");
        if (!model) throw new Error("CUSTOM_MODEL_REQUIRED");
        const baseUrl = await checkCustomAccess(provider, msg.baseUrl);
        consumeTokenOrThrow();
        const rewrite = await generateExplanation({ provider, apiKey, model, baseUrl, apiFormat: msg.apiFormat, promptText: buildModelTestPrompt() });
        sendResponse({ ok: true, provider, model, source: MODEL_TEST_SOURCE, rewrite });
        return;
      }

      if (msg.type === "ULW_GENERATE_EXPLANATION") {
        const selectionText = String(msg.selectionText || "").trim();
        if (!selectionText) throw new Error("NO_SELECTION");
        if (selectionText.length > 1000) throw new Error("SELECTION_TOO_LONG");

        const { cefrLevel, provider, apiKey, model, baseUrl: savedBaseUrl, apiFormat, readingLevelConfirmed } = await getSettings();
        if (!readingLevelConfirmed) {
          sendResponse({ ok: false, error: "READING_LEVEL_REQUIRED" });
          return;
        }
        if (!apiKey && provider !== "custom") {
          sendResponse({ ok: false, error: "MISSING_API_KEY" });
          return;
        }

        const baseUrl = await checkCustomAccess(provider, savedBaseUrl);
        if (!model) throw new Error("CUSTOM_MODEL_REQUIRED");
        const cacheKey = JSON.stringify([provider, baseUrl, apiFormat, cefrLevel, model, selectionText]);
        const cached = getCached(cacheKey);
         if (cached) {
           sendResponse({ ok: true, explanation: cached, cefrLevel, provider, model, cached: true });
           return;
         }

        const promptText = buildPrompt({ selectionText, cefrLevel });
        consumeTokenOrThrow();
        const explanation = await generateExplanation({ provider, apiKey, model, promptText, baseUrl, apiFormat });
        setCached(cacheKey, explanation);

        sendResponse({ ok: true, explanation, cefrLevel, provider, model, cached: false });
        return;
      }

      throw new Error("UNKNOWN_MESSAGE_TYPE");
    } catch (e) {
      const message = e?.message || String(e);
      sendResponse({ ok: false, error: message });
    }
  })();

  return true;
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.runtime.openOptionsPage();
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
