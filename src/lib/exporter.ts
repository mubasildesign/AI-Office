import JSZip from "jszip";
import { migrateCompany } from "./schema";
import type { AgentSpec, CompanySpec, CompatibilityReport, HostTarget, SkillSpec } from "./studio-types";

export type PackScope = { kind: "company" } | { kind: "agent"; id: string } | { kind: "team"; id: string };

export const AGENTPACK_FORMAT = "agentpack";
export const AGENTPACK_VERSION = "1.1.0";

function list(values: string[]) { return values.map((value) => `- ${value}`).join("\n"); }
function tomlString(value: string) { return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`; }
function tomlBlock(value: string) { return `"""\n${value.replaceAll('"""', '\\"\\"\\"')}\n"""`; }
function yamlValue(value: string) { return JSON.stringify(value); }

export function skillMarkdown(skill: SkillSpec) {
  return `---\nname: ${skill.id}\ndescription: ${yamlValue(skill.description)}\n---\n\n# ${skill.name}\n\n## When to use\n\n${skill.trigger}\n\n## Inputs\n\n${list(skill.inputs)}\n\n## Workflow\n\n${skill.workflow.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\n## Outputs\n\n${list(skill.outputs)}\n\n## Boundaries\n\n${list(skill.boundaries)}\n`;
}

function agentBody(agent: AgentSpec, company: CompanySpec) {
  const teams = company.teams.filter((team) => team.leadAgentId === agent.id);
  const delegation = teams.map((team) => {
    const members = team.memberAgentIds.map((id) => company.agents.find((item) => item.id === id)).filter(Boolean) as AgentSpec[];
    return `## Supervising ${team.name}\n\n${team.description}\n\nDelegate to these specialists by name, passing only the context each one needs:\n${list(members.map((member) => `${member.id}: ${member.title}. ${member.objective}`))}\n\nRouting rules:\n${list(team.routingRules)}\n\nAsk the user before: ${team.approvalPolicy.requiredFor.join(", ") || "nothing listed"}.\n\nOutput contract: ${team.outputContract}`;
  }).join("\n\n");
  return `# ${agent.title}\n\n${agent.instructions}\n\n## Objective\n\n${agent.objective}\n\n## Responsibilities\n\n${list(agent.responsibilities)}\n\n## Boundaries\n\n${list([...agent.nonGoals, ...agent.guardrails])}\n\n## Skills\n\n${list(agent.skillIds)}${delegation ? `\n\n${delegation}` : ""}\n`;
}

/** Narrows a company to one agent, one team, or the whole company. */
export function scopeCompany(company: CompanySpec, scope: PackScope): CompanySpec {
  if (scope.kind === "company") return company;
  const team = scope.kind === "team" ? company.teams.find((item) => item.id === scope.id) : undefined;
  const agentIds = new Set(scope.kind === "agent" ? [scope.id] : team ? [team.leadAgentId, ...team.memberAgentIds] : []);
  const agents = company.agents.filter((agent) => agentIds.has(agent.id));
  const skillIds = new Set(agents.flatMap((agent) => agent.skillIds));
  const toolIds = new Set(agents.flatMap((agent) => agent.toolIds));
  const name = scope.kind === "agent" ? agents[0]?.title ?? "Agent" : team?.name ?? "Team";
  return {
    ...company,
    id: `${company.id}-${scope.kind}-${scope.id}`,
    name,
    description: scope.kind === "agent" ? agents[0]?.objective ?? "" : team?.description ?? "",
    agents,
    teams: team ? [team] : [],
    skills: company.skills.filter((skill) => skillIds.has(skill.id)),
    tools: company.tools.filter((tool) => toolIds.has(tool.id)),
    missions: [],
  };
}

