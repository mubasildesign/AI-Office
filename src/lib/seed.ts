import foundersAssociate from "../../catalog/agents/founders-associate.json";
import fullStackDeveloper from "../../catalog/agents/full-stack-developer.json";
import growthMarketer from "../../catalog/agents/growth-marketer.json";
import operationsManager from "../../catalog/agents/operations-manager.json";
import productManager from "../../catalog/agents/product-manager.json";
import productDesigner from "../../catalog/agents/product-visual-designer.json";
import { deriveAppearance } from "./appearance";
import { deskSeatsByZone } from "./office-layout";
import type { AgentSpec, CompanySpec, DepartmentId, SkillSpec, TeamSpec, ToolProfile } from "./studio-types";

export const departmentColors: Record<DepartmentId, string> = {
  executive: "#3f4856",
  product: "#b7598d",
  engineering: "#198a86",
  revenue: "#d9772c",
  operations: "#587044",
};

export const departmentNames: Record<DepartmentId, string> = {
  executive: "Leadership",
  product: "Product",
  engineering: "Engineering",
  revenue: "Go to market",
  operations: "People + Ops",
};

interface LegacyAgent {
  roleCharter: string;
  outcomes: string[];
  nonGoals: string[];
  skills: Array<{ id: string; name: string; description: string; trigger: string; inputs: string[]; workflow: string[]; outputs: string[]; boundaries: string[] }>;
}

const legacy: Record<string, LegacyAgent> = {
  "chief-of-staff": foundersAssociate,
  "tech-lead": fullStackDeveloper,
  "growth-lead": growthMarketer,
  "operations-manager": operationsManager,
  "product-manager": productManager,
  "product-designer": productDesigner,
};

const migratedSkills: SkillSpec[] = Object.values(legacy).flatMap((agent) => agent.skills.map(({ id, name, description, trigger, inputs, workflow, outputs, boundaries }) => ({ id, name, description, trigger, inputs, workflow, outputs, boundaries })));

const generalSkills: Array<[string, string, string]> = [
  ["decision-memo", "Decision Memo", "Turn ambiguity into a concise decision memo with options, tradeoffs, and a recommendation."],
  ["operating-review", "Operating Review", "Run a cross-functional operating review against goals, metrics, and risks."],
  ["financial-model-review", "Financial Model Review", "Review internal budgets, runway scenarios, and spend requests for operational planning."],
  ["research-synthesis", "Research Synthesis", "Synthesize interviews and usage evidence into product opportunities."],
  ["pipeline-review", "Pipeline Review", "Review sales pipeline health, deal risks, and next actions."],
  ["customer-health-plan", "Customer Health Plan", "Create an account plan with health signals, risks, and expansion moves."],
  ["hiring-plan", "Hiring Plan", "Shape role scorecards, interview loops, and onboarding plans."],
  ["capacity-review", "Capacity Review", "Review workload, ownership, and operational risk across the team."],
];

export const seedSkills: SkillSpec[] = [
  ...migratedSkills,
  ...generalSkills.map(([id, name, description]) => ({
    id,
    name,
    description,
    trigger: `Use when the work needs: ${description.charAt(0).toLowerCase()}${description.slice(1)}`,
    inputs: ["Objective", "Available context", "Constraints"],
    workflow: ["Clarify the decision or outcome", "Inspect supplied evidence", "Develop options and tradeoffs", "Recommend and define named next actions"],
    outputs: ["Structured working document", "Risks and assumptions", "Named next actions"],
    boundaries: ["Do not invent evidence", "Ask before consequential external actions", "Mark uncertainty explicitly"],
  })),
];

type Role = [id: string, name: string, department: DepartmentId, title: string, objective: string, skills: string[], tools: string[]];

