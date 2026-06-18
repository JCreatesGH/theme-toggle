// Framework-agnostic theme engine: resolves system preference, persists choice,
// and applies a `data-theme` attribute (plus optional class / color-scheme /
// theme-color sync). No flash, no dependencies.
export type Theme = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

export interface ThemeStore {
  get(): Theme | null;
  set(theme: Theme): void;
}

// The DOM target. Only `setAttribute` is required; `classList`/`style` are used
// when present, so a minimal fake stays valid in tests.
export interface ThemeTarget {
  setAttribute(name: string, value: string): void;
  removeAttribute?(name: string): void;
  classList?: { add(...tokens: string[]): void; remove(...tokens: string[]): void };
  style?: { colorScheme?: string };
}

// A minimal `<meta>`-like element for syncing the mobile browser-chrome color.
export interface MetaTarget {
  setAttribute(name: string, value: string): void;
}

export interface ThemeColors {
  light: string;
  dark: string;
}

export interface ClassNames {
  light?: string;
  dark?: string;
}

export interface WindowLike {
  addEventListener?: Function;
  removeEventListener?: Function;
}

export interface ThemeEngineOptions {
  storageKey?: string;
  attribute?: string;             // attribute set on the root element
  element?: ThemeTarget;
  store?: ThemeStore;
  matchMedia?: (query: string) => { matches: boolean; addEventListener?: Function; removeEventListener?: Function };
  /** Toggle Tailwind-style classes (`{ dark: "dark" }`) in addition to the attribute. */
  classNames?: ClassNames;
  /** Set `element.style.colorScheme` so native controls/scrollbars match. Default: true. */
  colorScheme?: boolean;
  /** Sync `<meta name="theme-color">` for the mobile browser chrome. */
  themeColor?: ThemeColors;
  /** Target meta element; defaults to `meta[name="theme-color"]` in the document. */
  metaElement?: MetaTarget | null;
  /** Window used for cross-tab `storage` events; defaults to the global window. */
  window?: WindowLike;
  /** Update this tab when the theme changes in another tab. Default: false. */
  syncAcrossTabs?: boolean;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function systemPrefersDark(mm?: ThemeEngineOptions["matchMedia"]): boolean {
  const fn = mm ?? (typeof window !== "undefined" ? window.matchMedia.bind(window) : undefined);
  return fn ? fn(DARK_QUERY).matches : false;
}

export function resolveTheme(theme: Theme, prefersDark: boolean): Resolved {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

type MediaQueryListLike = {
  matches: boolean;
  addEventListener?: Function;
  removeEventListener?: Function;
};

export class ThemeEngine {
  private storageKey: string;
  private attribute: string;
  private element?: ThemeTarget;
  private store?: ThemeStore;
  private current: Theme;
  private mql?: MediaQueryListLike;
  private listeners = new Set<(resolved: Resolved) => void>();
  private onSystemChange: () => void;
  private last?: Resolved;
  private classNames?: ClassNames;
  private colorScheme: boolean;
  private themeColor?: ThemeColors;
  private metaElement?: MetaTarget | null;
  private win?: WindowLike;
  private onStorage?: (e: { key?: string | null; newValue?: string | null }) => void;

  constructor(opts: ThemeEngineOptions = {}) {
    this.storageKey = opts.storageKey ?? "theme";
    this.attribute = opts.attribute ?? "data-theme";
    this.element = opts.element ?? (typeof document !== "undefined" ? document.documentElement : undefined);
    this.store = opts.store ?? defaultStore(this.storageKey);
    this.classNames = opts.classNames;
    this.colorScheme = opts.colorScheme ?? true;
    this.themeColor = opts.themeColor;
    this.metaElement = opts.themeColor
      ? (opts.metaElement ?? (typeof document !== "undefined"
          ? (document.querySelector('meta[name="theme-color"]') as MetaTarget | null)
          : undefined))
      : undefined;
    this.win = opts.window ?? (typeof window !== "undefined" ? window : undefined);

    const mm = opts.matchMedia ?? (typeof window !== "undefined" ? window.matchMedia.bind(window) : undefined);
    this.mql = mm ? mm(DARK_QUERY) : undefined;
    this.current = this.store?.get() ?? "system";

    // Live-follow the OS: re-apply when the system preference changes while in "system" mode.
    this.onSystemChange = () => { if (this.current === "system") this.apply(); };
    this.mql?.addEventListener?.("change", this.onSystemChange);

    // Cross-tab: mirror a theme change made in another tab (storage events don't fire
    // in the tab that wrote them, so there's no echo loop).
    if (opts.syncAcrossTabs && this.win?.addEventListener) {
      this.onStorage = (e) => {
        if (e.key !== this.storageKey) return;
        this.current = (e.newValue as Theme) ?? "system";
        this.apply();
      };
      this.win.addEventListener("storage", this.onStorage);
    }

    this.apply();
  }

  get theme(): Theme { return this.current; }
  get resolved(): Resolved {
    return resolveTheme(this.current, this.mql ? this.mql.matches : false);
  }

  set(theme: Theme): Resolved {
    this.current = theme;
    this.store?.set(theme);
    return this.apply();
  }

  toggle(): Resolved {
    return this.set(this.resolved === "dark" ? "light" : "dark");
  }

  /** Cycle light → dark → system → light (for a tri-state control). Returns the new Theme. */
  cycle(): Theme {
    const order: Theme[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(this.current) + 1) % order.length];
    this.set(next);
    return next;
  }

  /** Subscribe to resolved-theme changes. Returns an unsubscribe function. */
  subscribe(listener: (resolved: Resolved) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Detach the OS + cross-tab listeners and drop all subscribers. */
  destroy(): void {
    this.mql?.removeEventListener?.("change", this.onSystemChange);
    if (this.onStorage) this.win?.removeEventListener?.("storage", this.onStorage);
    this.listeners.clear();
  }

  private apply(): Resolved {
    const resolved = this.resolved;
    const el = this.element;
    if (el) {
      el.setAttribute(this.attribute, resolved);

      // Tailwind-style class toggling (e.g. add/remove "dark" on <html>).
      if (this.classNames && el.classList) {
        const add = resolved === "dark" ? this.classNames.dark : this.classNames.light;
        const remove = resolved === "dark" ? this.classNames.light : this.classNames.dark;
        if (remove) el.classList.remove(remove);
        if (add) el.classList.add(add);
      }

      // Make native controls (scrollbars, inputs, date pickers) match.
      if (this.colorScheme && el.style) el.style.colorScheme = resolved;
    }

    // Sync the mobile browser-chrome color.
    if (this.themeColor && this.metaElement) {
      this.metaElement.setAttribute("content", this.themeColor[resolved]);
    }

    if (resolved !== this.last) {
      this.last = resolved;
      for (const l of this.listeners) l(resolved);
    }
    return resolved;
  }
}

function defaultStore(key: string): ThemeStore | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return {
    get: () => localStorage.getItem(key) as Theme | null,
    set: (t) => localStorage.setItem(key, t),
  };
}

export interface NoFlashOptions {
  storageKey?: string;
  attribute?: string;
  /** Also set `documentElement.style.colorScheme` before paint. Default: true. */
  colorScheme?: boolean;
  /** Also toggle Tailwind-style classes (`{ dark: "dark" }`) before paint. */
  classNames?: ClassNames;
}

// Inline script to drop in <head> to prevent flash-of-wrong-theme (FOUC).
// Accepts either positional args (legacy) or an options object.
export function noFlashScript(opts?: NoFlashOptions): string;
export function noFlashScript(storageKey?: string, attribute?: string): string;
export function noFlashScript(a?: string | NoFlashOptions, attribute?: string): string {
  const o: NoFlashOptions = typeof a === "string" || a === undefined
    ? { storageKey: a, attribute }
    : a;
  const k = jsString(o.storageKey ?? "theme");
  const attr = jsString(o.attribute ?? "data-theme");
  const colorScheme = o.colorScheme ?? true;

  let body = `var t=localStorage.getItem('${k}')||'system';` +
    `var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);` +
    `var r=d?'dark':'light';var e=document.documentElement;` +
    `e.setAttribute('${attr}',r);`;
  if (colorScheme) body += `e.style.colorScheme=r;`;
  if (o.classNames?.dark || o.classNames?.light) {
    const dk = jsString(o.classNames.dark ?? "");
    const lt = jsString(o.classNames.light ?? "");
    body += `if(d){${dk ? `e.classList.add('${dk}');` : ""}${lt ? `e.classList.remove('${lt}');` : ""}}` +
      `else{${lt ? `e.classList.add('${lt}');` : ""}${dk ? `e.classList.remove('${dk}');` : ""}}`;
  }
  return `(function(){try{${body}}catch(e){}})();`;
}

// Escape a value for safe embedding inside a single-quoted JS string literal.
function jsString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
