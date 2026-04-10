#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
manifest_path="$repo_root/nix/package-manifest.json"
runtime_repo="${1:-/home/rona/Repositories/@runtime-intel/nixos-cli}"
runtime_ref="${2:-main}"
tmpdir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi
if ! command -v nix >/dev/null 2>&1; then
  echo "nix is required" >&2
  exit 1
fi
if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required" >&2
  exit 1
fi

if [ -d "$runtime_repo" ]; then
  upstream_dir="$runtime_repo"
  rev="$(git -C "$runtime_repo" rev-parse HEAD)"
else
  upstream_dir="$tmpdir/upstream"
  echo "syncing from $runtime_repo @ $runtime_ref"
  git clone --depth 1 --branch "$runtime_ref" "$runtime_repo" "$upstream_dir" >/dev/null 2>&1
  rev="$(git -C "$upstream_dir" rev-parse HEAD)"
fi

echo "syncing from $runtime_repo"
rm -rf "$repo_root/upstream"
mkdir -p "$repo_root/upstream"
rsync -a --delete --exclude '.git' --exclude 'node_modules' "$upstream_dir"/ "$repo_root/upstream"/
cp "$upstream_dir/bun.lock" "$repo_root/bun.lock"

nix run github:nix-community/bun2nix?tag=2.0.8 -- \
  -l "$repo_root/bun.lock" \
  -o "$repo_root/bun.nix"

version="$(jq -r '.version' "$upstream_dir/package.json")"
homepage="$(jq -r '.homepage' "$upstream_dir/package.json")"
license="$(jq -r '.license' "$upstream_dir/package.json")"

jq \
  --arg version "$version" \
  --arg rev "$rev" \
  --arg homepage "$homepage" \
  --arg license "$license" \
  '.source.version = $version
   | .source.rev = $rev
   | .binary.name = "nixos-cli"
   | .binary.entrypoint = "bin/nixos-cli.mjs"
   | .meta.description = "Thin Nix package for the NixOS CLI bridge"
   | .meta.homepage = $homepage
   | .meta.licenseSpdx = $license' \
  "$manifest_path" > "$manifest_path.tmp"
mv "$manifest_path.tmp" "$manifest_path"

echo "updated:"
echo "  runtime:  $runtime_repo"
echo "  ref:      $runtime_ref"
echo "  manifest: $manifest_path"
echo "  lockfile: $repo_root/bun.lock"
echo "  deps nix: $repo_root/bun.nix"
