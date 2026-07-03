import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  type Theme,
  resolveTheme,
  themeBootstrapScript,
  applyTheme,
  persistTheme,
  toggleTheme,
} from "./theme";

describe("resolveTheme", () => {
  it("defaults to dark when no hints are provided", () => {
    expect(resolveTheme(undefined, undefined)).toBe("dark");
  });

  it("prefers URL param over persisted value", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });

  it("falls back to persisted value when no param", () => {
    expect(resolveTheme(undefined, "light")).toBe("light");
    expect(resolveTheme(undefined, "dark")).toBe("dark");
  });

  it("ignores unknown persisted values and defaults to dark", () => {
    expect(resolveTheme(undefined, "auto")).toBe("dark");
    expect(resolveTheme(undefined, "")).toBe("dark");
  });

  it("ignores unknown param values and defaults to dark", () => {
    expect(resolveTheme("auto", "light")).toBe("dark");
  });
});

describe("themeBootstrapScript", () => {
  it("returns a self-contained inline script", () => {
    const script = themeBootstrapScript();
    expect(script).toContain("document.documentElement");
    expect(script).toContain("localStorage.getItem");
    expect(script).toContain("URLSearchParams");
    expect(script.startsWith("(")).toBe(true);
  });
});

describe("applyTheme", () => {
  let classList: { list: string[]; add: (s: string) => void; remove: (s: string) => void };

  beforeEach(() => {
    classList = {
      list: [],
      add(s: string) {
        if (!this.list.includes(s)) this.list.push(s);
      },
      remove(s: string) {
        this.list = this.list.filter((c) => c !== s);
      },
    };
    (globalThis as unknown as { document: unknown }).document = {
      documentElement: { classList },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it("adds dark class and removes light class for dark theme", () => {
    classList.list = ["light"];
    applyTheme("dark");
    expect(classList.list).toEqual(["dark"]);
  });

  it("adds light class and removes dark class for light theme", () => {
    classList.list = ["dark"];
    applyTheme("light");
    expect(classList.list).toEqual(["light"]);
  });

  it("keeps the applied class when already present", () => {
    classList.list = ["dark"];
    applyTheme("dark");
    expect(classList.list).toEqual(["dark"]);
  });
});

describe("persistTheme", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      setItem(key: string, value: string) {
        store[key] = value;
      },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    Object.keys(store).forEach((k) => delete store[k]);
  });

  it("stores the theme under t0-theme", () => {
    persistTheme("light");
    expect(store["t0-theme"]).toBe("light");
  });
});

describe("toggleTheme", () => {
  it.each<[Theme, Theme]>([
    ["dark", "light"],
    ["light", "dark"],
  ])("toggles %s to %s", (input, expected) => {
    expect(toggleTheme(input)).toBe(expected);
  });
});
