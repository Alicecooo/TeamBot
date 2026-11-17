import type { InstanceInfo } from "@/state/store";

export function engineReady(instance: InstanceInfo): boolean {
  return instance.snapshot.state === "available" && instance.snapshot.authenticated !== false;
}
