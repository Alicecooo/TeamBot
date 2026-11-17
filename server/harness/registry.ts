// Provider instance registry — port of upstream's ProviderInstanceRegistryLive behavior, minus Effect.
import type { AnyProviderDriver, EngineAccess, InstanceConfigMap, InstanceId, ProviderInstance, ProviderSnapshot } from "./contracts.ts";

export interface ShadowInstance {
  instanceId: InstanceId;
  driverKind: string;
  displayName: string | undefined;
  shadow: true;
  reason: string;
}

export type RegistryEntry =
  | { instanceId: InstanceId; live: ProviderInstance; shadow?: undefined }
  | { instanceId: InstanceId; live?: undefined; shadow: ShadowInstance };

export const SNAPSHOT_DEADLINE_MS = 60_000;
/** How long a finished status read answers later reads, so a start-up's model lists and engine-list reads probe each engine once. */
export const SNAPSHOT_REUSE_MS = 3_000;
const SNAPSHOT_DEADLINE_REASON = "This engine did not report its status within a minute.";

function withinDeadline(read: () => Promise<ProviderSnapshot>): Promise<ProviderSnapshot> {
  let deadline: NodeJS.Timeout | undefined;
  return Promise.race([
    read(),
    new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => reject(new Error(SNAPSHOT_DEADLINE_REASON)), SNAPSHOT_DEADLINE_MS);
      deadline.unref?.();
    }),
  ]).finally(() => clearTimeout(deadline));
}

type SharedRead = { generation: number; settledAt?: number; read: Promise<ProviderSnapshot> };

export class ProviderRegistry {
  private byId = new Map<InstanceId, RegistryEntry>();
  private lastSnapshots = new Map<InstanceId, ProviderSnapshot>();
  private snapshotGeneration = 0;
  private driversByKind: Map<string, AnyProviderDriver>;

  constructor(drivers: readonly AnyProviderDriver[]) {
    this.driversByKind = new Map(drivers.map((d) => [d.driverKind, d]));
  }

  async load(configs: InstanceConfigMap, decorate?: (instance: ProviderInstance) => ProviderInstance) {
    const slots = [...this.byId.keys()];
    const loaded = await Promise.all(
      Object.entries(configs).map(async ([instanceId, entry]) => {
        const ready = await this.createEntry(instanceId, entry, decorate);
        this.byId.set(instanceId, ready);
        return ready;
      }),
    );
    // Config order, not completion order; an entry a dispose replaced meanwhile is not this load's to place.
    const placed = new Set(loaded.filter((entry) => this.byId.get(entry.instanceId) === entry).map((entry) => entry.instanceId));
    const entries = new Map(this.byId);
    this.byId.clear();
    for (const id of [...slots, ...[...entries.keys()].filter((id) => !placed.has(id)), ...placed]) {
      const entry = entries.get(id);
      if (entry && !this.byId.has(id)) this.byId.set(id, entry);
    }
  }

  private async createEntry(
    instanceId: InstanceId,
    entry: InstanceConfigMap[string],
    decorate?: (instance: ProviderInstance) => ProviderInstance,
  ): Promise<RegistryEntry> {
    await this.dispose(instanceId);
    const driver = this.driversByKind.get(entry.driver);
    if (!driver) {
      return {
        instanceId,
        shadow: {
          instanceId,
          driverKind: entry.driver,
          displayName: entry.displayName,
          shadow: true,
          reason: `unknown driver "${entry.driver}" — kept as configured, unavailable here`,
        },
      };
    }
    try {
      const config = entry.config === undefined ? driver.defaultConfig() : driver.decodeConfig(entry.config);
      const live = await driver.create({
        instanceId,
        displayName: entry.displayName ?? driver.metadata.displayName,
        environment: entry.environment ?? {},
        enabled: entry.enabled ?? true,
        config,
      });
      this.shareSnapshot(live);
      return { instanceId, live: decorate ? decorate(live) : live };
    } catch (e) {
      return {
        instanceId,
        shadow: {
          instanceId,
          driverKind: entry.driver,
          displayName: entry.displayName ?? driver.metadata.displayName,
          shadow: true,
          reason: e instanceof Error ? e.message : String(e),
        },
      };
    }
  }

