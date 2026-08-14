// Base slug only — collision suffixing ("-2", "-3", ...) happens in the
// server's project store, which is the only thing that knows what's already
// on disk. Keep this pure so it stays usable from the browser too.
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "untitled";
}
