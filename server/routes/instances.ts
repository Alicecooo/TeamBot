import { resetPathCache } from "../platform/env-path.ts";
import { HOSTED_PROVIDER_SETTINGS_ERROR } from "../deployment/hosted-models.ts";
import { PASS, type RouteHandler } from "./table.ts";

export interface InstanceRouteDeps {
  hostedModels: boolean;
  describeInstances(): Promise<unknown>;
}

export function createInstanceRoutes(deps: InstanceRouteDeps): RouteHandler {
  const { hostedModels } = deps;
  const describeInstances = deps.describeInstances;
  return async ({ res, path, method, json }) => {
    if (method === "GET" && path === "/api/instances") {
      // Windows never pushes PATH changes into a live process, so commands added since launch stay invisible until this rescan.
      resetPathCache();
      return json(res, 200, { instances: await describeInstances() });
    }
    const companyMutation = /^\/api\/instances\/(company\.[\w.-]+)(?:\/|$)/.exec(path);
    if (hostedModels && path.startsWith("/api/instances/") && method !== "GET") return json(res, 403, { error: HOSTED_PROVIDER_SETTINGS_ERROR });
    if (companyMutation && method !== "GET") return json(res, 403, { error: "Company accounts are read-only here. Manage this connection in desktop Settings." });

    return PASS;
  };
}