  /**
   * One engine's status read, bounded and shared: callers join the probe in flight, and one that finished within
   * SNAPSHOT_REUSE_MS answers again, so the same engine is not read twice for the same answer. A failed read is never reused.
   * Replaced on the driver's own instance, beneath a decorator's checks, which still run on every read; an object
   * spread would evaluate getters such as `models` once.
   */
  private shareSnapshot(instance: ProviderInstance): void {
    const read = instance.snapshot.bind(instance);
    let held: SharedRead | undefined;
    instance.snapshot = () => {
      if (held && held.generation === this.snapshotGeneration
        && (held.settledAt === undefined || Date.now() - held.settledAt < SNAPSHOT_REUSE_MS)) return held.read;
      const current: SharedRead = { generation: this.snapshotGeneration, read: withinDeadline(read) };
      held = current;
      current.read.then(() => { current.settledAt = Date.now(); }, () => { if (held === current) held = undefined; });
      return current.read;
    };
  }

  /** Every engine's next status read runs again: a key change may alter what it reports. */
  forgetSnapshots(): void {
    this.snapshotGeneration += 1;
  }

  get(instanceId: InstanceId): ProviderInstance | null {
    return this.byId.get(instanceId)?.live ?? null;
  }

  lastSnapshot(instanceId: InstanceId): ProviderSnapshot | undefined {
    return this.byId.get(instanceId)?.live ? this.lastSnapshots.get(instanceId) : undefined;
  }

  access(instanceId: InstanceId): EngineAccess | undefined {
    const entry = this.byId.get(instanceId);
    return entry ? this.driversByKind.get(entry.shadow?.driverKind ?? entry.live!.driverKind)?.metadata.access ?? "subscription" : undefined;
  }

  /** From the registry's config, never an HTTP body. */
  cliTarget(instanceId: InstanceId): { driverKind: string } | null {
    const entry = this.byId.get(instanceId);
    if (!entry) return null;
    return { driverKind: entry.shadow?.driverKind ?? entry.live!.driverKind };
  }

  entries(): RegistryEntry[] {
    return [...this.byId.values()];
  }

  instances(): ProviderInstance[] {
    return [...this.byId.values()].flatMap((e) => (e.live ? [e.live] : []));
  }

  async describe() {
    return Promise.all(
      this.entries().map(async (entry) => {
        const driver = this.driversByKind.get(entry.shadow?.driverKind ?? entry.live!.driverKind);
        if (entry.shadow) {
          return {
            instanceId: entry.instanceId,
            driverKind: entry.shadow.driverKind,
            displayName: entry.shadow.displayName ?? entry.shadow.driverKind,
            snapshot: { state: "unavailable", reason: entry.shadow.reason } satisfies ProviderSnapshot,
            models: { default: "", options: [] },
            capabilities: { computerMcp: false, agentsMcp: false, localComputerMcp: false },
            access: driver?.metadata.access ?? "subscription",
          };
        }
        const inst = entry.live;
        let snapshot: ProviderSnapshot;
        try {
          snapshot = await inst.snapshot();
        } catch (e) {
          snapshot = { state: "unavailable", reason: e instanceof Error ? e.message : String(e) };
        }
        // Only while this is still the live instance: a reload may have replaced it during the read.
        if (this.byId.get(inst.instanceId)?.live === inst) this.lastSnapshots.set(inst.instanceId, snapshot);
        return {
          instanceId: inst.instanceId,
          driverKind: inst.driverKind,
          displayName: inst.displayName ?? inst.driverKind,
          snapshot,
          models: inst.models,
          capabilities: {
            computerMcp: inst.adapter.capabilities.computerMcp === true,
            agentsMcp: inst.adapter.capabilities.agentsMcp === true,
            composioMcp: inst.adapter.capabilities.composioMcp === true,

            images: inst.adapter.capabilities.images === true,
            effortLevels: inst.adapter.capabilities.effortLevels,
            modelVariants: inst.adapter.capabilities.modelVariants === true,
            queueing: inst.adapter.capabilities.queueing === true,
            localComputerMcp: inst.adapter.capabilities.localComputerMcp === true,
            approvalReview: inst.reviewPermission !== undefined,
            backgroundText: inst.generateText !== undefined || inst.generateMemoryText !== undefined,
          },
          access: driver?.metadata.access ?? "subscription",
        };
      }),
    );
  }

  async disposeAll() {
    await Promise.allSettled(this.instances().map((i) => i.dispose()));
    this.byId.clear();
    this.lastSnapshots.clear();
  }

  async dispose(instanceId: InstanceId) {
    const entry = this.byId.get(instanceId);
    this.byId.delete(instanceId);
    this.lastSnapshots.delete(instanceId);
    await entry?.live?.dispose();
  }
}
