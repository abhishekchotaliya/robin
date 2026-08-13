// Safe for any host: components only, no registerRoot side effect. The
// studio's Player mounts the same ShortsBasic the renderer bundles, so
// preview and output can't drift apart.
export { RemotionRoot } from "./Root.tsx";
export { ShortsBasic, type ShortsBasicProps } from "./templates/ShortsBasic.tsx";
export { Captions } from "./components/Captions.tsx";
export { SceneMedia } from "./components/SceneMedia.tsx";
export { TitleCard } from "./components/TitleCard.tsx";
export { Transition } from "./components/Transition.tsx";
