import { useQuery } from "@tanstack/react-query";
import { HealthSchema, type Health } from "@app/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";

async function fetchHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`health check failed: ${res.status}`);
  return HealthSchema.parse(await res.json());
}

// Phase 0 placeholder — replaced by the projects list route in Phase 1.
export function HealthCheckPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Faceless Video Studio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <Skeleton className="h-20 w-full" />}
          {isError && (
            <p className="text-destructive text-sm">{(error as Error).message}</p>
          )}
          {data && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={data.ok ? "default" : "destructive"}>
                  {data.ok ? "healthy" : "down"}
                </Badge>
                <span className="text-muted-foreground">server v{data.version}</span>
              </div>
              <p>
                <span className="text-muted-foreground">bun:</span> {data.bun}
              </p>
              <p>
                <span className="text-muted-foreground">projects root:</span>{" "}
                {data.projectsRoot}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
