// Settled theme context — wraps the app with dark/light mode state.
// Mode is one of 'system' | 'light' | 'dark', persisted under a single
// AsyncStorage key. 'system' follows useColorScheme(); explicit light/dark
// overrides it. Toggle lives on Profile → Settings → Appearance.

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "../constants/Colors";

const STORAGE_KEY = "settled.themeMode";
const VALID_MODES = new Set(["system", "light", "dark"]);

const ThemeContext = createContext({
  mode: "system",           // user preference
  scheme: "light",          // resolved scheme (always 'light' | 'dark')
  dark: false,              // convenience boolean
  colors: Colors.light,     // current palette
  setMode: () => {},
  toggle: () => {},
  ready: false,             // persisted preference has been read
});

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [mode, setModeState] = useState("system");
  const [ready, setReady] = useState(false);

  // Hydrate from AsyncStorage on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (alive && saved && VALID_MODES.has(saved)) setModeState(saved);
      } catch {
        // ignore — fall back to 'system'
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const setMode = useCallback(async (next) => {
    if (!VALID_MODES.has(next)) return;
    setModeState(next);
    try { await AsyncStorage.setItem(STORAGE_KEY, next); } catch {}
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  const value = useMemo(() => {
    const scheme = mode === "system" ? (systemScheme === "dark" ? "dark" : "light") : mode;
    const dark = scheme === "dark";
    const colors = dark ? Colors.dark : Colors.light;
    return { mode, scheme, dark, colors, setMode, toggle, ready };
  }, [mode, systemScheme, setMode, toggle, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  return useContext(ThemeContext);
}
