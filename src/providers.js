// Defaults are starter choices; Refresh discovers models available to the user's key.
export const PROVIDERS = {
  gemini: {
    label: "Gemini (Google)",
    keyLabel: "Gemini API Key",
    defaultModel: "gemini-2.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    keyPlaceholder: "AIza...",
  },
  claude: {
    label: "Claude (Anthropic)",
    keyLabel: "Claude API Key",
    defaultModel: "claude-haiku-4-5",
    baseUrl: "https://api.anthropic.com/v1",
    keyPlaceholder: "sk-ant-...",
  },
  openai: {
    label: "GPT (OpenAI)",
    keyLabel: "OpenAI API Key",
    defaultModel: "gpt-4.1-mini",
    baseUrl: "https://api.openai.com/v1",
    keyPlaceholder: "sk-...",
  },
  deepseek: {
    label: "DeepSeek",
    keyLabel: "DeepSeek API Key",
    defaultModel: "deepseek-flash",
    baseUrl: "https://api.deepseek.com",
    keyPlaceholder: "sk-...",
  },
  grok: {
    label: "Grok (xAI)",
    keyLabel: "Grok API Key",
    defaultModel: "grok-4.7",
    baseUrl: "https://api.x.ai/v1",
    keyPlaceholder: "xai-...",
  },
  custom: {
    label: "Custom",
    defaultModel: "",
    baseUrl: "",
    keyPlaceholder: "sk-...",
  },
};

