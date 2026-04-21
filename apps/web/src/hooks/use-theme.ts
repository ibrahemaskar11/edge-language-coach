import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

type Theme = "light" | "dark";

function getStoredTheme(): Theme {
  const stored = localStorage.getItem("theme") as Theme | null;
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Module-level singleton — all useTheme() callers share this
let _theme: Theme = getStoredTheme();
document.documentElement.classList.toggle("dark", _theme === "dark");

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify() {
  listeners.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    () => _theme,
    () => "dark" as Theme,
  );

  const toggleTheme = () => {
    const newTheme = _theme === "dark" ? "light" : "dark";

    const applyChange = () => {
      _theme = newTheme;
      document.documentElement.classList.toggle("dark", newTheme === "dark");
      localStorage.setItem("theme", newTheme);
      flushSync(() => notify());
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vt = (document as any).startViewTransition;
    if (typeof vt === "function") {
      vt.call(document, applyChange);
    } else {
      applyChange();
    }
  };

  return { theme, toggleTheme };
}
