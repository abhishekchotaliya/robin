import type { ProjectStatus } from "@app/core";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";

// Used everywhere a project's status appears — project cards, the detail
// header, later the render tab — so the color mapping only lives here.
const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  scripted: "Scripted",
  voiced: "Voiced",
  ready: "Ready",
  rendered: "Rendered",
};

const STATUS_CLASS: Record<ProjectStatus, string> = {
  draft: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
  scripted: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  voiced: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  ready: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  rendered: "border-green-500/40 bg-green-500/10 text-green-400",
};

export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-normal", STATUS_CLASS[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
