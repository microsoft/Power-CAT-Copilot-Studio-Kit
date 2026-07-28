#!/usr/bin/env bash
# Build and deploy the SN Copilot container app.
# Run from kit/sn-mcp-copilot/.

set -euo pipefail

: "${RESOURCE_GROUP:=GenericResourceGroup}"
: "${LOCATION:=southindia}"
: "${ACR_NAME:=lobmcpapps}"

echo "Resource group: $RESOURCE_GROUP"
echo "Location:       $LOCATION"
echo "ACR:            $ACR_NAME"

az group create --name "$RESOURCE_GROUP" --location "$LOCATION" >/dev/null
az deployment group create \
    --resource-group "$RESOURCE_GROUP" \
    --template-file deploy/main.bicep \
    --parameters @deploy/parameters.bicepparam \
    --parameters acrName="$ACR_NAME" location="$LOCATION"

cd ..
az acr build \
    --registry "$ACR_NAME" \
    --image sn-mcp-copilot:latest \
    --file sn-mcp-copilot/Dockerfile \
    .

az containerapp update \
    --resource-group "$RESOURCE_GROUP" \
    --name gtc-sn-gw \
    --image "$(az acr show -n "$ACR_NAME" --query loginServer -o tsv)/sn-mcp-copilot:latest" >/dev/null

# MCP streamable-HTTP keeps session state in memory per replica. Without affinity,
# ACA round-robins requests across replicas and follow-up calls return 404
# ("Method Not Found" in Teams). Idempotent; survives bicep redeploys.
az containerapp ingress sticky-sessions set \
    --resource-group "$RESOURCE_GROUP" \
    --name gtc-sn-gw \
    --affinity sticky >/dev/null

FQDN=$(az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name gtc-sn-gw \
    --query properties.configuration.ingress.fqdn -o tsv)

echo ""
echo "SN Copilot live at: https://$FQDN"
echo ""
echo "Next: set MCP_GATEWAY_URL=https://$FQDN and run regen_manifests.py."
