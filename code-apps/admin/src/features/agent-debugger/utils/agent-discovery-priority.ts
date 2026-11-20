import { classifyAgentDiscoveryError } from "./agent-discovery-errors";

const CACHE_PREFIX = "agent-debugger:environment-priority:v1:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type DiscoveryIdentity = {
  tenantId?: string;
  objectId?: string;
  userPrincipalName?: string;
  appId: string;
  environmentId: string;
};

type EnvironmentHint = {
  url: string;
  lastSuccessAt: number;
  hasAgents: boolean;
};

export function agentDiscoveryCacheKey(identity: DiscoveryIdentity): string | undefined {
  const user = identity.objectId?.trim()
    ? `oid:${identity.objectId.trim()}` : identity.userPrincipalName?.trim()
      ? `upn:${identity.userPrincipalName.trim()}` : undefined;
  const parts = [identity.tenantId, identity.appId, identity.environmentId, user];
  if (parts.some(part => !part?.trim())) return undefined;
  return CACHE_PREFIX + parts.map(part => encodeURIComponent(part!.trim().toLowerCase())).join(":");
}

function isHint(value: unknown): value is EnvironmentHint {
  if (!value || typeof value !== "object") return false;
  const hint = value as Record<string, unknown>;
  return typeof hint.url === "string" && typeof hint.hasAgents === "boolean"
    && typeof hint.lastSuccessAt === "number" && Number.isFinite(hint.lastSuccessAt);
}

/** Hints only affect queue order. They are never an authorization or agent-data cache. */
export function createAgentDiscoveryPriorityCache(key: string | undefined, environmentUrls: readonly string[]) {
  const allowed = new Set(environmentUrls);
  const hints = new Map<string, EnvironmentHint>();
  let storage: Storage | undefined;
  let warned = false;
  const warn = (error: unknown) => {
    if (!warned) console.warn("[AgentDebugger] Environment priority cache is unavailable or invalid:", error);
    warned = true;
  };
  const prune = () => {
    const now = Date.now();
    for (const [url, hint] of hints) {
      if (!allowed.has(url) || hint.lastSuccessAt > now || now - hint.lastSuccessAt >= MAX_AGE_MS) {
        hints.delete(url);
      }
    }
  };
  if (key) {
    try {
      storage = window.localStorage;
      const raw = storage.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed) || !parsed.every(isHint)) throw new Error("Invalid environment priority entries.");
        for (const hint of parsed) {
          // Copy only the supported fields; never retain arbitrary cached content.
          hints.set(hint.url, { url: hint.url, lastSuccessAt: hint.lastSuccessAt, hasAgents: hint.hasAgents });
        }
        prune();
      }
    } catch (error) {
      warn(error);
    }
  }
  const save = () => {
    prune();
    if (!storage || !key) return;
    try {
      storage.setItem(key, JSON.stringify([...hints.values()]));
    } catch (error) {
      storage = undefined;
      warn(error);
    }
  };
  return {
    priority(url: string): number {
      const hint = hints.get(url);
      if (!hint || Date.now() - hint.lastSuccessAt >= MAX_AGE_MS) return 0;
      return hint.hasAgents ? 2 : 1;
    },
    recordSuccess(url: string, hasAgents: boolean) {
      if (!allowed.has(url)) return;
      hints.set(url, { url, hasAgents, lastSuccessAt: Date.now() });
      save();
    },
    recordFailure(url: string, error: unknown) {
      if (classifyAgentDiscoveryError(error) === "access-denied" && hints.delete(url)) save();
    },
  };
}
