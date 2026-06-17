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

type MediaQueryListLike = {
  matches: boolean;
  addEventListener?: Function;
  removeEventListener?: Function;
};

export class ThemeEngine {
  private storageKey: string;
  private attribute: string;
  private element?: ThemeEngineOptions["element"];
  private store?: ThemeStore;
  private current: Theme;
  private mql?: MediaQueryListLike;
  private listeners = new Set<(resolved: Resolved) => void>();
  private onSystemChange: () => void;
  private last?: Resolved;

  constructor(opts: ThemeEngineOptions = {}) {
    this.storageKey = opts.storageKey ?? "theme";
    this.attribute = opts.attribute ?? "data-theme";
    this.element = opts.element ?? (typeof document !== "undefined" ? document.documentElement : undefined);
    this.store = opts.store ?? defaultStore(this.storageKey);

    const mm = opts.matchMedia ?? (typeof window !== "undefined" ? window.matchMedia.bind(window) : undefined);
    this.mql = mm ? mm(DARK_QUERY) : undefined;
    this.current = this.store?.get() ?? "system";

    // Live-follow the OS: re-apply when the system preference changes while in "system" mode.
    this.onSystemChange = () => { if (this.current === "system") this.apply(); };
    this.mql?.addEventListener?.("change", this.onSystemChange);

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

  /** Detach the OS listener and drop all subscribers. */
  destroy(): void {
    this.mql?.removeEventListener?.("change", this.onSystemChange);
    this.listeners.clear();
  }

  private apply(): Resolved {
    const resolved = this.resolved;
    this.element?.setAttribute(this.attribute, resolved);
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

// Inline script to drop in <head> to prevent flash-of-wrong-theme (FOUC).
export function noFlashScript(storageKey = "theme", attribute = "data-theme"): string {
  const k = jsString(storageKey);
  const a = jsString(attribute);
  return `(function(){try{var t=localStorage.getItem('${k}')||'system';` +
    `var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);` +
    `document.documentElement.setAttribute('${a}',d?'dark':'light');}catch(e){}})();`;
}

// Escape a value for safe embedding inside a single-quoted JS string literal.
function jsString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
