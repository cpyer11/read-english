(() => {
  const HOST_ID = "ulw-learn-english-host";

  if (document.getElementById(HOST_ID)) return;

  const { createTranslator, resolveLanguage } = globalThis.ULWI18n;
  let interfaceLanguage = resolveLanguage();
  let t = createTranslator(interfaceLanguage);
  let activeMessage = null;
  let activeExplanation = null;

  let cachedSelection = null;
  let hideTimer = null;
  let isPinnedOpen = false;

  function createHost() {
    const host = document.createElement("div");
    host.id = HOST_ID;
    // Use absolute positioning instead of fixed. On sites that apply CSS
    // transforms to ancestor elements (e.g. Twitter/X), a fixed element
    // becomes relative to the transformed ancestor, which can cause the
    // overlay to appear far from the selected text. Absolute positioning
    // combined with scroll offsets ensures the overlay is anchored
    // correctly relative to the document and independent of transforms.
    host.style.position = "absolute";
    host.style.left = "0px";
    host.style.top = "0px";
    host.style.zIndex = "2147483647";
    host.style.pointerEvents = "none";
    document.documentElement.appendChild(host);
    return host;
  }

  function createShadow(host) {
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = getCss();
    shadow.appendChild(style);

    const root = document.createElement("div");
    root.id = "ai-host";
    root.lang = interfaceLanguage;

    const trigger = document.createElement("button");
    trigger.id = "ai-trigger";
    trigger.className = "ai-btn-trigger";
    trigger.type = "button";
    trigger.setAttribute("aria-label", t("explain"));
    trigger.innerHTML = getIconSvg();

    const card = document.createElement("div");
    card.id = "ai-card";
    card.className = "ai-card";

    const header = document.createElement("div");
    header.className = "ai-header";

    const title = document.createElement("span");
    title.className = "ai-title";
    title.id = "ai-title";
    title.textContent = "";
    title.lang = "en";

    const closeBtn = document.createElement("button");
    closeBtn.className = "ai-close-btn";
    closeBtn.type = "button";
    closeBtn.textContent = "x";
    closeBtn.setAttribute("aria-label", t("close"));

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "ai-body";

    const loader = document.createElement("div");
    loader.className = "ai-loader";
    loader.id = "ai-loader";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-label", t("loading"));
    loader.innerHTML =
      '<div class="shimmer-line width-full"></div>' +
      '<div class="shimmer-line width-80"></div>' +
      '<div class="shimmer-line width-90"></div>';

    const content = document.createElement("div");
    content.className = "ai-content";
    content.id = "ai-content";
    content.textContent = "";

    body.appendChild(loader);
    body.appendChild(content);

    const footer = document.createElement("div");
    footer.className = "ai-footer";

    const badge = document.createElement("span");
    badge.className = "ai-badge";
    const badgeLabel = document.createElement("span");
    badgeLabel.textContent = t("levelBadge");
    const badgeLevel = document.createElement("span");
    badgeLevel.id = "user-level";
    badge.append(badgeLabel, document.createTextNode(" "), badgeLevel);

    const link = document.createElement("a");
    link.href = "#";
    link.id = "ai-options-link";
    link.className = "ai-link";
    link.textContent = t("options");

    footer.appendChild(badge);
    footer.appendChild(link);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);

    root.appendChild(trigger);
    root.appendChild(card);
    shadow.appendChild(root);

    card.lang = interfaceLanguage;
    return { shadow, trigger, card, title, closeBtn, loader, content, link, badgeLabel, badgeLevel };
  }

  function getCss() {
    return `
:host {
  all: initial;
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  --ai-bg: rgba(255, 255, 255, 0.92);
  --ai-border: rgba(0, 0, 0, 0.08);
  --ai-shadow:
    0 0 0 1px rgba(0,0,0,0.02),
    0 4px 12px -2px rgba(0,0,0,0.08),
    0 20px 40px -8px rgba(0,0,0,0.12);
  --ai-text-main: #171717;
  --ai-text-muted: #666666;
  --ai-text-sub: #8F8F8F;
  --ai-radius: 12px;
  box-sizing: border-box;
}

#ai-host { position: relative; pointer-events: none; z-index: 2147483647; }

.ai-card {
  width: 350px;
  height: 300px;
  max-width: 90vw;
  max-height: 80vh;
  background: var(--ai-bg);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--ai-border);
  border-radius: var(--ai-radius);
  box-shadow: var(--ai-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  opacity: 0;
  transform: scale(0.96) translateY(4px);
  transform-origin: top left;
  transition: opacity 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
  position: absolute;
  top: 10px; left: 0;
}

.ai-card.visible {
  opacity: 1;
  transform: scale(1) translateY(0);
  pointer-events: auto;
}

.ai-header {
  height: 40px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--ai-border);
  background: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  font-weight: 600;
  color: var(--ai-text-main);
  flex-shrink: 0;
  letter-spacing: -0.01em;
  z-index: 2;
  cursor: move;
  user-select: none;
}


.ai-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
  font-weight: 600;
  color: #111;
}

.ai-close-btn {
  background: none;
  border: none;
  font-size: 18px;
  line-height: 1;
  color: #999;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}
.ai-close-btn:hover {
  color: #111;
  background: rgba(0,0,0,0.05);
}

.ai-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 0;
  scroll-behavior: smooth;
}

.ai-body::-webkit-scrollbar { width: 6px; height: 6px; }
.ai-body::-webkit-scrollbar-track { background: transparent; }
.ai-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 99px; border: 2px solid transparent; background-clip: content-box; }
.ai-body::-webkit-scrollbar-thumb:hover { background-color: rgba(0,0,0,0.25); }

#ai-content { display: flex; flex-direction: column; gap: 16px; padding-bottom: 4px; }

.ai-section { display: flex; flex-direction: column; gap: 6px; }

.ai-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  color: var(--ai-text-sub);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  user-select: none;
}

.ai-value {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ai-text-main);
}

/* Example styling */
.ai-section-example .ai-label { color: #6366F1; }
.ai-value-italic {
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  font-style: italic;
  color: #4B5563;
  background: rgba(0,0,0,0.025);
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid rgba(0,0,0,0.04);
  font-size: 13px;
}

.ai-footer {
  padding: 8px 12px;
  background: rgba(250, 250, 252, 0.8);
  border-top: 1px solid var(--ai-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--ai-text-muted);
  z-index: 2;
}

.ai-badge {
  background: rgba(0,0,0,0.04);
  color: #555;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.ai-link {
  color: var(--ai-text-muted);
  text-decoration: none;
  font-weight: 500;
  pointer-events: auto;
  transition: color 0.15s;
}
.ai-link:hover { color: #171717; }

.ai-loader {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 8px;
}
.shimmer-line {
  height: 10px;
  background: rgba(0,0,0,0.05);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}
.shimmer-line::after {
  content: '';
  position: absolute;
  top: 0; left: 0;
  height: 100%; width: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent);
  transform: translateX(-100%);
  animation: shimmer 1.5s infinite;
}
.width-full { width: 100%; }
.width-80 { width: 80%; }
.width-90 { width: 90%; }

.ai-btn-trigger {
  position: absolute;
  top: 0; left: 0;
  transform: translate(0, -140%) scale(1);
  background: #163d36;
  color: #f7f4e8;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.05);
  transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: auto;
  z-index: 10;
  animation: popIn 0.3s backwards;
}
.ai-btn-trigger:hover {
  transform: translate(0, -145%) scale(1.05);
  background: #102e28;
  box-shadow: 0 8px 20px rgba(0,0,0,0.25);
}
.ai-btn-trigger svg { width: 22px; height: 22px; fill: currentColor; }
.ai-btn-trigger .reading-page-accent { fill: #9fddbd; }

@keyframes popIn { from { opacity: 0; transform: translate(0, -80%) scale(0.8); } to { opacity: 1; transform: translate(0, -140%) scale(1); } }
@keyframes shimmer { 100% { transform: translateX(100%); } }
`;
  }

  function getIconSvg() {
    return `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M4.3 6C6.8 5.2 9.3 5.7 11.25 7.2V19.2C9.25 17.8 6.8 17.1 4.25 17.9C3.5 18.15 3 17.6 3 16.8V7.4C3 6.7 3.5 6.3 4.3 6Z" />
  <path class="reading-page-accent" d="M12.75 7.2C14.7 5.7 17.2 5.2 19.7 6C20.5 6.3 21 6.7 21 7.4V16.8C21 17.6 20.5 18.15 19.75 17.9C17.2 17.1 14.75 17.8 12.75 19.2Z" />
</svg>
`;
  }

  function getSelectionSnapshot() {
    const selection = window.getSelection();
    if (!selection || selection.type !== "Range" || selection.rangeCount === 0) return null;

    const text = selection.toString().trim();
    if (!text) return null;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;

    return {
      text,
      rect: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
    };
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function positionHostAtSelection(host, rect) {
    // Calculate the desired position relative to the document. We add scroll
    // offsets so that the overlay follows the viewport when scrolling and
    // remains near the selected text even inside transformed containers.
    const x = rect.right + 8 + window.scrollX;
    const y = rect.top + window.scrollY;

    // Constrain the overlay to the visible viewport area. Because the
    // element is absolutely positioned relative to the document, include
    // scroll offsets in the min/max calculations to keep the overlay
    // within the viewport bounds.
    const minX = window.scrollX + 8;
    const maxX = window.scrollX + window.innerWidth - 360;

    const minY = window.scrollY + 8;
    const maxY = window.scrollY + window.innerHeight - 320;

    host.style.left = `${clamp(x, minX, maxX)}px`;
    host.style.top = `${clamp(y, minY, maxY)}px`;
  }


  function showTriggerOnly(ui) {
    isPinnedOpen = false;
    ui.card.classList.remove("visible");
    ui.trigger.style.display = "flex";
  }

  function hideAll(host, ui) {
    isPinnedOpen = false;
    host.style.left = "-99999px";
    host.style.top = "-99999px";
    ui.card.classList.remove("visible");
    ui.trigger.style.display = "flex";
    cachedSelection = null;
  }


  function setLoading(ui, isLoading) {
    ui.card.setAttribute("aria-busy", String(isLoading));
    ui.loader.style.display = isLoading ? "flex" : "none";
    ui.content.style.display = isLoading ? "none" : "block";
  }

  function showMessage(ui, key, values = {}) {
    activeMessage = { key, values };
    activeExplanation = null;
    setLoading(ui, false);
    ui.content.textContent = t(key, values);
  }

  function showExtensionError(ui, error) {
    const message = error?.message || String(error || "");
    if (/extension context invalidated/i.test(message)) {
      showMessage(ui, "extensionReloaded");
    } else {
      showMessage(ui, "error", { error: message || t("unknownError") });
    }
  }

  function parseExplanationSections(text) {
    const raw = String(text || "");
    const lines = raw.split(/\r?\n/).map((l) => l.trim());

    let meaning = "";
    let example = "";

    for (const line of lines) {
      if (!line) continue;

      const m = line.match(/^(?:\d+\)\s*)?meaning\s*:\s*(.*)$/i);
      if (m) {
        meaning = m[1].trim();
        continue;
      }

      const e = line.match(/^(?:\d+\)\s*)?example\s*:\s*(.*)$/i);
      if (e) {
        example = e[1].trim();
        continue;
      }

      if (!meaning) {
        meaning = line;
        continue;
      }

      if (!example) {
        example = line;
        continue;
      }

      example += `\n${line}`;
    }

    if (!meaning && raw.trim()) meaning = raw.trim();

    return {
      meaning: meaning.trim(),
      example: example.trim(),
      raw: raw.trim(),
    };
  }

  function renderExplanation(ui, explanationText) {
    activeExplanation = explanationText;
    activeMessage = null;
    const { meaning, example } = parseExplanationSections(explanationText);

    ui.content.textContent = "";

    const root = document.createElement("div");
    root.id = "ai-content";

    const meaningSection = document.createElement("div");
    meaningSection.className = "ai-section ai-section-meaning";

    const meaningLabel = document.createElement("span");
    meaningLabel.className = "ai-label";
    meaningLabel.textContent = t("meaning");

    const meaningValue = document.createElement("p");
    meaningValue.className = "ai-value";
    meaningValue.textContent = meaning || "";
    meaningValue.lang = "en";

    meaningSection.appendChild(meaningLabel);
    meaningSection.appendChild(meaningValue);

    root.appendChild(meaningSection);

    if (example) {
      const exampleSection = document.createElement("div");
      exampleSection.className = "ai-section ai-section-example";

      const exampleLabel = document.createElement("span");
      exampleLabel.className = "ai-label";
      exampleLabel.textContent = t("example");

      const exampleValue = document.createElement("p");
      exampleValue.className = "ai-value ai-value-italic";
      exampleValue.textContent = example;
      exampleValue.lang = "en";

      exampleSection.appendChild(exampleLabel);
      exampleSection.appendChild(exampleValue);

      root.appendChild(exampleSection);
    }

    ui.content.appendChild(root);
  }

  async function openOptionsPage(ui) {
    try {
      const response = await chrome.runtime.sendMessage({ type: "ULW_OPEN_OPTIONS" });
      if (!response?.ok) throw new Error("OPEN_OPTIONS_FAILED");
    } catch {
      showMessage(ui, "extensionReloaded");
    }
  }

  function wireEvents(host, ui) {
    const cardHeader = ui.card.querySelector(".ai-header");
    let isDragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    cardHeader.addEventListener("mousedown", (e) => {
      isDragging = true;
      isPinnedOpen = true;
      startX = e.clientX;
      startY = e.clientY;

      const style = window.getComputedStyle(ui.card);
      startLeft = parseFloat(style.left) || 0;
      startTop = parseFloat(style.top) || 0;

      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      e.preventDefault();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      ui.card.style.left = `${startLeft + dx}px`;
      ui.card.style.top = `${startTop + dy}px`;
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });

    const header = ui.card.querySelector(".ai-header");
    
    header.addEventListener("mousedown", (e) => {
      isDragging = true;

      isPinnedOpen = true;
      startX = e.clientX;
      startY = e.clientY;

      const style = window.getComputedStyle(ui.card);
      startLeft = parseFloat(style.left) || 0;
      startTop = parseFloat(style.top) || 0;

      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      e.preventDefault();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      ui.card.style.left = `${startLeft + dx}px`;
      ui.card.style.top = `${startTop + dy}px`;
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });

    ui.trigger.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      isPinnedOpen = true;
    });

    ui.trigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!cachedSelection) return;

      isPinnedOpen = true;
      ui.trigger.style.display = "none";

      ui.title.textContent = cachedSelection.text;

      ui.card.classList.add("visible");
      setLoading(ui, true);
      activeMessage = null;
      activeExplanation = null;
      ui.content.textContent = "";

      try {
        chrome.runtime.sendMessage(
          { type: "ULW_GENERATE_EXPLANATION", selectionText: cachedSelection.text },
          (resp) => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              showExtensionError(ui, lastError);
              return;
            }

            if (!resp || !resp.ok) {
              const customErrors = { CUSTOM_ACCESS_REQUIRED: "customAccessRequired", INVALID_CUSTOM_URL: "customUrlInvalid", CUSTOM_MODEL_REQUIRED: "customModelRequired" };
              if (customErrors[resp?.error]) {
                showMessage(ui, customErrors[resp.error]);
                return;
              }
              if (resp?.error === "READING_LEVEL_REQUIRED") {
                showMessage(ui, "readingRequired");
                if (ui.badgeLevel) ui.badgeLevel.textContent = "";
                return;
              }
              if (resp?.error === "MISSING_API_KEY") {
                showMessage(ui, "keyMissing");
                if (ui.badgeLevel) ui.badgeLevel.textContent = "";
                return;
              }
              if (resp?.error === "RATE_LIMIT") {
                showMessage(ui, "rateLimit");
                return;
              }
              if (resp?.error === "PROVIDER_HTTP_401" || resp?.error === "PROVIDER_HTTP_403") {
                showMessage(ui, "providerDenied");
                return;
              }
              if (resp?.error === "PROVIDER_HTTP_429") {
                showMessage(ui, "quotaReached");
                return;
              }
              if (resp?.error === "PROVIDER_TIMEOUT") {
                showMessage(ui, "providerTimeout");
                return;
              }
              showMessage(ui, "error", { error: resp?.error || t("unknownError") });
              return;
            }

            setLoading(ui, false);
            renderExplanation(ui, resp.explanation);
            if (ui.badgeLevel) ui.badgeLevel.textContent = resp.cefrLevel || "";
          }
        );
      } catch (error) {
        // A reload can make sendMessage throw before its callback runs.
        // Showing a message in finally does not catch that exception.
        showExtensionError(ui, error);
      }
    });

    ui.closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      isPinnedOpen = false;
      ui.card.classList.remove("visible");
      ui.trigger.style.display = "flex";
    });


    ui.link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openOptionsPage(ui);
    });

    document.addEventListener(
      "mousedown",
      (e) => {
        const path = e.composedPath ? e.composedPath() : [];
        if (path.includes(host)) return;
        if (isPinnedOpen) {
          isPinnedOpen = false;
          ui.card.classList.remove("visible");
          // If we have selection, show trigger; otherwise keep hiding all
          if (cachedSelection) {
             ui.trigger.style.display = "flex";
          }
        }
      },
      true
    );


    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        ui.card.classList.remove("visible");
      }
    });

    document.addEventListener(
      "scroll",
      () => {
        if (isPinnedOpen) return;
        if (hideTimer) window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => hideAll(host, ui), 100);
      },
      { passive: true }
    );

    document.addEventListener(
      "selectionchange",
      () => {
        if (hideTimer) window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => {
          if (isPinnedOpen) return;
          const snap = getSelectionSnapshot();
          if (!snap) {
            hideAll(host, ui);
            return;
          }
          cachedSelection = snap;
          positionHostAtSelection(host, snap.rect);
          showTriggerOnly(ui);
        }, 300);
      },
      { passive: true }
    );

    document.addEventListener("mouseup", () => {
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        if (isPinnedOpen) return;
        const snap = getSelectionSnapshot();
        if (!snap) {
          hideAll(host, ui);
          return;
        }

        if (snap.text.length > 1000) {
          cachedSelection = snap;
          positionHostAtSelection(host, snap.rect);
          showTriggerOnly(ui);
          ui.title.textContent = snap.text;
          ui.card.classList.add("visible");
          showMessage(ui, "selectionTooLong");
          if (ui.badgeLevel) ui.badgeLevel.textContent = "";
          return;
        }

        cachedSelection = snap;
        positionHostAtSelection(host, snap.rect);
        showTriggerOnly(ui);
      }, 10);
    });
  }

  const host = createHost();
  const ui = createShadow(host);
  setLoading(ui, true);
  setLoading(ui, false);

  function applyLanguage(preference) {
    interfaceLanguage = resolveLanguage(preference);
    t = createTranslator(interfaceLanguage);
    ui.card.lang = interfaceLanguage;
    ui.shadow.getElementById("ai-host").lang = interfaceLanguage;
    ui.trigger.setAttribute("aria-label", t("explain"));
    ui.trigger.title = t("explain");
    ui.closeBtn.setAttribute("aria-label", t("close"));
    ui.loader.setAttribute("aria-label", t("loading"));
    ui.link.textContent = t("options");
    ui.badgeLabel.textContent = t("levelBadge");
    if (activeMessage) showMessage(ui, activeMessage.key, activeMessage.values);
    else if (activeExplanation) renderExplanation(ui, activeExplanation);
  }

  applyLanguage("auto");
  try {
    chrome.storage.local.get({ uiLanguage: "auto" }).then((stored) => applyLanguage(stored.uiLanguage)).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.uiLanguage) applyLanguage(changes.uiLanguage.newValue);
    });
  } catch {
    // Keep the local UI usable if the extension is reloaded during startup.
  }

  try {
    chrome.runtime.sendMessage({ type: "ULW_GET_SETTINGS" }, (resp) => {
      // Read lastError even during initialization to consume Chrome's error.
      if (chrome.runtime.lastError) return;
      if (resp?.ok && resp?.settings?.readingLevelConfirmed && resp?.settings?.cefrLevel && ui.badgeLevel) {
        ui.badgeLevel.textContent = resp.settings.cefrLevel;
      }
    });
  } catch {
    // The next user action will show the existing refresh-page guidance.
  }

  wireEvents(host, ui);
  hideAll(host, ui);
})();
