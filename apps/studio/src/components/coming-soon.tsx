import type { LucideIcon } from "lucide-react";

// Placeholder for tabs whose phase hasn't been built yet. Naming the phase
// keeps the tab honest instead of looking broken.
export function ComingSoon({
  icon: Icon,
  title,
  description,
  phase,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  phase: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Icon className="text-muted-foreground/50 h-10 w-10" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground max-w-sm text-xs">{description}</p>
      </div>
      <span className="text-muted-foreground/60 text-xs">Arrives in phase {phase}</span>
    </div>
  );
}
