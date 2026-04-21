import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Menu } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { Spinner } from "@/components/ui/spinner";
import { useTopics, useStats, useSessions, useFlashcardDecks } from "@/hooks/use-api";

export const Route = createFileRoute("/_authenticated/playground")({
  component: PlaygroundLayout,
});

function getPageTitle(pathname: string): string {
  if (pathname === "/playground" || pathname === "/playground/") return "Playground";
  if (pathname.startsWith("/playground/topics")) return "Topics";
  if (pathname.startsWith("/playground/flashcards")) return "Flashcards";
  if (pathname.startsWith("/playground/chats")) return "Past Chats";
  if (pathname.startsWith("/playground/reports")) return "Reports";
  if (pathname.startsWith("/playground/session")) return "Session";
  return "";
}

function PlaygroundLayout() {
  const router = useRouterState();
  const pageTitle = getPageTitle(router.location.pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { isLoading: topicsLoading } = useTopics();
  const { isLoading: statsLoading } = useStats();
  const { isLoading: sessionsLoading } = useSessions();
  const { isLoading: flashcardsLoading } = useFlashcardDecks();

  const dataLoading = topicsLoading || statsLoading || sessionsLoading || flashcardsLoading;

  if (dataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center border-b border-border/40 px-4 md:px-8">
          <button
            className="mr-3 md:hidden text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h2 className="text-sm font-semibold">{pageTitle}</h2>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
