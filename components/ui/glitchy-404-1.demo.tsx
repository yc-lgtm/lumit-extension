"use client";

import { useTheme } from "next-themes";
import { Glitchy404 } from "@/components/ui/glitchy-404-1";

export default function Glitchy404Demo() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div className="flex min-h-screen items-center justify-center overflow-hidden">
      <Glitchy404 width={800} height={232} color={isDark ? "#fff" : "#000"} />
    </div>
  );
}
