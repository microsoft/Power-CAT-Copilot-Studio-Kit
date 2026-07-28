# MCP Apps

This folder holds **MCP App** samples — Model Context Protocol servers that return an
interactive user interface (a widget) alongside each tool response, so Microsoft 365 Copilot
renders a live, interactive screen inline in the chat instead of plain text.

## Samples

| Sample | Description |
| --- | --- |
| [`salesforce-crm`](./salesforce-crm/python/README.md) | **Ask - Salesforce** — connects a Salesforce org to Microsoft 365 Copilot. Read, create, and update records across seven CRM entities, view a pipeline dashboard, and act on approvals. |
| [`servicenow-itsm`](./servicenow-itsm/python/README.md) | **Ask - ServiceNow** — connects a ServiceNow instance to Microsoft 365 Copilot. Read, create, and update records across five ITSM and HR entities, act on approvals, search knowledge articles, and browse the service catalog. |

Each sample follows the same layout:

```
<sample>/
├─ media/            Animated walkthroughs referenced by the sample README
└─ python/
   ├─ README.md      Full setup, deployment, and troubleshooting guide
   ├─ agent/         Declarative agent + app package manifests
   ├─ deploy/        Local and Azure Container Apps deployment scripts (Bicep + PowerShell)
   ├─ shared_mcp/    Shared auth, HTTP, logging, and telemetry helpers
   ├─ widgets/       React 19 + Fluent UI v9 widget source (built with Vite)
   └─ <name>_mcp/    FastMCP server, client, settings, and tool definitions
```

Both samples run either locally (via a dev tunnel) or on Azure Container Apps.
Start with the sample's own `python/README.md` — it is the authoritative setup guide.

## Prerequisites

- Python 3.11
- Node.js 20+ (to build the widget bundles)
- An Azure subscription, if you deploy to Azure Container Apps
- A Salesforce org or ServiceNow instance with API access

## License

MIT — see [LICENSE.txt](../LICENSE.txt) at the repository root.
