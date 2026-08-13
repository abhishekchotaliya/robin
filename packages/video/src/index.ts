import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root.tsx";

/**
 * Entry point for the Remotion CLI and the phase-8 bundler ONLY — it is
 * referenced by file path, never imported as a package.
 *
 * registerRoot() runs on import, which would fire in the browser if the
 * studio's Player pulled the components in through here. Component exports
 * live in exports.ts for exactly that reason.
 */
registerRoot(RemotionRoot);
