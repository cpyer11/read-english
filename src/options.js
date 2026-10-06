import { normalizeLevel } from "./learningLevel.js";
import { READING_SAMPLES } from "./readingSamples.js";
import { MODEL_TEST_SOURCE } from "./modelTest.js";
import { PROVIDERS, getCustomOriginPattern, getProviderProfiles, normalizeCustomBaseUrl, normalizeCustomApiFormat, normalizeModelList, normalizeProvider } from "./providers.js";
import "./i18n.js";

const { createTranslator, resolveLanguage, normalizePreference, translateDocument } = globalThis.ULWI18n;
let languagePreference = "auto";
let interfaceLanguage = resolveLanguage();
let t = createTranslator(interfaceLanguage);
let statusMessage = null;
let modelMessage = null;
let confirmedLevel = null;

const DEFAULT_SETTINGS = {
  cefrLevel: "B1",
  aiProvider: "gemini",
  providerSettings: {},
  readingLevelConfirmed: false,
  uiLanguage: "auto",
};

let readingLevelConfirmed = false;
let sampleIndex = 0;
let activeProvider = "gemini";
let providerProfiles = getProviderProfiles({});
let refreshVersion = 0;
let pendingRefresh = null;
let settingsReady = false;
let testVersion = 0;
let pendingTest = null;
let testMessage = null;

function renderSample() {
  const sample = READING_SAMPLES[sampleIndex];
  document.getElementById("sample-title").textContent = sample.title;
  document.getElementById("sample-text").textContent = sample.text;
  const words = sample.text.trim().split(/\s+/).length;
  document.getElementById("sample-meta").textContent = t("sampleMeta", { level: sample.level, words, current: sampleIndex + 1, total: READING_SAMPLES.length });
  document.getElementById("sample-meta").lang = interfaceLanguage;
  document.getElementById("choose-level").textContent = t("chooseLevel", { level: sample.level });
  document.getElementById("previous-sample").disabled = sampleIndex === 0;
  document.getElementById("next-sample").disabled = sampleIndex === READING_SAMPLES.length - 1;
  for (const [index, button] of Array.from(document.getElementById("level-tabs").children).entries()) {
    button.setAttribute("aria-pressed", String(index === sampleIndex));
  }
}

function showConfirmedLevel(level) {
  confirmedLevel = level;
  document.getElementById("placement-result").textContent = t("levelConfirmed", { level });
  document.getElementById("placement-reader").hidden = true;
  document.getElementById("retake-placement").hidden = false;
  document.getElementById("cefrLevel").disabled = false;
}

function setupPlacement() {
  const tabs = document.getElementById("level-tabs");
  READING_SAMPLES.forEach((sample, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = sample.level;
    button.addEventListener("click", () => {
      sampleIndex = index;
      renderSample();
    });
    tabs.appendChild(button);
  });
  document.getElementById("previous-sample").addEventListener("click", () => {
    sampleIndex = Math.max(0, sampleIndex - 1);
    renderSample();
  });
  document.getElementById("next-sample").addEventListener("click", () => {
    sampleIndex = Math.min(READING_SAMPLES.length - 1, sampleIndex + 1);
    renderSample();
  });
  document.getElementById("retake-placement").addEventListener("click", () => {
    const currentLevel = document.getElementById("cefrLevel").value;
    sampleIndex = READING_SAMPLES.findIndex((sample) => sample.level === currentLevel);
    if (sampleIndex < 0) sampleIndex = 0;
    document.getElementById("placement-reader").hidden = false;
    document.getElementById("retake-placement").hidden = true;
    renderSample();
  });
  document.getElementById("choose-level").addEventListener("click", async () => {
    const level = READING_SAMPLES[sampleIndex].level;
    const button = document.getElementById("choose-level");
    button.disabled = true;
    try {
      await chrome.storage.local.set({ cefrLevel: level, readingLevelConfirmed: true });
      readingLevelConfirmed = true;
      document.getElementById("cefrLevel").value = level;
      showConfirmedLevel(level);
      setStatus("levelSaved", "success", { level });
    } catch {
      setStatus("levelSaveFailed", "error");
    } finally {
      button.disabled = false;
    }
  });
  renderSample();
}

function setStatus(key, type, values = {}) {
  statusMessage = key ? { key, type, values } : null;
  const el = document.getElementById("status-msg");
  if (!el) return;
  el.textContent = key ? t(key, values) : "";
  el.className = type;
  if (!key) el.className = "";
}

