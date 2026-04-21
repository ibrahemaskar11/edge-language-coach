import { useTheme } from "@/hooks/use-theme";

export function Logo({ size = 32 }: { size?: number }) {
  const { theme } = useTheme();
  return (
    <img
      src={theme === "dark" ? "/logo-dark.svg" : "/logo-light.svg"}
      alt="edge.ai"
      width={size}
      height={size}
      style={{ flexShrink: 0 }}
    />
  );
}
