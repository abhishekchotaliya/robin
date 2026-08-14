import { useRef, useState } from "react";
import { Check, Trash2, Upload } from "lucide-react";
import {
  ACCEPTED_MIME_TYPES,
  formatBytes,
  isAcceptedMime,
  type Asset,
  type Project,
  type Scene,
} from "@app/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { useAssets, useDeleteAsset, useUploadAssets } from "@/hooks/useAssets.ts";
import { ApiError, assetUrl } from "@/lib/api.ts";
import { cn } from "@/lib/utils.ts";

const ACCEPT_ATTR = Object.keys(ACCEPTED_MIME_TYPES).join(",");

function AssetThumb({ asset, slug }: { asset: Asset; slug: string }) {
  const src = assetUrl(slug, asset.filename);
  if (asset.kind === "image") {
    return <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />;
  }
  if (asset.kind === "video") {
    return <video src={src} className="h-full w-full object-cover" muted preload="metadata" />;
  }
  return (
    <div className="text-muted-foreground flex h-full w-full items-center justify-center text-xs">
      audio
    </div>
  );
}

export function MediaTab({
  project,
  scene,
  onUpdateScene,
  onAssetDeleted,
}: {
  project: Project;
  scene: Scene;
  onUpdateScene: (sceneId: string, patch: Partial<Scene>) => void;
  /** Mirrors the server's reference-clearing into the local draft — see the call site. */
  onAssetDeleted: (assetId: string) => void;
}) {
  const { data: assets, isLoading } = useAssets(project.id);
  const uploadAssets = useUploadAssets(project.id);
  const deleteAsset = useDeleteAsset(project.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function upload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = [...fileList];
    const rejected = files.filter((f) => !isAcceptedMime(f.type));
    const accepted = files.filter((f) => isAcceptedMime(f.type));

    if (rejected.length > 0) {
      toast.error(
        `Can't use ${rejected.map((f) => f.name).join(", ")} — images, video and audio only.`,
      );
    }
    if (accepted.length === 0) return;

    try {
      const created = await uploadAssets.mutateAsync(accepted);
      toast.success(`Added ${created.length} file${created.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    }
  }

  function assignToScene(asset: Asset) {
    onUpdateScene(scene.id, {
      media: { ...scene.media, kind: asset.kind === "audio" ? "color" : asset.kind, assetId: asset.id },
    });
  }

  function clearSceneMedia() {
    onUpdateScene(scene.id, { media: { ...scene.media, kind: "color", assetId: null } });
  }

  // Which scenes use each asset — shown as badges so it's obvious what's in
  // play before deleting something.
  const sceneNumbersByAsset = new Map<string, number[]>();
  project.scenes.forEach((s, index) => {
    if (!s.media.assetId) return;
    const list = sceneNumbersByAsset.get(s.media.assetId) ?? [];
    list.push(index + 1);
    sceneNumbersByAsset.set(s.media.assetId, list);
  });

  const visualAssets = (assets ?? []).filter((a) => a.kind !== "audio");
  const audioAssets = (assets ?? []).filter((a) => a.kind === "audio");

  return (
    <div className="space-y-6 p-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void upload(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-border/80",
        )}
      >
        <Upload className="text-muted-foreground h-6 w-6" />
        <p className="text-sm">
          {uploadAssets.isPending ? "Uploading…" : "Drop images, video or music here"}
        </p>
        <p className="text-muted-foreground text-xs">or click to browse</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = ""; // let the same file be picked again after a delete
          }}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Scene {project.scenes.findIndex((s) => s.id === scene.id) + 1} background</Label>
          {scene.media.assetId && (
            <Button variant="ghost" size="sm" onClick={clearSceneMedia}>
              Use solid color instead
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-video w-full rounded-md" />
            ))}
          </div>
        )}

        {!isLoading && visualAssets.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No media yet. Drop an image or video above, then click it to put it behind this scene.
          </p>
        )}

        {visualAssets.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {visualAssets.map((asset) => {
              const assigned = scene.media.assetId === asset.id;
              const usedBy = sceneNumbersByAsset.get(asset.id) ?? [];
              return (
                <div key={asset.id} className="group space-y-1">
                  <button
                    type="button"
                    onClick={() => assignToScene(asset)}
                    className={cn(
                      "bg-muted relative block aspect-video w-full overflow-hidden rounded-md border transition-colors",
                      assigned ? "border-primary ring-primary/30 ring-2" : "border-border hover:border-primary/50",
                    )}
                  >
                    <AssetThumb asset={asset} slug={project.slug} />
                    {assigned && (
                      <span className="bg-primary text-primary-foreground absolute top-1 right-1 rounded-full p-0.5">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-muted-foreground truncate text-[11px]" title={asset.filename}>
                      {formatBytes(asset.bytes)}
                    </span>
                    <div className="flex items-center gap-1">
                      {usedBy.length > 0 && (
                        <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                          {usedBy.length === 1 ? `scene ${usedBy[0]}` : `${usedBy.length} scenes`}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${asset.filename}`}
                        className="text-muted-foreground/50 hover:text-destructive h-5 w-5 opacity-0 group-hover:opacity-100"
                        onClick={async () => {
                          try {
                            await deleteAsset.mutateAsync(asset.id);
                            onAssetDeleted(asset.id);
                          } catch (err) {
                            toast.error(err instanceof ApiError ? err.message : "Delete failed");
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        {scene.media.assetId ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="fit">Fit</Label>
              <Select
                value={scene.media.fit}
                onValueChange={(fit) =>
                  onUpdateScene(scene.id, { media: { ...scene.media, fit: fit as "cover" | "contain" } })
                }
              >
                <SelectTrigger id="fit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">Cover — fill the frame, crop overflow</SelectItem>
                  <SelectItem value="contain">Contain — fit inside, letterbox</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ken Burns</Label>
              <div className="flex items-center gap-3">
                <Switch
                  checked={scene.media.kenBurns.enabled}
                  onCheckedChange={(enabled) =>
                    onUpdateScene(scene.id, {
                      media: { ...scene.media, kenBurns: { ...scene.media.kenBurns, enabled } },
                    })
                  }
                />
                <Select
                  value={scene.media.kenBurns.direction}
                  disabled={!scene.media.kenBurns.enabled}
                  onValueChange={(direction) =>
                    onUpdateScene(scene.id, {
                      media: {
                        ...scene.media,
                        kenBurns: { ...scene.media.kenBurns, direction: direction as "in" | "out" },
                      },
                    })
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Slow zoom in</SelectItem>
                    <SelectItem value="out">Slow zoom out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="color">Background color</Label>
            <div className="flex items-center gap-2">
              <input
                id="color"
                type="color"
                value={scene.media.color}
                onChange={(e) => onUpdateScene(scene.id, { media: { ...scene.media, color: e.target.value } })}
                className="border-input h-9 w-14 cursor-pointer rounded-md border bg-transparent p-1"
              />
              <span className="text-muted-foreground font-mono text-xs">{scene.media.color}</span>
            </div>
            <p className="text-muted-foreground text-xs">Used until you assign media to this scene.</p>
          </div>
        )}
      </div>

      {audioAssets.length > 0 && (
        <div className="space-y-2">
          <Label>Audio files</Label>
          <p className="text-muted-foreground text-xs">
            {audioAssets.length} uploaded — background music is wired up in phase 6.
          </p>
        </div>
      )}
    </div>
  );
}
