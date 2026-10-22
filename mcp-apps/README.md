# MCP Apps

Ready-to-deploy MCP Copilot apps, packaged as self-contained zips.

> **What is an MCP App?** An MCP App is an extension to the Model Context Protocol (MCP) that lets an MCP server deliver rich, interactive UI widgets to its host. In these samples, that host is Microsoft 365 Copilot — so tool responses render as interactive cards, lists, and forms instead of plain text.

## Available apps

| Folder | Package | App |
|---|---|---|
| `ask-salesforce` | `ask-salesforce.zip` | Ask - Salesforce CRM Copilot |
| `ask-servicenow` | `ask-servicenow.zip` | Ask - ServiceNow ITSM Copilot |
| `ask-hubspot` | `ask-hubspot.zip` | Ask - HubSpot CRM Copilot |
| `copilot-agent-kit` | - (source code, no zip) | Copilot Agent Kit MCP apps: Agent Review, Agent Map, Review Browser, Agent Debugger and Evaluation Builder |

## Getting started

1. Open the folder for the app you want (see the table above).
2. Follow the `README.md` inside that folder.

Each in-folder README's **Step 1 — Get the code** tells you to extract the `.zip` already included in that folder.

`copilot-agent-kit` is source code, not a zip. Its `README.md` and `SELF-HOSTING.md` give the build steps and the Azure hosting steps.
