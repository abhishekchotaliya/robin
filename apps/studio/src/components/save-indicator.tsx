import { AlertCircle, Check, Loader2 } from "lucide-react";
import type { SaveStatus } from "@/hooks/useProjectEditor.ts";

export function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;

  if (status === "saving") {
    return (
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="text-destructive flex items-center gap-1.5 text-xs">
        <AlertCircle className="h-3 w-3" />
        Couldn't save — retrying
      </span>
    );
  }

  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <Check className="h-3 w-3" />
      Saved
    </span>
  );
}
