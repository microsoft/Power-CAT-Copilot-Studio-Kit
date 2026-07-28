# Build from salesforce-crm/python/ as context: docker build -t sf-mcp-copilot .

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
COPY sf_crm_mcp/ sf_crm_mcp/
COPY pyproject.toml pyproject.toml
# Overlay freshly-built widget.html
COPY --from=widget-builder /build/sf_crm_mcp/web/widget.html sf_crm_mcp/web/widget.html
RUN pip install --no-cache-dir --prefix=/opt/venv .

# ── Runtime image ───────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /build/shared_mcp /opt/venv/lib/python3.11/site-packages/shared_mcp
ENV PATH="/opt/venv/bin:$PATH" PYTHONPATH="/opt/venv/lib/python3.11/site-packages"
ENV PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python", "-m", "sf_crm_mcp"]