export function normalizeCustomBaseUrl(baseUrl) {
  let url;
  try { url = new URL(String(baseUrl || "").trim()); }
  catch { throw new Error("INVALID_CUSTOM_URL"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("INVALID_CUSTOM_URL");
  }
  return url.toString().replace(/\/+$/, "");
}

export function getCustomOriginPattern(baseUrl) {
  const url = new URL(normalizeCustomBaseUrl(baseUrl));
  // Chrome host permissions apply to all ports and paths on the requested host.
  return `${url.protocol}//${url.hostname}/*`;
}

export function normalizeCustomApiFormat(format) {
  return format === "responses" ? "responses" : "chat";
}

export function getProvider(provider, customConfig = {}) {
  if (!Object.hasOwn(PROVIDERS, provider)) throw new Error("INVALID_PROVIDER");
  if (provider === "custom") return {
    ...PROVIDERS.custom,
    baseUrl: normalizeCustomBaseUrl(customConfig.baseUrl),
    apiFormat: normalizeCustomApiFormat(customConfig.apiFormat),
  };
  return PROVIDERS[provider];
}

export function normalizeProvider(provider) {
  return Object.hasOwn(PROVIDERS, provider) ? provider : "gemini";
}

export function normalizeModel(provider, model) {
  if (!Object.hasOwn(PROVIDERS, provider)) throw new Error("INVALID_PROVIDER");
  const value = String(model || "").trim() || PROVIDERS[provider].defaultModel;
  return provider === "gemini" ? value.replace(/^models\//, "") : value;
}

export function normalizeModelList(models) {
  return Array.isArray(models)
    ? [...new Set(models.filter((model) => typeof model === "string" && model.trim()).map((model) => model.trim()))]
    : [];
}

export function getProviderProfiles(stored) {
  const profiles = {};
  for (const provider of Object.keys(PROVIDERS)) {
    // Preserve Gemini credentials from earlier versions without removing legacy fields.
    const legacy = provider === "gemini" ? {
      apiKey: stored.geminiApiKey,
      model: stored.geminiModel,
      cachedModels: stored.cachedModels,
    } : {};
    const profile = stored.providerSettings?.[provider] || legacy;
    profiles[provider] = {
      apiKey: String(profile.apiKey || "").trim(),
      model: normalizeModel(provider, profile.model),
      cachedModels: normalizeModelList(profile.cachedModels),
      ...(provider === "custom" ? {
        name: String(profile.name || "").trim(),
        baseUrl: String(profile.baseUrl || "").trim(),
        apiFormat: normalizeCustomApiFormat(profile.apiFormat),
      } : {}),
    };
  }
  return profiles;
}

function authHeaders(provider, apiKey) {
  if (provider === "gemini") return { "x-goog-api-key": apiKey };
  if (provider === "claude") return {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function requestJson(provider, apiKey, url, body) {
  const key = String(apiKey || "").trim();
  if (!key && provider !== "custom") throw new Error("MISSING_API_KEY");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { ...authHeaders(provider, key), ...(body ? { "Content-Type": "application/json" } : {}) },
      referrerPolicy: "no-referrer",
      cache: "no-store",
      credentials: "omit",
      ...(provider === "custom" ? { redirect: "error" } : {}),
      signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    // Keep error bodies (which can echo credentials) out of content-script responses.
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("PROVIDER_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listProviderModels({ provider, apiKey, baseUrl, apiFormat }) {
  const config = getProvider(provider, { baseUrl, apiFormat });
  const models = [];
  let cursor = "";
  // Gemini and Claude model endpoints are paginated. Bound requests defensively.
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${config.baseUrl}/models`);
    if (provider === "gemini") {
      url.searchParams.set("pageSize", "1000");
      if (cursor) url.searchParams.set("pageToken", cursor);
    } else if (provider === "claude") {
      url.searchParams.set("limit", "1000");
      if (cursor) url.searchParams.set("after_id", cursor);
    }
    const data = await requestJson(provider, apiKey, url.toString());
    if (provider === "gemini") {
      models.push(...(data.models || [])
        .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
        .map((model) => normalizeModel(provider, model.name))
        .filter((name) => name.startsWith("gemini-") && !/image|embedding|tts|robotics/.test(name)));
    } else {
      models.push(...(data.data || []).map((model) => model.id).filter((id) => {
        if (typeof id !== "string") return false;
        if (provider === "custom") return true;
        if (provider === "claude") return id.startsWith("claude-");
        if (provider === "openai") return id.startsWith("gpt-")
          && !/audio|realtime|transcri|image|search|codex|instruct|tts|chat-latest/.test(id)
          && !/^gpt-(3\.5|4($|-))/.test(id);
        if (provider === "grok") return id.startsWith("grok-") && !/image|video|imagine|audio/.test(id);
        return id.startsWith("deepseek-");
      }));
    }
    const next = provider === "gemini" ? data.nextPageToken
      : provider === "claude" && data.has_more ? data.last_id : "";
    if (!next) return normalizeModelList(models).sort();
    if (next === cursor) throw new Error("MODEL_LIST_PAGINATION_FAILED");
    cursor = next;
  }
  throw new Error("MODEL_LIST_PAGINATION_FAILED");
}

export async function generateExplanation({ provider, apiKey, model, promptText, baseUrl, apiFormat }) {
  const config = getProvider(provider, { baseUrl, apiFormat });
  const modelName = normalizeModel(provider, model);
  if (!modelName) throw new Error("CUSTOM_MODEL_REQUIRED");
  const usesResponses = provider === "openai" || (provider === "custom" && config.apiFormat === "responses");
  let endpoint;
  let body;
  if (provider === "gemini") {
    endpoint = `${config.baseUrl}/models/${encodeURIComponent(modelName)}:generateContent`;
    body = {
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    };
    if (/^gemini-2\.5-(flash|flash-lite)(-|$)/.test(modelName)) {
      body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }
  } else if (provider === "claude") {
    endpoint = `${config.baseUrl}/messages`;
    body = { model: modelName, messages: [{ role: "user", content: promptText }], max_tokens: 2048 };
  } else if (usesResponses) {
    endpoint = `${config.baseUrl}/responses`;
    body = { model: modelName, input: promptText, max_output_tokens: 2048, store: false };
  } else {
    endpoint = `${config.baseUrl}/chat/completions`;
    body = { model: modelName, messages: [{ role: "user", content: promptText }], max_tokens: 2048, stream: false };
    if (provider === "deepseek") body.thinking = { type: "disabled" };
  }
  const data = await requestJson(provider, apiKey, endpoint, body);
  let text;
  if (provider === "gemini") {
    text = data.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text || "").join("");
  } else if (provider === "claude") {
    text = data.content?.filter((part) => part.type === "text").map((part) => part.text).join("\n");
  } else if (usesResponses) {
    text = data.output?.filter((item) => item.type === "message")
      .flatMap((item) => item.content || []).filter((part) => part.type === "output_text").map((part) => part.text).join("\n");
  } else {
    text = data.choices?.[0]?.message?.content;
  }
  if (typeof text !== "string" || !text.trim()) throw new Error("PROVIDER_EMPTY_RESPONSE");
  return text.trim();
}