export function compatibility(company: CompanySpec, target: HostTarget): CompatibilityReport {
  const report: CompatibilityReport = { target, supported: [], degraded: [], unsupported: [] };
  const hasTeams = company.teams.length > 0;
  const approvals = company.teams.some((team) => team.approvalPolicy.requiredFor.length) || company.tools.some((tool) => tool.approval !== "never");
  const projectMemory = company.agents.some((agent) => agent.memory.project);
  const openai = company.agents.filter((agent) => agent.model.provider === "openai").length;
  const anthropic = company.agents.length - openai;
  const budgets = company.teams.some((team) => team.budget.maxCostUsd !== undefined);

  if (target === "agentpack") {
    report.supported.push("Agents", "Supervisor teams", "Skills", "MCP tool profiles", "Approval policies", "Memory policies", "Model policies", "Evaluations", "Office layout");
    return report;
  }
  if (target === "docker") {
    report.supported.push("Agents", "Skills", "MCP stdio and HTTP profiles", "OpenAI and Anthropic model policies", "Trace streaming");
    if (hasTeams) report.supported.push("Supervisor teams with delegation and synthesis");
    if (approvals) report.supported.push("Approval checkpoints through the runner API");
    if (projectMemory) report.degraded.push("Project memory needs a mounted volume to persist between container restarts");
    report.degraded.push("Image is built from the AI Office runner source included in this repository");
    report.unsupported.push("Scheduled missions (no production scheduler in v1)");
    return report;
  }

  report.supported.push("Agent instructions and boundaries", "Skills as SKILL.md files", "MCP server declarations (credentials configured in the host)");
  if (hasTeams) report.degraded.push("Supervisor teams become a lead agent whose instructions name and route to specialist agents; the host decides when to delegate");
  if (approvals) report.degraded.push(target === "claude" ? "Approval policies map to Claude Code permission prompts, not per-team approvers" : "Approval policies map to Codex approval mode, not per-team approvers");
  if (projectMemory) report.degraded.push("Memory retention is documented in instructions; the host manages its own memory");
  if (budgets) report.unsupported.push("Team cost budgets are not enforced by the host");
  if (target === "codex" && anthropic) report.degraded.push(`${anthropic} agent(s) use Anthropic models and fall back to the Codex default model`);
  if (target === "claude" && openai) report.degraded.push(`${openai} agent(s) use OpenAI models and are set to inherit the Claude Code model`);
  if (target === "codex") report.unsupported.push("Per-agent temperature");
  report.unsupported.push("Trace streaming to AI Office Studio", "Scheduled missions");
  return report;
}

function claudeModel(agent: AgentSpec) {
  if (agent.model.provider !== "anthropic") return "inherit";
  if (agent.model.model.includes("opus")) return "opus";
  if (agent.model.model.includes("haiku")) return "haiku";
  return "sonnet";
}

export async function buildPackage(company: CompanySpec, target: HostTarget, scope: PackScope = { kind: "company" }) {
  const pack = scopeCompany(company, scope);
  const report = compatibility(pack, target);
  const zip = new JSZip();
  zip.file("agentpack.json", JSON.stringify({ format: AGENTPACK_FORMAT, formatVersion: AGENTPACK_VERSION, scope, generatedFor: target, compatibility: report, company: pack }, null, 2));
  zip.file("COMPATIBILITY.md", `# Compatibility: ${target}\n\n## Supported\n\n${list(report.supported) || "None"}\n\n## Degraded\n\n${list(report.degraded) || "None"}\n\n## Unsupported\n\n${list(report.unsupported) || "None"}\n`);
  zip.file("README.md", `# ${pack.name}\n\n${pack.description}\n\nGenerated by AI Office Studio. \`agentpack.json\` is the canonical, lossless source; host-specific files are generated from it. Secrets are never included; configure provider keys and tool credentials in the target host.\n`);

  const enabledTools = pack.tools.filter((tool) => tool.enabled);
  if (target === "agentpack") {
    pack.skills.forEach((skill) => zip.file(`skills/${skill.id}/SKILL.md`, skillMarkdown(skill)));
    pack.agents.forEach((agent) => zip.file(`agents/${agent.id}.md`, agentBody(agent, pack)));
  } else if (target === "codex") {
    const agentEntries = pack.agents.map((agent) => `[agents.${agent.id}]\ndescription = ${tomlString(`${agent.title}: ${agent.objective}`)}\nconfig_file = "agents/${agent.id}.toml"\n`).join("\n");
    const mcp = enabledTools.map((tool) => tool.command ? `[mcp_servers.${tool.id}]\ncommand = ${tomlString(tool.command.split(" ")[0])}\nargs = [${tool.command.split(" ").slice(1).map(tomlString).join(", ")}]\n` : `[mcp_servers.${tool.id}]\nurl = ${tomlString(tool.url ?? "")}\n`).join("\n");
    zip.file(".codex/config.toml", `# Generated by AI Office Studio. Review MCP servers before enabling them.\n[features]\nmulti_agent = true\n\n${agentEntries}\n${mcp}`);
    pack.agents.forEach((agent) => zip.file(`.codex/agents/${agent.id}.toml`, `${agent.model.provider === "openai" ? `model = ${tomlString(agent.model.model)}\n` : ""}developer_instructions = ${tomlBlock(agentBody(agent, pack))}\n`));
    pack.skills.forEach((skill) => zip.file(`.agents/skills/${skill.id}/SKILL.md`, skillMarkdown(skill)));
    zip.file("AGENTS.md", `# ${pack.name}\n\nThis project defines ${pack.agents.length} agents in \`.codex/agents\`. ${pack.teams.map((team) => `${team.name} is supervised by ${team.leadAgentId}.`).join(" ")}\n`);
  } else if (target === "claude") {
    zip.file(".claude-plugin/plugin.json", JSON.stringify({ name: pack.id, version: pack.version, description: pack.description, author: { name: "AI Office Studio export" } }, null, 2));
    pack.agents.forEach((agent) => zip.file(`agents/${agent.id}.md`, `---\nname: ${agent.id}\ndescription: ${yamlValue(`${agent.title}. ${agent.objective}`)}\nmodel: ${claudeModel(agent)}\n---\n\n${agentBody(agent, pack)}`));
    pack.skills.forEach((skill) => zip.file(`skills/${skill.id}/SKILL.md`, skillMarkdown(skill)));
    zip.file(".mcp.json", JSON.stringify({ mcpServers: Object.fromEntries(enabledTools.map((tool) => [tool.id, tool.command ? { command: tool.command.split(" ")[0], args: tool.command.split(" ").slice(1) } : { type: "http", url: tool.url }])) }, null, 2));
  } else if (target === "docker") {
    pack.skills.forEach((skill) => zip.file(`skills/${skill.id}/SKILL.md`, skillMarkdown(skill)));
    zip.file("runner.config.json", JSON.stringify({ agentpack: "./agentpack.json", host: "0.0.0.0", port: 4317, allowedOrigins: ["http://localhost:3000"], mcp: enabledTools.map(({ id, transport, command, url }) => ({ id, transport: command ? "stdio" : "http", command, url, kind: transport })) }, null, 2));
    zip.file("Dockerfile", "# Build context: copy the AI Office runner source (runner/, package.json) next to this file.\nFROM node:22-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install --omit=dev\nENV AI_OFFICE_RUNNER_HOST=0.0.0.0 AI_OFFICE_RUNNER_PORT=4317 AI_OFFICE_AGENTPACK=/app/agentpack.json\nEXPOSE 4317\nCMD [\"npx\", \"tsx\", \"runner/index.ts\"]\n");
    zip.file("docker-compose.yml", `services:\n  ai-office-runner:\n    build: .\n    ports: ["127.0.0.1:4317:4317"]\n    environment:\n      OPENAI_API_KEY: \${OPENAI_API_KEY:-}\n      ANTHROPIC_API_KEY: \${ANTHROPIC_API_KEY:-}\n    volumes:\n      - runner-memory:/app/memory\nvolumes:\n  runner-memory: {}\n`);
  }
  return { zip, report, pack };
}

