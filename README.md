# theme-toggle-ts

[![CI](https://github.com/JCreatesGH/theme-toggle/actions/workflows/ci.yml/badge.svg)](https://github.com/JCreatesGH/theme-toggle/actions)
[![TypeScript](https://img.shields.io/badge/types-included-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Dark-mode theming done properly: respects the OS `prefers-color-scheme`, lets users override to light/dark/system, persists the choice, and ships a tiny inline script that **prevents the flash of wrong theme** on first paint. It also handles the parts most theme toggles miss — native controls (`color-scheme`), the mobile browser chrome (`<meta name="theme-color">`), Tailwind's `class` strategy, and **cross-tab sync**. Framework-agnostic, zero dependencies.

![screenshot](assets/screenshot.png)

## Install

```bash
npm install theme-toggle-ts
```

## Usage

```ts
import { ThemeEngine } from "theme-toggle-ts";

const engine = new ThemeEngine();      // reads storage + OS preference, applies data-theme
engine.toggle();                       // light <-> dark, persisted
engine.set("system");                  // follow the OS again
engine.cycle();                        // light -> dark -> system -> … (tri-state button)
engine.resolved;                       // "light" | "dark" (after resolving "system")

// React to changes (e.g. update an icon). In "system" mode this also fires when
// the OS flips light/dark while the page is open.
const off = engine.subscribe((resolved) => updateIcon(resolved));
// ...later: off();  engine.destroy();
```

Style off the attribute:

```css
:root            { --bg: #fff; --fg: #111; }
[data-theme=dark]{ --bg: #0f1117; --fg: #e6edf3; }
body { background: var(--bg); color: var(--fg); }
```

### Get the details right

```ts
const engine = new ThemeEngine({
  classNames: { dark: "dark" },                    // Tailwind: toggles class="dark" on <html>
  themeColor: { light: "#ffffff", dark: "#0f1117" }, // syncs <meta name="theme-color"> (mobile chrome)
  syncAcrossTabs: true,                            // mirror the choice into other open tabs
  // colorScheme: true (default) → sets `color-scheme` so native controls/scrollbars match
});
```

- **`color-scheme`** is set on the root by default, so date pickers, scrollbars, and form
  controls render in the right palette. Disable with `colorScheme: false`.
- **Tailwind** users pass `classNames: { dark: "dark" }` to drive `dark:` variants — the
  `data-theme` attribute is still set too, so both styling strategies work.
- **`theme-color`** keeps the mobile address bar in sync; pass `metaElement` to target a
  specific tag, otherwise it finds `meta[name="theme-color"]`.
- **Cross-tab sync** (`syncAcrossTabs: true`) listens for `storage` events so toggling the
  theme in one tab updates the others live.

### No flash of wrong theme

Drop this in `<head>` **before** your stylesheet so the correct theme is set before first paint:

```html
<script>
  // import { noFlashScript } from "theme-toggle-ts" to generate this string
  (function(){try{var t=localStorage.getItem('theme')||'system';
   var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
   document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();
</script>
```

## API

- `new ThemeEngine(options?)` — `{ storageKey, attribute, element, store, matchMedia, classNames, colorScheme, themeColor, metaElement, window, syncAcrossTabs }`, all injectable (which is why it's 100% testable without a DOM).
- `.theme` → `"light" | "dark" | "system"` (the user's choice)
- `.resolved` → `"light" | "dark"` (what's actually applied)
- `.set(theme)` · `.toggle()` · `.cycle()` — change the theme
- `.subscribe(listener)` → returns an unsubscribe fn; fires on every resolved-theme change, **including live OS light/dark switches while in `system` mode, and cross-tab changes**
- `.destroy()` — detach the OS + cross-tab listeners and drop subscribers
- `noFlashScript(opts?)` — accepts `{ storageKey, attribute, colorScheme, classNames }` (or legacy positional `storageKey, attribute`); the generated script reflects `color-scheme` and classes too, so there's no flash on any of them
- `resolveTheme()` · `systemPrefersDark()`

A runnable `demo.html` is included.

## Development

```bash
npm install && npm test    # 26 tests
```

## License

MIT
