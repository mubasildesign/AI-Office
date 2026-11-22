"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Buildings, CheckCircle, MagnifyingGlass, Play, Plus, Users, WarningCircle } from "@phosphor-icons/react";
import { AgentAvatar } from "./agent-avatar";
import { Kpi, PageHeader, Tag, TabBar, ViewSwitch, missionTone, stateName, stateTone, type ViewMode } from "./ui";
import { useStudio } from "@/lib/studio-store";
import { departmentColors, departmentNames, newTeam } from "@/lib/seed";
import { departmentZones } from "@/lib/office-layout";
import { validateCompany } from "@/lib/schema";
import type { DepartmentId, MissionSpec } from "@/lib/studio-types";

interface Props { onNewMission: () => void; onAddAgent: () => void; onRunMission: (mission: MissionSpec) => void }

export function OperationsView({ onNewMission, onAddAgent, onRunMission }: Props) {
  const { state } = useStudio();
  if (state.section === "agents") return <AgentsTable onAddAgent={onAddAgent} />;
  if (state.section === "teams") return <Teams />;
  if (state.section === "missions") return <Missions onNewMission={onNewMission} onRunMission={onRunMission} />;
  return <Overview onNewMission={onNewMission} />;
}

function Overview({ onNewMission }: { onNewMission: () => void }) {
  const { state, dispatch } = useStudio();
  const { company } = state;
  const active = company.agents.filter((agent) => agent.state !== "idle").length;
  const errors = validateCompany(company).filter((issue) => issue.level === "error").length;
  const open = company.missions.filter((mission) => !["completed", "cancelled"].includes(mission.status)).length;
  const headcount = departmentZones.map((department) => ({ department, people: company.agents.filter((agent) => agent.department === department) }));
  const max = Math.max(1, ...headcount.map((item) => item.people.length));
  const readiness = [
    ["Every agent has boundaries", company.agents.every((agent) => agent.nonGoals.length || agent.guardrails.length)],
    ["Every team has a supervisor", company.teams.every((team) => company.agents.some((agent) => agent.id === team.leadAgentId))],
    ["Tool access is declared per agent", true],
    ["Provider keys stay in the runner", true],
  ] as const;

  return (
    <section className="operations-page">
      <PageHeader title="Overview">
        <button className="button" onClick={() => dispatch({ type: "view", view: "office" })}><Buildings /> Open office</button>
        <button className="button primary" onClick={onNewMission}><Plus /> New mission</button>
      </PageHeader>

      <div className="kpi-grid">
        <Kpi label="Agents" value={company.agents.length} tag={errors ? { tone: "critical", text: `${errors} invalid` } : { tone: "success", text: "All valid" }} onClick={() => dispatch({ type: "section", section: "agents" })}>
          <div className="breakdown" aria-hidden>{headcount.filter((item) => item.people.length).map((item) => <i key={item.department} style={{ flex: item.people.length, background: departmentColors[item.department] }} />)}</div>
        </Kpi>
        <Kpi label="Active now" value={active} tag={active ? { tone: "accent", text: "Live" } : undefined} />
        <Kpi label="Teams" value={company.teams.length} onClick={() => dispatch({ type: "section", section: "teams" })} />
        <Kpi label="Open missions" value={open} unit={`of ${company.missions.length}`} onClick={() => dispatch({ type: "section", section: "missions" })} />
      </div>

      <div className="dashboard-grid">
        <article className="panel">
          <header><h2>Departments</h2><button className="text-button" onClick={() => dispatch({ type: "section", section: "agents" })}>All agents <ArrowRight /></button></header>
          <div className="department-bars">
            {headcount.map(({ department, people }) => (
              <div key={department}>
                <span>{departmentNames[department]}</span>
                <div><i style={{ width: `${(people.length / max) * 100}%`, background: departmentColors[department] }} /></div>
                <span className="bar-avatars">{people.slice(0, 6).map((agent) => <AgentAvatar key={agent.id} appearance={agent.appearance} size={20} />)}</span>
                <b>{people.length}</b>
              </div>
            ))}
          </div>
        </article>
        <article className="panel readiness-card">
          <header><h2>Export readiness</h2><Tag tone={errors ? "critical" : "success"}>{errors ? "Needs fixes" : "Ready"}</Tag></header>
          <ul>
            {readiness.map(([label, ok]) => <li key={label}>{ok ? <CheckCircle className="ok" /> : <WarningCircle className="bad" />}{label}</li>)}
          </ul>
          <button className="text-button" onClick={() => dispatch({ type: "section", section: "deployments" })}>Compatibility reports <ArrowRight /></button>
        </article>
      </div>

      <article className="panel">
        <header><h2>Agents</h2></header>
        <div className="agent-grid">
          {company.agents.map((agent) => (
            <button key={agent.id} className="agent-card" onClick={() => dispatch({ type: "select", selection: { kind: "agent", id: agent.id } })}>
              <AgentAvatar appearance={agent.appearance} size={44} state={agent.state} />
              <span><b>{agent.title}</b><em>{agent.name}</em></span>
            </button>
          ))}
          {company.agents.length === 0 && <p className="panel-empty">No agents yet</p>}
        </div>
      </article>
    </section>
  );
}