const roles: Role[] = [
  ["ceo", "Maya Chen", "executive", "CEO", "Set company direction, make the final call on cross-functional tradeoffs, and keep leadership aligned on a few outcomes.", ["decision-memo", "operating-review", "strategic-research"], ["drive"]],
  ["coo", "Noah Williams", "executive", "COO", "Turn strategy into an operating cadence with owners, metrics, and visible risks.", ["operating-review", "initiative-tracker", "process-mapping"], ["drive"]],
  ["cfo", "Aarav Mehta", "executive", "CFO", "Support internal budgeting, runway planning, and spend review for operating decisions.", ["financial-model-review", "decision-memo"], ["drive"]],
  ["cpo", "Sofia Rossi", "executive", "CPO", "Own the product strategy and make sure the roadmap ladders up to customer and business outcomes.", ["roadmap-planning", "prioritization", "decision-memo"], ["drive", "figma"]],
  ["cto", "Ethan Park", "executive", "CTO", "Own technical strategy, architecture risk, and engineering delivery health.", ["technical-planning", "code-review", "decision-memo"], ["github"]],
  ["cmo", "Amara Okafor", "executive", "CMO", "Own positioning, demand generation, and brand consistency across channels.", ["positioning", "campaign-planning", "decision-memo"], ["drive"]],
  ["chief-of-staff", "Leah Cohen", "executive", "Chief of Staff", "", ["decision-brief", "meeting-synthesis", "initiative-tracker", "executive-communication"], ["drive"]],
  ["product-manager", "Ishan Rao", "product", "Product Manager", "", ["discovery-framing", "prd-authoring", "prioritization", "release-brief"], ["drive", "github"]],
  ["product-designer", "Mila Novak", "product", "Product Designer", "", ["user-flow-planning", "visual-direction", "interface-critique", "developer-handoff"], ["figma"]],
  ["ux-researcher", "Nora Al-Sayed", "product", "UX Researcher", "Plan and synthesize research so product decisions rest on observed customer evidence.", ["research-synthesis", "discovery-framing"], ["drive"]],
  ["tech-lead", "Lucas Martin", "engineering", "Tech Lead", "", ["technical-planning", "code-review", "systematic-debugging"], ["github"]],
  ["frontend-engineer", "Zoe Kim", "engineering", "Frontend Engineer", "Build accessible, performant interfaces that match the agreed design and acceptance criteria.", ["implementation", "systematic-debugging", "design-system-application"], ["github", "figma"]],
  ["backend-engineer", "Mateo Silva", "engineering", "Backend Engineer", "Build reliable services, data models, and integrations with clear failure handling.", ["implementation", "systematic-debugging"], ["github"]],
  ["qa-engineer", "Priya Nair", "engineering", "QA Engineer", "Design risk-based test plans and report release readiness with evidence.", ["test-design", "code-review"], ["github"]],
  ["growth-lead", "Owen Brooks", "revenue", "Growth Lead", "", ["experiment-design", "campaign-planning", "seo-planning", "content-brief"], ["drive"]],
  ["sales-lead", "Elena Garcia", "revenue", "Sales Lead", "Run a disciplined pipeline and turn qualified conversations into revenue.", ["pipeline-review", "positioning"], ["drive"]],
  ["customer-success", "Sam Taylor", "revenue", "Customer Success Lead", "Keep customers healthy, onboarded, and expanding with proactive account plans.", ["customer-health-plan", "meeting-synthesis"], ["drive"]],
  ["people-lead", "Anika Bose", "operations", "People Lead", "Design hiring, onboarding, and team rituals that help people do their best work.", ["hiring-plan", "sop-creation"], ["drive"]],
  ["operations-manager", "Henry Wilson", "operations", "Operations Manager", "", ["sop-creation", "process-mapping", "project-reporting", "vendor-evaluation"], ["drive"]],
];

const regulatedRoles: Record<string, string> = {
  cfo: "Supports internal operating workflows only. Does not provide licensed financial, tax, audit, legal, or investment advice.",
  "people-lead": "Supports internal people operations only. Does not provide licensed legal or employment advice.",
};

export function buildAgent(role: Role, index: number, seat: string): AgentSpec {
  const [id, name, department, title, objective, skillIds, toolIds] = role;
  const source = legacy[id];
  return {
    id,
    name,
    title,
    department,
    accent: departmentColors[department],
    initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2),
    appearance: deriveAppearance(id, index),
    objective: objective || (source ? `${source.roleCharter.split(". ")[0].replace(/\.$/, "")}.` : `Own the ${title} function.`),
    instructions: `Act as the company's ${title}. ${source?.roleCharter ?? ""} Start by confirming the objective, evidence, constraints, and decision owner. Work transparently, cite supplied material, expose assumptions, and finish with an artifact and named next actions.`.replace(/\s+/g, " ").trim(),
    responsibilities: source?.outcomes ?? [`Own ${title.toLowerCase()} decisions`, "Coordinate dependencies", "Produce reviewable artifacts"],
    nonGoals: [...(source?.nonGoals ?? ["Making irreversible external changes without approval", "Presenting guesses as facts"]), ...(regulatedRoles[id] ? [regulatedRoles[id]] : [])],
    skillIds,
    toolIds,
    memory: { working: true, project: true, retentionDays: 30, redactSecrets: true },
    model: department === "product" ? { provider: "anthropic", model: "claude-sonnet-4-5", temperature: 0.3, maxTokens: 12000 } : { provider: "openai", model: "gpt-5.2", temperature: 0.2, maxTokens: 12000 },
    guardrails: ["Require approval before external writes", "Never store or echo credentials", "Surface conflicting instructions"],
    evaluations: ["Produces a useful artifact from incomplete context", "Refuses requests outside declared authority"],
    state: "idle",
    seat,
  };
}

