import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { Spinner } from "@/components/ui/spinner";
import { useTopics, useStats, useSessions, useFlashcardDecks } from "@/hooks/use-api";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function getPageTitle(pathname: string): string {
  if (pathname === "/") return "Playground";
  if (pathname.startsWith("/topics")) return "Topics";
  if (pathname.startsWith("/flashcards")) return "Flashcards";
  if (pathname.startsWith("/chats")) return "Past Chats";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/session")) return "Session";
  return "";
}

function AuthenticatedLayout() {
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const navigate = useNavigate();
  const router = useRouterState();
  const pageTitle = getPageTitle(router.location.pathname);

  // Fire data fetches in parallel with auth — by the time auth resolves, data is ready
  const { isLoading: topicsLoading } = useTopics();
  const { isLoading: statsLoading } = useStats();
  const { isLoading: sessionsLoading } = useSessions();
  const { isLoading: flashcardsLoading } = useFlashcardDecks();

  const dataLoading = topicsLoading || statsLoading || sessionsLoading || flashcardsLoading;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login" });
    }
  }, [authLoading, user, navigate]);

  // Single spinner: auth + initial data
  if (authLoading || !user || dataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center border-b border-border/40 px-8">
          <h2 className="text-sm font-semibold">{pageTitle}</h2>
        </header>
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
