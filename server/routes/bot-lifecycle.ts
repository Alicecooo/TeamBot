import type { Store } from "../storage/store.ts";
import { PASS, type RouteHandler } from "./table.ts";

export interface BotLifecycleRouteDeps {
  store: Pick<Store, "bots">;
  interruptAllDirectThreads(botId: string): Promise<void>;
  deleteBotWithLifecycle(botId: string): Promise<{ status: number; body: unknown }>;
}

export function createBotLifecycleRoutes(deps: BotLifecycleRouteDeps): RouteHandler {
  const {store, interruptAllDirectThreads, deleteBotWithLifecycle} = deps;
  return async ({ req, res, path, method, json }) => {
    let m: RegExpMatchArray | null = null;
    if (method === "POST" && path === "/api/local-computer/interrupt") {
      if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
        return json(res, 415, { error: "content-type must be application/json" });
      }
      await Promise.allSettled(
        store.bots
          .filter((bot) => bot.computer === "local")
          .map(async (bot) => {
            await interruptAllDirectThreads(bot.id);
          }),
      );
      return json(res, 200, { ok: true });
    }
    m = path.match(/^\/api\/bots\/([\w-]+)$/);
    if (m && method === "DELETE") {
      const result = await deleteBotWithLifecycle(m[1]);
      return json(res, result.status, result.body);
    }
    return PASS;
  };
}
