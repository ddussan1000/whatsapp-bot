import { Moon, Sun } from "lucide-react";
import { useTheme } from "./use-theme";
import { Button } from "./ui/button";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";
  return (
    <Button
      variant="outline"
      onClick={() => setTheme(nextTheme)}
      aria-label="Cambiar tema"
      title={`Cambiar a ${nextTheme}`}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  );
}
