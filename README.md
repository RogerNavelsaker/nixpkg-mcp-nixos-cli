# nixpkg-nixos-cli

Thin Nix and Flox packaging repo for the Bun-installable `nixos-cli` bridge package.

This repo should own only reproducible Nix packaging. It should not own Pi-specific install behavior or generic MCP package docs.

## Current Status

- Exposes the CLI binary as `nixos-cli`
- Fetches upstream source directly from the configured remote GitHub repo
- Narrows packaging to the upstream package surface instead of depending on a committed vendored tree
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

The source of truth for this repo is the upstream `nixos-cli` Git repo. Syncing a new version means:

- cloning the configured upstream repo and ref
- copying its `bun.lock`
- regenerating `bun.nix`
- updating the pinned upstream revision and source hash in `nix/package-manifest.json`

The sync script defaults to the remote GitHub upstream and does not materialize a committed `upstream/` tree anymore.
