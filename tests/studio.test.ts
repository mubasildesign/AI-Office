import test from "node:test";
import assert from "node:assert/strict";
import { blankCompany, seedCompany, startupCompany } from "../src/lib/seed";
import { companySchema, migrateCompany, validateCompany } from "../src/lib/schema";
import { allDeskSeats, blockers, findPath, meetingSeats, walkable } from "../src/lib/office-layout";
import { buildPackage, compatibility, importPackage, readPackage } from "../src/lib/exporter";
import { initialStudioState, reducer, type StudioState } from "../src/lib/studio-store";
import { statesAt } from "../src/lib/trace-replay";
import type { TraceEvent } from "../src/lib/studio-types";

const roles = ["CEO", "COO", "CFO", "CPO", "CTO", "CMO", "Chief of Staff", "Product Manager", "Product Designer", "UX Researcher", "Tech Lead", "Frontend Engineer", "Backend Engineer", "QA Engineer", "Growth Lead", "Sales Lead", "Customer Success Lead", "People Lead", "Operations Manager"];

function ready(company = startupCompany()): StudioState {
  return reducer(initialStudioState, { type: "company.create", company });
}

test("startup template has 19 valid agents with unique desks and migrated catalog content", () => {
  const company = startupCompany();
  assert.deepEqual(company.agents.map((agent) => agent.title), roles);
  assert.equal(new Set(company.agents.map((agent) => agent.seat)).size, 19);
  assert.ok(companySchema.safeParse(company).success);
  assert.deepEqual(validateCompany(company).filter((issue) => issue.level === "error"), []);
  const pm = company.agents.find((agent) => agent.id === "product-manager")!;
  assert.ok(pm.skillIds.includes("prd-authoring"));
  assert.ok(company.skills.some((skill) => skill.id === "prd-authoring" && skill.workflow.length > 2));
  assert.ok(company.agents.find((agent) => agent.id === "cfo")!.nonGoals.some((item) => item.includes("licensed financial")));
});

test("blank company starts empty but keeps the skill library", () => {
  const company = blankCompany("Acme Labs");
  assert.equal(company.id, "acme-labs");
  assert.equal(company.agents.length, 0);
  assert.ok(company.skills.length > 10);
});

test("migration upgrades a v1.0 company with percentage positions and no appearance", () => {
  const legacy = structuredClone(seedCompany) as unknown as Record<string, unknown>;
  legacy.schemaVersion = "1.0";
  legacy.agents = seedCompany.agents.map((agent, index) => {
    const old: Record<string, unknown> = { ...agent, position: { x: 10 + index, y: 20 }, state: "working" };
    delete old.seat;
    delete old.appearance;
    return old;
  });
  legacy.teams = seedCompany.teams.map((team) => {
    const old: Record<string, unknown> = { ...team };
    delete old.routingRules;
    delete old.budget;
    return old;
  });
  const migrated = migrateCompany(legacy);
  assert.equal(migrated.schemaVersion, "1.1");
  assert.equal(new Set(migrated.agents.map((agent) => agent.seat)).size, migrated.agents.length);
  assert.ok(migrated.agents.every((agent) => agent.state === "idle" && agent.appearance.shape));
  assert.ok(migrated.teams.every((team) => team.routingRules.length && team.budget.maxTokens > 0));
  assert.throws(() => migrateCompany({ name: "" }));
});

test("every desk and team room seat is reachable on the office floor", () => {
  const grid = walkable();
  const start = { tx: 20, ty: 12 };
  for (const seat of [...allDeskSeats, ...meetingSeats]) {
    assert.ok(grid[seat.ty][seat.tx], `${seat.id} sits on a blocked tile`);
    const path = findPath(start, seat);
    const last = path.at(-1)!;
    assert.deepEqual([last.tx, last.ty], [seat.tx, seat.ty], `${seat.id} is unreachable`);
    for (const step of path) assert.ok(grid[step.ty][step.tx], `${seat.id} path crosses furniture at ${step.tx},${step.ty}`);
  }
  assert.ok(blockers.length > 10);
});

