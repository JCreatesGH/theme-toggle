# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [0.2.0]

### Added
- **`color-scheme` sync** (on by default): the engine sets `element.style.colorScheme` so
  native controls, scrollbars, and form widgets render in the right palette. Opt out with
  `colorScheme: false`.
- **Tailwind-style `class` strategy**: pass `classNames: { dark: "dark" }` (or explicit
  `{ light, dark }`) to toggle classes on the root alongside the `data-theme` attribute.
- **`<meta name="theme-color">` sync** via `themeColor: { light, dark }`, keeping the mobile
  browser chrome in step. Targets `meta[name="theme-color"]` by default; override with
  `metaElement`.
- **Cross-tab sync** via `syncAcrossTabs: true` — a `storage` listener mirrors a theme
  change made in another tab (and fires subscribers). `destroy()` detaches it.
- `noFlashScript()` now accepts an options object (`{ storageKey, attribute, colorScheme,
  classNames }`) and the generated script reflects `color-scheme` and classes, so there's no
  flash on those either. The legacy positional signature still works.
- New exported types: `ThemeTarget`, `MetaTarget`, `ThemeColors`, `ClassNames`,
  `WindowLike`, `NoFlashOptions`.

### Changed
- The injectable `element` type widened from `{ setAttribute }` to `ThemeTarget` (optional
  `classList` / `style`), so existing minimal fakes remain valid.

## [0.1.0]

- Initial release: framework-agnostic light/dark/system theme engine with persistence, live
  OS following in `system` mode, `subscribe`/`toggle`/`cycle`, a no-flash inline script, and
  a fully injectable (DOM-free testable) design.
