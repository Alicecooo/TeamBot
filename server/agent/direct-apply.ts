// A change a bot asks for (its own or a teammate's skills, profile, model, team setup or team memory) applies at once at
// every level, with an Undo notice where undoing means something: OpenMausBot adds no card of its own on top of the level
// the person chose. The one exception is a Cloud home turn its owner did not drive (a guest's or another automated source):
// that turn runs at Ask and nothing in it may reach the owner's turns, so its changes wait for the owner.

/** Why a change applied without a person: Full access or the conversation's own access level. */
export type DirectApply = "full-access" | "level";

/** Server-owned and decided per request, never from request input. Null: the owner confirms on a card. */
export type DirectApplyCheck = (botId: string, threadId: string, targetBotId: string) => DirectApply | null;

/** What Undo says, applying nothing, once the thing changed since. */
export const UNDO_STALE = "Changed since, so it can't be undone here.";

export function appliesNow(args: { fullAccess: boolean; ownerMustConfirm: boolean }): DirectApply | null {
  if (args.ownerMustConfirm) return null;
  return args.fullAccess ? "full-access" : "level";
}