test("AgentPack round trips company, team, and single-agent scopes without data loss", async () => {
  const company = startupCompany();
  const whole = await buildPackage(company, "agentpack");
  const restored = await importPackage(await whole.zip.generateAsync({ type: "uint8array" }), null);
  assert.equal(restored.mode, "replace");
  assert.deepEqual(restored.company, migrateCompany(company));

  const team = await buildPackage(company, "agentpack", { kind: "team", id: "leadership-council" });
  const teamPack = await readPackage(await team.zip.generateAsync({ type: "uint8array" }));
  assert.equal(teamPack.company.agents.length, 7);
  assert.equal(teamPack.company.teams[0].leadAgentId, "ceo");

  const target = blankCompany("Acme");
  const merged = await importPackage(await team.zip.generateAsync({ type: "uint8array" }), target);
  assert.equal(merged.mode, "merge");
  assert.equal(merged.company.agents.length, 7);
  assert.equal(merged.company.teams.length, 1);

  const single = await buildPackage(company, "agentpack", { kind: "agent", id: "ceo" });
  const again = await importPackage(await single.zip.generateAsync({ type: "uint8array" }), merged.company);
  assert.ok(again.company.agents.some((agent) => agent.id === "ceo-2"), "duplicate agent ids are renamed on merge");
  assert.equal(new Set(again.company.agents.map((agent) => agent.seat)).size, again.company.agents.length);
});

