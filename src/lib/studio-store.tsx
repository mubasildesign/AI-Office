"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { loadActiveCompany, saveCompany } from "./db";
import type { AgentSpec, AgentState, CompanySpec, MissionSpec, TeamSpec, TraceEvent } from "./studio-types";

export type Selection = { kind: "agent" | "team" | "mission"; id: string } | null;
export type Section = "overview" | "agents" | "teams" | "missions" | "tools" | "deployments" | "activity";
export type View = "operations" | "office";

type Snapshot = { company: CompanySpec; selection: Selection };
export interface StudioState extends Snapshot {
  view: View;
  section: Section;
  past: Snapshot[];
  future: Snapshot[];
  ready: boolean;
  loadError?: string;
  traces: TraceEvent[];
  /** Agents currently seated in the office team room, in seating order. */
  meeting: string[];
  notice?: string;
}

export type Action =
  | { type: "hydrate"; company: CompanySpec | null; error?: string; notice?: string }
  | { type: "company.create"; company: CompanySpec }
  | { type: "company.replace"; company: CompanySpec; notice?: string }
  | { type: "company.update"; patch: Partial<Pick<CompanySpec, "name" | "description" | "version">> }
  | { type: "company.close" }
  | { type: "select"; selection: Selection }
  | { type: "view"; view: View }
  | { type: "section"; section: Section }
  | { type: "agent.add"; agent: AgentSpec }
  | { type: "agent.update"; id: string; patch: Partial<AgentSpec> }
  | { type: "agent.remove"; id: string }
  | { type: "agent.seat"; id: string; seat: string; department: AgentSpec["department"] }
  | { type: "team.add"; team: TeamSpec }
  | { type: "team.update"; id: string; patch: Partial<TeamSpec> }
  | { type: "team.remove"; id: string }
  | { type: "mission.add"; mission: MissionSpec }
  | { type: "mission.assign"; id: string; assigneeType: MissionSpec["assigneeType"]; assigneeId: string }
  | { type: "mission.status"; id: string; status: MissionSpec["status"] }
  | { type: "mission.remove"; id: string }
  | { type: "trace.add"; event: TraceEvent }
  | { type: "meeting.set"; ids: string[] }
  | { type: "meeting.toggle"; id: string }
  | { type: "notice"; notice?: string }
  | { type: "undo" }
  | { type: "redo" };

const emptyCompany: CompanySpec = { schemaVersion: "1.1", id: "", name: "", description: "", version: "0.0.0", agents: [], skills: [], teams: [], tools: [], missions: [], deployments: [], updatedAt: "" };

const initial: StudioState = { company: emptyCompany, selection: null, view: "operations", section: "overview", past: [], future: [], ready: false, traces: [], meeting: [] };

function snap(state: StudioState): Snapshot {
  return { company: state.company, selection: state.selection };
}

function commit(state: StudioState, company: CompanySpec, selection: Selection = state.selection): StudioState {
  return { ...state, company: { ...company, updatedAt: new Date().toISOString() }, selection, past: [...state.past.slice(-59), snap(state)], future: [] };
}

function withAgents(company: CompanySpec, map: (agent: AgentSpec) => AgentSpec): CompanySpec {
  return { ...company, agents: company.agents.map(map) };
}

function setStates(company: CompanySpec, states: Record<string, AgentState>) {
  if (!Object.keys(states).length) return company;
  return withAgents(company, (agent) => (states[agent.id] && states[agent.id] !== agent.state ? { ...agent, state: states[agent.id] } : agent));
}

function setMission(company: CompanySpec, id: string, patch: Partial<MissionSpec>) {
  return { ...company, missions: company.missions.map((mission) => (mission.id === id ? { ...mission, ...patch, updatedAt: new Date().toISOString() } : mission)) };
}

/** Applies a live runner event to agent and mission state. Activity only ever comes from these events. */
function applyTrace(state: StudioState, event: TraceEvent): StudioState {
  let company = state.company;
  const states: Record<string, AgentState> = {};
  const participants = new Set(state.traces.filter((item) => item.missionId === event.missionId && item.agentId).map((item) => item.agentId!));
  switch (event.type) {
    case "mission.started": company = setMission(company, event.missionId, { status: "running" }); break;
    case "agent.started": if (event.agentId) states[event.agentId] = "working"; break;
    case "agent.handoff": {
      const from = event.payload?.from; const to = event.payload?.to;
      if (typeof from === "string") states[from] = "waiting";
      if (typeof to === "string") states[to] = "working";
      break;
    }
    case "tool.requested": if (event.agentId) states[event.agentId] = "working"; break;
    case "approval.required": if (event.agentId) states[event.agentId] = "waiting"; company = setMission(company, event.missionId, { status: "waiting" }); break;
    case "artifact.created": if (event.agentId) states[event.agentId] = "review"; break;
    case "agent.completed": if (event.agentId) states[event.agentId] = "idle"; break;
    case "mission.completed":
    case "mission.failed":
    case "mission.cancelled":
      participants.forEach((id) => { states[id] = "idle"; });
      if (event.agentId) states[event.agentId] = "idle";
      company = setMission(company, event.missionId, { status: event.type === "mission.completed" ? "completed" : event.type === "mission.failed" ? "failed" : "cancelled" });
      break;
    default: break;
  }
  return { ...state, company: setStates(company, states), traces: [...state.traces.slice(-999), event] };
}

