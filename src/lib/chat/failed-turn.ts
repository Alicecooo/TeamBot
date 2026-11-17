import type { Bot, InstanceInfo } from "@/state/store";
import { failedTurnCause } from "../../../shared/thread/failed-turn";

export { failedTurnCause };

export function botEngine(bot: Bot | undefined, instances: InstanceInfo[]): InstanceInfo | undefined {
  return bot && instances.find((instance) => instance.instanceId === bot.modelSelection.instanceId);
}
