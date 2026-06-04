// Framework-agnostic theme engine: resolves system preference, persists choice,
// and applies a `data-theme` attribute. No flash, no dependencies.
export type Theme = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

export interface ThemeStore {
  get(): Theme | null;
  set(theme: Theme): void;
}

export interface ThemeEngineOptions {
  storageKey?: string;
  attribute?: string;     // attribute set on the root element
  element?: { setAttribute(name: string, value: string): void };
  store?: ThemeStore;
  matchMedia?: (query: string) => { matches: boolean; addEventListener?: Function; removeEventListener?: Function };
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

export class ThemeEngine {
  private storageKey: string;
  private attribute: string;
  private element?: ThemeEngineOptions["element"];
  private store?: ThemeStore;
  private mm?: ThemeEngineOptions["matchMedia"];
  private current: Theme;

  constructor(opts: ThemeEngineOptions = {}) {
    this.storageKey = opts.storageKey ?? "theme";
    this.attribute = opts.attribute ?? "data-theme";
    this.element = opts.element ?? (typeof document !== "undefined" ? document.documentElement : undefined);
    this.store = opts.store ?? defaultStore(this.storageKey);
    this.mm = opts.matchMedia;
    this.current = this.store?.get() ?? "system";
    this.apply();
  }

  get theme(): Theme { return this.current; }
  get resolved(): Resolved {
    return resolveTheme(this.current, systemPrefersDark(this.mm));
  }

  set(theme: Theme): Resolved {
    this.current = theme;
    this.store?.set(theme);
    return this.apply();
  }

  toggle(): Resolved {
    return this.set(this.resolved === "dark" ? "light" : "dark");
  }

  private apply(): Resolved {
    const resolved = this.resolved;
    this.element?.setAttribute(this.attribute, resolved);
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

// Inline script to drop in <head> to prevent flash-of-wrong-theme (FOUC).
export function noFlashScript(storageKey = "theme", attribute = "data-theme"): string {
  return `(function(){try{var t=localStorage.getItem('${storageKey}')||'system';` +
    `var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);` +
    `document.documentElement.setAttribute('${attribute}',d?'dark':'light');}catch(e){}})();`;
}
