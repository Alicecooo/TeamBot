import { api, desktopApprovalBridge, persistBotUpdate, persistTaskApproval, type Bot } from "@/state/store";
import type { BotCreationDraft } from "./bot-creation-draft";
import { imageAttachmentFromFile } from "../chat/composer-attachments";
import { botAvatarUrlFromStoredPath } from "../../../shared/bot/bot-avatar";

export async function preparedBotTemplate(draft: BotCreationDraft) {
  const template = draft.export();
  if (template.profile.avatarUrl?.startsWith("blob:")) {
    if (!draft.avatarFile) throw new Error("Choose the avatar image again");
    const uploaded = await imageAttachmentFromFile(draft.avatarFile);
    const avatarUrl = uploaded && botAvatarUrlFromStoredPath(uploaded.path);
    if (!avatarUrl) throw new Error("Could not store the avatar image");
    template.profile.avatarUrl = avatarUrl;
  }
  return template;
}

/** File setup and native consent finish before handing the team to the new bot. */
export async function createConfiguredBot(
  draft: BotCreationDraft,
  request: typeof api = api,
  update: typeof persistBotUpdate = persistBotUpdate,
  approvals = desktopApprovalBridge(),
): Promise<{ bot: Bot; warnings: string[] }> {
  const template = await preparedBotTemplate(draft);
  const { chiefOfStaff, managedSections, toolScope, ...profile } = template.profile;
  if (!profile.name?.trim()) throw new Error("Give the bot a name");
  const preset = draft.preset;
  const response = await request<{ bot: Bot }>("/api/bots", {
    method: "POST", body: JSON.stringify({ name: profile.name, title: profile.title,
      description: profile.description, modelSelection: profile.modelSelection, section: profile.section,
      requireAvailableModel: true, useDefaults: false,
      ...(Object.hasOwn(template.profile, "toolScope") ? { settings: { toolScope } } : {}),
      ...(preset ? { preset: preset.id } : {}) }),
  });
  let bot = response.bot;
  const warnings: string[] = [];
  try {
    // The create endpoint already validated the model and effort defaults; never overwrite them with the raw draft.
    const patched = await update(bot.id, { ...profile, modelSelection: bot.modelSelection, ...draft.consent }, new AbortController().signal,
      request, approvals, bot);
    bot = { ...bot, ...patched };
    if (profile.approvalMode === "full" || profile.approvalMode === "custom") {
      if (patched.approvalMode !== profile.approvalMode) {
        throw new Error("The bot's requested approval level was not granted");
      }
      const granted = await persistTaskApproval(bot.id, bot.threadId, {
        approvalMode: profile.approvalMode,
        acknowledgeLocalAuto: draft.consent.acknowledgeLocalAuto === true,
      }, approvals, request);
      if (granted.approvalMode !== profile.approvalMode) {
        throw new Error("The initial thread's requested approval level was not granted");
      }
    }
    for (const [path, text] of Object.entries(template.memory)) {
      if (preset?.notes.includes(path)) continue;
      await request(`/api/bots/${bot.id}/memory/file`, {
        method: "PUT", body: JSON.stringify({ path, text }),
      });
    }
    for (const skill of template.skills) {
      if (preset?.skills.includes(skill.name)) continue;
      await request(`/api/bots/${bot.id}/skill-template`, { method: "POST", body: JSON.stringify(skill) });
    }
  } catch (error) {
    let cleanupFailed = false;
    try { await request(`/api/bots/${bot.id}`, { method: "DELETE" }); }
    catch { cleanupFailed = true; }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(cleanupFailed ? `${message}. Cleanup failed for bot ${bot.name} (${bot.id}); remove it before retrying.` : message);
  }
  // Creation is complete: avoid deleting a bot or inviting a duplicate retry after a recoverable handover error.
  if (chiefOfStaff) {
    try {
      const result = await request<{ bot: Bot }>(`/api/bots/${bot.id}`, {
        method: "PATCH", body: JSON.stringify({ chiefOfStaff, managedSections, acknowledgePeerScope: true }),
      });
      bot = { ...bot, ...result.bot };
    } catch (error) {
      warnings.push(`Review this bot's Chief of Staff setting: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { bot, warnings };
}