test("adapters generate native files and never include secrets", async () => {
  const company = startupCompany();
  const codex = await buildPackage(company, "codex");
  const config = await codex.zip.file(".codex/config.toml")!.async("string");
  assert.match(config, /multi_agent = true/);
  assert.match(config, /\[agents\.ceo\]\ndescription = "CEO: /);
  assert.match(config, /\[mcp_servers\.github\]\ncommand = "npx"/);
  const ceo = await codex.zip.file(".codex/agents/ceo.toml")!.async("string");
  assert.match(ceo, /developer_instructions = """/);
  assert.match(ceo, /Supervising Leadership Council/);
  assert.ok(codex.zip.file(".agents/skills/prd-authoring/SKILL.md"));

  const claude = await buildPackage(company, "claude");
  const designer = await claude.zip.file("agents/product-designer.md")!.async("string");
  assert.match(designer, /^---\nname: product-designer\n/);
  assert.match(designer, /model: sonnet/);
  assert.ok(claude.zip.file(".claude-plugin/plugin.json"));
  assert.ok(JSON.parse(await claude.zip.file(".mcp.json")!.async("string")).mcpServers.github);

  const docker = await buildPackage(company, "docker");
  assert.ok(docker.zip.file("Dockerfile") && docker.zip.file("docker-compose.yml") && docker.zip.file("runner.config.json"));

  for (const pack of [codex, claude, docker]) {
    for (const file of Object.values(pack.zip.files)) {
      if (file.dir) continue;
      const text = await file.async("string");
      assert.doesNotMatch(text, /sk-[A-Za-z0-9]{10,}|ANTHROPIC_API_KEY=[^$\s]/, `${file.name} contains a secret-looking value`);
    }
  }
});

test("compatibility reports never silently flatten teams, approvals, or memory", () => {
  const company = startupCompany();
  assert.deepEqual(compatibility(company, "agentpack").degraded, []);
  for (const target of ["codex", "claude"] as const) {
    const report = compatibility(company, target);
    assert.ok(report.degraded.some((item) => item.includes("Supervisor teams")));
    assert.ok(report.degraded.some((item) => item.includes("Approval")));
    assert.ok(report.degraded.some((item) => item.includes("Memory")));
  }
  assert.ok(compatibility(company, "claude").degraded.some((item) => item.includes("OpenAI")));
  assert.ok(compatibility(company, "docker").supported.some((item) => item.includes("Supervisor teams")));
  const solo = blankCompany("Solo");
  assert.ok(!compatibility(solo, "codex").degraded.some((item) => item.includes("Supervisor teams")));
});

test("undo and redo restore edits, and transient runner state stays out of history", () => {
  let state = ready();
  state = reducer(state, { type: "agent.update", id: "ceo", patch: { name: "Ada Lovelace" } });
  state = reducer(state, { type: "agent.seat", id: "ceo", seat: "engineering:5", department: "engineering" });
  assert.equal(state.company.agents[0].department, "engineering");
  const historyLength = state.past.length;
  state = reducer(state, { type: "trace.add", event: { id: "1", missionId: "m", timestamp: "", type: "agent.started", agentId: "cto", message: "" } });
  assert.equal(state.past.length, historyLength);
  assert.equal(state.company.agents.find((agent) => agent.id === "cto")!.state, "working");
  state = reducer(state, { type: "undo" });
  assert.equal(state.company.agents[0].department, "executive");
  assert.equal(state.company.agents[0].name, "Ada Lovelace");
  state = reducer(state, { type: "undo" });
  assert.equal(state.company.agents[0].name, "Maya Chen");
  state = reducer(state, { type: "redo" });
  assert.equal(state.company.agents[0].name, "Ada Lovelace");
});

test("office and operations share one state: seats, teams, and missions", () => {
  let state = ready();
  state = reducer(state, { type: "meeting.set", ids: ["ceo", "cto", "cfo"] });
  assert.deepEqual(state.meeting, ["ceo", "cto", "cfo"]);
  state = reducer(state, { type: "team.add", team: { ...state.company.teams[0], id: "ceo-team", name: "CEO team", memberAgentIds: ["cto", "cfo"] } });
  assert.ok(state.company.teams.some((team) => team.id === "ceo-team" && team.leadAgentId === "ceo"));
  state = reducer(state, { type: "agent.remove", id: "cfo" });
  assert.deepEqual(state.company.teams.find((team) => team.id === "ceo-team")!.memberAgentIds, ["cto"]);
  assert.deepEqual(state.meeting, ["ceo", "cto"]);
});

test("trace events drive mission and agent state, and replay matches", () => {
  const events: TraceEvent[] = [
    { id: "1", missionId: "m1", timestamp: "", type: "mission.started", message: "" },
    { id: "2", missionId: "m1", timestamp: "", type: "agent.started", agentId: "ceo", message: "" },
    { id: "3", missionId: "m1", timestamp: "", type: "agent.handoff", agentId: "ceo", message: "", payload: { from: "ceo", to: "cto" } },
    { id: "4", missionId: "m1", timestamp: "", type: "agent.completed", agentId: "cto", message: "" },
    { id: "5", missionId: "m1", timestamp: "", type: "mission.completed", agentId: "ceo", message: "" },
  ];
  assert.deepEqual(statesAt(events, 2), { ceo: "waiting", cto: "working" });
  let state = ready();
  const now = new Date().toISOString();
  state = reducer(state, { type: "mission.add", mission: { id: "m1", title: "Plan", objective: "Plan", assigneeType: "team", assigneeId: "leadership-council", context: "", artifacts: [], budget: { maxTokens: 1000 }, status: "draft", createdAt: now, updatedAt: now } });
  for (const event of events.slice(0, 3)) state = reducer(state, { type: "trace.add", event });
  assert.equal(state.company.missions[0].status, "running");
  assert.equal(state.company.agents.find((agent) => agent.id === "cto")!.state, "working");
  for (const event of events.slice(3)) state = reducer(state, { type: "trace.add", event });
  assert.equal(state.company.missions[0].status, "completed");
  assert.ok(state.company.agents.every((agent) => agent.state === "idle"));
});
