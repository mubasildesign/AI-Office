"use client";

import { ArrowsOutCardinal, Coffee, DotsSixVertical, Keyboard, Pause, Play, Plus, SkipBack, Tag, Users, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentAvatar } from "./agent-avatar";
import type { DropTarget, EngineAgent, OfficeEngine } from "./office/office-engine";
import { useStudio } from "@/lib/studio-store";
import { WORLD_H, WORLD_W, TILE, departmentZones, freeDeskIn, zones } from "@/lib/office-layout";
import { departmentNames, newTeam, roleRank } from "@/lib/seed";
import { effectFor, statesAt } from "@/lib/trace-replay";
import type { AgentSpec, DepartmentId, MissionSpec } from "@/lib/studio-types";

const statusPriority: MissionSpec["status"][] = ["running", "waiting", "queued", "draft", "failed", "completed", "cancelled"];
const keyDepartments: DepartmentId[] = ["executive", "product", "engineering", "revenue", "operations"];
const stateLabel: Record<AgentSpec["state"], string> = { idle: "Available", working: "Working", waiting: "Waiting", review: "Review", blocked: "Blocked" };

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

function signPosition(zone: (typeof zones)[number]): React.CSSProperties {
  if (!departmentZones.includes(zone.id as DepartmentId)) return { left: pct(zone.x * TILE + 6, WORLD_W), top: pct(zone.y * TILE + 4, WORLD_H) };
  if (zone.y < 13) return { left: pct(zone.x * TILE + 6, WORLD_W), top: pct((zone.y + zone.h) * TILE + 2, WORLD_H) };
  return { left: pct((zone.x + zone.w) * TILE - 6, WORLD_W), top: pct(zone.y * TILE - 2, WORLD_H), transform: "translate(-100%, -100%)" };
}

interface OfficeProps {
  runnerOnline: boolean;
  paired: boolean;
  onOpenRunner: () => void;
  onNewMission: () => void;
  onRunMission: (mission: MissionSpec) => void;
}

