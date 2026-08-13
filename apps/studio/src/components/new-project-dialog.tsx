import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateProjectRequestSchema, type CreateProjectRequest, type FormatPreset } from "@app/core";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { useCreateProject } from "@/hooks/useProjects.ts";
import { ApiError } from "@/lib/api.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";

const FORMAT_OPTIONS: { value: FormatPreset; label: string; aspect: string }[] = [
  { value: "shorts", label: "Shorts", aspect: "9:16" },
  { value: "landscape", label: "Landscape", aspect: "16:9" },
  { value: "square", label: "Square", aspect: "1:1" },
];

export function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const createProject = useCreateProject();

  const form = useForm<CreateProjectRequest>({
    resolver: zodResolver(CreateProjectRequestSchema),
    defaultValues: { title: "", formatPreset: "shorts", templateId: "shorts-basic" },
  });

  async function onSubmit(values: CreateProjectRequest) {
    try {
      const project = await createProject.mutateAsync(values);
      toast.success(`Created "${project.title}"`);
      onOpenChange(false);
      form.reset();
      navigate(`/projects/${project.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create project");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) form.reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Give it a title and pick a format to get started.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" autoFocus placeholder="Tech News #1" {...form.register("title")} />
              {form.formState.errors.title && (
                <p className="text-destructive text-sm">{form.formState.errors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Format</Label>
              <div className="grid grid-cols-3 gap-2">
                {FORMAT_OPTIONS.map((opt) => {
                  const selected = form.watch("formatPreset") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => form.setValue("formatPreset", opt.value, { shouldValidate: true })}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-md border p-3 text-sm transition-colors",
                        selected ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
                      )}
                    >
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-muted-foreground text-xs">{opt.aspect}</span>
                      {opt.value === "shorts" && (
                        <span className="text-muted-foreground text-[10px]">default</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Template</Label>
              <div className="border-primary bg-primary/10 rounded-md border p-3 text-sm">
                <span className="font-medium">Shorts Basic</span>
                <p className="text-muted-foreground text-xs">
                  Full-bleed media, slow Ken Burns, word-by-word captions.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={createProject.isPending}>
              {createProject.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
