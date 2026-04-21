import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth";
import { useProfile } from "@/hooks/use-api";
import { Spinner } from "@/components/ui/spinner";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGuard,
});

function AuthGuard() {
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });

  const { data: profile, isLoading: profileLoading } = useProfile();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login" });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!profileLoading && profile && !profile.onboardingCompleted) {
      if (!location.pathname.includes("/onboarding")) {
        navigate({ to: "/onboarding" });
      }
    }
  }, [profile, profileLoading, location.pathname, navigate]);

  if (authLoading || !user || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return <Outlet />;
}
