# Read English Privacy Policy

Effective date: October 4, 2026

This policy describes the data handling of Read English version 0.1.0, a free, open-source browser extension for English reading. It applies to the extension, not to the independent policies of model providers or a website hosting this policy.

## What is stored on your device

The extension uses `chrome.storage.local` to store your reading level, interface language, selected provider, API keys, model choices, custom-service address and format, and saved model lists. These settings are not synchronized by the extension to a developer-operated server.

Generated explanations may be cached temporarily in the background worker's memory for up to ten minutes. This cache is bounded and is not written to persistent extension storage.

## What is sent to a model service

When you request an explanation, the extension sends your selected text and an explanation prompt, including your selected reading level, to the model service you configured. Your API credentials are used to authenticate requests to that service. The extension does not send the entire webpage, its URL, or your browsing history for an explanation.

Refreshing models sends an authenticated model-list request to your selected provider. Testing a model sends a fixed example sentence and a rewrite prompt. The built-in reading samples and interface translations do not make model requests.

Supported built-in services are Google Gemini, Anthropic Claude, OpenAI, DeepSeek, and xAI. If you configure a custom service, requests go to the address you enter; that service may operate a proxy. Requests to an HTTP custom address are not encrypted by HTTPS. Each service may receive network information such as your IP address and may retain request data under its own policies. Choose and configure a provider whose policies you accept.

## Developer access and data use

This extension version has no developer-operated backend for collecting selections, credentials, browsing activity, or analytics. Its data handling is used to provide the reading and model-connection features described above. It does not sell user data or use it for advertising.

API responses are displayed as content. The extension does not load or execute remotely hosted JavaScript.

## Your choices

You choose the provider, API key, model, and custom-service address. You choose which text to explain. You can change these settings, revoke API keys at the provider, or uninstall the extension. Any information already received by a model provider remains subject to that provider's retention and deletion policies.

Do not select confidential text for explanation unless you are willing to send it to your chosen service. API keys stored in a browser extension are not an encrypted credential vault; protect access to your device and browser profile.

## Contact

For questions about the extension's data handling, use the project's public issue tracker: https://github.com/cpyer11/read-english/issues . Do not post API keys or other private information in public issues.

## Changes

This policy should be updated when the extension's data handling changes. The effective date above identifies this version of the policy.
