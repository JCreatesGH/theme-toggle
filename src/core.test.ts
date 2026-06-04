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

describe("noFlashScript", () => {
  it("returns an IIFE referencing the storage key", () => {
    const s = noFlashScript("mytheme");
    expect(s).toContain("mytheme");
    expect(s.startsWith("(function()")).toBe(true);
  });
});
