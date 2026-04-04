import { Zap } from "lucide-react";

interface SessionLoaderProps {
  message?: string;
}

export function SessionLoader({
  message = "Validando sesión…",
}: SessionLoaderProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background">
      {/* Animated ring + icon */}
      <div className="relative flex items-center justify-center">
        {/* Outer spinning ring */}
        <span className="absolute h-16 w-16 animate-spin rounded-full border-2 border-transparent border-t-primary/30 border-r-primary/10" />
        {/* Inner pulsing ring */}
        <span className="absolute h-12 w-12 animate-ping rounded-full bg-primary/5" />
        {/* Brand icon */}
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Zap size={18} className="text-primary" />
        </div>
      </div>

      {/* Text */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-medium text-foreground/80">DSS Bot</p>
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
