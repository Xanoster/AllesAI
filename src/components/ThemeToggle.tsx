"use client";

import { useEffect } from "react";
import { useSettings } from "@/lib/store";
import { Sun, Moon } from "lucide-react";

export function ThemeApplier() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);
  return null;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSettings((s) => s.theme);
  const toggleTheme = useSettings((s) => s.toggleTheme);
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      className={
        "inline-flex items-center justify-center rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--fg)] " +
        className
      }
      title={isDark ? "Switch to light" : "Switch to dark"}
      aria-label="Toggle theme"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
