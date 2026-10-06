# Read English — Detailed guide

[← Back to the overview and language selector](../README.md)

Read English is a lightweight Chrome extension for English learners. It explains selected words/phrases directly on the page using simple English tailored to your CEFR level (A1 to C2).

Choose Gemini, Claude, GPT (OpenAI), DeepSeek, or Grok to keep your reading flow with comprehensible input (no translations).

## Website and store materials

The English landing page and its demonstration video are in [website](../website/README.md). Chrome Web Store listing text and privacy policy are in [store-assets](../store-assets/listing.md).

## Key Features

- Contextual explanations: select text on any webpage and request an English explanation
- Interface languages: English, Simplified/Traditional Chinese, Spanish, French, Portuguese, Japanese and Korean; automatic browser matching or a manual choice
- Reading self-placement: one original story rewritten at six A1–C2 difficulty levels, each about 200 English words, available offline without an API key
- Level-aware output: every A1–C2 level uses about 80% expressions at your level and 20% slightly new expressions, with support for understanding them
- English-only learning: avoids translation to build immersion
- Example sentence: each response includes a small example
- Performance: in-memory cache + basic rate limiting
- Provider-aware models: switching provider restores its own key, model choice and cached list; Refresh fetches the selected provider's available text models
- Custom provider: configure an OpenAI-compatible API base URL, choose Chat Completions or Responses, and enter a model ID manually or use Refresh
- Model test: ask the selected model to rewrite a fixed advanced sentence in A2 English and inspect its real reply before saving
- Local-first: API keys are stored on your device via `chrome.storage.local`

## Installation (Load Unpacked)

1. Clone/download this repository.
2. Open `chrome://extensions/`.
3. Enable "Developer mode".
4. Click "Load unpacked".
5. Select the folder that contains `manifest.json` (the repository root).

Works in Chrome and other Chromium-based browsers (Edge, Brave, etc.).

## Configuration

Before using the extension, choose a provider and add its API key:

1. On first installation, the options page opens automatically. You can also click the extension toolbar icon or "Options" in the on-page card.
2. Try the A1–C2 passages without a dictionary. Choose the highest level where you comfortably understand the meaning and most details; if unsure, choose the lower level. You can start anywhere and do not need to read all six. If A1 is difficult, start there and adjust your level later.
3. Select Model Provider: Gemini, Claude, GPT (OpenAI), DeepSeek, or Grok. Enter that provider's API key.
4. The model menu immediately shows that provider's saved list or starter model. Click "Refresh" to fetch models available to your key and pick one. Image, audio, embedding and other specialised model families are filtered out.
5. Click "Save" to apply the provider, keys, model choices, refreshed lists and learning settings. You can edit several providers before saving; their drafts are kept separately while switching.

Settings are stored locally via `chrome.storage.local`.

### Interface language

The language selector at the top of Settings offers English, 简体中文, 繁體中文, Español, Français, Português, 日本語 and 한국어. Automatic uses the browser's interface language, then a supported preferred language, and falls back to English. Chinese regions/scripts are matched to Simplified or Traditional Chinese.

Choosing a language updates and saves it immediately, including controls and status/error messages on existing webpage cards. It does not overwrite unsaved provider keys, model choices, or reading settings. Reading passages, their titles, and AI explanations remain in English; only the interface labels such as Meaning and Example are translated. Browser extension names, descriptions and toolbar tooltips use Chrome's native locale catalogs and follow the browser language.

All interface translations are bundled in `src/i18n.js`; language switching makes no model request. Add a complete dictionary and language entry there to extend the interface, and add a corresponding `_locales` catalog for browser metadata.

Previous Gemini keys, model choices and cached lists are retained automatically. A failed Refresh leaves the previous list and selection in place. Responses from a refresh are discarded if you change the provider or API key while it is loading. Changing provider does not make an API request until you click Refresh or generate an explanation.

### Custom provider

Select **Custom (OpenAI compatible)** to use another service or a local server. Enter an optional service name and the API **base URL**, including the provider's version or proxy path when needed. For example, `https://api.example.com/v1` or `http://localhost:1234/v1`. Do not append `/chat/completions`, `/responses`, or `/models`; the extension adds the endpoint for the selected operation.

