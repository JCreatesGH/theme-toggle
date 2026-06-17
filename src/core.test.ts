import { describe, it, expect } from "vitest";
import { ThemeEngine, resolveTheme, noFlashScript } from "./core";

function fakeElement() {
  const attrs: Record<string, string> = {};
  return { setAttribute: (k: string, v: string) => { attrs[k] = v; }, attrs };
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
});
