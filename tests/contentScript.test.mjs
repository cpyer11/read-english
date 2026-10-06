import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/contentScript.js", import.meta.url), "utf8");
const translations = fs.readFileSync(new URL("../src/i18n.js", import.meta.url), "utf8");
const invalidated = () => new Error("Extension context invalidated.");

function loadContentScript({ sendMessage, storageGet } = {}) {
  class Element {
    children = [];
    style = {};
    listeners = new Map();
    attributes = {};
    textContent = "";
    classList = {
      add() {},
      remove() {},
    };
    appendChild(child) { this.children.push(child); return child; }
    append(...children) { this.children.push(...children); }
    attachShadow() { this.shadow = new Element(); return this.shadow; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    querySelector(selector) {
      const matches = selector.startsWith("#")
        ? (child) => child.id === selector.slice(1)
        : (child) => child.className === selector.slice(1);
      for (const child of this.children) {
        if (matches(child)) return child;
        const nested = child.querySelector(selector);
        if (nested) return nested;
      }
      return null;
    }
    getElementById(id) { return this.querySelector(`#${id}`); }
    async dispatch(type) {
      for (const listener of this.listeners.get(type) || []) {
        await listener({ preventDefault() {}, stopPropagation() {} });
      }
    }
  }

  const document = new Element();
  document.documentElement = new Element();
  document.createElement = () => new Element();
  document.createTextNode = (text) => Object.assign(new Element(), { textContent: text });
  document.getElementById = (id) => document.documentElement.getElementById(id);
  const timers = new Map();
  let timerId = 0;
  const calls = [];
  const chrome = {
    storage: {
      local: { get: storageGet || (async () => ({ uiLanguage: "en" })) },
      onChanged: { addListener() {} },
    },
    runtime: {
      sendMessage(message, callback) {
        calls.push(message);
        if (sendMessage) return sendMessage(message, callback, chrome.runtime);
        callback?.({ ok: true });
      },
    },
  };
  const context = vm.createContext({
    document, chrome,
    navigator: { languages: ["en"] },
    window: {
      scrollX: 0, scrollY: 0, innerWidth: 1280, innerHeight: 800,
      setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
      clearTimeout(id) { timers.delete(id); },
      getSelection: () => ({
        type: "Range", rangeCount: 1, toString: () => "give it a try",
        getRangeAt: () => ({ getBoundingClientRect: () => ({
          left: 20, right: 100, top: 20, bottom: 40, width: 80, height: 20,
        }) }),
      }),
    },
  });
  vm.runInContext(translations, context);
  vm.runInContext(source, context);
  const shadow = document.documentElement.children[0].shadow;
  return {
    calls, chrome,
    content: shadow.getElementById("ai-content"),
    loader: shadow.getElementById("ai-loader"),
    badge: shadow.getElementById("user-level"),
    async explain() {
      await document.dispatch("mouseup");
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach((callback) => callback());
      await shadow.getElementById("ai-trigger").dispatch("click");
    },
  };
}

test("old page catches synchronous sendMessage failures after extension reload", async () => {
  const page = loadContentScript({ sendMessage(message, callback) {
    if (message.type === "ULW_GET_SETTINGS") return callback({ ok: true });
    throw invalidated();
  } });
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.explain();
    assert.match(page.content.textContent, /Refresh this webpage/);
    assert.equal(page.loader.style.display, "none");
  }
});

test("callback failures show refresh guidance or the actual connection error", async () => {
  for (const [message, expected] of [
    ["Extension context invalidated.", /Refresh this webpage/],
    ["Could not establish connection. Receiving end does not exist.", /Error: Could not establish connection/],
  ]) {
    const page = loadContentScript({ sendMessage(request, callback, runtime) {
      if (request.type === "ULW_GET_SETTINGS") return callback({ ok: true });
      runtime.lastError = { message };
      callback();
      delete runtime.lastError;
    } });
    await page.explain();
    assert.match(page.content.textContent, expected);
    assert.equal(page.loader.style.display, "none");
  }
});

test("reload during initialization still wires the refresh guidance", async () => {
  const page = loadContentScript({
    storageGet() { throw invalidated(); },
    sendMessage() { throw invalidated(); },
  });
  await page.explain();
  assert.match(page.content.textContent, /Refresh this webpage/);
});

test("initial settings callback consumes runtime.lastError", () => {
  let reads = 0;
  loadContentScript({ sendMessage(_message, callback, runtime) {
    Object.defineProperty(runtime, "lastError", { get() {
      reads++;
      return { message: "Could not establish connection." };
    } });
    callback();
  } });
  assert.equal(reads, 1);
});

test("rejected language storage does not prevent explanations", async () => {
  const page = loadContentScript({ storageGet: () => Promise.reject(invalidated()) });
  await page.explain();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.calls.at(-1).type, "ULW_GENERATE_EXPLANATION");
});

test("successful explanations and provider errors still render", async () => {
  let response = { ok: true, explanation: "Meaning: Try something.\nExample: Give it a try.", cefrLevel: "B1" };
  const page = loadContentScript({ sendMessage(message, callback) {
    callback(message.type === "ULW_GET_SETTINGS" ? { ok: true } : response);
  } });
  await page.explain();
  assert.equal(page.loader.style.display, "none");
  assert.equal(page.badge.textContent, "B1");
  const sections = page.content.children.at(-1).children;
  assert.equal(sections[0].children[1].textContent, "Try something.");
  assert.equal(sections[1].children[1].textContent, "Give it a try.");
  response = { ok: false, error: "MISSING_API_KEY" };
  await page.explain();
  assert.match(page.content.textContent, /API key/);
});