export async function exportPackage(company: CompanySpec, target: HostTarget, scope: PackScope = { kind: "company" }) {
  const { zip, pack } = await buildPackage(company, target, scope);
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${pack.id}-${target}.agentpack.zip`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ImportResult { company: CompanySpec; mode: "replace" | "merge"; summary: string }

function uniqueId(id: string, taken: Set<string>) {
  if (!taken.has(id)) return id;
  let index = 2;
  while (taken.has(`${id}-${index}`)) index += 1;
  return `${id}-${index}`;
}

export async function readPackage(data: Blob | ArrayBuffer | Uint8Array) {
  const zip = await JSZip.loadAsync(data);
  const file = zip.file("agentpack.json");
  if (!file) throw new Error("This file has no agentpack.json manifest.");
  const manifest = JSON.parse(await file.async("string")) as { format?: string; scope?: PackScope; company?: unknown };
  if (manifest.format !== AGENTPACK_FORMAT) throw new Error("This is not an AI Office agentpack.");
  return { scope: manifest.scope ?? { kind: "company" as const }, company: migrateCompany(manifest.company) };
}

export async function importPackage(data: Blob | ArrayBuffer | Uint8Array, current: CompanySpec | null): Promise<ImportResult> {
  const { scope, company: incoming } = await readPackage(data);
  if (scope.kind === "company" || !current?.id) return { company: incoming, mode: "replace", summary: `Imported ${incoming.name} with ${incoming.agents.length} agents and ${incoming.teams.length} teams.` };

  const agentIds = new Set(current.agents.map((agent) => agent.id));
  const rename = new Map<string, string>();
  const agents = incoming.agents.map((agent) => {
    const id = uniqueId(agent.id, agentIds);
    agentIds.add(id);
    rename.set(agent.id, id);
    return { ...agent, id };
  });
  const teamIds = new Set(current.teams.map((team) => team.id));
  const teams = incoming.teams.map((team) => {
    const id = uniqueId(team.id, teamIds);
    teamIds.add(id);
    return { ...team, id, leadAgentId: rename.get(team.leadAgentId) ?? team.leadAgentId, memberAgentIds: team.memberAgentIds.map((member) => rename.get(member) ?? member) };
  });
  const skills = [...current.skills, ...incoming.skills.filter((skill) => !current.skills.some((item) => item.id === skill.id))];
  const tools = [...current.tools, ...incoming.tools.filter((tool) => !current.tools.some((item) => item.id === tool.id))];
  const merged = migrateCompany({ ...current, agents: [...current.agents, ...agents], teams: [...current.teams, ...teams], skills, tools });
  return { company: merged, mode: "merge", summary: `Added ${agents.length} agent${agents.length === 1 ? "" : "s"}${teams.length ? ` and ${teams.length} team` : ""} to ${current.name}.` };
}
