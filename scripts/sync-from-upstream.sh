#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
manifest_path="$repo_root/nix/package-manifest.json"
runtime_repo="${1:-https://github.com/RogerNavelsaker/nixos-cli.git}"
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
upstream_dir="$tmpdir/upstream"
echo "syncing from $runtime_repo @ $runtime_ref"
git clone --depth 1 --branch "$runtime_ref" "$runtime_repo" "$upstream_dir" >/dev/null 2>&1
rev="$(git -C "$upstream_dir" rev-parse HEAD)"
cp "$upstream_dir/bun.lock" "$repo_root/bun.lock"
src_hash="$(
  nix store prefetch-file --json --unpack "https://github.com/RogerNavelsaker/nixos-cli/archive/${rev}.tar.gz" \
    | jq -r '.hash'
)"

nix run github:nix-community/bun2nix?tag=2.0.8 -- \
  -l "$repo_root/bun.lock" \
  -o "$repo_root/bun.nix"

version="$(jq -r '.version' "$upstream_dir/package.json")"
homepage="$(jq -r '.homepage' "$upstream_dir/package.json")"
license="$(jq -r '.license' "$upstream_dir/package.json")"

jq \
  --arg version "$version" \
  --arg rev "$rev" \
  --arg hash "$src_hash" \
  --arg homepage "$homepage" \
  --arg license "$license" \
  '.source.type = "github"
   | .source.owner = "RogerNavelsaker"
   | .source.repo = "nixos-cli"
   | .source.defaultBranch = "main"
   | .source.version = $version
   | .source.rev = $rev
   | .source.hash = $hash
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
echo "  rev:      $rev"
echo "  hash:     $src_hash"
echo "  manifest: $manifest_path"
echo "  lockfile: $repo_root/bun.lock"
echo "  deps nix: $repo_root/bun.nix"
