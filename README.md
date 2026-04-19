Obsidian AI Clipper is a fork focused on staged snippet capture for Obsidian. It lets you highlight, stage, reorder, format, and send content to Obsidian, then clear staged snippets automatically after a successful save.

- **[Install from source](#install-the-extension-locally)**
- **[Workflow](#use-the-extension)**
- **[Developer notes](#developers)**

## Get started

Build the extension locally and load the generated `dist/` directory in your browser.

### Install the extension locally

1. Run `npm run build`.
2. Open your browser's extensions page.
3. Load the unpacked `dist/` directory.

For Chromium-based browsers:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` directory

For Firefox:

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `dist_firefox/manifest.json`

For Safari on macOS and iOS:

1. Run `npm run build`
2. Open `xcode/Obsidian Web Clipper/Obsidian Web Clipper.xcodeproj` in Xcode
3. Build and run the app target for the platform you want to test
4. Enable the extension in Safari and load the generated app/extension

## Use the extension

The capture flow is staged first, then saved to Obsidian:

1. Select text or a visible element on a page.
2. Click **Add to staging** to create a staged snippet.
3. Add more snippets as needed, then reorder them in the staging panel.
4. Choose a snippet format in settings if you want compact, plain text, or a custom template.
5. Click **Add to Obsidian** to send the staged content to your note.
6. The staged snippets clear automatically after a successful save when that option is enabled.

The staging panel shows both a card view and a Markdown preview. Highlighted page selections stay linked to the staged snippet until the snippet is removed or saved.

## Contribute

### Translations

You can help translate Obsidian AI Clipper into your language. Submit your translation via pull request using the format found in the [/_locales](/src/_locales) folder.

### Features and bug fixes

Open issues in this fork are the source of truth for follow-up work.

## Roadmap

In no particular order:

- [ ] Separate icon and branding pass
- [ ] Lean settings pass
- [ ] Template directory
- [x] Template validation
- [x] Template logic (if/for)
- [x] Snippet staging with auto-clear after save

## Developers

To build the extension:

```
npm run build
```

This will create three directories:
- `dist/` for the Chromium version
- `dist_firefox/` for the Firefox version
- `dist_safari/` for the Safari version

### Install the extension locally

For Chromium browsers, such as Chrome, Brave, Edge, and Arc:

1. Open your browser and navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist` directory

For Firefox:

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Navigate to the `dist_firefox` directory and select the `manifest.json` file

If you want to run the extension permanently you can do so with the Nightly or Developer versions of Firefox.

1. Type `about:config` in the URL bar
2. In the Search box type `xpinstall.signatures.required`
3. Double-click the preference, or right-click and select "Toggle", to set it to `false`.
4. Go to `about:addons` > gear icon > **Install Add-on From File…**

For iOS Simulator testing on macOS:

1. Run `npm run build` to build the extension
2. Open `xcode/Obsidian Web Clipper/Obsidian Web Clipper.xcodeproj` in Xcode
3. Select the **Obsidian Web Clipper (iOS)** scheme from the scheme selector
4. Choose an iOS Simulator device and click **Run** to build and launch the app
5. Once the app is running on the simulator, open **Safari**
6. Navigate to a webpage and tap the **Extensions** button in Safari to access the Obsidian AI Clipper extension

### Run tests

```
npm test
```

Or run in watch mode during development:

```
npm run test:watch
```

## Third-party libraries

- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) for browser compatibility
- [defuddle](https://github.com/kepano/defuddle) for content extraction and Markdown conversion
- [dayjs](https://github.com/iamkun/dayjs) for date parsing and formatting
- [lz-string](https://github.com/pieroxy/lz-string) to compress templates to reduce storage space
- [lucide](https://github.com/lucide-icons/lucide) for icons
- [dompurify](https://github.com/cure53/DOMPurify) for sanitizing HTML
