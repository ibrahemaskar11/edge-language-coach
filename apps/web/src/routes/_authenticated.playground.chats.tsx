import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/playground/chats")({
  component: () => <Outlet />,
});
