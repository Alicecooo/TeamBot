import type { AnyProviderDriver } from "../harness/contracts.ts";
import { OpenAICompatDriver } from "./openai-compat.ts";

export const BUILT_IN_DRIVERS: readonly AnyProviderDriver[] = [
  OpenAICompatDriver,
];
