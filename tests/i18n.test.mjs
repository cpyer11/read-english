import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../src/i18n.js";

const { languages, messages, resolveLanguage, createTranslator, normalizePreference } = globalThis.ULWI18n;

test("every supported interface language translates every key and preserves placeholders", () => {
  const keys = Object.keys(messages.en).sort();
  for (const language of Object.keys(languages)) {
    assert.deepEqual(Object.keys(messages[language]).sort(), keys, `${language}: missing translations`);
    for (const key of keys) {
      assert.ok(messages[language][key].trim(), `${language}.${key}: empty translation`);
      const placeholders = (text) => [...new Set(text.match(/\{\w+\}/g) || [])].sort();
      assert.deepEqual(placeholders(messages[language][key]), placeholders(messages.en[key]), `${language}.${key}: incorrect parameters`);
    }
  }
  const html = fs.readFileSync(new URL("../src/options.html", import.meta.url), "utf8");
  for (const match of html.matchAll(/data-i18n(?:-aria)?="(\w+)"/g)) assert.ok(messages.en[match[1]], `Unknown HTML translation key ${match[1]}`);
});

test("browser language matching covers regions, Chinese scripts, override and fallback", () => {
  for (const [tags, expected] of [
    [["en-GB"], "en"], [["zh-CN"], "zh-CN"], [["zh_Hant_HK"], "zh-TW"],
    [["zh-TW"], "zh-TW"], [["zh-Hans"], "zh-CN"], [["es-MX"], "es"],
    [["fr-CA"], "fr"], [["pt-BR"], "pt"], [["ja-JP"], "ja"], [["ko-KR"], "ko"],
    [["de-DE", "es-ES"], "es"], [["de-DE"], "en"],
  ]) assert.equal(resolveLanguage("auto", tags), expected);
  assert.equal(resolveLanguage("ja", ["zh-CN"]), "ja");
  assert.equal(normalizePreference("__proto__"), "auto");
  assert.equal(resolveLanguage("unsupported", ["fr-FR"]), "fr");
  assert.equal(createTranslator("unsupported")("save"), "Save");
  assert.equal(createTranslator("zh-CN")("chooseLevel", { level: "B2" }), "选择 B2 作为我的阅读等级");
});

test("manifest localization is complete and content scripts load translations first", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.default_locale, "en");
  const sourceKeys = [manifest.name, manifest.description, manifest.action.default_title].map((text) => text.match(/^__MSG_(\w+)__$/)?.[1]);
  for (const locale of ["en", "zh_CN", "zh_TW", "es", "fr", "pt_BR", "pt_PT", "ja", "ko"]) {
    const catalog = JSON.parse(fs.readFileSync(new URL(`../_locales/${locale}/messages.json`, import.meta.url), "utf8"));
    for (const key of sourceKeys) assert.ok(catalog[key]?.message, `${locale}: missing manifest key ${key}`);
    assert.ok(catalog.extensionName.message.length <= 75);
    assert.ok(catalog.extensionDescription.message.length <= 132);
  }
  const scripts = manifest.content_scripts[0].js;
  assert.ok(scripts.indexOf("src/i18n.js") < scripts.indexOf("src/contentScript.js"));
});
