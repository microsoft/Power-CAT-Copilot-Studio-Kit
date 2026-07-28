"""Regenerate mcp-tools.json + ai-plugin.json from the live SN server.

Writes the manifests, then validates what was written. Exits 1 on drift —
SetSail.ps1 honors that and aborts before MOS3 upload.

Run from kit/sn-mcp-copilot/:
    python deploy/regen_manifests.py

Honors MCP_GATEWAY_URL (set by SetSail.ps1 to the tunnel URL).
"""
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

APP_ROOT = Path(__file__).resolve().parent.parent

# Ensure the app root is on sys.path so servicenow_mcp is importable
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

env = APP_ROOT / ".env"
if env.exists():
    load_dotenv(env, override=False)

import servicenow_mcp.servicenow_server as sn  # noqa: E402

SERVER_PATH    = "/mcp"
TOOL_PREFIX    = "sn__"
TUNNEL_BASE    = os.getenv("MCP_GATEWAY_URL", "https://localhost:8081")

TOOLS_PATH  = APP_ROOT / "agent" / "appPackage" / "mcp-tools.json"
PLUGIN_PATH = APP_ROOT / "agent" / "appPackage" / "ai-plugin.json"


def title_case(name: str) -> str:
    bare = re.sub(r"^[a-z]+__", "", name)
    return bare.replace("_", " ").capitalize()


def _simplify_prop(prop: dict) -> dict:
    if "anyOf" in prop:
        types = prop["anyOf"]
        non_null = [t for t in types if t.get("type") != "null"]
        if len(types) == 2 and len(non_null) == 1:
            result = {k: v for k, v in non_null[0].items()}
            if "default" in prop and prop["default"] is not None:
                result["default"] = prop["default"]
            return {k: v for k, v in result.items() if k != "title"}
    return {k: v for k, v in prop.items() if k != "title"}


def clean_schema(schema: dict) -> dict:
    s = {k: v for k, v in schema.items() if k != "title"}
    if "properties" in s:
        s["properties"] = {
            pname: _simplify_prop(prop) for pname, prop in s["properties"].items()
        }
    return s


def build_entries(server_mod):
    tools = server_mod.mcp._tool_manager._tools
    entries, functions = [], []
    for tool_name, tool in tools.items():
        schema = dict(tool.parameters) if tool.parameters else {
            "properties": {}, "type": "object"
        }
        schema.setdefault("required", [])
        entry = {
            "name": tool_name,
            "description": tool.description or "",
            "inputSchema": clean_schema(schema),
            "title": title_case(tool_name),
        }
        if tool.meta:
            entry["_meta"] = tool.meta
        entries.append(entry)
        functions.append({"name": tool_name, "description": tool.description or ""})
    return entries, functions


def validate_written(prefix: str) -> list[str]:
    """Re-read what we just wrote and assert internal consistency.
    Returns a list of error strings (empty == all-clear).
    """
    errors: list[str] = []

    tools = json.loads(TOOLS_PATH.read_text(encoding="utf-8")).get("tools", [])
    plugin = json.loads(PLUGIN_PATH.read_text(encoding="utf-8"))
    plugin_functions = {f["name"] for f in plugin.get("functions", [])}
    tool_names = {t["name"] for t in tools}

    # 1. Every tool except the backstage-lookup set has _meta.ui.resourceUri
    no_widget = getattr(sn, "NO_WIDGET_TOOLS", set())
    missing_meta = [t["name"] for t in tools
                    if t["name"] not in no_widget
                    and not t.get("_meta", {}).get("ui", {}).get("resourceUri")]
    if missing_meta:
        errors.append(f"missing _meta.ui.resourceUri: {sorted(missing_meta)}")

    # 2. Every tool appears in ai-plugin.json functions
    not_in_plugin = tool_names - plugin_functions
    if not_in_plugin:
        errors.append(f"tools missing from ai-plugin.functions: {sorted(not_in_plugin)}")
    extra_in_plugin = plugin_functions - tool_names
    if extra_in_plugin:
        errors.append(f"ai-plugin.functions has entries not in mcp-tools: {sorted(extra_in_plugin)}")

    # 3. Every tool has the expected prefix
    wrong_prefix = [n for n in tool_names if not n.startswith(prefix)]
    if wrong_prefix:
        errors.append(f"tools without {prefix!r} prefix: {sorted(wrong_prefix)}")

    # 4. Runtime's run_for_functions covers exactly the tool set
    for i, rt in enumerate(plugin.get("runtimes", [])):
        rfn = set(rt.get("run_for_functions", []))
        if rfn != tool_names:
            errors.append(
                f"runtime[{i}].run_for_functions mismatch: "
                f"missing={sorted(tool_names - rfn)}, extra={sorted(rfn - tool_names)}"
            )

    return errors


def main() -> int:
    entries, functions = build_entries(sn)

    TOOLS_PATH.write_text(json.dumps({"tools": entries}, indent=4), encoding="utf-8")
    print(f"[OK] mcp-tools.json — {len(entries)} tools")

    plugin = json.loads(PLUGIN_PATH.read_text(encoding="utf-8"))
    plugin["functions"] = functions
    existing = plugin.get("runtimes", [])
    if not existing:
        existing = [{
            "type": "RemoteMCPServer",
            "spec": {"url": "", "mcp_tool_description": {"file": "mcp-tools.json"}},
            "auth": {"type": "None"},
        }]
    existing[0]["spec"]["url"] = TUNNEL_BASE + SERVER_PATH
    existing[0]["spec"]["mcp_tool_description"] = {"file": "mcp-tools.json"}
    existing[0]["run_for_functions"] = [f["name"] for f in functions]
    plugin["runtimes"] = existing[:1]
    PLUGIN_PATH.chmod(PLUGIN_PATH.stat().st_mode | 0o200)
    PLUGIN_PATH.write_text(json.dumps(plugin, indent=4), encoding="utf-8")
    print(f"[OK] ai-plugin.json — {len(functions)} functions, 1 runtime ({TUNNEL_BASE}{SERVER_PATH})")

    print()
    print("Validating written manifests...")
    errors = validate_written(TOOL_PREFIX)
    if errors:
        print("[FAIL] manifest drift detected:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print(f"[OK] manifests validated — {len(entries)} tools, all consistent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
