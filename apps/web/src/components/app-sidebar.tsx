import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore, signOut } from "@/lib/auth";
import { useTheme } from "@/hooks/use-theme";
import { Spinner } from "@/components/ui/spinner";
import { Logo } from "@/components/logo";
import { Sheet, SheetContent } from "@/components/ui/sheet";

function IconPlayground({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconTopics({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

function IconFlashcards({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </svg>
  );
}

function IconPastChats({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
    </svg>
  );
}

function IconReports({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" x2="18" y1="20" y2="10" />
      <line x1="12" x2="12" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="14" />
    </svg>
  );
}

function IconSun({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function IconMoon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

const navItems = [
  { title: "Playground", to: "/playground", icon: IconPlayground },
  { title: "Topics", to: "/playground/topics", icon: IconTopics },
  { title: "Flashcards", to: "/playground/flashcards", icon: IconFlashcards },
  { title: "Past Chats", to: "/playground/chats", icon: IconPastChats },
  { title: "Reports", to: "/playground/reports", icon: IconReports },
] as const;

interface NavContentProps {
  currentPath: string;
  onNavigate?: () => void;
}

function NavContent({ currentPath, onNavigate }: NavContentProps) {
  const user = useAuthStore((s) => s.user);
  const { theme, toggleTheme } = useTheme();

  const logout = useMutation({
    mutationFn: signOut,
  });

  function isActive(to: string) {
    if (to === "/playground") return currentPath === "/playground" || currentPath === "/playground/";
    return currentPath.startsWith(to);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="px-4 py-5">
        <Link to="/playground" onClick={onNavigate} className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="text-sm font-semibold tracking-tight">edge.ai</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.title}
              to={item.to}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon />
              {item.title}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border/40 px-4 py-4 space-y-1.5">
        <p className="truncate text-xs text-sidebar-foreground/50">
          {user?.email}
        </p>
        <div className="flex items-center justify-between">
          <button
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
          >
            {logout.isPending ? (
              <span className="flex items-center gap-1.5">
                <Spinner className="h-3 w-3" /> Signing out...
              </span>
            ) : (
              "Sign out"
            )}
          </button>
          <button
            onClick={toggleTheme}
            className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
          >
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AppSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function AppSidebar({ mobileOpen, onMobileClose }: AppSidebarProps) {
  const router = useRouterState();
  const currentPath = router.location.pathname;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex h-screen w-64 shrink-0 flex-col border-r border-border/40 bg-sidebar text-sidebar-foreground">
        <NavContent currentPath={currentPath} />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={(open) => { if (!open) onMobileClose?.(); }}>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground">
          <NavContent currentPath={currentPath} onNavigate={onMobileClose} />
        </SheetContent>
      </Sheet>
    </>
  );
}
