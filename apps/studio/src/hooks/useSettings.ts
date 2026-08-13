import type { UpdateSettingsRequest } from "@app/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api.ts";

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateSettingsRequest) => api.updateSettings(patch),
    onSuccess: (settings) => {
      queryClient.setQueryData(["settings"], settings);
      // A newly configured key means the voice list can now be fetched.
      queryClient.invalidateQueries({ queryKey: ["voices"] });
    },
  });
}

export function useVoices(providerId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["voices", providerId],
    queryFn: () => api.listVoices(providerId),
    enabled,
    // Voice catalogs change rarely and the call costs a provider round trip.
    staleTime: 5 * 60 * 1000,
  });
}
