import { LoginForm } from "@/components/login-form";
import { ModeToggle } from "@/components/mode-toggle";

export function LoginPage() {
  return (
    <div className="relative flex min-h-svh flex-col">
      <div
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-primary/8 via-background to-muted/40 dark:from-primary/12 dark:to-muted/25"
        aria-hidden
      />

      <header className="relative z-10 flex justify-end p-4 sm:p-6">
        <ModeToggle />
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-16 pt-4 sm:px-6 sm:pb-20">
        <div className="flex w-full max-w-[400px] flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className="flex size-14 items-center justify-center rounded-2xl bg-primary text-lg font-bold tracking-tight text-primary-foreground shadow-md ring-1 ring-primary/20"
              aria-hidden
            >
              SB
            </div>
            <div className="">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Sales Bot
              </h1>
            </div>
          </div>

          <LoginForm />
        </div>
      </main>
    </div>
  );
}
