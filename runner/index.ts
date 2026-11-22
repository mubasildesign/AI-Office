import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { WebSocketServer, type WebSocket } from "ws";
import type { AgentSpec, CompanySpec, MissionSpec, TraceEvent } from "../src/lib/studio-types";

const PORT = Number(process.env.AI_OFFICE_RUNNER_PORT ?? 4317);
const HOST = process.env.AI_OFFICE_RUNNER_HOST ?? "127.0.0.1";
const ALLOWED_ORIGINS = new Set((process.env.AI_OFFICE_ALLOWED_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000").split(","));
const pairingCode = String(randomInt(100000, 999999));
const sessions = new Map<string, number>();
const sockets = new Set<WebSocket>();
const cancelled = new Set<string>();
let currentRequestOrigin = "";

function cors(response: ServerResponse) {
  if (ALLOWED_ORIGINS.has(currentRequestOrigin)) response.setHeader("Access-Control-Allow-Origin", currentRequestOrigin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function json(response: ServerResponse, status: number, value: unknown) {
  cors(response); response.statusCode = status; response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(value));
}

async function body(request: IncomingMessage) {
  let value = "";
  for await (const chunk of request) value += chunk;
  return value ? JSON.parse(value) : {};
}

function bearer(request: IncomingMessage) { return request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? ""; }
function authorized(request: IncomingMessage) { const token = bearer(request); return Boolean(token && (sessions.get(token) ?? 0) > Date.now()); }

function emit(event: Omit<TraceEvent, "id" | "timestamp">) {
  const full: TraceEvent = { id: randomUUID(), timestamp: new Date().toISOString(), ...event };
  const payload = JSON.stringify(full);
  sockets.forEach((socket) => { if (socket.readyState === socket.OPEN) socket.send(payload); });
  return full;
}

function systemPrompt(agent: AgentSpec, company: CompanySpec) {
  const skills = company.skills.filter((skill) => agent.skillIds.includes(skill.id));
  return `${agent.instructions}\n\nResponsibilities:\n- ${agent.responsibilities.join("\n- ")}\n\nBoundaries:\n- ${[...agent.nonGoals, ...agent.guardrails].join("\n- ")}\n\nAvailable workflows:\n${skills.map((skill) => `## ${skill.name}\n${skill.description}\nSteps: ${skill.workflow.join("; ")}`).join("\n\n")}\n\nYou are working inside ${company.name}. Never claim to have used a tool unless the runtime supplies a tool result.`;
}

async function runAgent(agent: AgentSpec, company: CompanySpec, input: string): Promise<{ text: string; tokens: number }> {
  if (agent.model.provider === "openai") {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured in the runner environment");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await client.responses.create({ model: agent.model.model, instructions: systemPrompt(agent, company), input, max_output_tokens: agent.model.maxTokens });
    return { text: result.output_text, tokens: result.usage?.total_tokens ?? 0 };
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured in the runner environment");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const result = await client.messages.create({ model: agent.model.model, system: systemPrompt(agent, company), max_tokens: Math.min(agent.model.maxTokens, 16000), messages: [{ role: "user", content: input }] });
  return { text: result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n"), tokens: (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0) };
}

class MissionCancelled extends Error {}

async function execute(company: CompanySpec, mission: MissionSpec) {
  try {
    emit({ missionId: mission.id, type: "mission.started", message: `Mission started: ${mission.title}` });
    const team = mission.assigneeType === "team" ? company.teams.find((item) => item.id === mission.assigneeId) : null;
    const lead = team ? company.agents.find((item) => item.id === team.leadAgentId) : company.agents.find((item) => item.id === mission.assigneeId);
    if (!lead) throw new Error("Mission lead not found");
    emit({ missionId: mission.id, type: "agent.started", agentId: lead.id, message: `${lead.title} is planning the work` });
    const brief = `Mission: ${mission.title}\nObjective: ${mission.objective}\nContext: ${mission.context || "No extra context"}\nRequested artifacts: ${mission.artifacts.join(", ") || "A useful final artifact"}`;
    let used = 0;
    const budget = team?.budget.maxTokens ?? mission.budget.maxTokens;
    const checkpoint = () => {
      if (cancelled.has(mission.id)) throw new MissionCancelled("Mission cancelled");
      if (used > budget) throw new Error(`Token budget of ${budget.toLocaleString()} exceeded`);
    };
    const plan = await runAgent(lead, company, `${brief}\n\nCreate a concise delegation plan. Name which specialists are needed and what each should return. Do not perform their work yet.`);
    used += plan.tokens;
    emit({ missionId: mission.id, type: "agent.message", agentId: lead.id, message: "Delegation plan created", payload: { content: plan.text, tokens: plan.tokens } });
    checkpoint();

    const members = team ? team.memberAgentIds.map((id) => company.agents.find((agent) => agent.id === id)).filter(Boolean) as AgentSpec[] : [];
    const selectedMembers = members.slice(0, 5);
    const sharedContext = team?.sharedContext.length ? `\n\nShared team context: ${team.sharedContext.join("; ")}` : "";
    const outputs: Array<{ agent: AgentSpec; content: string }> = [];
    for (const member of selectedMembers) {
      checkpoint();
      emit({ missionId: mission.id, type: "agent.handoff", agentId: lead.id, message: `${lead.title} delegated to ${member.title}`, payload: { from: lead.id, to: member.id } });
      emit({ missionId: mission.id, type: "agent.started", agentId: member.id, message: `${member.title} received a delegated task` });
      const result = await runAgent(member, company, `Mission: ${mission.title}\nObjective: ${mission.objective}${sharedContext}\n\nSupervisor plan:\n${plan.text}\n\nComplete only the part that belongs to your role. Return evidence, assumptions, risks, and a concrete contribution for the final artifact.`);
      used += result.tokens;
      outputs.push({ agent: member, content: result.text });
      emit({ missionId: mission.id, type: "agent.completed", agentId: member.id, message: `${member.title} completed their contribution`, payload: { content: result.text, tokens: result.tokens } });
    }
    checkpoint();

    const synthesis = await runAgent(lead, company, `${brief}\n\nOriginal plan:\n${plan.text}\n\nSpecialist contributions:\n${outputs.map(({ agent, content }) => `## ${agent.title}\n${content}`).join("\n\n")}\n\nSynthesize the final deliverable. Resolve contradictions, retain uncertainty, and end with named next actions.`);
    used += synthesis.tokens;
    emit({ missionId: mission.id, type: "artifact.created", agentId: lead.id, message: "Final mission artifact created", payload: { name: `${mission.title}.md`, mimeType: "text/markdown", content: synthesis.text, tokens: synthesis.tokens } });
    emit({ missionId: mission.id, type: "mission.completed", agentId: lead.id, message: `Mission completed using ${used.toLocaleString()} tokens`, payload: { tokens: used } });
  } catch (error) {
    if (error instanceof MissionCancelled) emit({ missionId: mission.id, type: "mission.cancelled", message: "Mission cancelled" });
    else emit({ missionId: mission.id, type: "mission.failed", message: error instanceof Error ? error.message : "Mission failed" });
  } finally {
    cancelled.delete(mission.id);
  }
}

const server = createServer(async (request, response) => {
  currentRequestOrigin = request.headers.origin ?? "";
  cors(response);
  if (request.method === "OPTIONS") { response.statusCode = 204; response.end(); return; }
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  if (request.method === "GET" && url.pathname === "/v1/health") {
    json(response, 200, { ok: true, version: "1.1.0", paired: authorized(request), providers: { openai: Boolean(process.env.OPENAI_API_KEY), anthropic: Boolean(process.env.ANTHROPIC_API_KEY) } }); return;
  }
  if (request.method === "POST" && url.pathname === "/v1/pair") {
    const value = await body(request);
    if (String(value.code) !== pairingCode) { json(response, 401, { error: "Invalid pairing code" }); return; }
    const token = randomBytes(24).toString("base64url"); sessions.set(token, Date.now() + 8 * 60 * 60 * 1000); json(response, 200, { token, expiresIn: 28800 }); return;
  }
  if (!authorized(request)) { json(response, 401, { error: "Pair with the local runner first" }); return; }
  if (request.method === "GET" && url.pathname === "/v1/capabilities") {
    json(response, 200, { providers: [process.env.OPENAI_API_KEY && "openai", process.env.ANTHROPIC_API_KEY && "anthropic"].filter(Boolean), transports: ["mcp-stdio", "mcp-http"], approvals: true, traces: true }); return;
  }
  if (request.method === "POST" && url.pathname === "/v1/validate") {
    const { company } = await body(request) as { company: CompanySpec };
    const errors = company.agents.flatMap((agent) => [!agent.instructions && `${agent.title} has no instructions`, !agent.nonGoals.length && `${agent.title} has no boundaries`].filter(Boolean));
    json(response, errors.length ? 422 : 200, { ok: !errors.length, errors }); return;
  }
  if (request.method === "POST" && url.pathname === "/v1/missions") {
    const { company, mission } = await body(request) as { company: CompanySpec; mission: MissionSpec };
    const missionTeam = company.teams.find((team) => team.id === mission.assigneeId);
    const participants = missionTeam ? [missionTeam.leadAgentId, ...missionTeam.memberAgentIds.slice(0, 5)] : [mission.assigneeId];
    const requiredProviders = new Set(company.agents.filter((agent) => participants.includes(agent.id)).map((agent) => agent.model.provider));
    if (requiredProviders.has("openai") && !process.env.OPENAI_API_KEY || requiredProviders.has("anthropic") && !process.env.ANTHROPIC_API_KEY) { json(response, 422, { error: "Configure the required provider API keys in the runner environment" }); return; }
    void execute(company, mission); json(response, 202, { accepted: true, missionId: mission.id }); return;
  }
  const action = url.pathname.match(/^\/v1\/missions\/([^/]+)\/(approve|reject|cancel)$/);
  if (request.method === "POST" && action) {
    if (action[2] === "cancel" || action[2] === "reject") cancelled.add(action[1]);
    json(response, 200, { ok: true, missionId: action[1], action: action[2] }); return;
  }
  json(response, 404, { error: "Not found" });
});

const ws = new WebSocketServer({ noServer: true });
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const token = url.searchParams.get("token") ?? "";
  if (url.pathname !== "/v1/events" || (sessions.get(token) ?? 0) <= Date.now()) { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); return; }
  ws.handleUpgrade(request, socket, head, (client) => { sockets.add(client); client.on("close", () => sockets.delete(client)); });
});

server.listen(PORT, HOST, () => {
  console.log(`\nAI Office Runner 1.1.0`);
  console.log(`Listening at http://${HOST}:${PORT}`);
  console.log(`Pairing code: ${pairingCode}`);
  console.log(`Providers: OpenAI ${process.env.OPENAI_API_KEY ? "ready" : "missing"}, Anthropic ${process.env.ANTHROPIC_API_KEY ? "ready" : "missing"}\n`);
});
