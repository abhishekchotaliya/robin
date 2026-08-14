import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, KeyRound, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { useHealthChecks, useSettings, useUpdateSettings } from "@/hooks/useSettings.ts";
import { ApiError } from "@/lib/api.ts";

function ProviderKey() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [key, setKey] = useState("");
  const configured = settings?.providers.elevenlabs.configured ?? false;

  async function save(value: string | null) {
    try {
      await updateSettings.mutateAsync({
        providers: { elevenlabs: value === null ? null : { apiKey: value } },
      });
      setKey("");
      toast.success(value === null ? "Key removed" : "Key saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the key");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="elevenlabs">ElevenLabs API key</Label>
        {configured && (
          <Badge variant="outline" className="border-green-500/40 text-[10px] text-green-400">
            configured
          </Badge>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          id="elevenlabs"
          type="password"
          value={key}
          placeholder={configured ? "•••••••• (replace)" : "sk_…"}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && key.trim()) void save(key.trim());
          }}
        />
        <Button onClick={() => void save(key.trim())} disabled={!key.trim() || updateSettings.isPending}>
          Save
        </Button>
        {configured && (
          <Button variant="outline" onClick={() => void save(null)} disabled={updateSettings.isPending}>
            Remove
          </Button>
        )}
      </div>
      {/* Worth stating plainly: people are right to be wary of pasting keys. */}
      <p className="text-muted-foreground text-xs">
        Stored on this machine in <code>~/VideoStudio/settings.json</code>. The server never sends it to the
        browser — this page only ever learns whether one is set.
      </p>
    </div>
  );
}

function HealthChecks() {
  const { data: checks, isLoading, refetch, isFetching } = useHealthChecks();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Native tools</Label>
        <Button variant="ghost" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
          Re-check
        </Button>
      </div>

      {isLoading && <Skeleton className="h-24 w-full" />}

      {checks?.map((check) => (
        <div key={check.name} className="flex items-start gap-3 rounded-md border p-3">
          {check.ok ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
          ) : (
            <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{check.name}</p>
            <p className="text-muted-foreground font-mono text-xs break-words">{check.detail}</p>
            {check.hint && <p className="text-muted-foreground text-xs">{check.hint}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  return (
    <div className="min-h-screen">
      <header className="border-border/50 flex items-center gap-3 border-b px-6 py-4">
        <Button variant="ghost" size="icon" asChild aria-label="Back to projects">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Settings</h1>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-8 p-6">
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4" />
            Providers
          </h2>
          <ProviderKey />
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Defaults for new projects</h2>
          {isLoading && <Skeleton className="h-20 w-full" />}
          {settings && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="format">Format</Label>
                <Select
                  value={settings.defaultFormat}
                  onValueChange={(defaultFormat) =>
                    void updateSettings.mutateAsync({
                      defaultFormat: defaultFormat as typeof settings.defaultFormat,
                    })
                  }
                >
                  <SelectTrigger id="format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shorts">Shorts — 9:16</SelectItem>
                    <SelectItem value="landscape">Landscape — 16:9</SelectItem>
                    <SelectItem value="square">Square — 1:1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Projects folder</Label>
                <p className="text-muted-foreground rounded-md border px-3 py-2 font-mono text-xs break-all">
                  {settings.projectsRoot}
                </p>
                <p className="text-muted-foreground text-xs">
                  Set <code>VIDEO_STUDIO_ROOT</code> before starting the server to change this.
                </p>
              </div>
            </div>
          )}
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Health</h2>
          <HealthChecks />
        </section>
      </main>
    </div>
  );
}
