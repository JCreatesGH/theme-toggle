import { describe, it, expect } from "vitest";
import { ThemeEngine, resolveTheme, noFlashScript } from "./core";

function fakeElement() {
  const attrs: Record<string, string> = {};
  return { setAttribute: (k: string, v: string) => { attrs[k] = v; }, attrs };
}
// A richer fake with classList + style, for the apply-strategy tests.
function fakeRichElement() {
  const attrs: Record<string, string> = {};
  const classes = new Set<string>();
  const style: { colorScheme?: string } = {};
  return {
    setAttribute: (k: string, v: string) => { attrs[k] = v; },
    classList: { add: (...t: string[]) => t.forEach((c) => classes.add(c)),
                 remove: (...t: string[]) => t.forEach((c) => classes.delete(c)) },
    style,
    attrs, classes, _style: style,
  };
}
// A fake window that can fire `storage` events, for cross-tab tests.
function fakeWindow() {
  const cbs = new Set<(e: any) => void>();
  return {
    addEventListener: (_e: string, cb: any) => cbs.add(cb),
    removeEventListener: (_e: string, cb: any) => cbs.delete(cb),
    _storage: (key: string, newValue: string | null) => cbs.forEach((cb) => cb({ key, newValue })),
    _count: () => cbs.size,
  };
}
function fakeStore(initial: any = null) {
  let v = initial;
  return { get: () => v, set: (t: any) => { v = t; }, peek: () => v };
}
const mm = (dark: boolean) => () => ({ matches: dark });

// A fake MediaQueryList that can fire `change` events, for testing live OS updates.
function fakeMM(initialDark: boolean) {
  let matches = initialDark;
  const cbs = new Set<(e: { matches: boolean }) => void>();
  const mql = {
    get matches() { return matches; },
    addEventListener: (_e: string, cb: any) => cbs.add(cb),
    removeEventListener: (_e: string, cb: any) => cbs.delete(cb),
    _change: (d: boolean) => { matches = d; cbs.forEach((cb) => cb({ matches: d })); },
  };
  return { mm: () => mql, mql };
}

