import { useContext } from "react";
import type { ThemeProviderState } from "./theme-context";
import { ThemeProviderContext } from "./theme-context";

export const useTheme = () => {
  const context = useContext(ThemeProviderContext) as ThemeProviderState;
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};

