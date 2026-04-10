import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type CommandResult = {
  ok: boolean;
  command: string;
  toolName?: string;
  input?: Json;
  result?: Json;
  error?: string;
};

const DEFAULT_SERVER_COMMAND = process.env.MCP_NIXOS_COMMAND || "mcp-nixos";
const SKILL_TEXT = `---
name: nixos-mcp
description: Use nixos-cli for NixOS, Home Manager, nix-darwin, FlakeHub, Noogle, nix.dev, wiki, and package version lookups when you need accurate ecosystem data without guessing.
---

# MCP-NixOS

Use this skill when the task involves:
- NixOS packages, options, or channels
- Home Manager or nix-darwin options
- Nixvim, Noogle, FlakeHub, nix.dev, or NixOS wiki lookups
- package version history or binary cache checks

Prefer \`nixos-cli\` over ad hoc web searches when the question is about Nix ecosystem facts.

## Preferred commands

\`\`\`bash
nixos-cli search firefox --source nixos --type packages --limit 5
nixos-cli info services.openssh.enable --source nixos --type option
nixos-cli options --source home-manager --query programs.git
nixos-cli stats --source nixos
nixos-cli versions python --limit 5
\`\`\`

## Routing rules

- Use \`search\` first for discovery.
- Use \`info\` when you already know the exact package or option name.
- Use \`versions\` for package history instead of searching changelogs manually.
- Use \`options\` for prefix browsing in Home Manager, Darwin, Nixvim, or Noogle.
- If the CLI fails, report the exact error instead of guessing.
`;

function usage(): never {
  console.error(`Usage:
  nixos-cli list-tools [--json]
  nixos-cli skill
  nixos-cli tool <tool-name> [--input-json <json>] [--json]
  nixos-cli search <query> [--source <source>] [--type <type>] [--channel <channel>] [--limit <n>] [--json]
  nixos-cli info <query> [--source <source>] [--type <type>] [--channel <channel>] [--json]
  nixos-cli stats [--source <source>] [--channel <channel>] [--json]
  nixos-cli options [--source <source>] [--query <prefix>] [--json]
  nixos-cli channels [--json]
  nixos-cli flake-inputs --type <list|ls|read> [--query <value>] [--limit <n>] [--json]
  nixos-cli cache <query> [--version <version>] [--system <system>] [--json]
  nixos-cli versions <package> [--version <version>] [--limit <n>] [--json]

Environment:
  MCP_NIXOS_COMMAND   Override the server executable (default: mcp-nixos)`);
  process.exit(2);
}

function parseFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  if (index + 1 >= args.length) throw new Error(`Missing value for ${flag}`);
  return args[index + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function parseJson(value: string | undefined, label: string): Json | undefined {
  if (value == null) return undefined;
  try {
    return JSON.parse(value) as Json;
  } catch (error) {
    throw new Error(`Invalid JSON for ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function printResult(result: CommandResult, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!result.ok) {
    console.error(result.error || "unknown error");
    process.exit(1);
  }

  if (result.command === "list-tools") {
    const tools = ((result.result as { tools?: Array<{ name?: string; description?: string }> })?.tools ?? []);
    for (const tool of tools) {
      console.log(`${tool.name}: ${tool.description ?? ""}`.trim());
    }
    return;
  }

  const toolResult = result.result as { content?: Array<{ type?: string; text?: string }> } | undefined;
  const textItems = toolResult?.content?.filter((item) => item?.type === "text" && typeof item.text === "string") ?? [];
  if (textItems.length > 0) {
    console.log(textItems.map((item) => item.text).join("\n\n"));
    return;
  }

  console.log(JSON.stringify(result.result, null, 2));
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: DEFAULT_SERVER_COMMAND,
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client(
    { name: "nixos-cli", version: "2.3.0-p2" },
    { capabilities: {} },
  );
  try {
    await client.connect(transport);
    await client.listTools();
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function callTool(toolName: string, input: Json | undefined, command: string): Promise<CommandResult> {
  try {
    const result = await withClient(async (client) =>
      await client.callTool({
        name: toolName,
        arguments: (input ?? {}) as Record<string, unknown>,
      }),
    );
    return { ok: true, command, toolName, input, result: result as Json };
  } catch (error) {
    return {
      ok: false,
      command,
      toolName,
      input,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function listTools(): Promise<CommandResult> {
  try {
    const result = await withClient(async (client) => await client.listTools());
    return { ok: true, command: "list-tools", result: result as Json };
  } catch (error) {
    return { ok: false, command: "list-tools", error: error instanceof Error ? error.message : String(error) };
  }
}

function nixArgs(base: Record<string, unknown>): Json {
  return base as Json;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (!command) usage();
  const asJson = hasFlag(argv, "--json");
  let result: CommandResult;

  switch (command) {
    case "list-tools":
      result = await listTools();
      break;
    case "skill":
      console.log(SKILL_TEXT);
      return;
    case "tool": {
      const toolName = argv[1];
      if (!toolName) usage();
      result = await callTool(toolName, parseJson(parseFlag(argv, "--input-json"), "--input-json"), command);
      break;
    }
    case "search": {
      const query = argv[1];
      if (!query) usage();
      result = await callTool(
        "nix",
        nixArgs({
          action: "search",
          query,
          source: parseFlag(argv, "--source") || "nixos",
          type: parseFlag(argv, "--type") || "packages",
          channel: parseFlag(argv, "--channel") || "unstable",
          ...(parseFlag(argv, "--limit") ? { limit: Number(parseFlag(argv, "--limit")) } : {}),
        }),
        command,
      );
      break;
    }
    case "info": {
      const query = argv[1];
      if (!query) usage();
      result = await callTool(
        "nix",
        nixArgs({
          action: "info",
          query,
          source: parseFlag(argv, "--source") || "nixos",
          type: parseFlag(argv, "--type") || "package",
          channel: parseFlag(argv, "--channel") || "unstable",
        }),
        command,
      );
      break;
    }
    case "stats":
      result = await callTool(
        "nix",
        nixArgs({
          action: "stats",
          source: parseFlag(argv, "--source") || "nixos",
          channel: parseFlag(argv, "--channel") || "unstable",
        }),
        command,
      );
      break;
    case "options":
      result = await callTool(
        "nix",
        nixArgs({
          action: "options",
          source: parseFlag(argv, "--source") || "home-manager",
          query: parseFlag(argv, "--query") || "",
        }),
        command,
      );
      break;
    case "channels":
      result = await callTool("nix", nixArgs({ action: "channels" }), command);
      break;
    case "flake-inputs": {
      const type = parseFlag(argv, "--type");
      if (!type) usage();
      result = await callTool(
        "nix",
        nixArgs({
          action: "flake-inputs",
          type,
          query: parseFlag(argv, "--query") || "",
          ...(parseFlag(argv, "--limit") ? { limit: Number(parseFlag(argv, "--limit")) } : {}),
        }),
        command,
      );
      break;
    }
    case "cache": {
      const query = argv[1];
      if (!query) usage();
      result = await callTool(
        "nix",
        nixArgs({
          action: "cache",
          query,
          version: parseFlag(argv, "--version") || "latest",
          system: parseFlag(argv, "--system") || "",
        }),
        command,
      );
      break;
    }
    case "versions": {
      const packageName = argv[1];
      if (!packageName) usage();
      result = await callTool(
        "nix_versions",
        {
          package: packageName,
          ...(parseFlag(argv, "--version") ? { version: parseFlag(argv, "--version") } : {}),
          ...(parseFlag(argv, "--limit") ? { limit: Number(parseFlag(argv, "--limit")) } : {}),
        },
        command,
      );
      break;
    }
    default:
      usage();
  }

  printResult(result, asJson);
}

await main();
