import { Link, useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, LogOut, LayoutDashboard, CreditCard } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/games", label: "Games" },
    { href: "/promotions", label: "Promotions" },
    { href: "/winners", label: "Winners" },
  ];

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.trim() || "P"
    : "P";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground dark selection:bg-primary selection:text-primary-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 transition-transform hover:scale-105">
            <span className="text-2xl font-bold tracking-tighter text-primary drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]">
              Charter &amp; Oak
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  location === link.href
                    ? "text-primary drop-shadow-[0_0_4px_rgba(234,179,8,0.5)]"
                    : "text-muted-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="h-8 w-20 rounded-md bg-white/5 animate-pulse" />
            ) : isAuthenticated && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full ring-1 ring-white/10 hover:ring-primary/50 transition-all px-2 py-1 pr-3">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={user.profileImageUrl ?? undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-white hidden sm:block">
                      {user.firstName ?? user.email ?? "Player"}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-card border-white/10">
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="flex items-center gap-2 cursor-pointer">
                      <LayoutDashboard className="h-4 w-4 text-primary" />
                      <span>My Dashboard</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/cashier" className="flex items-center gap-2 cursor-pointer">
                      <CreditCard className="h-4 w-4 text-primary" />
                      <span>Cashier / Deposit</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    onClick={logout}
                    className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Log Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="hidden sm:inline-flex text-muted-foreground hover:text-white"
                  onClick={login}
                >
                  Log In
                </Button>
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(234,179,8,0.4)]"
                  onClick={login}
                >
                  Sign Up
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col">{children}</main>

      <footer className="w-full border-t border-white/5 bg-card py-8 mt-12">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div className="flex flex-col gap-1">
            <span className="text-xl font-bold text-primary tracking-tighter">Charter &amp; Oak</span>
            <span className="text-xs text-muted-foreground">Ohio's Premier Online Casino.</span>
          </div>

          <div className="max-w-xl p-4 rounded-lg bg-background/50 border border-white/5 border-l-destructive border-l-4">
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
              Must be 21+ to play. If you or someone you know has a gambling problem, call{" "}
              <span className="text-white font-bold">1-800-589-9966</span>.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
