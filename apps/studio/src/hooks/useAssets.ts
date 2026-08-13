import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api.ts";

export function useAssets(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "assets"],
    queryFn: () => api.listAssets(projectId),
    enabled: projectId.length > 0,
  });
}

export function useUploadAssets(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => api.uploadAssets(projectId, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "assets"] });
    },
  });
}

export function useDeleteAsset(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => api.deleteAsset(projectId, assetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "assets"] });
      // Deleting an asset clears any scene that referenced it, so the
      // project itself is now stale too.
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });
}