function setModelMsg(key, isError, values = {}) {
  modelMessage = key ? { key, isError, values } : null;
  const el = document.getElementById("model-msg");
  if (!el) return;
  el.textContent = key ? t(key, values) : "";
  el.style.color = isError ? "#dc2626" : "";
}

function setTestMsg(key, isError, values = {}) {
  testMessage = key ? { key, isError, values } : null;
  const el = document.getElementById("test-model-msg");
  el.textContent = key ? t(key, values) : "";
  el.style.color = isError ? "#dc2626" : key === "modelTestPassed" ? "#047857" : "";
}

function clearModelTest() {
  // A reply for an older key/model/endpoint must not appear to verify the current draft.
  testVersion++;
  pendingTest = null;
  document.getElementById("model-test-result").hidden = true;
  document.getElementById("test-model-output").textContent = "";
  setTestMsg("", false);
}

function providerLabel() {
  return activeProvider === "custom"
    ? providerProfiles.custom.name || t("customProvider")
    : PROVIDERS[activeProvider].label;
}

function applyLanguage(preference) {
  languagePreference = normalizePreference(preference);
  interfaceLanguage = resolveLanguage(languagePreference);
  t = createTranslator(interfaceLanguage);
  document.documentElement.lang = interfaceLanguage;
  document.getElementById("uiLanguage").value = languagePreference;
  translateDocument(document, t);
  renderSample();
  document.getElementById("placement-result").textContent = readingLevelConfirmed
    ? t("levelConfirmed", { level: confirmedLevel || document.getElementById("cefrLevel").value })
    : t("chooseLevelFirst");
  document.getElementById("api-key-label").textContent = t("apiKeyLabel", { provider: providerLabel() });
  document.querySelector('[data-i18n="keyHint"]').textContent = t(activeProvider === "custom" ? "customKeyHint" : "keyHint");
  const emptyModel = document.querySelector('#aiModel option[value=""]');
  if (emptyModel) emptyModel.textContent = t("noModels");
  if (statusMessage) setStatus(statusMessage.key, statusMessage.type, statusMessage.values);
  if (modelMessage) {
    if (Object.hasOwn(modelMessage.values, "provider")) modelMessage.values.provider = providerLabel();
    setModelMsg(modelMessage.key, modelMessage.isError, modelMessage.values);
  }
  if (testMessage) {
    if (Object.hasOwn(testMessage.values, "provider")) testMessage.values.provider = providerLabel();
    setTestMsg(testMessage.key, testMessage.isError, testMessage.values);
  }
  updateModelControls();
}

function updateModelControls() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const refreshing = pendingRefresh?.version === refreshVersion;
  document.getElementById("aiModel").disabled = !settingsReady || refreshing;
  document.getElementById("refresh-models-btn").disabled = !settingsReady || refreshing || (activeProvider === "custom"
    ? !document.getElementById("customBaseUrl").value.trim() : !apiKey);
  const testing = pendingTest?.version === testVersion;
  const model = document.getElementById(activeProvider === "custom" ? "customModel" : "aiModel").value.trim();
  const testButton = document.getElementById("test-model-btn");
  testButton.disabled = !settingsReady || testing || !model || (activeProvider === "custom"
    ? !document.getElementById("customBaseUrl").value.trim() : !apiKey);
  testButton.textContent = t(testing ? "testingModel" : "testModel");
  document.getElementById("model-test-result").setAttribute("aria-busy", String(testing));
}

function setModelOptions(modelNames, selectedModel) {
  const selectEl = document.getElementById("aiModel");
  if (!selectEl) return;

  selectEl.innerHTML = "";
  if (!Array.isArray(modelNames) || modelNames.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = t("noModels");
    selectEl.appendChild(opt);
    return;
  }

  for (const name of modelNames) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    selectEl.appendChild(opt);
  }

  const desired = String(selectedModel || "").trim();
  if (activeProvider === "custom" && !desired) {
    selectEl.selectedIndex = -1;
  } else if (desired && modelNames.includes(desired)) {
    selectEl.value = desired;
  } else {
    selectEl.value = modelNames[0];
  }
}

