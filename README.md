# Focus extension for Manifest V3

Unofficial Manifest V3 adaptation of [Brad Jasper’s Focus extension](https://github.com/bradjasper/focus-extension), for Chromium browsers that reject the original Manifest V2 extension. Requires the [Focus macOS app](https://heyfocus.com).

## Install

1. Download this repository using **Code → Download ZIP**, then extract it.
2. Open your browser’s extensions settings and enable **Developer mode**.
3. Choose **Load unpacked** and select the **extension** folder inside the extracted repository.
4. Confirm version **2.8.2**. Keep only one Focus extension enabled.
5. Start a Focus session with the desired website in its blocklist, then reload that website.

Requires Chromium 116 or later and support for unpacked extensions. After updating files, click Reload on the extension’s card.

## What changed

- Manifest V3 service worker replaces the persistent background page.
- Worker-compatible browser detection and current extension URL API.
- Local WebSocket connection with 20-second keepalive pings and reconnect alarms.
- Navigation, tab activation, and single-page application route checks.
- Support for both localhost block responses and the installed Focus app’s file-based block-page response.
- Malformed-message and stale-response handling.

## Verification

The user confirmed Twitter blocking worked in the ChatGPT desktop app’s embedded browser after loading version 2.8.2. This is a single-environment confirmation, not a guarantee for every browser or app version.

Run the six mocked worker regression tests with Node.js:

```sh
node --test extension/tests/worker.test.cjs
```

## Limitations

The extension follows active Focus sessions; it does not block independently. Focus must be running. It identifies itself to Focus as Chrome. It does not prevent the extension or app from being disabled or suspended. No Focus schedules or settings are included or modified.

## Attribution

Original extension and artwork: Brad Jasper / Focus. This fork is unofficial and is not endorsed by Focus or OpenAI. Upstream history and bundled third-party notices are retained. The upstream repository does not include a top-level license; this fork does not assert a new license over upstream code or artwork.

## Remove

Remove the extension from your browser’s extensions settings.
