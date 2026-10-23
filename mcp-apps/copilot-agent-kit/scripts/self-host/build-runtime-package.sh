#!/usr/bin/env bash
# Builds the runtime package (zip) of the Agent Review MCP app for Azure App Service.
# Run it on Linux x64, for example in Azure Cloud Shell (Bash).
# Usage: bash ./scripts/self-host/build-runtime-package.sh [--out <folder>]
# The zip contains dist/, node_modules/ (production packages only) and package.json.
set -euo pipefail

out_dir="${HOME}/agent-review-releases"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) out_dir="${2:?--out needs a folder}"; shift 2 ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

fail() { echo "ERROR: $*" >&2; exit 1; }
warn() { echo "WARNING: $*" >&2; }

[[ "$(uname -s)" == "Linux" ]] || fail "Run this script on Linux. App Service runs on Linux, and some packages contain native code."
[[ "$(uname -m)" == "x86_64" ]] || fail "Run this script on x86_64 (amd64). This machine is $(uname -m)."
for tool in node npm sha256sum; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is not installed. See step 1 of SELF-HOSTING.md."
done
if command -v zip >/dev/null 2>&1; then
  zipper="zip"
elif command -v python3 >/dev/null 2>&1; then
  zipper="python3"
else
  fail "Install zip or python3."
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
[[ -f package.json && -f package-lock.json && -f infra/modules/resources.bicep ]] \
  || fail "Cannot find the repository files. Keep this script in scripts/self-host/ of the repository."
case "$repo_root" in
  /mnt/*) warn "The repository is on a Windows drive ($repo_root). npm can be very slow there. Clone the repository in your Linux home folder." ;;
esac

# Use the same Node.js major version as the App Service runtime in the template.
node_major="$(node -p 'process.versions.node.split(".")[0]')"
runtime_major="$(grep -oE "NODE\|[0-9]+" infra/modules/resources.bicep | head -n 1 | cut -d'|' -f2 || true)"
(( node_major >= 20 )) || fail "Node.js 20 or later is necessary. This machine has $(node --version)."
if [[ -n "$runtime_major" && "$node_major" != "$runtime_major" ]]; then
  warn "App Service runs Node.js $runtime_major (infra/modules/resources.bicep), but this machine has $(node --version). Use the same major version if possible."
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  version="$(git rev-parse --short HEAD)"
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    warn "The working tree has changes that are not committed. The package name gets the suffix -dirty."
    version="${version}-dirty"
  fi
else
  version="nogit-$(date -u +%Y%m%d%H%M%S)"
fi

echo "==> npm ci"
npm ci --no-audit --no-fund
echo "==> npm run build"
npm run build

for file in dist/server/main.js dist/ui/agent-review.html dist/ui/review-browser.html \
            dist/ui/agent-map.html dist/ui/agent-debugger.html dist/ui/evaluation-builder.html; do
  [[ -f "$file" ]] || fail "The build did not make $file."
done

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
cp -R dist package.json package-lock.json "$stage/"
echo "==> npm ci --omit=dev (production packages only)"
(cd "$stage" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
rm -f "$stage/package-lock.json"

mkdir -p "$out_dir"
out_dir="$(cd "$out_dir" && pwd)"
zip_path="${out_dir}/agent-review-mcpapp-${version}.zip"
rm -f "$zip_path"
echo "==> Make the zip"
if [[ "$zipper" == "zip" ]]; then
  (cd "$stage" && zip -qr "$zip_path" dist node_modules package.json)
else
  (cd "$stage" && python3 -m zipfile -c "$zip_path" dist node_modules package.json)
fi

size="$(stat -c %s "$zip_path")"
sha="$(sha256sum "$zip_path" | cut -d' ' -f1)"
printf '%s  %s\n' "$sha" "$(basename "$zip_path")" > "${zip_path}.sha256"

echo
echo "Package: $zip_path"
echo "Size:    $size bytes"
echo "SHA-256: $sha (also in ${zip_path}.sha256)"
echo
echo "Deploy it from the repository folder (step 7 of SELF-HOSTING.md):"
echo "  azd deploy web --from-package \"$zip_path\""
