import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, persistTheme, toggleTheme, type Theme } from "@/lib/theme/theme";

/**
 * Theme switcher button for the site header.
 *
 * Reads the current theme from the document root on mount, then toggles
 * between dark and light while persisting the choice to localStorage.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
  }, []);

  function handleClick() {
    const next = toggleTheme(theme);
    applyTheme(next);
    persistTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-glass text-secondary-canvas transition-colors hover:text-foreground hover:border-hairline-strong"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
