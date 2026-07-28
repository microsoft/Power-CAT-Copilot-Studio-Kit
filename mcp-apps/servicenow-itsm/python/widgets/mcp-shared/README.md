# mcp-shared

Polyglot shared library for LOB MCP Copilots. Contains both a Python package and a JS package in one folder.

## Python (`shared_mcp/`)

- `auth.py` — Bearer token extraction from FastMCP request context
- `http.py` — `httpx.AsyncClient` factory (30s timeout default)
- `logger.py` — `structlog` factory
- `telemetry.py` — App Insights tool-call telemetry (HTTP REST, no SDK)

Installed via `pip install -e kit/mcp-shared` (from repo root). Consumers depend on it via `mcp-shared` in their `pyproject.toml`.

## JS (`widgets/`)

- `McpBridge` / `useMcpBridge` / `useToolData` / `useTheme` — MCP Apps host bridge for React widgets
- `FluentWrapper` — Fluent UI v9 theme provider that reads from the bridge
- `Toast` / `useToast` / `ToastContainer` — global toast notifications
- `ErrorBoundary` — widget crash recovery UI
- `ExpandButton` — fullscreen toggle
- `McpFooter` — MCP attribution + "Open in portal" link

Installed via `npm install file:../../mcp-shared` from each Copilot's `widgets/` folder. Consumers import via `@gtc/mcp-shared`.

## Version

Both manifests share version **0.5.0**. Bump them together when releasing.
