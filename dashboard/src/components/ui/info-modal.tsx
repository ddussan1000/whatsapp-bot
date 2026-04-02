import { HelpCircle } from "lucide-react";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

interface InfoModalProps {
  title: string;
  children: React.ReactNode;
  triggerLabel?: string;
  iconOnly?: boolean;
}

export function InfoModal({
  title,
  children,
  triggerLabel,
  iconOnly = false,
}: InfoModalProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {iconOnly ? (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors p-0.5"
            aria-label={`Información sobre ${title}`}
          >
            <HelpCircle size={15} />
          </button>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5">
            <HelpCircle size={14} />
            {triggerLabel ?? "¿Cómo funciona?"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle size={16} className="text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function InfoSection({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {title && <p className="font-semibold text-foreground">{title}</p>}
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}

export function InfoStep({
  n,
  children,
}: {
  n: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground mt-0.5">
        {n}
      </span>
      <span className="text-muted-foreground">{children}</span>
    </div>
  );
}

export function InfoCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
      {children}
    </code>
  );
}

export function InfoAlert({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      {children}
    </div>
  );
}
