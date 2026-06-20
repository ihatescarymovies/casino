import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/games", label: "Games" },
    { href: "/promotions", label: "Promotions" },
    { href: "/winners", label: "Winners" },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground dark selection:bg-primary selection:text-primary-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 transition-transform hover:scale-105">
            <span className="text-2xl font-bold tracking-tighter text-primary drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]">
              BuckeyeBet
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  location === link.href ? "text-primary drop-shadow-[0_0_4px_rgba(234,179,8,0.5)]" : "text-muted-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Button variant="ghost" className="hidden sm:inline-flex text-muted-foreground hover:text-white">
              Log In
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(234,179,8,0.4)]">
              Sign Up
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col">
        {children}
      </main>

      <footer className="w-full border-t border-white/5 bg-card py-8 mt-12">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div className="flex flex-col gap-1">
            <span className="text-xl font-bold text-primary tracking-tighter">BuckeyeBet</span>
            <span className="text-xs text-muted-foreground">Ohio's Premier Online Casino.</span>
          </div>
          
          <div className="max-w-xl p-4 rounded-lg bg-background/50 border border-white/5 border-l-destructive border-l-4">
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
              Must be 21+ to play. If you or someone you know has a gambling problem, call <span className="text-white font-bold">1-800-589-9966</span>.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