export const initialStudioState = initial;

export function reducer(state: StudioState, action: Action): StudioState {
  switch (action.type) {
    case "hydrate": return { ...state, company: action.company ?? emptyCompany, ready: true, loadError: action.error, notice: action.notice };
    case "company.create": return { ...initial, company: action.company, ready: true };
    case "company.replace": return { ...commit(state, action.company, null), meeting: [], notice: action.notice };
    case "company.update": return commit(state, { ...state.company, ...action.patch });
    case "company.close": return { ...initial, ready: true };
    case "select": return { ...state, selection: action.selection };
    case "view": return { ...state, view: action.view };
    case "section": return { ...state, section: action.section, view: "operations" };
    case "agent.add": return commit(state, { ...state.company, agents: [...state.company.agents, action.agent] }, { kind: "agent", id: action.agent.id });
    case "agent.update": return commit(state, withAgents(state.company, (agent) => (agent.id === action.id ? { ...agent, ...action.patch } : agent)));
    case "agent.remove": return {
      ...commit(state, {
        ...state.company,
        agents: state.company.agents.filter((agent) => agent.id !== action.id),
        teams: state.company.teams.map((team) => ({ ...team, memberAgentIds: team.memberAgentIds.filter((id) => id !== action.id) })),
      }, null),
      meeting: state.meeting.filter((id) => id !== action.id),
    };
    case "agent.seat": return commit(state, withAgents(state.company, (agent) => (agent.id === action.id ? { ...agent, seat: action.seat, department: action.department } : agent)));
    case "team.add": return commit(state, { ...state.company, teams: [...state.company.teams, action.team] }, { kind: "team", id: action.team.id });
    case "team.update": return commit(state, { ...state.company, teams: state.company.teams.map((team) => (team.id === action.id ? { ...team, ...action.patch } : team)) });
    case "team.remove": return commit(state, { ...state.company, teams: state.company.teams.filter((team) => team.id !== action.id) }, null);
    case "mission.add": return commit(state, { ...state.company, missions: [action.mission, ...state.company.missions] }, { kind: "mission", id: action.mission.id });
    case "mission.assign": return commit(state, setMission(state.company, action.id, { assigneeType: action.assigneeType, assigneeId: action.assigneeId }));
    case "mission.status": return { ...state, company: setMission(state.company, action.id, { status: action.status }) };
    case "mission.remove": return commit(state, { ...state.company, missions: state.company.missions.filter((mission) => mission.id !== action.id) }, null);
    case "trace.add": return applyTrace(state, action.event);
    case "meeting.set": return { ...state, meeting: action.ids.slice(0, 12) };
    case "meeting.toggle": return { ...state, meeting: state.meeting.includes(action.id) ? state.meeting.filter((id) => id !== action.id) : [...state.meeting, action.id].slice(0, 12) };
    case "notice": return { ...state, notice: action.notice };
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return { ...state, ...previous, past: state.past.slice(0, -1), future: [snap(state), ...state.future] };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return { ...state, ...next, past: [...state.past, snap(state)], future: state.future.slice(1) };
    }
  }
}

const StudioContext = createContext<{ state: StudioState; dispatch: React.Dispatch<Action> } | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    loadActiveCompany().then(({ company, error, recovered }) => dispatch({ type: "hydrate", company, error, notice: recovered ? "Recovered your company from the previous local store." : undefined }));
  }, []);
  useEffect(() => {
    if (!state.ready || !state.company.id) return;
    const timer = window.setTimeout(() => void saveCompany(state.company).catch(() => dispatch({ type: "notice", notice: "Could not save to browser storage. Export a package to keep your work." })), 300);
    return () => window.clearTimeout(timer);
  }, [state.company, state.ready]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used inside StudioProvider");
  return context;
}

export function useSelected() {
  const { state } = useStudio();
  return useMemo(() => {
    const selection = state.selection;
    if (!selection) return null;
    if (selection.kind === "agent") return state.company.agents.find((item) => item.id === selection.id) ?? null;
    if (selection.kind === "team") return state.company.teams.find((item) => item.id === selection.id) ?? null;
    return state.company.missions.find((item) => item.id === selection.id) ?? null;
  }, [state.company, state.selection]);
}

export function useAgentMap() {
  const { state } = useStudio();
  return useMemo(() => new Map(state.company.agents.map((agent) => [agent.id, agent])), [state.company.agents]);
}
