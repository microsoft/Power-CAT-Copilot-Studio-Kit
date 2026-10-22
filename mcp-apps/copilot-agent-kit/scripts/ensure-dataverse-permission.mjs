import { spawnSync } from "node:child_process";

const DATAVERSE_APP_ID = "00000007-0000-0000-c000-000000000000";
const USER_IMPERSONATION_SCOPE_ID = "78ce3f0f-a1ce-49c2-8cde-64b5c0896db4";
const USER_IMPERSONATION_SCOPE = "user_impersonation";
const clientId = process.argv[2];

if (!clientId) {
  throw new Error("Agent Review client ID is required.");
}

function az(args) {
  const result = process.platform === "win32"
    ? spawnSync(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/c", `az ${args.join(" ")}`],
        { encoding: "utf8" },
      )
    : spawnSync("az", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      result.error?.message
      || result.stderr?.trim()
      || result.stdout?.trim()
      || `Azure CLI failed: az ${args.join(" ")}`,
    );
  }
  return result.stdout.trim();
}

function azJson(args) {
  const output = az([...args, "--output", "json"]);
  return output ? JSON.parse(output) : null;
}

function tryAzJson(args) {
  try {
    return azJson(args);
  } catch {
    return null;
  }
}

let servicePrincipal = tryAzJson(["ad", "sp", "show", "--id", clientId, "--query", "{id:id}"]);
if (!servicePrincipal?.id) {
  servicePrincipal = azJson(["ad", "sp", "create", "--id", clientId, "--query", "{id:id}"]);
}

const permissions = azJson(["ad", "app", "permission", "list", "--id", clientId]) ?? [];
if (!permissions.some((entry) =>
  entry.resourceAppId === DATAVERSE_APP_ID
  && entry.resourceAccess?.some((access) => access.id === USER_IMPERSONATION_SCOPE_ID && access.type === "Scope")
)) {
  az([
    "ad",
    "app",
    "permission",
    "add",
    "--id",
    clientId,
    "--api",
    DATAVERSE_APP_ID,
    "--api-permissions",
    `${USER_IMPERSONATION_SCOPE_ID}=Scope`,
  ]);
}

const dataversePrincipal = azJson([
  "ad",
  "sp",
  "show",
  "--id",
  DATAVERSE_APP_ID,
  "--query",
  "{id:id}",
]);
if (!dataversePrincipal?.id) {
  throw new Error("The Dataverse service principal is unavailable in this tenant.");
}

const grants = azJson([
  "rest",
  "--method",
  "GET",
  "--url",
  `https://graph.microsoft.com/v1.0/oauth2PermissionGrants?$filter=clientId%20eq%20%27${servicePrincipal.id}%27`,
  "--query",
  "value",
]) ?? [];
const consented = grants.some((grant) =>
  grant.resourceId === dataversePrincipal.id
  && grant.scope?.split(/\s+/).includes(USER_IMPERSONATION_SCOPE)
);
if (!consented) {
  az([
    "ad",
    "app",
    "permission",
    "grant",
    "--id",
    clientId,
    "--api",
    DATAVERSE_APP_ID,
    "--scope",
    USER_IMPERSONATION_SCOPE,
  ]);
}

console.log("Dataverse delegated permission is configured.");