export function OfficeView({ runnerOnline, paired, onOpenRunner, onNewMission, onRunMission }: OfficeProps) {
  const { state, dispatch } = useStudio();
  const { company, meeting, selection, traces } = state;
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<OfficeEngine | null>(null);
  const actorEls = useRef(new Map<string, HTMLElement>());
  const [ready, setReady] = useState(false);
  const [labels, setLabels] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const [dropHint, setDropHint] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [playback, setPlayback] = useState<{ missionId: string; index: number; playing: boolean } | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean; pointerId: number } | null>(null);
  const suppressClick = useRef(false);
  const selectedAgent = selection?.kind === "agent" ? company.agents.find((agent) => agent.id === selection.id) ?? null : null;

  useEffect(() => {
    let disposed = false;
    let engine: OfficeEngine | null = null;
    import("./office/office-engine").then(async ({ OfficeEngine: Engine }) => {
      if (disposed || !hostRef.current || !overlayRef.current) return;
      engine = await Engine.create(hostRef.current, overlayRef.current);
      if (disposed) { engine.destroy(); return; }
      engineRef.current = engine;
      setReady(true);
    });
    return () => { disposed = true; engine?.destroy(); engineRef.current = null; };
  }, []);

  const missionTraces = useMemo(() => (playback ? traces.filter((event) => event.missionId === playback.missionId) : []), [traces, playback]);
  const playbackStates = useMemo(() => (playback ? statesAt(missionTraces, playback.index) : null), [playback, missionTraces]);

  const missionByAgent = useMemo(() => {
    const map = new Map<string, MissionSpec["status"]>();
    for (const mission of company.missions) {
      const agentId = mission.assigneeType === "agent" ? mission.assigneeId : company.teams.find((team) => team.id === mission.assigneeId)?.leadAgentId;
      if (!agentId) continue;
      const current = map.get(agentId);
      if (!current || statusPriority.indexOf(mission.status) < statusPriority.indexOf(current)) map.set(agentId, mission.status);
    }
    return map;
  }, [company.missions, company.teams]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine) return;
    const agents: EngineAgent[] = company.agents.map((agent) => ({
      id: agent.id,
      seat: agent.seat,
      appearance: agent.appearance,
      state: playbackStates ? playbackStates[agent.id] ?? "idle" : agent.state,
      missionStatus: missionByAgent.get(agent.id),
    }));
    engine.sync({ agents, meeting, selectedId: selectedAgent?.id ?? null, runnerOnline: runnerOnline && paired });
    actorEls.current.forEach((element, id) => engine.bindOverlay(id, element));
  }, [ready, company.agents, meeting, selectedAgent?.id, runnerOnline, paired, playbackStates, missionByAgent]);

  // Live trace effects stream straight from runner events.
  const seenTraces = useRef(traces.length);
  useEffect(() => {
    const engine = engineRef.current;
    const fresh = traces.slice(seenTraces.current);
    seenTraces.current = traces.length;
    if (!engine || playback) return;
    fresh.forEach((event) => { const effect = effectFor(event); if (effect) engine.effect(effect); });
  }, [traces, playback]);

  // Trace playback timer
  useEffect(() => {
    if (!playback?.playing) return;
    const last = missionTraces.length - 1;
    const timer = window.setTimeout(() => setPlayback((value) => value && (value.index >= last ? { ...value, playing: false } : { ...value, index: value.index + 1 })), playback.index >= last ? 0 : 1100);
    return () => window.clearTimeout(timer);
  }, [playback, missionTraces.length]);
  useEffect(() => {
    if (!playback || !engineRef.current) return;
    const event = missionTraces[playback.index];
    const effect = event && effectFor(event);
    if (effect) engineRef.current.effect(effect);
  }, [playback?.index, playback?.missionId, missionTraces]); // eslint-disable-line react-hooks/exhaustive-deps

  const takenSeats = useCallback((except: string) => company.agents.filter((agent) => agent.id !== except).map((agent) => agent.seat), [company.agents]);

  const moveToDepartment = useCallback((agent: AgentSpec, department: DepartmentId, seat?: string) => {
    const target = seat ?? freeDeskIn(department, takenSeats(agent.id), agent.seat);
    if (meeting.includes(agent.id)) dispatch({ type: "meeting.toggle", id: agent.id });
    if (target !== agent.seat || department !== agent.department) dispatch({ type: "agent.seat", id: agent.id, seat: target, department });
    setAnnouncement(`${agent.title} moved to ${departmentNames[department]}.`);
  }, [dispatch, meeting, takenSeats]);

  const toggleMeeting = useCallback((agent: AgentSpec) => {
    const joining = !meeting.includes(agent.id);
    if (joining && meeting.length >= 12) { setAnnouncement("The team room is full."); return; }
    dispatch({ type: "meeting.toggle", id: agent.id });
    setAnnouncement(joining ? `${agent.title} joined the team room.` : `${agent.title} returned to their desk.`);
  }, [dispatch, meeting]);

  const coffee = useCallback((agent: AgentSpec) => {
    if (meeting.includes(agent.id)) dispatch({ type: "meeting.toggle", id: agent.id });
    const sent = engineRef.current?.coffeeBreak(agent.id);
    setAnnouncement(sent ? `${agent.title} is grabbing a coffee.` : "The lounge is full right now.");
  }, [dispatch, meeting]);

  function applyDrop(agent: AgentSpec, target: DropTarget) {
    if (!target) { setAnnouncement(`${agent.title} went back to their desk.`); return; }
    if (target.kind === "desk") moveToDepartment(agent, target.department, target.seat);
    if (target.kind === "zone") moveToDepartment(agent, target.department);
    if (target.kind === "meeting" && !meeting.includes(agent.id)) toggleMeeting(agent);
    if (target.kind === "lounge") window.setTimeout(() => coffee(agent), 0);
  }

  function describe(target: DropTarget) {
    if (!target) return "Drop to return to desk";
    if (target.kind === "desk") return `Desk in ${departmentNames[target.department]}`;
    if (target.kind === "zone") return `Move to ${departmentNames[target.department]}`;
    if (target.kind === "meeting") return "Seat in team room";
    return "Coffee break";
  }

  function onActorPointerDown(event: React.PointerEvent, agent: AgentSpec) {
    if (event.button !== 0) return;
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: agent.id, x: event.clientX, y: event.clientY, moved: false, pointerId: event.pointerId };
  }
  function onActorPointerMove(event: React.PointerEvent) {
    const current = drag.current;
    const engine = engineRef.current;
    if (!current || !engine) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 5) { current.moved = true; engine.beginDrag(current.id); }
    if (current.moved) setDropHint(describe(engine.dragTo(current.id, event.clientX, event.clientY)));
  }
  function onActorPointerUp(event: React.PointerEvent, agent: AgentSpec) {
    const current = drag.current;
    const engine = engineRef.current;
    drag.current = null;
    setDropHint(null);
    if (!current || !engine || !current.moved) return;
    suppressClick.current = true;
    const target = engine.dropTargetAt(event.clientX, event.clientY, agent.id);
    engine.endDrag(agent.id);
    applyDrop(agent, target);
  }

  function focusNeighbor(from: AgentSpec, key: string) {
    const origin = actorEls.current.get(from.id)?.getBoundingClientRect();
    if (!origin) return;
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key]!;
    let best: { id: string; score: number } | null = null;
    actorEls.current.forEach((element, id) => {
      if (id === from.id) return;
      const rect = element.getBoundingClientRect();
      const dx = rect.left - origin.left;
      const dy = rect.top - origin.top;
      const along = dx * direction[0] + dy * direction[1];
      if (along <= 4) return;
      const across = Math.abs(dx * direction[1]) + Math.abs(dy * direction[0]);
      const score = along + across * 2.5;
      if (!best || score < best.score) best = { id, score };
    });
    const target = best as { id: string } | null;
    if (target) (actorEls.current.get(target.id)?.querySelector("button") as HTMLButtonElement | null)?.focus();
  }

  function onActorKey(event: React.KeyboardEvent, agent: AgentSpec) {
    const key = event.key;
    if (key.startsWith("Arrow")) { event.preventDefault(); focusNeighbor(agent, key); return; }
    if (key === "Escape") { dispatch({ type: "select", selection: null }); return; }
    const lower = key.toLowerCase();
    if (lower === "m") { event.preventDefault(); toggleMeeting(agent); return; }
    if (lower === "c") { event.preventDefault(); coffee(agent); return; }
    const index = Number(key) - 1;
    if (index >= 0 && index < keyDepartments.length) { event.preventDefault(); moveToDepartment(agent, keyDepartments[index]); }
  }

  const tracedMissions = useMemo(() => company.missions.filter((mission) => traces.some((event) => event.missionId === mission.id)), [company.missions, traces]);
  const counts = useMemo(() => Object.fromEntries(departmentZones.map((dept) => [dept, company.agents.filter((agent) => agent.department === dept).length])), [company.agents]);
  const live = runnerOnline && paired;

  return (
    <section className="office-workspace" aria-label="Interactive office floor">
      <div className="office-toolbar">
        <div className="office-title">
          <h1>Office</h1>
          <span className={`tag with-dot ${live ? "tone-success" : "tone-neutral"}`}>{live ? "Live" : "Saved"}</span>
        </div>
        <div className="office-controls">
          <div className="office-legend" aria-label="Agent states">
            <span><i className="state-dot idle" /> Available</span><span><i className="state-dot working" /> Working</span><span><i className="state-dot waiting" /> Waiting</span><span><i className="state-dot review" /> Review</span>
          </div>
          <button className={`chip-button ${labels ? "on" : ""}`} aria-pressed={labels} onClick={() => setLabels(!labels)}><Tag /> Roles</button>
          <button className={`chip-button ${showKeys ? "on" : ""}`} aria-expanded={showKeys} onClick={() => setShowKeys(!showKeys)}><Keyboard /> Keys</button>
        </div>
      </div>

      {showKeys && <div className="key-help" role="note"><b>Keyboard</b><span><kbd>Tab</kbd> focus a person</span><span><kbd>Arrows</kbd> move focus spatially</span><span><kbd>Enter</kbd> open editor</span><span><kbd>M</kbd> team room</span><span><kbd>C</kbd> coffee break</span><span><kbd>1</kbd>–<kbd>5</kbd> Leadership, Product, Engineering, Go to market, People + Ops</span><span><kbd>⌘K</kbd> command palette</span></div>}

      <div className="office-stage">
        <div className={`office-map ${labels ? "labels-on" : ""} ${dropHint ? "dragging" : ""}`} ref={hostRef}>
          {!ready && <div className="office-loading"><span /> Setting up the office…</div>}
          <div className="office-overlay" ref={overlayRef}>
            {zones.map((zone) => (
              <div key={zone.id} className={`zone-sign zone-${zone.id}`} style={signPosition(zone)}>
                <b>{zone.name}</b>{counts[zone.id] !== undefined && <em>{counts[zone.id]}</em>}
                {zone.id === "meeting" && meeting.length > 0 && <em>{meeting.length}</em>}
              </div>
            ))}
            {company.agents.map((agent) => {
              const shownState = playbackStates ? playbackStates[agent.id] ?? "idle" : agent.state;
              const isSelected = selectedAgent?.id === agent.id;
              return (
                <div key={agent.id} className={`office-actor ${isSelected ? "selected" : ""}`} data-agent-id={agent.id} ref={(element) => { if (element) actorEls.current.set(agent.id, element); else actorEls.current.delete(agent.id); engineRef.current?.bindOverlay(agent.id, element); }}>
                  <span className="actor-tag"><AgentAvatar appearance={agent.appearance} size={13} /><span className="actor-label">{agent.title}</span><i className={`state-dot ${shownState}`} /></span>
                  <button
                    className="actor-hit"
                    aria-label={`${agent.title}, ${agent.name}, ${departmentNames[agent.department]}, ${stateLabel[shownState]}${meeting.includes(agent.id) ? ", in team room" : ""}`}
                    aria-pressed={isSelected}
                    onPointerDown={(event) => onActorPointerDown(event, agent)}
                    onPointerMove={onActorPointerMove}
                    onPointerUp={(event) => onActorPointerUp(event, agent)}
                    onPointerCancel={() => { if (drag.current?.moved) engineRef.current?.endDrag(agent.id); drag.current = null; setDropHint(null); }}
                    onPointerEnter={() => engineRef.current?.setHover(agent.id)}
                    onPointerLeave={() => engineRef.current?.setHover(null)}
                    onFocus={() => engineRef.current?.setHover(agent.id)}
                    onBlur={() => engineRef.current?.setHover(null)}
                    onKeyDown={(event) => onActorKey(event, agent)}
                    onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } dispatch({ type: "select", selection: { kind: "agent", id: agent.id } }); }}
                  />
                  <span className="actor-card" role="tooltip"><AgentAvatar appearance={agent.appearance} size={28} /><span><b>{agent.title}</b><small>{agent.name}</small><small className={`state-text ${shownState}`}>{stateLabel[shownState]}</small></span></span>
                </div>
              );
            })}
          </div>
          <button className={`runner-banner ${live ? "live" : runnerOnline ? "found" : ""}`} onClick={onOpenRunner}>
            <i />{live ? "Runner live" : runnerOnline ? "Runner found" : "Runner offline"}
          </button>
          {dropHint && <div className="drop-hint"><ArrowsOutCardinal /> {dropHint}</div>}
          {playback && <div className="playback-banner"><Play /> Replaying recorded trace · step {playback.index + 1} of {missionTraces.length}</div>}
          {company.agents.length === 0 && <div className="office-empty"><b>No one works here yet</b><span>Add agents from the Agents page or the command palette.</span></div>}
        </div>

        {selectedAgent && (
          <div className="selection-dock" role="region" aria-label={`Actions for ${selectedAgent.title}`}>
            <AgentAvatar appearance={selectedAgent.appearance} size={34} state={playbackStates?.[selectedAgent.id] ?? selectedAgent.state} />
            <div className="dock-id"><b>{selectedAgent.title}</b><small>{selectedAgent.name} · {departmentNames[selectedAgent.department]}</small></div>
            <button className="button" onClick={() => toggleMeeting(selectedAgent)}><Users /> {meeting.includes(selectedAgent.id) ? "Leave team room" : "Team room"}</button>
            <label className="dock-select"><span className="sr-only">Move to department</span>
              <select value={selectedAgent.department} onChange={(event) => moveToDepartment(selectedAgent, event.target.value as DepartmentId)}>
                {keyDepartments.map((dept) => <option key={dept} value={dept}>{departmentNames[dept]}</option>)}
              </select>
            </label>
            <button className="button" onClick={() => coffee(selectedAgent)}><Coffee /> Coffee</button>
            <button className="icon-button" aria-label="Clear selection" onClick={() => dispatch({ type: "select", selection: null })}><X /></button>
          </div>
        )}
      </div>

      <div className="office-panels">
        <MissionTray onNewMission={onNewMission} onRunMission={onRunMission} live={live} setAnnouncement={setAnnouncement} />
        <TeamRoom setAnnouncement={setAnnouncement} />
        <section className="panel office-panel playback-panel" aria-label="Trace playback">
          <header><div><h2>Trace playback</h2></div></header>
          {tracedMissions.length === 0 ? <p className="panel-empty">No traces yet</p> : (
            <>
              <select aria-label="Mission to replay" value={playback?.missionId ?? ""} onChange={(event) => setPlayback(event.target.value ? { missionId: event.target.value, index: 0, playing: false } : null)}>
                <option value="">Live view</option>
                {tracedMissions.map((mission) => <option key={mission.id} value={mission.id}>{mission.title}</option>)}
              </select>
              {playback && missionTraces.length > 0 && (
                <>
                  <div className="playback-controls">
                    <button className="icon-button" aria-label="Restart" onClick={() => setPlayback({ ...playback, index: 0 })}><SkipBack /></button>
                    <button className="icon-button" aria-label={playback.playing ? "Pause" : "Play"} onClick={() => setPlayback({ ...playback, playing: !playback.playing, index: playback.index >= missionTraces.length - 1 ? 0 : playback.index })}>{playback.playing ? <Pause /> : <Play />}</button>
                    <input type="range" aria-label="Trace position" min={0} max={missionTraces.length - 1} value={playback.index} onChange={(event) => setPlayback({ ...playback, index: Number(event.target.value), playing: false })} />
                  </div>
                  <p className="playback-caption">{missionTraces[playback.index]?.message}</p>
                </>
              )}
            </>
          )}
        </section>
      </div>
      <div className="sr-only" aria-live="polite">{announcement}</div>
    </section>
  );
}

