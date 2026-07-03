export type Theme = "dark" | "light";

const STORAGE_KEY = "t0-theme";

/**
 * Resolve the effective theme from an optional URL parameter and a persisted
 * preference. Falls back to dark (the command-center default).
 */
export function resolveTheme(
  param: string | null | undefined,
  persisted: string | null | undefined,
): Theme {
  const candidate = param ?? persisted ?? "dark";
  return candidate === "light" ? "light" : "dark";
}

/**
 * JavaScript snippet injected into the HTML shell to set the theme before
 * first paint. Avoids a flash of un-themed content.
 */
export function themeBootstrapScript(): string {
  return `(function(){try{var p=new URLSearchParams(location.search).get('theme');var s=localStorage.getItem('${STORAGE_KEY}');var t=(p==='light'||s==='light')?'light':'dark';var html=document.documentElement;if(t==='light'){html.classList.remove('dark');html.classList.add('light');}else{html.classList.remove('light');html.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`;
}

/**
 * Apply the theme to the current document root.
 */
export function applyTheme(theme: Theme): void {
  const html = document.documentElement;
  if (theme === "light") {
    html.classList.remove("dark");
    html.classList.add("light");
  } else {
    html.classList.remove("light");
    html.classList.add("dark");
  }
}

/**
 * Persist the theme preference to localStorage.
 */
export function persistTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
}

/**
 * Toggle between dark and light.
 */
export function toggleTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}
