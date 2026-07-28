# Build from servicenow-itsm/python/ as context: docker build -t sn-mcp-copilot .

# ── Widget build stage ──────────────────────────────────────────────────────
FROM node:20-slim AS widget-builder
WORKDIR /build
COPY widgets/ widgets/
WORKDIR /build/widgets
RUN npm install && npm run build

# ── Python build stage ──────────────────────────────────────────────────────
FROM python:3.11-slim AS builder
WORKDIR /build
COPY shared_mcp/ shared_mcp/
COPY servicenow_mcp/ servicenow_mcp/
COPY pyproject.toml pyproject.toml
# Overlay freshly-built widget.html
COPY --from=widget-builder /build/servicenow_mcp/web/widget.html servicenow_mcp/web/widget.html
RUN pip install --no-cache-dir --prefix=/opt/venv .

# ── Runtime image ───────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /build/shared_mcp /opt/venv/lib/python3.11/site-packages/shared_mcp
ENV PATH="/opt/venv/bin:$PATH" PYTHONPATH="/opt/venv/lib/python3.11/site-packages"
ENV PYTHONUNBUFFERED=1
EXPOSE 8081
CMD ["python", "-m", "servicenow_mcp"]
