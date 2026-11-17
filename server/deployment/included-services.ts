// One relay URL + token pair per included service:
//   OMB_CLOUD_BOAT_URL    + OMB_CLOUD_BOAT_TOKEN     the Boat relay, ending in /api/box/v1
//   OMB_CLOUD_AI_TOKEN is no longer used; it is still removed from the environment at startup.
// The person's own key always wins and is resolved per request; an included token goes only to its relay and is never
// written to config.json or reported to a client.

export const BOAT_API_DEFAULT = "https://boat.dev/api/v1";
/** Must also be on WORKSPACE_CREDENTIAL_ENV. */
export const INCLUDED_TOKEN_ENV = ["OMB_CLOUD_BOAT_TOKEN", "OMB_CLOUD_AI_TOKEN"] as const;

export interface ServiceCredential {
  token: string;
  /** The only base URL this token is ever sent to. */
  api: string;
  included: boolean;
}

interface Included {
  boat: ServiceCredential | null;
}

function includedService(url: string | undefined, token: string | undefined): ServiceCredential | null {
  const api = url?.trim().replace(/\/+$/, "");
  const secret = token?.trim();
  return api && secret ? { token: secret, api, included: true } : null;
}

const includedFrom = (env: NodeJS.ProcessEnv): Included => ({
  boat: includedService(env.OMB_CLOUD_BOAT_URL, env.OMB_CLOUD_BOAT_TOKEN),
});

let held: Included | null = null;

/** Dropped from the environment at startup so nothing the server starts can inherit them. */
export function holdIncludedServices(env: NodeJS.ProcessEnv = process.env): void {
  held = includedFrom(env);
  for (const name of INCLUDED_TOKEN_ENV) delete env[name];
}

function resolve(own: string | undefined, providerApi: string, included: ServiceCredential | null): ServiceCredential | null {
  if (own) {
    // A leased computer hands the included token back as a plain one; it still goes only to its relay.
    if (included && own === included.token) return included;
    return { token: own, api: providerApi, included: false };
  }
  return included;
}

export const boatProviderApi = (env: NodeJS.ProcessEnv = process.env): string => env.OMB_BOAT_API || BOAT_API_DEFAULT;
export function boatCredential(own: string | undefined, env: NodeJS.ProcessEnv = process.env): ServiceCredential | null {
  return resolve(own, boatProviderApi(env), (held ?? includedFrom(env)).boat);
}

