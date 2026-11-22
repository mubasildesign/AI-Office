import { z } from "zod";
import { avatarEyes, avatarShapes, deriveAppearance, hairStyles } from "./appearance";
import { departmentZones, freeDeskIn, seatById } from "./office-layout";
import { newTeam } from "./seed";
import type { AgentSpec, CompanySpec, DepartmentId, TeamSpec } from "./studio-types";

const department = z.enum(["executive", "product", "engineering", "revenue", "operations"]);
const stringList = z.array(z.string());

export const appearanceSchema = z.object({
  shape: z.enum(avatarShapes as [string, ...string[]]),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  eyes: z.enum(avatarEyes as [string, ...string[]]),
  skin: z.string(),
  hair: z.string(),
  hairStyle: z.enum(hairStyles as [string, ...string[]]),
  pants: z.string(),
});

export const skillSchema = z.object({ id: z.string().min(1), name: z.string().min(1), description: z.string(), trigger: z.string(), inputs: stringList, workflow: stringList, outputs: stringList, boundaries: stringList });

export const toolSchema = z.object({ id: z.string().min(1), name: z.string().min(1), transport: z.enum(["mcp", "native"]), command: z.string().optional(), url: z.string().optional(), capabilities: stringList, approval: z.enum(["always", "writes", "never"]), enabled: z.boolean() });

export const agentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  title: z.string().min(1),
  department,
  accent: z.string(),
  initials: z.string(),
  appearance: appearanceSchema,
  objective: z.string(),
  instructions: z.string(),
  responsibilities: stringList,
  nonGoals: stringList,
  skillIds: stringList,
  toolIds: stringList,
  memory: z.object({ working: z.boolean(), project: z.boolean(), retentionDays: z.number().int().min(0), redactSecrets: z.boolean() }),
  model: z.object({ provider: z.enum(["openai", "anthropic"]), model: z.string().min(1), temperature: z.number().min(0).max(2), maxTokens: z.number().int().positive() }),
  guardrails: stringList,
  evaluations: stringList,
  state: z.enum(["idle", "working", "waiting", "review", "blocked"]),
  seat: z.string(),
});

export const teamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  leadAgentId: z.string().min(1),
  memberAgentIds: stringList,
  routing: z.literal("supervisor"),
  routingRules: stringList,
  sharedContext: stringList,
  approvalPolicy: z.object({ requiredFor: stringList, approvers: stringList, timeoutMinutes: z.number() }),
  budget: z.object({ maxTokens: z.number().int().positive(), maxCostUsd: z.number().optional() }),
  outputContract: z.string(),
});

export const missionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  objective: z.string(),
  assigneeType: z.enum(["agent", "team"]),
  assigneeId: z.string(),
  context: z.string(),
  artifacts: stringList,
  budget: z.object({ maxTokens: z.number().int().positive(), maxCostUsd: z.number().optional() }),
  status: z.enum(["draft", "queued", "running", "waiting", "completed", "failed", "cancelled"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const companySchema = z.object({
  schemaVersion: z.literal("1.1"),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  version: z.string(),
  agents: z.array(agentSchema),
  skills: z.array(skillSchema),
  teams: z.array(teamSchema),
  tools: z.array(toolSchema),
  missions: z.array(missionSchema),
  deployments: z.array(z.object({ id: z.string(), target: z.enum(["agentpack", "codex", "claude", "docker"]), scope: z.enum(["user", "project", "container"]), includeTools: z.boolean(), includeEvaluations: z.boolean() })),
  updatedAt: z.string(),
});

type Loose = Record<string, unknown>;

/** Upgrades any earlier company shape to the current schema, then validates it. */
export function migrateCompany(raw: unknown): CompanySpec {
  const input = (raw ?? {}) as Loose;
  const taken: string[] = [];
  const agents = ((input.agents as Loose[] | undefined) ?? []).map((agent, index) => {
    const dept = (departmentZones.includes(agent.department as DepartmentId) ? agent.department : "operations") as DepartmentId;
    const currentSeat = typeof agent.seat === "string" && seatById(agent.seat)?.zone === dept && !taken.includes(agent.seat) ? agent.seat : undefined;
    const seat = currentSeat ?? freeDeskIn(dept, taken);
    taken.push(seat);
    const next = { ...agent, department: dept, seat, state: "idle", appearance: { ...deriveAppearance(String(agent.id), index), ...((agent.appearance as Loose) ?? {}) } } as Loose;
    delete next.position;
    return next as unknown as AgentSpec;
  });
  const teams = ((input.teams as Loose[] | undefined) ?? []).map((team) => newTeam({ ...(team as unknown as TeamSpec) }));
  const candidate = { ...input, schemaVersion: "1.1", agents, teams, missions: input.missions ?? [], deployments: input.deployments ?? [], skills: input.skills ?? [], tools: input.tools ?? [] };
  return companySchema.parse(candidate) as CompanySpec;
}

export interface CompanyIssue { level: "error" | "warning"; message: string; target?: { kind: "agent" | "team"; id: string } }

export function validateCompany(company: CompanySpec): CompanyIssue[] {
  const issues: CompanyIssue[] = [];
  const agentIds = new Set(company.agents.map((agent) => agent.id));
  const skillIds = new Set(company.skills.map((skill) => skill.id));
  for (const agent of company.agents) {
    if (!agent.instructions.trim()) issues.push({ level: "error", message: `${agent.title} has no instructions`, target: { kind: "agent", id: agent.id } });
    if (!agent.nonGoals.length && !agent.guardrails.length) issues.push({ level: "warning", message: `${agent.title} has no boundaries`, target: { kind: "agent", id: agent.id } });
    for (const id of agent.skillIds) if (!skillIds.has(id)) issues.push({ level: "error", message: `${agent.title} references missing skill ${id}`, target: { kind: "agent", id: agent.id } });
  }
  for (const team of company.teams) {
    if (!agentIds.has(team.leadAgentId)) issues.push({ level: "error", message: `${team.name} has no valid supervisor`, target: { kind: "team", id: team.id } });
    if (!team.memberAgentIds.length) issues.push({ level: "warning", message: `${team.name} has no specialists`, target: { kind: "team", id: team.id } });
    for (const id of team.memberAgentIds) if (!agentIds.has(id)) issues.push({ level: "error", message: `${team.name} references a removed agent`, target: { kind: "team", id: team.id } });
  }
  return issues;
}
