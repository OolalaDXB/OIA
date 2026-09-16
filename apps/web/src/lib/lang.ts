"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LANG, LANGS, type Lang } from "./vocabulary";

/**
 * Which language the console speaks.
 *
 * French by default, because the person who uses this works in French and a
 * tool you cannot read is the same as not having one. English stays a click
 * away: half the source material — TED, UNGM, the World Bank — is in English,
 * and switching is sometimes easier than translating in your head.
 *
 * The choice lives in localStorage rather than in the database on purpose. It
 * is a per-browser convenience, not a decision worth recording, and reading it
 * must never be able to fail: a private window or blocked site data returns the
 * default rather than a blank console.
 */

const KEY = "oia.lang.v1";

function read(): Lang {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored && (LANGS as readonly string[]).includes(stored)) return stored as Lang;
    // Fall back to what the browser asks for before the hardcoded default.
    if (window.navigator?.language?.toLowerCase().startsWith("en")) return "en";
  } catch {
    // Private window, blocked storage, or server render — the default is fine.
  }
  return DEFAULT_LANG;
}

/**
 * One language for the whole page, not one per component.
 *
 * The first version gave every caller its own `useState`, so switching to
 * English from the Money screen left the navigation rail in French: the page
 * and its own menu disagreed, on screen, at the same time. That is precisely
 * the incoherence this work exists to remove, so the choice lives in a single
 * module-level value every hook subscribes to.
 */
let current: Lang = DEFAULT_LANG;
const listeners = new Set<(l: Lang) => void>();

export function useLang(): { lang: Lang; setLang: (l: Lang) => void; toggle: () => void } {
  // Always start at the default so the server render and the first client
  // render agree; the stored choice is applied immediately after mount.
  const [lang, setLangState] = useState<Lang>(current);

  useEffect(() => {
    const stored = read();
    if (stored !== current) {
      current = stored;
      for (const l of listeners) l(stored);
    }
    setLangState(current);

    listeners.add(setLangState);
    return () => {
      listeners.delete(setLangState);
    };
  }, []);

  const setLang = useCallback((next: Lang) => {
    current = next;
    for (const l of listeners) l(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // The choice still applies to this session; it just will not be remembered.
    }
    try {
      document.documentElement.lang = next;
    } catch {
      /* not fatal */
    }
  }, []);

  const toggle = useCallback(() => setLang(lang === "fr" ? "en" : "fr"), [lang, setLang]);
  return { lang, setLang, toggle };
}