function captureProviderDraft() {
  const profile = providerProfiles[activeProvider];
  profile.apiKey = document.getElementById("apiKey").value.trim();
  if (activeProvider === "custom") {
    profile.name = document.getElementById("customName").value.trim();
    profile.baseUrl = document.getElementById("customBaseUrl").value.trim();
    profile.apiFormat = normalizeCustomApiFormat(document.getElementById("customApiFormat").value);
    profile.model = document.getElementById("customModel").value.trim();
  } else profile.model = document.getElementById("aiModel").value || profile.model;
}

function renderProvider() {
  const config = PROVIDERS[activeProvider];
  const profile = providerProfiles[activeProvider];
  const custom = activeProvider === "custom";
  document.getElementById("custom-provider-fields").hidden = !custom;
  document.getElementById("custom-model-field").hidden = !custom;
  for (const id of ["customName", "customBaseUrl", "customApiFormat", "customModel"]) document.getElementById(id).disabled = !custom;
  if (custom) {
    document.getElementById("customName").value = profile.name;
    document.getElementById("customBaseUrl").value = profile.baseUrl;
    document.getElementById("customApiFormat").value = profile.apiFormat;
    document.getElementById("customModel").value = profile.model;
  }
  document.getElementById("api-key-label").textContent = t("apiKeyLabel", { provider: providerLabel() });
  document.querySelector('[data-i18n="keyHint"]').textContent = t(custom ? "customKeyHint" : "keyHint");
  const apiKeyEl = document.getElementById("apiKey");
  apiKeyEl.value = profile.apiKey;
  apiKeyEl.placeholder = config.keyPlaceholder;
  const models = profile.cachedModels.length ? profile.cachedModels : [config.defaultModel];
  setModelOptions(normalizeModelList([profile.model, ...models]), profile.model);
  updateModelControls();
  setModelMsg(profile.cachedModels.length ? "modelsCached" : custom ? "customModelsHint" : "modelsStarter", false, { provider: providerLabel() });
}

async function requestCustomAccess(baseUrl) {
  // Called before any await in a click/submit handler to retain Chrome's user gesture.
  const granted = await chrome.permissions.request({ origins: [getCustomOriginPattern(baseUrl)] });
  if (!granted) throw new Error("CUSTOM_ACCESS_REQUIRED");
}

async function fetchModelsWithKey(provider, apiKey, customConfig) {
  const key = String(apiKey || "").trim();
  if (!key && provider !== "custom") throw new Error("MISSING_API_KEY");

  const resp = await chrome.runtime.sendMessage({ type: "ULW_LIST_MODELS", provider, apiKey: key, ...customConfig });
  if (!resp || !resp.ok) {
    throw new Error(resp?.error || "FAILED_TO_LIST_MODELS");
  }

  if (!Array.isArray(resp.models) || !resp.models.length) throw new Error("NO_MODELS_AVAILABLE");
  return resp.models;
}

async function loadSettings() {
  const stored = { ...DEFAULT_SETTINGS, ...await chrome.storage.local.get(null) };
  const levelEl = document.getElementById("cefrLevel");
  providerProfiles = getProviderProfiles(stored);
  activeProvider = normalizeProvider(stored.aiProvider);
  document.getElementById("aiProvider").value = activeProvider;
  if (levelEl) levelEl.value = normalizeLevel(stored.cefrLevel);
  readingLevelConfirmed = stored.readingLevelConfirmed === true;
  confirmedLevel = readingLevelConfirmed ? normalizeLevel(stored.cefrLevel) : null;
  applyLanguage(stored.uiLanguage);
  if (readingLevelConfirmed) showConfirmedLevel(normalizeLevel(stored.cefrLevel));
  else document.getElementById("placement-result").textContent = t("chooseLevelFirst");

  renderProvider();
  document.getElementById("aiProvider").disabled = false;
  document.getElementById("apiKey").disabled = false;
  document.getElementById("save-btn").disabled = false;
  document.getElementById("uiLanguage").disabled = false;
  settingsReady = true;
  updateModelControls();
}

