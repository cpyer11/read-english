# Chrome 应用商店资料草稿

## 英文介绍

Read English helps you understand English while staying on the webpage you are reading.

Select an English word, phrase, or sentence and click Explain. Get a short explanation and an example in English, with the difficulty guided by your selected reading level from A1 to C2.

Features:
- Read explanations directly on the current webpage.
- Choose your reading level with six built-in offline sample passages.
- Get English explanations and examples without switching to translation.
- Use Gemini, Claude, GPT (OpenAI), DeepSeek, Grok, or a custom OpenAI-compatible service.
- Choose your own model and use your own API key.
- Test your model connection before saving settings.
- Keep settings and API keys in local browser storage.
- Choose from eight interface languages.

The extension is free and open source. Actual AI explanations require a configured model service; that service may charge you separately. The built-in reading samples work offline without an API key. This is a reading aid, not a formal CEFR assessment. AI-generated explanations may be inaccurate.

## 中文介绍

在网页上，用读得懂的英文理解英文。

选中英文单词、短语或句子，点击 Explain，即可在当前网页查看英文解释与例句。通过 A1–C2 六级试读，选择适合自己的阅读难度。

支持 Gemini、Claude、GPT、DeepSeek、Grok，以及自定义 OpenAI 兼容服务。你可以选择模型、使用自己的 API Key，并在设置页测试连接。

插件免费开源。实际生成解释需要配置模型服务，该服务的费用由对应服务商收取。内置阅读试读无需 API Key，可离线使用。阅读等级是自评参考，不是正式 CEFR 考试；AI 解释也可能有偏差。

## Single purpose

Help English learners understand user-selected English text by displaying level-appropriate English explanations and examples on the current webpage.

## Permissions justification

### storage

Stores the user's reading level, interface language, selected model provider, model settings, API keys, and cached model lists locally in chrome.storage.local. It is required to preserve the user's reading and connection settings across browser sessions.

### Website access / content scripts

The user may read English on any webpage. The bundled content script provides a selection-triggered Explain button and an explanation card on that page. Generation occurs when the user explicitly requests an explanation. The extension sends the selected text and its explanation prompt to the model provider chosen by the user; it does not send the whole page or browsing history.

### Built-in provider host permissions

Allows the extension's background worker to request model lists and generate explanations directly using the user's credentials at the selected built-in provider: Google Gemini, Anthropic, OpenAI, DeepSeek, or xAI.

### Optional host permissions

Allows a user-configured OpenAI-compatible service, including a local service. The extension requests access to the configured service's specific origin when the user saves or tests that configuration. The broad optional patterns permit user-chosen origins; they are not all granted automatically.

## Remote code

No remotely hosted code is executed. Extension JavaScript is bundled locally. Model APIs return data/text for display rather than executable code.

## Data disclosure notes

- Do not claim that no user data is processed: selected webpage text is sent to the user's chosen model service.
- Website content is processed to provide explanations.
- User-entered API credentials are kept locally and used to authenticate requests to the configured model service.
- There is no developer-operated analytics or data-collection endpoint in this version.
- Review the actual dashboard categories before completing the disclosure fields. The privacy policy and submitted declarations must remain consistent.
- Any declarations or agreements that legally bind the publisher must be reviewed by the account owner.

## Review instructions

1. Install the extension and open its settings.
2. The six A1–C2 sample passages are available without a key. Select a comfortable reading level.
3. Choose a model provider and enter a valid API key for that provider, or configure a compatible local service.
4. Select a text model. Test model submits a fixed English sentence and displays an A2 rewrite. Save the settings.
5. Open a normal English webpage, select a short word or phrase, and click Explain.
6. Verify that an English Meaning and Example appear in the webpage card.

No account or credential for the extension developer is required. API service credentials are external and are not included in the upload package. A reviewer who needs a dedicated test credential should request it from the publisher; never include the publisher's personal key in the ZIP or listing.

## 尚需填写的真实资料

- 发布者账号、联系邮箱及注册状态。
- 对外公开且可访问的隐私政策 URL。
- 至少一张真实使用截图（1280×800 或 640×400）。
- 440×280 商店宣传图。
- 上传后产生的插件 ID 和商店详情页 URL。

参考：[上传步骤](https://developer.chrome.com/docs/webstore/publish)、[图片要求](https://developer.chrome.com/docs/webstore/images)、[隐私字段](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)。
