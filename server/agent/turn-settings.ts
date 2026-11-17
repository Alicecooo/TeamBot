import { mcpCallTimeoutMinutes, type AppConfig } from "../config/config.ts";
import { correctiveRounds } from "../host/loop-guard.ts";

/** The fields of an engine turn that come from Settings. */
export function settingsTurnFields(cfg: AppConfig): {
  mcpCallTimeoutMs: number;
  toolErrorCorrectiveRounds: number;
} {
  return {
    mcpCallTimeoutMs: mcpCallTimeoutMinutes() * 60_000,
    toolErrorCorrectiveRounds: correctiveRounds(cfg),
  };
}