function AgentsTable({ onAddAgent }: { onAddAgent: () => void }) {
  const { state, dispatch } = useStudio();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<DepartmentId | "all">("all");
  const [view, setView] = useState<ViewMode>("list");
  const { agents: all } = state.company;
  const tabs = [{ id: "all" as const, label: "All", count: all.length }, ...departmentZones.map((department) => ({ id: department, label: departmentNames[department], count: all.filter((agent) => agent.department === department).length }))];
  const agents = useMemo(() => all.filter((agent) => (tab === "all" || agent.department === tab) && `${agent.name} ${agent.title}`.toLowerCase().includes(query.toLowerCase())), [all, tab, query]);
  const select = (id: string) => dispatch({ type: "select", selection: { kind: "agent", id } });
  return (
    <section className="operations-page">
      <PageHeader title="Agents" count={all.length}><button className="button primary" onClick={onAddAgent}><Plus /> New agent</button></PageHeader>
      <div className="list-toolbar">
        <TabBar tabs={tabs} value={tab} onChange={setTab} label="Department" />
        <div className="toolbar-tools">
          <label className="search-field"><MagnifyingGlass /><input placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search agents" /></label>
          <ViewSwitch value={view} onChange={setView} />
        </div>
      </div>
      {view === "board" ? (
        <div className="board">
          {departmentZones.filter((department) => tab === "all" || tab === department).map((department) => {
            const people = agents.filter((agent) => agent.department === department);
            return (
              <section className="board-col" key={department}>
                <header><i style={{ background: departmentColors[department] }} /><h2>{departmentNames[department]}</h2><span className="count">{people.length}</span></header>
                <div className="board-cards">
                  {people.map((agent) => (
                    <button key={agent.id} className={`board-card ${state.selection?.id === agent.id ? "selected" : ""}`} onClick={() => select(agent.id)}>
                      <span className="board-person"><AgentAvatar appearance={agent.appearance} size={32} /><span><b>{agent.title}</b><em>{agent.name}</em></span></span>
                      <span className="board-meta"><Tag tone={stateTone[agent.state]}>{stateName[agent.state]}</Tag><span className="mono">{agent.model.model}</span></span>
                    </button>
                  ))}
                  {people.length === 0 && <p className="board-empty">No agents</p>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
      <div className="table-panel">
        <table>
          <thead><tr><th>Role</th><th>Department</th><th>Model</th><th>Skills</th><th>Tools</th><th>State</th></tr></thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id} tabIndex={0} aria-selected={state.selection?.id === agent.id} className={state.selection?.id === agent.id ? "selected" : ""} onClick={() => select(agent.id)} onKeyDown={(event) => { if (event.key === "Enter") select(agent.id); }}>
                <td><div className="table-person"><AgentAvatar appearance={agent.appearance} size={32} /><div><b>{agent.title}</b><span>{agent.name}</span></div></div></td>
                <td>{departmentNames[agent.department]}</td>
                <td><span className="mono">{agent.model.model}</span></td>
                <td>{agent.skillIds.length}</td>
                <td>{agent.toolIds.length}</td>
                <td><Tag tone={stateTone[agent.state]}>{stateName[agent.state]}</Tag></td>
              </tr>
            ))}
          </tbody>
        </table>
        {agents.length === 0 && <p className="panel-empty">No agents match</p>}
      </div>
      )}
    </section>
  );
}

function Teams() {
  const { state, dispatch } = useStudio();
  const { company } = state;
  function create() {
    const lead = company.agents.find((agent) => agent.id === "ceo") ?? company.agents[0];
    if (!lead) return;
    let index = company.teams.length + 1;
    while (company.teams.some((team) => team.id === `team-${index}`)) index += 1;
    dispatch({ type: "team.add", team: newTeam({ id: `team-${index}`, name: `${lead.title}-led team`, leadAgentId: lead.id, memberAgentIds: [] }) });
  }
  return (
    <section className="operations-page">
      <PageHeader title="Teams"><button className="button primary" disabled={!company.agents.length} onClick={create}><Plus /> New team</button></PageHeader>
      <div className="team-grid">
        {company.teams.map((team) => {
          const lead = company.agents.find((agent) => agent.id === team.leadAgentId);
          return (
            <button className={`team-card ${state.selection?.id === team.id ? "selected" : ""}`} key={team.id} onClick={() => dispatch({ type: "select", selection: { kind: "team", id: team.id } })}>
              <div className="team-topology">
                {lead && <span className="lead-node"><AgentAvatar appearance={lead.appearance} size={44} /><em>{lead.title}</em></span>}
                <i />
                <div>{team.memberAgentIds.slice(0, 8).map((id) => { const member = company.agents.find((agent) => agent.id === id); return member ? <AgentAvatar key={id} appearance={member.appearance} size={28} title={member.title} /> : null; })}{team.memberAgentIds.length > 8 && <em>+{team.memberAgentIds.length - 8}</em>}</div>
              </div>
              <h2>{team.name}</h2>
              <footer><Tag tone="neutral" dot={false}>{team.memberAgentIds.length + 1} agents</Tag><Tag tone="neutral" dot={false}>{Math.round(team.budget.maxTokens / 1000)}k tokens</Tag></footer>
            </button>
          );
        })}
        {company.teams.length === 0 && <div className="empty-state"><Users /><h2>No teams yet</h2><button className="button primary" disabled={!company.agents.length} onClick={create}>Create a team</button></div>}
      </div>
    </section>
  );
}

type MissionTab = "all" | "draft" | "active" | "done";
const activeStates: MissionSpec["status"][] = ["queued", "running", "waiting"];
const boardColumns: Array<{ id: string; label: string; tone: string; states: MissionSpec["status"][] }> = [
  { id: "draft", label: "Draft", tone: "neutral", states: ["draft"] },
  { id: "active", label: "In progress", tone: "accent", states: ["queued", "running"] },
  { id: "waiting", label: "Needs approval", tone: "warning", states: ["waiting"] },
  { id: "done", label: "Finished", tone: "success", states: ["completed", "failed", "cancelled"] },
];

function Missions({ onNewMission, onRunMission }: { onNewMission: () => void; onRunMission: (mission: MissionSpec) => void }) {
  const { state, dispatch } = useStudio();
  const { company } = state;
  const [tab, setTab] = useState<MissionTab>("all");
  const [view, setView] = useState<ViewMode>("list");
  const assignee = (mission: MissionSpec) => mission.assigneeType === "team" ? company.teams.find((team) => team.id === mission.assigneeId)?.name : company.agents.find((agent) => agent.id === mission.assigneeId)?.title;
  const inTab = (mission: MissionSpec, id: MissionTab) => id === "all" || (id === "draft" && mission.status === "draft") || (id === "active" && activeStates.includes(mission.status)) || (id === "done" && ["completed", "failed", "cancelled"].includes(mission.status));
  const tabs: Array<{ id: MissionTab; label: string; count: number }> = (["all", "draft", "active", "done"] as const).map((id) => ({ id, label: { all: "All", draft: "Drafts", active: "Active", done: "Finished" }[id], count: company.missions.filter((mission) => inTab(mission, id)).length }));
  const missions = company.missions.filter((mission) => inTab(mission, tab));
  return (
    <section className="operations-page">
      <PageHeader title="Missions" count={company.missions.length}><button className="button primary" onClick={onNewMission}><Plus /> New mission</button></PageHeader>
      {company.missions.length === 0 ? (
        <div className="empty-state"><Play /><h2>No missions yet</h2><button className="button primary" onClick={onNewMission}>Create a mission</button></div>
      ) : (
        <>
          <div className="list-toolbar"><TabBar tabs={tabs} value={tab} onChange={setTab} label="Mission status" /><div className="toolbar-tools"><ViewSwitch value={view} onChange={setView} /></div></div>
          {view === "board" ? (
            <div className="board">
              {boardColumns.map((column) => {
                const items = company.missions.filter((mission) => column.states.includes(mission.status));
                return (
                  <section className="board-col" key={column.id}>
                    <header><i className={`col-dot tone-${column.tone}`} /><h2>{column.label}</h2><span className="count">{items.length}</span></header>
                    <div className="board-cards">
                      {items.map((mission) => (
                        <button key={mission.id} className={`board-card ${state.selection?.id === mission.id ? "selected" : ""}`} onClick={() => dispatch({ type: "select", selection: { kind: "mission", id: mission.id } })}>
                          <b className="board-title">{mission.title}</b>
                          <span className="board-meta"><Tag tone={missionTone[mission.status]}><span className="capitalize">{mission.status}</span></Tag><span>{assignee(mission) ?? "Unassigned"}</span></span>
                          {(mission.status === "draft" || mission.status === "failed" || mission.status === "cancelled") && <span className="board-actions"><span role="button" tabIndex={0} className="button small" onClick={(event) => { event.stopPropagation(); onRunMission(mission); }} onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); onRunMission(mission); } }}><Play /> Run</span></span>}
                        </button>
                      ))}
                      {items.length === 0 && <p className="board-empty">Nothing here</p>}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
          <div className="table-panel">
            <table>
              <thead><tr><th>Status</th><th>Mission</th><th>Owner</th><th>Budget</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {missions.map((mission) => (
                  <tr key={mission.id} tabIndex={0} className={state.selection?.id === mission.id ? "selected" : ""} onClick={() => dispatch({ type: "select", selection: { kind: "mission", id: mission.id } })} onKeyDown={(event) => { if (event.key === "Enter") dispatch({ type: "select", selection: { kind: "mission", id: mission.id } }); }}>
                    <td><Tag tone={missionTone[mission.status]}><span className="capitalize">{mission.status}</span></Tag></td>
                    <td><b className="cell-title">{mission.title}</b></td>
                    <td>{assignee(mission) ?? "Unassigned"}</td>
                    <td>{Math.round(mission.budget.maxTokens / 1000)}k tokens</td>
                    <td className="cell-actions">{(mission.status === "draft" || mission.status === "failed" || mission.status === "cancelled") && <button className="button small" onClick={(event) => { event.stopPropagation(); onRunMission(mission); }}><Play /> Run</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {missions.length === 0 && <p className="panel-empty">Nothing here</p>}
          </div>
          )}
        </>
      )}
    </section>
  );
}