function MissionTray({ onNewMission, onRunMission, live, setAnnouncement }: { onNewMission: () => void; onRunMission: (mission: MissionSpec) => void; live: boolean; setAnnouncement: (value: string) => void }) {
  const { state, dispatch } = useStudio();
  const { company } = state;
  const [ghost, setGhost] = useState<{ title: string; x: number; y: number; target?: string } | null>(null);
  const dragging = useRef<{ mission: MissionSpec; x: number; y: number; moved: boolean } | null>(null);
  const open = company.missions.filter((mission) => !["completed", "cancelled"].includes(mission.status)).slice(0, 8);

  function assigneeName(mission: MissionSpec) {
    if (mission.assigneeType === "team") return company.teams.find((team) => team.id === mission.assigneeId)?.name ?? "Unassigned";
    return company.agents.find((agent) => agent.id === mission.assigneeId)?.title ?? "Unassigned";
  }

  function targetAt(x: number, y: number) {
    for (const element of document.elementsFromPoint(x, y)) {
      const agentId = (element as HTMLElement).closest?.("[data-agent-id]")?.getAttribute("data-agent-id");
      if (agentId) return { kind: "agent" as const, id: agentId };
      const teamId = (element as HTMLElement).closest?.("[data-team-drop]")?.getAttribute("data-team-drop");
      if (teamId) return { kind: "team" as const, id: teamId };
    }
    return null;
  }

  function assign(mission: MissionSpec, kind: "agent" | "team", id: string) {
    dispatch({ type: "mission.assign", id: mission.id, assigneeType: kind, assigneeId: id });
    const name = kind === "agent" ? company.agents.find((agent) => agent.id === id)?.title : company.teams.find((team) => team.id === id)?.name;
    setAnnouncement(`${mission.title} assigned to ${name}.`);
  }

  return (
    <section className="panel office-panel mission-tray" aria-label="Mission tray">
      <header><div><h2>Mission tray</h2></div><button className="text-button" onClick={onNewMission}><Plus /> New</button></header>
      {open.length === 0 ? <p className="panel-empty">No open missions</p> : (
        <ul className="tray-list">
          {open.map((mission) => (
            <li key={mission.id}
              className="tray-card"
              onPointerDown={(event) => { if ((event.target as HTMLElement).closest("select,button")) return; event.currentTarget.setPointerCapture(event.pointerId); dragging.current = { mission, x: event.clientX, y: event.clientY, moved: false }; }}
              onPointerMove={(event) => {
                const current = dragging.current;
                if (!current) return;
                if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 5) current.moved = true;
                if (!current.moved) return;
                const target = targetAt(event.clientX, event.clientY);
                const label = target ? (target.kind === "agent" ? company.agents.find((agent) => agent.id === target.id)?.title : company.teams.find((team) => team.id === target.id)?.name) : undefined;
                setGhost({ title: current.mission.title, x: event.clientX, y: event.clientY, target: label });
              }}
              onPointerUp={(event) => {
                const current = dragging.current;
                dragging.current = null;
                setGhost(null);
                if (!current?.moved) return;
                const target = targetAt(event.clientX, event.clientY);
                if (target) assign(current.mission, target.kind, target.id);
              }}
              onPointerCancel={() => { dragging.current = null; setGhost(null); }}
            >
              <DotsSixVertical className="tray-grip" aria-hidden />
              <span className={`mission-status ${mission.status}`}><i /></span>
              <div className="tray-body">
                <b>{mission.title}</b>
                <label><span className="sr-only">Assign {mission.title} to</span>
                  <select value={`${mission.assigneeType}:${mission.assigneeId}`} onChange={(event) => { const [kind, id] = event.target.value.split(":") as ["agent" | "team", string]; assign(mission, kind, id); }}>
                    {!company.agents.some((agent) => agent.id === mission.assigneeId) && !company.teams.some((team) => team.id === mission.assigneeId) && <option value={`${mission.assigneeType}:${mission.assigneeId}`}>Unassigned</option>}
                    <optgroup label="Teams">{company.teams.map((team) => <option key={team.id} value={`team:${team.id}`}>{team.name}</option>)}</optgroup>
                    <optgroup label="Agents">{company.agents.map((agent) => <option key={agent.id} value={`agent:${agent.id}`}>{agent.title} · {agent.name}</option>)}</optgroup>
                  </select>
                </label>
                <small>{mission.status} · {assigneeName(mission)}</small>
              </div>
              {(mission.status === "draft" || mission.status === "failed") && <button className="icon-button" aria-label={`Run ${mission.title}`} title={live ? "Run in local runner" : "Pair the runner to run"} onClick={() => onRunMission(mission)}><Play /></button>}
            </li>
          ))}
        </ul>
      )}
      {ghost && <div className="mission-ghost" style={{ left: ghost.x, top: ghost.y }}><b>{ghost.title}</b><small>{ghost.target ? `Assign to ${ghost.target}` : "Drop on a person or team"}</small></div>}
    </section>
  );
}