describe("resolveTheme", () => {
  it("resolves system to the OS preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
  it("explicit themes win over OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("ThemeEngine", () => {
  it("applies resolved theme to the element on construct", () => {
    const el = fakeElement();
    const e = new ThemeEngine({ element: el, store: fakeStore("dark"), matchMedia: mm(false) });
    expect(el.attrs["data-theme"]).toBe("dark");
    expect(e.resolved).toBe("dark");
  });

  it("defaults to system and follows OS when no stored value", () => {
    const el = fakeElement();
    const e = new ThemeEngine({ element: el, store: fakeStore(null), matchMedia: mm(true) });
    expect(e.theme).toBe("system");
    expect(el.attrs["data-theme"]).toBe("dark");
  });

  it("toggle flips and persists", () => {
    const el = fakeElement();
    const store = fakeStore("light");
    const e = new ThemeEngine({ element: el, store, matchMedia: mm(false) });
    expect(e.toggle()).toBe("dark");
    expect(el.attrs["data-theme"]).toBe("dark");
    expect(store.peek()).toBe("dark");
    expect(e.toggle()).toBe("light");
  });

  it("set persists the chosen theme", () => {
    const store = fakeStore(null);
    const e = new ThemeEngine({ element: fakeElement(), store, matchMedia: mm(false) });
    e.set("dark");
    expect(store.peek()).toBe("dark");
  });

  it("custom attribute name", () => {
    const el = fakeElement();
    new ThemeEngine({ element: el, attribute: "data-mode", store: fakeStore("dark"), matchMedia: mm(false) });
    expect(el.attrs["data-mode"]).toBe("dark");
  });
});

describe("ThemeEngine system reactivity", () => {
  it("live-follows the OS in system mode", () => {
    const el = fakeElement();
    const { mm, mql } = fakeMM(false);
    const e = new ThemeEngine({ element: el, store: fakeStore(null), matchMedia: mm });
    expect(el.attrs["data-theme"]).toBe("light");
    mql._change(true);
    expect(el.attrs["data-theme"]).toBe("dark");
    expect(e.resolved).toBe("dark");
  });

  it("ignores OS changes once an explicit theme is chosen", () => {
    const el = fakeElement();
    const { mm, mql } = fakeMM(false);
    const e = new ThemeEngine({ element: el, store: fakeStore(null), matchMedia: mm });
    e.set("light");
    mql._change(true);
    expect(el.attrs["data-theme"]).toBe("light");
  });

  it("subscribe is notified on change; unsubscribe stops it", () => {
    const { mm, mql } = fakeMM(false);
    const e = new ThemeEngine({ element: fakeElement(), store: fakeStore("system"), matchMedia: mm });
    const seen: string[] = [];
    const off = e.subscribe((r) => seen.push(r));
    mql._change(true);    // system -> dark
    e.set("light");       // -> light
    off();
    e.set("dark");        // not recorded
    expect(seen).toEqual(["dark", "light"]);
  });

  it("destroy detaches the OS listener", () => {
    const el = fakeElement();
    const { mm, mql } = fakeMM(false);
    const e = new ThemeEngine({ element: el, store: fakeStore("system"), matchMedia: mm });
    e.destroy();
    mql._change(true);
    expect(el.attrs["data-theme"]).toBe("light");
  });

  it("cycle goes light -> dark -> system -> light", () => {
    const e = new ThemeEngine({ element: fakeElement(), store: fakeStore("light"), matchMedia: mm(false) });
    expect(e.cycle()).toBe("dark");
    expect(e.cycle()).toBe("system");
    expect(e.cycle()).toBe("light");
  });
});

describe("ThemeEngine apply strategies", () => {
  it("sets color-scheme on the element style by default", () => {
    const el = fakeRichElement();
    new ThemeEngine({ element: el, store: fakeStore("dark"), matchMedia: mm(false) });
    expect(el._style.colorScheme).toBe("dark");
  });

  it("can disable color-scheme syncing", () => {
    const el = fakeRichElement();
    new ThemeEngine({ element: el, store: fakeStore("dark"), matchMedia: mm(false), colorScheme: false });
    expect(el._style.colorScheme).toBeUndefined();
  });

  it("toggles Tailwind-style classes alongside the attribute", () => {
    const el = fakeRichElement();
    const e = new ThemeEngine({
      element: el, store: fakeStore("dark"), matchMedia: mm(false),
      classNames: { dark: "dark" },
    });
    expect(el.classes.has("dark")).toBe(true);
    e.set("light");
    expect(el.classes.has("dark")).toBe(false);
    expect(el.attrs["data-theme"]).toBe("light");
  });

  it("swaps explicit light/dark class names", () => {
    const el = fakeRichElement();
    const e = new ThemeEngine({
      element: el, store: fakeStore("light"), matchMedia: mm(false),
      classNames: { light: "theme-light", dark: "theme-dark" },
    });
    expect(el.classes.has("theme-light")).toBe(true);
    e.toggle();
    expect(el.classes.has("theme-dark")).toBe(true);
    expect(el.classes.has("theme-light")).toBe(false);
  });

  it("syncs the theme-color meta tag", () => {
    const meta = fakeElement();
    const e = new ThemeEngine({
      element: fakeElement(), store: fakeStore("light"), matchMedia: mm(false),
      themeColor: { light: "#ffffff", dark: "#0f1117" }, metaElement: meta,
    });
    expect(meta.attrs["content"]).toBe("#ffffff");
    e.toggle();
    expect(meta.attrs["content"]).toBe("#0f1117");
  });
});

describe("ThemeEngine cross-tab sync", () => {
  it("mirrors a theme change from another tab", () => {
    const el = fakeElement();
    const win = fakeWindow();
    const e = new ThemeEngine({
      element: el, store: fakeStore("light"), matchMedia: mm(false),
      window: win, syncAcrossTabs: true,
    });
    expect(el.attrs["data-theme"]).toBe("light");
    win._storage("theme", "dark");
    expect(el.attrs["data-theme"]).toBe("dark");
    expect(e.theme).toBe("dark");
  });

  it("ignores storage events for other keys", () => {
    const el = fakeElement();
    const win = fakeWindow();
    new ThemeEngine({
      element: el, store: fakeStore("light"), matchMedia: mm(false),
      storageKey: "theme", window: win, syncAcrossTabs: true,
    });
    win._storage("other-key", "dark");
    expect(el.attrs["data-theme"]).toBe("light");
  });

  it("does not register a listener unless syncAcrossTabs is on", () => {
    const win = fakeWindow();
    new ThemeEngine({ element: fakeElement(), store: fakeStore("light"), matchMedia: mm(false), window: win });
    expect(win._count()).toBe(0);
  });

  it("destroy detaches the storage listener", () => {
    const el = fakeElement();
    const win = fakeWindow();
    const e = new ThemeEngine({
      element: el, store: fakeStore("light"), matchMedia: mm(false),
      window: win, syncAcrossTabs: true,
    });
    e.destroy();
    expect(win._count()).toBe(0);
    win._storage("theme", "dark");
    expect(el.attrs["data-theme"]).toBe("light");
  });
});

describe("noFlashScript", () => {
  it("returns an IIFE referencing the storage key", () => {
    const s = noFlashScript("mytheme");
    expect(s).toContain("mytheme");
    expect(s.startsWith("(function()")).toBe(true);
  });

  it("escapes quotes in the storage key and attribute", () => {
    const s = noFlashScript("a'b");
    expect(s).toContain("a\\'b");
  });

  it("accepts an options object and includes color-scheme by default", () => {
    const s = noFlashScript({ storageKey: "t", attribute: "data-mode" });
    expect(s).toContain("data-mode");
    expect(s).toContain("style.colorScheme");
  });

  it("omits color-scheme when disabled", () => {
    const s = noFlashScript({ colorScheme: false });
    expect(s).not.toContain("colorScheme");
  });

  it("emits classList toggling when classNames is set", () => {
    const s = noFlashScript({ classNames: { dark: "dark" } });
    expect(s).toContain("classList.add('dark')");
    expect(s).toContain("classList.remove('dark')");
  });
});