Choose **OpenAI Chat Completions** (default) or **OpenAI Responses** according to the service's documentation. Fill in its API key, or leave the key empty for a server that does not require authentication. Enter the exact **Model ID**. Refresh calls `GET {base URL}/models` and fills the existing model menu; selecting from it updates the Model ID. If the service has no model-list endpoint, you can still enter a model ID and Save. Refresh preserves your manually entered model even when it is absent from the returned list.

Save or Refresh requests Chrome's optional access permission for that service's host. Denying access leaves saved settings unchanged and stops the request. Permissions must still be present when generating explanations. See [Chrome's optional permissions documentation](https://developer.chrome.com/docs/extensions/reference/api/permissions). The custom profile retains its own URL, format, key, model and list when switching to another provider. Changing its URL or API format clears the old model list and discards any old refresh response. Explanation caches distinguish URLs and API formats. This version provides one editable custom service profile.

### Test the selected model

Click **Test model** below the model menu to send one generation request using the currently displayed provider, key and model, including a custom service's address and API format. No Save or reading-level selection is required. For a custom service, Test model can also request the necessary host permission. The test makes a fresh request each time and does not save settings or populate the reading explanation cache.

The fixed advanced sentence is: “Notwithstanding the unforeseen setbacks, the committee remained resolute in its determination to implement a solution that would benefit the community.” The model connection test asks for a simple A2 English rewrite, using common words and up to three short sentences. The panel shows the original and the model's reply, or an error such as an invalid key, unavailable model, quota limit or timeout. A nonempty reply confirms that generation works; the displayed rewrite lets you judge how well the model follows the difficulty instruction. Changing the provider, key, model, custom address or format clears the old test result and ignores any reply still arriving for it. Switching interface language preserves the English reply and does not repeat the request.

### Built-in provider APIs

Model discovery uses each provider's authenticated models endpoint; generated explanations use the endpoints below. Actual availability depends on your account and key. The starter choice is a convenience, not a guarantee of access.

| Provider | Model discovery | Explanations / official reference |
| --- | --- | --- |
| Gemini | `GET /v1beta/models` | `POST /v1beta/models/{model}:generateContent` |
| Claude | `GET /v1/models` | [Messages API](https://platform.claude.com/docs/en/api/messages/create) |
| GPT (OpenAI) | [GET /v1/models](https://developers.openai.com/api/reference/resources/models/methods/list) | [Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses), with `store: false` |
| DeepSeek | [GET /models](https://api-docs.deepseek.com/api/list-models/) | [Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/) |
| Grok | [GET /v1/models](https://docs.x.ai/developers/rest-api-reference/inference/models) | [Chat Completions API](https://docs.x.ai/developers/model-capabilities/legacy/chat-completions) |

All six passages tell the same story, "A day with my friend", preserving its characters, events, and outcome while varying vocabulary and sentence structure. Judge how comfortably you understand the actual wording, rather than relying on remembering the plot from another version.

The passages provide an informal reading self-assessment, not a validated CEFR test or a measure of listening, speaking, or writing. Returning users are invited to try the samples before their next explanation; existing API keys and model settings are preserved. You can repeat the self-check or adjust your level in Settings later.

### Explanation difficulty

Every selected level from A1 to C2 uses the same automatic 80/20 balance: about 80% vocabulary and expressions familiar at that level, and about 20% slightly new expressions. New expressions must be supported by familiar context or a brief plain-English gloss. Sentence structure and the main meaning remain anchored at the user's selected level. The ratio applies across vocabulary and expressions in the response, rather than assigning one out of five sentences to a higher difficulty. At C2, new expressions can introduce natural phrasing or finer nuances.

There is no difficulty toggle. Older saved preferences for the removed toggle are ignored. The ratio is an approximate generation target; short explanations should stay natural instead of adding padding to reach an exact percentage. It cannot guarantee which words an individual learner already knows. Adjust your reading level in Settings if the explanations feel too easy or difficult.

The [official CEFR descriptions](https://www.coe.int/en/web/common-european-framework-reference-languages/table-1-cefr-3.3-common-reference-levels-global-scale) distinguish understanding the main ideas of complex texts at B2 from recognising implicit meaning in demanding, longer texts at C1. A small comprehensible challenge is not treated as a jump to the next entire CEFR band.

## How to Use

1. Visit any webpage with English content.
2. Highlight a word, phrase, or sentence.
3. Click the small "Explain" button (book icon) near your selection.
4. Read the explanation card (Meaning + Example).
5. You can drag the card by its header to reposition it.

## Security & Privacy Notes

- Your API keys are stored locally in `chrome.storage.local`, separately for each provider.
- Requests go directly from the background service worker to the selected provider: `generativelanguage.googleapis.com`, `api.anthropic.com`, `api.openai.com`, `api.deepseek.com`, `api.x.ai`, or your configured custom API address. Only the selected text and explanation prompt are sent for generation. Custom requests use the service you enter, which may itself be a proxy.
- Client-side API keys cannot be perfectly hidden from a determined user. Treat your key as a private credential.
- Never commit `.env`/key files or paste your API key into the repo.

## Troubleshooting

- Missing API key: open Options, check the selected provider and save its valid key.
- Refresh fails: check the provider/key and model permissions. A 429 response means the provider rejected the request due to quota or rate limits; the previous model list is kept.
- Reading level required: open Options, read a sample, and choose a comfortable level.
- Selection too long: selections are limited to 1000 characters.
- Rate limit: wait a few seconds and retry.
- Extension reloaded: refresh the current webpage after reloading the extension.

## Development checks

Run `node --test tests/*.test.mjs` with a recent Node.js version supporting ES module syntax detection (Node 22.7+). Tests cover translation completeness, language matching, manifest locale catalogs, reading samples, prompt difficulty, first-use gating, provider migration, built-in/custom model discovery and generation formats, model testing with unsaved settings, URL validation, optional host access, errors, rate limiting, and cache separation using mocked Chrome and API responses. These checks do not call paid provider APIs.

## License

MIT — see [LICENSE](../LICENSE).

## 中文快速入门

1. 安装：打开 `chrome://extensions/`，开启“开发者模式”，点击“加载已解压的扩展程序”，选择本项目根目录（包含 `manifest.json`）。
   设置页顶部可选界面语言，默认按浏览器语言自动匹配；支持英语、简体/繁体中文、西班牙语、法语、葡萄牙语、日语和韩语。选择后立即保存，网页提示同步更新；学习文章和解释内容仍为英文。
2. 试读：首次安装自动打开 Options。同一篇原创故事提供 A1–C2 六种难度，人物、事件和结局一致，每篇约 200 个英文单词，不用 API Key。选择词汇和句子都能轻松读懂的最高等级；拿不准时选低一级。这是阅读自评，不是正式等级考试。
3. 配置：选择 Gemini、Claude、GPT（OpenAI）、DeepSeek 或 Grok，填入对应 API Key。模型下拉菜单随供应商切换，点 Refresh 获取此 Key 的可用模型，再点 Save 保存。每家分别保存 Key、模型和列表；旧 Gemini 设置自动沿用。A1–C2 均自动采用约 80% 本等级表达、20% 稍难的新表达，并用上下文或简短解释帮助理解。觉得难时可重新试读或手动调低等级。
4. 使用：在网页选中英文文本，点击旁边出现的书本图标 Explain 按钮，即可查看英文解释。

自定义服务：在供应商中选“自定义（OpenAI 兼容）”，填写 API 基础地址、接口格式和模型 ID。Key 按服务要求填写；本地服务不需要 Key 时可留空。保留 Refresh 刷新按钮，也支持在服务没有模型列表时直接手动填写并保存。首次 Save 或 Refresh 会请求访问该服务地址的浏览器权限。

测试模型：选好模型后点“测试模型”，会用当前填写的配置，将一句高级英文改写成 A2 英文，并显示原句和模型回复。无需先保存，也不要求先完成阅读自评。每次测试都会发出一次生成请求；更换模型、Key 或服务地址后，旧结果会清除。
