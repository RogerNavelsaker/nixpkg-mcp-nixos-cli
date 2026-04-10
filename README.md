# nixpkg-nixos-cli

Thin Nix and Flox packaging repo for the Bun-installable `nixos-cli` bridge package.

This repo should own only reproducible Nix packaging. It should not own Pi-specific install behavior or generic MCP package docs.

## Current Status

- Exposes the CLI binary as `nixos-cli`
- Packages the local `nixos-cli` source tree
- Uses the package repo’s Bun lock surface with `bun2nix`
- Wraps the CLI with Bun from the Nix store, so Bun does not need to be installed separately in Flox
- Carries a package revision separate from upstream so Flox can detect packaging-only updates

## Files

- `flake.nix`
- `flake.lock`
- `bun.lock`
- `bun.nix`
- `nix/package-manifest.json`
- `nix/package.nix`
- `scripts/sync-from-upstream.sh`

## Direction

The source of truth for this repo is the local `nixos-cli` runtime repo. Syncing a new version means:

- copying the current `nixos-cli` source tree
- copying its `bun.lock`
- regenerating `bun.nix`
- bumping `nix/package-manifest.json`

The GitHub workflow is manual-only because hosted runners cannot observe local workspace changes. Use `workflow_dispatch` with a git URL and ref when you want a remote sync.