function TeamRoom({ setAnnouncement }: { setAnnouncement: (value: string) => void }) {
  const { state, dispatch } = useStudio();
  const { company, meeting } = state;
  const people = meeting.map((id) => company.agents.find((agent) => agent.id === id)).filter(Boolean) as AgentSpec[];
  const ranked = [...people].sort((a, b) => (roleRank.indexOf(a.id) + 1 || 99) - (roleRank.indexOf(b.id) + 1 || 99));
  const [leadId, setLeadId] = useState("");
  const [name, setName] = useState("");
  const lead = people.find((agent) => agent.id === leadId) ?? ranked[0];

  function create() {
    if (!lead || people.length < 2) return;
    const members = people.filter((agent) => agent.id !== lead.id).map((agent) => agent.id);
    let id = `${lead.id}-team`;
    let index = 2;
    while (company.teams.some((team) => team.id === id)) id = `${lead.id}-team-${index++}`;
    const team = newTeam({ id, name: name.trim() || `${lead.title}-led team`, leadAgentId: lead.id, memberAgentIds: members, description: `Formed in the team room with ${lead.title} as supervisor.` });
    dispatch({ type: "team.add", team });
    dispatch({ type: "meeting.set", ids: [] });
    setName("");
    setLeadId("");
    setAnnouncement(`${team.name} created with ${members.length + 1} agents.`);
  }

  return (
    <section className="panel office-panel team-room-panel" aria-label="Team room">
      <header><div><h2>Team room</h2>{people.length > 0 && <span className="count-pill">{people.length}</span>}</div>{people.length > 0 && <button className="text-button" onClick={() => dispatch({ type: "meeting.set", ids: [] })}>Clear</button>}</header>
      {people.length > 0 && (
        <>
          <ul className="room-people">
            {ranked.map((agent) => (
              <li key={agent.id} className={agent.id === lead?.id ? "lead" : ""}>
                <button onClick={() => setLeadId(agent.id)} aria-pressed={agent.id === lead?.id} title="Make supervisor"><AgentAvatar appearance={agent.appearance} size={22} /><span>{agent.title}</span>{agent.id === lead?.id && <em>Lead</em>}</button>
                <button className="room-remove" aria-label={`Send ${agent.title} back to desk`} onClick={() => dispatch({ type: "meeting.toggle", id: agent.id })}><X /></button>
              </li>
            ))}
          </ul>
          <div className="room-form">
            <input aria-label="Team name" placeholder={lead ? `${lead.title}-led team` : "Team name"} value={name} onChange={(event) => setName(event.target.value)} />
            <button className="button primary" disabled={people.length < 2} onClick={create}><Users /> Create team</button>
          </div>
        </>
      )}
      <div className="team-chips" aria-label="Existing teams">
        {company.teams.map((team) => {
          const teamLead = company.agents.find((agent) => agent.id === team.leadAgentId);
          return (
            <div className="team-chip" key={team.id} data-team-drop={team.id}>
              {teamLead && <AgentAvatar appearance={teamLead.appearance} size={18} />}
              <span>{team.name}</span>
              <button className="text-button" onClick={() => { dispatch({ type: "meeting.set", ids: [team.leadAgentId, ...team.memberAgentIds] }); setAnnouncement(`${team.name} convened in the team room.`); }}>Convene</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