async function saveSettings({ cefrLevel }) {
  captureProviderDraft();
  const provider = activeProvider;
  const profiles = structuredClone(providerProfiles);
  if (provider === "custom") {
    profiles.custom.baseUrl = normalizeCustomBaseUrl(profiles.custom.baseUrl);
    if (!profiles.custom.model) throw new Error("CUSTOM_MODEL_REQUIRED");
    await requestCustomAccess(profiles.custom.baseUrl);
  }
  // Save all drafts together so switching providers never loses an unsaved key.
  await chrome.storage.local.set({
    aiProvider: provider,
    providerSettings: profiles,
    cefrLevel,
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupPlacement();
  applyLanguage("auto");
  document.getElementById("apiKey").disabled = true;
  document.getElementById("save-btn").disabled = true;
  loadSettings().catch(() => setStatus("loadFailed", "error"));

  document.getElementById("uiLanguage").addEventListener("change", async () => {
    const select = document.getElementById("uiLanguage");
    const previous = languagePreference;
    const next = normalizePreference(select.value);
    select.disabled = true;
    applyLanguage(next);
    try {
      // Language is saved immediately and independently of provider/learning drafts.
      await chrome.storage.local.set({ uiLanguage: next });
    } catch {
      applyLanguage(previous);
      setStatus("languageSaveFailed", "error");
    } finally {
      select.disabled = false;
    }
  });

  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes.uiLanguage) applyLanguage(changes.uiLanguage.newValue);
  });

  const form = document.getElementById("options-form");
  if (!form) return;

  document.getElementById("aiProvider").addEventListener("change", () => {
    captureProviderDraft();
    activeProvider = normalizeProvider(document.getElementById("aiProvider").value);
    refreshVersion++;
    clearModelTest();
    renderProvider();
    setStatus("unsaved", "success");
  });

  const refreshBtn = document.getElementById("refresh-models-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      captureProviderDraft();
      const provider = activeProvider;
      const profile = providerProfiles[provider];
      const apiKey = profile.apiKey;
      const customConfig = provider === "custom" ? { baseUrl: profile.baseUrl, apiFormat: profile.apiFormat } : {};
      const version = ++refreshVersion;
      pendingRefresh = { version };
      setModelMsg("modelsLoading", false, { provider: providerLabel() });
      updateModelControls();
      try {
        if (provider === "custom") await requestCustomAccess(customConfig.baseUrl);
        if (version !== refreshVersion) return;
        const models = await fetchModelsWithKey(provider, apiKey, customConfig);
        // Discard responses after changing provider/key or starting another refresh.
        if (version !== refreshVersion) return;
        profile.cachedModels = models;
        const previousModel = profile.model;
        profile.model = provider === "custom" ? profile.model || models[0] : models.includes(profile.model) ? profile.model
          : models.includes(PROVIDERS[provider].defaultModel) ? PROVIDERS[provider].defaultModel : models[0];
        setModelOptions(normalizeModelList([profile.model, ...models]), profile.model);
        if (provider === "custom") document.getElementById("customModel").value = profile.model;
        if (profile.model !== previousModel) clearModelTest();
        setModelMsg("modelsLoaded", false, { count: models.length, provider: providerLabel() });
      } catch (e) {
        if (version !== refreshVersion) return;
        const messages = {
          MISSING_API_KEY: "keyRequired",
          PROVIDER_HTTP_401: "keyRejected",
          PROVIDER_HTTP_403: "accessDenied",
          PROVIDER_HTTP_429: "quotaReached",
          PROVIDER_TIMEOUT: "providerTimeout",
          NO_MODELS_AVAILABLE: "noModelsAvailable",
          INVALID_CUSTOM_URL: "customUrlInvalid",
          CUSTOM_ACCESS_REQUIRED: "customAccessRequired",
          PROVIDER_HTTP_404: provider === "custom" ? "customModelsUnavailable" : "refreshFailed",
        };
        setModelMsg(messages[e?.message] || "refreshFailed", true, { error: e?.message || t("unknownError") });
      } finally {
        if (version === refreshVersion) {
          pendingRefresh = null;
          updateModelControls();
        }
      }
    });
  }

  document.getElementById("test-model-btn").addEventListener("click", async () => {
    captureProviderDraft();
    const provider = activeProvider;
    const profile = structuredClone(providerProfiles[provider]);
    const version = ++testVersion;
    pendingTest = { version };
    document.getElementById("model-test-result").hidden = false;
    document.getElementById("test-model-source").textContent = MODEL_TEST_SOURCE;
    document.getElementById("test-model-output").textContent = "";
    setTestMsg("modelTesting", false, { provider: providerLabel(), model: profile.model });
    updateModelControls();
    try {
      if (provider === "custom") await requestCustomAccess(profile.baseUrl);
      if (version !== testVersion) return;
      const response = await chrome.runtime.sendMessage({
        type: "ULW_TEST_MODEL", provider, apiKey: profile.apiKey, model: profile.model,
        ...(provider === "custom" ? { baseUrl: profile.baseUrl, apiFormat: profile.apiFormat } : {}),
      });
      if (version !== testVersion) return;
      if (!response?.ok) throw new Error(response?.error || "MODEL_TEST_FAILED");
      if (typeof response.rewrite !== "string" || !response.rewrite.trim()) throw new Error("PROVIDER_EMPTY_RESPONSE");
      document.getElementById("test-model-output").textContent = response.rewrite.trim();
      setTestMsg("modelTestPassed", false, { provider: providerLabel(), model: profile.model });
    } catch (error) {
      if (version !== testVersion) return;
      document.getElementById("model-test-result").hidden = true;
      const messages = {
        MISSING_API_KEY: "keyRequired", PROVIDER_HTTP_401: "keyRejected", PROVIDER_HTTP_403: "accessDenied",
        PROVIDER_HTTP_404: "testModelUnavailable", PROVIDER_HTTP_429: "quotaReached", PROVIDER_TIMEOUT: "providerTimeout",
        CUSTOM_ACCESS_REQUIRED: "customAccessRequired", INVALID_CUSTOM_URL: "customUrlInvalid", CUSTOM_MODEL_REQUIRED: "customModelRequired",
        PROVIDER_EMPTY_RESPONSE: "testModelEmpty", RATE_LIMIT: "rateLimit",
      };
      setTestMsg(messages[error?.message] || "modelTestFailed", true, { error: error?.message || t("unknownError") });
    } finally {
      if (version === testVersion) {
        pendingTest = null;
        updateModelControls();
      }
    }
  });

  const apiKeyEl = document.getElementById("apiKey");
  if (apiKeyEl) {
    apiKeyEl.addEventListener("input", () => {
      refreshVersion++;
      captureProviderDraft();
      clearModelTest();
      updateModelControls();
      setModelMsg(activeProvider === "custom" ? "customModelsHint" : "refreshForKey", false);
    });
  }

  const modelEl = document.getElementById("aiModel");
  if (modelEl) {
    modelEl.addEventListener("change", () => {
      if (activeProvider === "custom") document.getElementById("customModel").value = modelEl.value;
      captureProviderDraft();
      clearModelTest();
      updateModelControls();
      setStatus("unsaved", "success");
    });
  }

  for (const id of ["customName", "customBaseUrl", "customApiFormat", "customModel"]) {
    document.getElementById(id).addEventListener(id === "customApiFormat" ? "change" : "input", () => {
      if (activeProvider !== "custom") return;
      if (id === "customBaseUrl" || id === "customApiFormat") {
        refreshVersion++;
        providerProfiles.custom.cachedModels = [];
        setModelOptions(normalizeModelList([document.getElementById("customModel").value]), document.getElementById("customModel").value.trim());
        setModelMsg("customModelsHint", false);
      }
      captureProviderDraft();
      clearModelTest();
      if (id === "customModel") {
        const model = providerProfiles.custom.model;
        setModelOptions(normalizeModelList([model, ...providerProfiles.custom.cachedModels]), model);
      }
      document.getElementById("api-key-label").textContent = t("apiKeyLabel", { provider: providerLabel() });
      updateModelControls();
      setStatus("unsaved", "success");
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("", "");

    const levelEl = document.getElementById("cefrLevel");
    const cefrLevel = String(levelEl?.value || DEFAULT_SETTINGS.cefrLevel);

    if (!readingLevelConfirmed) {
      setStatus("placementRequired", "error");
      return;
    }

    try {
      document.getElementById("save-btn").disabled = true;
      await saveSettings({ cefrLevel });
      showConfirmedLevel(cefrLevel);
      setStatus("saved", "success");
      setTimeout(() => setStatus("", ""), 1200);
    } catch (error) {
      const messages = { INVALID_CUSTOM_URL: "customUrlInvalid", CUSTOM_MODEL_REQUIRED: "customModelRequired", CUSTOM_ACCESS_REQUIRED: "customAccessRequired" };
      setStatus(messages[error.message] || "saveFailed", "error");
    } finally {
      document.getElementById("save-btn").disabled = false;
    }
  });
});
