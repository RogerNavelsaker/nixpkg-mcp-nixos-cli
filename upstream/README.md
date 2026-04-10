# nixos-cli

Thin Bun CLI wrapper for the upstream `nixos-mcp` MCP server.

It speaks MCP over stdio and expects `mcp-nixos` on `PATH` by default.

## Commands

```bash
  nixos-cli list-tools
  nixos-cli skill > .pi/skills/nixos-mcp/SKILL.md
  nixos-cli search firefox --source nixos --type packages
  nixos-cli info services.openssh.enable --source nixos --type option
  nixos-cli stats --source nixos
nixos-cli versions python --limit 5
```

## Runtime

Override the server executable if needed:

```bash
MCP_NIXOS_COMMAND=/abs/path/mcp-nixos
```