const seatCursor: Record<DepartmentId, number> = { executive: 0, product: 0, engineering: 0, revenue: 0, operations: 0 };
const agents: AgentSpec[] = roles.map((role, index) => {
  const department = role[2];
  const seat = deskSeatsByZone[department][seatCursor[department]++].id;
  return buildAgent(role, index, seat);
});

export const roleRank = roles.map((role) => role[0]);

const tools: ToolProfile[] = [
  { id: "github", name: "GitHub", transport: "mcp", command: "npx -y @modelcontextprotocol/server-github", capabilities: ["repositories", "issues", "pull requests"], approval: "writes", enabled: true },
  { id: "figma", name: "Figma", transport: "mcp", url: "https://mcp.figma.com/mcp", capabilities: ["files", "design context", "comments"], approval: "writes", enabled: true },
  { id: "drive", name: "Google Drive", transport: "mcp", capabilities: ["search", "read documents", "write documents"], approval: "writes", enabled: false },
];

export function newTeam(partial: Partial<TeamSpec> & Pick<TeamSpec, "id" | "name" | "leadAgentId" | "memberAgentIds">): TeamSpec {
  return {
    description: "A supervisor-led team that plans, delegates, and synthesizes one accountable result.",
    routing: "supervisor",
    routingRules: ["Supervisor plans and delegates by role", "Specialists receive only the context they need", "Supervisor resolves conflicts and synthesizes"],
    sharedContext: ["Mission brief", "Company context"],
    approvalPolicy: { requiredFor: ["external writes", "spend"], approvers: ["user"], timeoutMinutes: 60 },
    budget: { maxTokens: 120000 },
    outputContract: "One synthesized artifact with recommendation, risks, owners, and next actions.",
    ...partial,
  };
}

const teams: TeamSpec[] = [
  newTeam({
    id: "leadership-council",
    name: "Leadership Council",
    description: "Turns company-level ambiguity into an aligned operating decision.",
    leadAgentId: "ceo",
    memberAgentIds: ["coo", "cfo", "cpo", "cto", "cmo", "chief-of-staff"],
    sharedContext: ["Company strategy", "Operating metrics", "Active constraints"],
    approvalPolicy: { requiredFor: ["external writes", "spend", "deployment"], approvers: ["user"], timeoutMinutes: 60 },
    outputContract: "One decision memo with recommendation, dissent, risks, owner, and next review date.",
  }),
  newTeam({
    id: "product-launch-pod",
    name: "Product Launch Pod",
    description: "Plans, builds, validates, and launches a product increment.",
    leadAgentId: "product-manager",
    memberAgentIds: ["product-designer", "ux-researcher", "tech-lead", "frontend-engineer", "backend-engineer", "qa-engineer", "growth-lead"],
    sharedContext: ["Product brief", "Research evidence", "Repository context"],
    approvalPolicy: { requiredFor: ["production deployment", "customer messaging"], approvers: ["user"], timeoutMinutes: 60 },
    budget: { maxTokens: 200000 },
    outputContract: "A launch packet containing scope, evidence, implementation, QA, rollout, and measurement plan.",
  }),
];

const deployments: CompanySpec["deployments"] = [
  { id: "codex-project", target: "codex", scope: "project", includeTools: true, includeEvaluations: true },
  { id: "claude-project", target: "claude", scope: "project", includeTools: true, includeEvaluations: true },
  { id: "docker-runner", target: "docker", scope: "container", includeTools: true, includeEvaluations: false },
];

export const seedCompany: CompanySpec = {
  schemaVersion: "1.1",
  id: "northstar-studio",
  name: "Northstar Studio",
  description: "A complete startup operating team, built from portable specialist agents.",
  version: "1.0.0",
  agents,
  skills: seedSkills,
  teams,
  tools,
  missions: [],
  deployments,
  updatedAt: new Date().toISOString(),
};

export function startupCompany(name?: string): CompanySpec {
  const company = structuredClone(seedCompany);
  if (name?.trim()) {
    company.name = name.trim();
    company.id = slug(name) || company.id;
  }
  company.updatedAt = new Date().toISOString();
  return company;
}

export function blankCompany(name: string): CompanySpec {
  return {
    schemaVersion: "1.1",
    id: slug(name) || "my-company",
    name: name.trim() || "My company",
    description: "A new local-first AI company.",
    version: "0.1.0",
    agents: [],
    skills: structuredClone(seedSkills),
    teams: [],
    tools: structuredClone(tools),
    missions: [],
    deployments: structuredClone(deployments),
    updatedAt: new Date().toISOString(),
  };
}

export function blankAgent(company: CompanySpec, department: DepartmentId, seat: string): AgentSpec {
  let index = company.agents.length + 1;
  while (company.agents.some((agent) => agent.id === `agent-${index}`)) index += 1;
  const agent = buildAgent([`agent-${index}`, `New Agent ${index}`, department, "Specialist", "Describe the outcome this agent owns.", [], []], index + 3, seat);
  return agent;
}

export function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
