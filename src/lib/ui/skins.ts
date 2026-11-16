import { hasPriorRun } from "../chat/prior-run";

export const SKIN_IDS = [
  "midnight",
  "daylight",
] as const;
export type SkinId = (typeof SKIN_IDS)[number];

export type Skin = {
  id: SkinId;
  name: string;
  tagline: string;
};

export const SKINS: readonly Skin[] = [
  { id: "midnight", name: "黑", tagline: "黑底。" },
  { id: "daylight", name: "白", tagline: "白底。" },
];

export const DEFAULT_SKIN: SkinId = "daylight";
export const PRIOR_INSTALL_SKIN: SkinId = "midnight";

const KEY = "omb-skin";

function isSkinId(value: unknown): value is SkinId {
  return SKIN_IDS.includes(value as SkinId);
}

// With storage blocked the localStorage getter itself throws, and `typeof` alone doesn't shield it.
function getStore(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const LIGHT_SKINS = new Set(["atelier", "lagoon", "linen", "daylight", "meadow"]);

export function readSkin(): SkinId {
  try {
    const store = getStore();
    const stored = store?.getItem(KEY);
    if (isSkinId(stored)) return stored;
    if (stored && LIGHT_SKINS.has(stored)) return "daylight";
    if (stored) return "midnight";
    return hasPriorRun(store) ? PRIOR_INSTALL_SKIN : DEFAULT_SKIN;
  } catch {
    return PRIOR_INSTALL_SKIN;
  }
}

export function applySkin(id: SkinId): void {
  document.documentElement.dataset.skin = id;
  try {
    getStore()?.setItem(KEY, id);
  } catch {
  }
  // On Windows the caption buttons sit in a native overlay the main process paints, out of CSS's reach.
  try {
    void window.ogb?.applySkin?.(id)?.catch(() => undefined);
  } catch {
  }
}
