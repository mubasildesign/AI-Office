export type DepartmentId = "executive" | "product" | "engineering" | "revenue" | "operations";
export type AgentState = "idle" | "working" | "waiting" | "review" | "blocked";
export type HostTarget = "agentpack" | "codex" | "claude" | "docker";
export type AvatarShape = "square" | "octagon" | "flower" | "gear" | "diamond" | "cloud" | "drop" | "heart" | "star" | "circle" | "triangle" | "bean";
export type AvatarEyes = "pills" | "dots" | "happy" | "sleepy" | "wink";
export type HairStyle = "short" | "long" | "bun" | "curly" | "buzz" | "bob";

export interface AgentAppearance {
  shape: AvatarShape;
  color: string;
  eyes: AvatarEyes;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  pants: string;
}

export interface SkillSpec {
  id: string;
  name: string;
  description: string;
  trigger: string;
  inputs: string[];
  workflow: string[];
  outputs: string[];
  boundaries: string[];
}

export interface ToolProfile {
  id: string;
  name: string;
  transport: "mcp" | "native";
  command?: string;
  url?: string;
  capabilities: string[];
  approval: "always" | "writes" | "never";
  enabled: boolean;
}

export interface MemoryPolicy {
  working: boolean;
  project: boolean;
  retentionDays: number;
  redactSecrets: boolean;
}

export interface ModelPolicy {
  provider: "openai" | "anthropic";
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface ApprovalPolicy {
  requiredFor: string[];
  approvers: string[];
  timeoutMinutes: number;
}

export interface AgentSpec {
  id: string;
  name: string;
  title: string;
  department: DepartmentId;
  accent: string;
  initials: string;
  appearance: AgentAppearance;
  objective: string;
  instructions: string;
  responsibilities: string[];
  nonGoals: string[];
  skillIds: string[];
  toolIds: string[];
  memory: MemoryPolicy;
  model: ModelPolicy;
  guardrails: string[];
  evaluations: string[];
  state: AgentState;
  /** Desk identifier in the office floor plan, e.g. `engineering:2`. */
  seat: string;
}

export interface TeamSpec {
  id: string;
  name: string;
  description: string;
  leadAgentId: string;
  memberAgentIds: string[];
  routing: "supervisor";
  routingRules: string[];
  sharedContext: string[];
  approvalPolicy: ApprovalPolicy;
  budget: { maxTokens: number; maxCostUsd?: number };
  outputContract: string;
}

export interface MissionSpec {
  id: string;
  title: string;
  objective: string;
  assigneeType: "agent" | "team";
  assigneeId: string;
  context: string;
  artifacts: string[];
  budget: { maxTokens: number; maxCostUsd?: number };
  status: "draft" | "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface TraceEvent {
  id: string;
  missionId: string;
  timestamp: string;
  type: "mission.started" | "agent.started" | "agent.handoff" | "agent.message" | "tool.requested" | "approval.required" | "artifact.created" | "agent.completed" | "mission.completed" | "mission.failed" | "mission.cancelled";
  agentId?: string;
  message: string;
  payload?: Record<string, unknown>;
}

export interface Artifact {
  id: string;
  missionId: string;
  name: string;
  mimeType: string;
  content: string;
  createdBy: string;
}

export interface DeploymentProfile {
  id: string;
  target: HostTarget;
  scope: "user" | "project" | "container";
  includeTools: boolean;
  includeEvaluations: boolean;
}

export interface CompatibilityReport {
  target: HostTarget;
  supported: string[];
  degraded: string[];
  unsupported: string[];
}

export interface CompanySpec {
  schemaVersion: "1.1";
  id: string;
  name: string;
  description: string;
  version: string;
  agents: AgentSpec[];
  skills: SkillSpec[];
  teams: TeamSpec[];
  tools: ToolProfile[];
  missions: MissionSpec[];
  deployments: DeploymentProfile[];
  updatedAt: string;
}
