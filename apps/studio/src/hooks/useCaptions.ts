import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api.ts";

export function useCaptions(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "captions"],
    queryFn: () => api.getCaptions(projectId),
    enabled: projectId.length > 0,
  });
}
