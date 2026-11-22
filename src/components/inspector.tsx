"use client";

import { CheckCircle, Copy, DownloadSimple, Play, Prohibit, Stop, Trash, WarningCircle, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { AgentAvatar } from "./agent-avatar";
import { paintCharacter } from "./office/pixel-art";
import { useSelected, useStudio } from "@/lib/studio-store";
import { avatarColors, avatarEyes, avatarShapes, hairColors, hairStyles, pantsColors, skinTones } from "@/lib/appearance";
import { compatibility } from "@/lib/exporter";
import { agentSchema, teamSchema } from "@/lib/schema";
import { departmentNames } from "@/lib/seed";
import { departmentZones, freeDeskIn } from "@/lib/office-layout";
import { missionAction } from "@/lib/runner-client";
import type { AgentAppearance, AgentSpec, HostTarget, MissionSpec, TeamSpec } from "@/lib/studio-types";

interface InspectorProps { token: string; paired: boolean; onRunMission: (mission: MissionSpec) => void }

export function Inspector(props: InspectorProps) {
  const { state, dispatch } = useStudio();
  const selected = useSelected();
  const [width, setWidth] = useState(() => { const saved = Number(localStorage.getItem("ai-office-inspector")); return saved >= 340 && saved <= 720 ? saved : 400; });
  const resizing = useRef(false);
  useEffect(() => { document.documentElement.style.setProperty("--inspector-w", `${width}px`); }, [width]);
  if (!state.selection || !selected) return null;
  const kind = state.selection.kind;
  const heading = kind === "agent" ? (selected as AgentSpec).title : kind === "team" ? (selected as TeamSpec).name : (selected as MissionSpec).title;
  return (
    <aside className="inspector" aria-label={`${kind} inspector`}>
      <div
        className="inspector-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector"
        tabIndex={0}
        onPointerDown={(event) => { resizing.current = true; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { if (!resizing.current) return; const next = Math.min(720, Math.max(340, window.innerWidth - event.clientX)); setWidth(next); }}
        onPointerUp={() => { resizing.current = false; localStorage.setItem("ai-office-inspector", String(width)); }}
        onKeyDown={(event) => { if (event.key === "ArrowLeft") setWidth((value) => Math.min(720, value + 20)); if (event.key === "ArrowRight") setWidth((value) => Math.max(340, value - 20)); }}
      />
      <header>
        <div><span>{kind === "agent" ? "AGENT EDITOR" : kind === "team" ? "TEAM EDITOR" : "MISSION"}</span><h2>{heading}</h2></div>
        <button className="icon-button" aria-label="Close inspector" onClick={() => dispatch({ type: "select", selection: null })}><X /></button>
      </header>
      {kind === "agent" ? <AgentEditor key={selected.id} agent={selected as AgentSpec} /> : kind === "team" ? <TeamEditor key={selected.id} team={selected as TeamSpec} /> : <MissionInspector key={selected.id} mission={selected as MissionSpec} {...props} />}
    </aside>
  );
}

/* ---------- Committing fields: one undo step per edit, not per keystroke ---------- */

function useDraft<T>(value: T) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState(value);
  if (!editing && seen !== value) { setSeen(value); setDraft(value); }
  return { draft, setDraft, setEditing };
}

function TextField({ label, value, onCommit, multiline, rows = 3 }: { label: string; value: string; onCommit: (value: string) => void; multiline?: boolean; rows?: number }) {
  const { draft, setDraft, setEditing } = useDraft(value);
  const commit = () => { setEditing(false); if (draft !== value) onCommit(draft); };
  const shared = { value: draft, onFocus: () => setEditing(true), onBlur: commit, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value) };
  return <label>{label}{multiline ? <textarea rows={rows} {...shared} /> : <input {...shared} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }} />}</label>;
}

function ListField({ label, values, onCommit }: { label: string; values: string[]; onCommit: (values: string[]) => void }) {
  return <TextField label={label} value={values.join("\n")} multiline rows={Math.max(3, values.length + 1)} onCommit={(value) => onCommit(value.split("\n").map((item) => item.trim()).filter(Boolean))} />;
}

function NumberField({ label, value, onCommit, min, max, step }: { label: string; value: number; onCommit: (value: number) => void; min?: number; max?: number; step?: number }) {
  const { draft, setDraft, setEditing } = useDraft(String(value));
  return <label>{label}<input type="number" min={min} max={max} step={step} value={draft} onFocus={() => setEditing(true)} onChange={(event) => setDraft(event.target.value)} onBlur={() => { setEditing(false); const next = Number(draft); if (Number.isFinite(next) && next !== value) onCommit(next); else setDraft(String(value)); }} /></label>;
}

function SectionTitle({ title }: { title: string }) { return <div className="section-title"><h3>{title}</h3></div>; }

/* ---------- Agent editor ---------- */

const agentTabs = ["Identity", "Objectives", "Instructions", "Skills", "Tools", "Memory", "Guardrails", "Models", "Evaluations", "Compatibility", "Manifest"] as const;

function PixelPreview({ appearance }: { appearance: AgentAppearance }) {
  const src = useMemo(() => paintCharacter(appearance, "down", "stand").toDataURL(), [appearance]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="pixel-preview" src={src} alt="Office character preview" width={48} height={72} /> : <span className="pixel-preview" />;
}

function AgentEditor({ agent }: { agent: AgentSpec }) {
  const { state, dispatch } = useStudio();
  const update = (patch: Partial<AgentSpec>) => dispatch({ type: "agent.update", id: agent.id, patch });
  const look = (patch: Partial<AgentAppearance>) => update({ appearance: { ...agent.appearance, ...patch } });

  return (
    <Tabs.Root defaultValue="Identity" className="inspector-tabs">
      <Tabs.List aria-label="Agent configuration">{agentTabs.map((tab) => <Tabs.Trigger key={tab} value={tab}>{tab}</Tabs.Trigger>)}</Tabs.List>
      <div className="inspector-scroll">
        <Tabs.Content value="Identity">
          <div className="agent-identity">
            <AgentAvatar appearance={agent.appearance} size={52} state={agent.state} />
            <PixelPreview appearance={agent.appearance} />
            <div><b>{agent.title}</b><small>{agent.name} · {departmentNames[agent.department]}</small></div>
          </div>
          <div className="two-fields">
            <TextField label="Role" value={agent.title} onCommit={(title) => update({ title })} />
            <TextField label="Name" value={agent.name} onCommit={(name) => update({ name, initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2) })} />
          </div>
          <label>Department
            <select value={agent.department} onChange={(event) => { const department = event.target.value as AgentSpec["department"]; dispatch({ type: "agent.seat", id: agent.id, department, seat: freeDeskIn(department, state.company.agents.filter((item) => item.id !== agent.id).map((item) => item.seat)) }); }}>
              {departmentZones.map((dept) => <option key={dept} value={dept}>{departmentNames[dept]}</option>)}
            </select>
          </label>
          <SectionTitle title="Icon" />
          <div className="swatch-grid shapes" role="radiogroup" aria-label="Icon shape">
            {avatarShapes.map((shape) => <button key={shape} role="radio" aria-checked={agent.appearance.shape === shape} aria-label={shape} className={agent.appearance.shape === shape ? "on" : ""} onClick={() => look({ shape })}><AgentAvatar appearance={{ ...agent.appearance, shape }} size={28} /></button>)}
          </div>
          <div className="swatch-grid colors" role="radiogroup" aria-label="Icon color">
            {avatarColors.map((color) => <button key={color} role="radio" aria-checked={agent.appearance.color === color} aria-label={color} className={agent.appearance.color === color ? "on" : ""} style={{ background: color }} onClick={() => look({ color })} />)}
          </div>
          <div className="segmented" role="radiogroup" aria-label="Eyes">
            {avatarEyes.map((eyes) => <button key={eyes} role="radio" aria-checked={agent.appearance.eyes === eyes} className={agent.appearance.eyes === eyes ? "on" : ""} onClick={() => look({ eyes })}>{eyes}</button>)}
          </div>
          <SectionTitle title="Office character" />
          <div className="swatch-grid colors small" role="radiogroup" aria-label="Skin tone">{skinTones.map((skin) => <button key={skin} role="radio" aria-checked={agent.appearance.skin === skin} aria-label={`Skin ${skin}`} className={agent.appearance.skin === skin ? "on" : ""} style={{ background: skin }} onClick={() => look({ skin })} />)}</div>
          <div className="swatch-grid colors small" role="radiogroup" aria-label="Hair color">{hairColors.map((hair) => <button key={hair} role="radio" aria-checked={agent.appearance.hair === hair} aria-label={`Hair ${hair}`} className={agent.appearance.hair === hair ? "on" : ""} style={{ background: hair }} onClick={() => look({ hair })} />)}</div>
          <div className="segmented" role="radiogroup" aria-label="Hair style">{hairStyles.map((hairStyle) => <button key={hairStyle} role="radio" aria-checked={agent.appearance.hairStyle === hairStyle} className={agent.appearance.hairStyle === hairStyle ? "on" : ""} onClick={() => look({ hairStyle })}>{hairStyle}</button>)}</div>
          <div className="swatch-grid colors small" role="radiogroup" aria-label="Trousers">{pantsColors.map((pants) => <button key={pants} role="radio" aria-checked={agent.appearance.pants === pants} aria-label={`Trousers ${pants}`} className={agent.appearance.pants === pants ? "on" : ""} style={{ background: pants }} onClick={() => look({ pants })} />)}</div>
          <button className="button danger full" onClick={() => { if (window.confirm(`Remove ${agent.title} from the company? You can undo this.`)) dispatch({ type: "agent.remove", id: agent.id }); }}><Trash /> Remove agent</button>
        </Tabs.Content>

        <Tabs.Content value="Objectives">
          <TextField label="Primary objective" value={agent.objective} multiline rows={4} onCommit={(objective) => update({ objective })} />
          <ListField label="Responsibilities" values={agent.responsibilities} onCommit={(responsibilities) => update({ responsibilities })} />
          <ListField label="Non-goals" values={agent.nonGoals} onCommit={(nonGoals) => update({ nonGoals })} />
        </Tabs.Content>

        <Tabs.Content value="Instructions">
          <SectionTitle title="Operating instructions" />
          <TextField label="Instructions" value={agent.instructions} multiline rows={14} onCommit={(instructions) => update({ instructions })} />
        </Tabs.Content>

        <Tabs.Content value="Skills">
          <SectionTitle title="Skills" />
          {state.company.skills.map((skill) => {
            const on = agent.skillIds.includes(skill.id);
            return (
              <label className={`capability-card ${on ? "on" : ""}`} key={skill.id}>
                <input type="checkbox" checked={on} onChange={(event) => update({ skillIds: event.target.checked ? [...agent.skillIds, skill.id] : agent.skillIds.filter((id) => id !== skill.id) })} />
                <div><b>{skill.name}</b><small>{skill.workflow.length} steps</small></div>
              </label>
            );
          })}
        </Tabs.Content>

        <Tabs.Content value="Tools">
          <SectionTitle title="Tool access" />
          {state.company.tools.map((tool) => (
            <label className="toggle-row" key={tool.id}>
              <div><b>{tool.name}</b><small>{tool.command ? "MCP stdio" : tool.url ? "MCP HTTP" : tool.transport} · approval {tool.approval === "writes" ? "before writes" : tool.approval}{tool.enabled ? "" : " · disabled"}</small></div>
              <input type="checkbox" checked={agent.toolIds.includes(tool.id)} onChange={(event) => update({ toolIds: event.target.checked ? [...agent.toolIds, tool.id] : agent.toolIds.filter((id) => id !== tool.id) })} />
            </label>
          ))}
        </Tabs.Content>

        <Tabs.Content value="Memory">
          <SectionTitle title="Memory policy" />
          <label className="toggle-row"><div><b>Working memory</b></div><input type="checkbox" checked={agent.memory.working} onChange={(event) => update({ memory: { ...agent.memory, working: event.target.checked } })} /></label>
          <label className="toggle-row"><div><b>Project memory</b></div><input type="checkbox" checked={agent.memory.project} onChange={(event) => update({ memory: { ...agent.memory, project: event.target.checked } })} /></label>
          <label className="toggle-row"><div><b>Redact secrets</b></div><input type="checkbox" checked={agent.memory.redactSecrets} onChange={(event) => update({ memory: { ...agent.memory, redactSecrets: event.target.checked } })} /></label>
          <NumberField label="Retention (days)" value={agent.memory.retentionDays} min={0} max={3650} onCommit={(retentionDays) => update({ memory: { ...agent.memory, retentionDays } })} />
        </Tabs.Content>

        <Tabs.Content value="Guardrails">
          <ListField label="Guardrails" values={agent.guardrails} onCommit={(guardrails) => update({ guardrails })} />
          <p className="message-strip"><WarningCircle />Regulated roles support internal operational workflows only and do not provide licensed legal, financial, audit, medical, or investment advice.</p>
        </Tabs.Content>

        <Tabs.Content value="Models">
          <SectionTitle title="Model policy" />
          <label>Provider<select value={agent.model.provider} onChange={(event) => { const provider = event.target.value as AgentSpec["model"]["provider"]; update({ model: { ...agent.model, provider, model: provider === "openai" ? "gpt-5.2" : "claude-sonnet-4-5" } }); }}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select></label>
          <TextField label="Model" value={agent.model.model} onCommit={(model) => update({ model: { ...agent.model, model } })} />
          <div className="two-fields">
            <NumberField label="Temperature" value={agent.model.temperature} min={0} max={2} step={0.1} onCommit={(temperature) => update({ model: { ...agent.model, temperature } })} />
            <NumberField label="Max output tokens" value={agent.model.maxTokens} min={256} step={256} onCommit={(maxTokens) => update({ model: { ...agent.model, maxTokens } })} />
          </div>
        </Tabs.Content>

        <Tabs.Content value="Evaluations">
          <SectionTitle title="Behavior evaluations" />
          <ListField label="Evaluation cases" values={agent.evaluations} onCommit={(evaluations) => update({ evaluations })} />
        </Tabs.Content>

        <Tabs.Content value="Compatibility">
          <CompatibilityPanel agent={agent} />
        </Tabs.Content>

        <Tabs.Content value="Manifest">
          <ManifestEditor value={agent} schema={agentSchema} onApply={(next) => update(next as Partial<AgentSpec>)} lockedKeys={["id"]} />
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}

function CompatibilityPanel({ agent }: { agent: AgentSpec }) {
  const { state } = useStudio();
  const scoped = useMemo(() => ({ ...state.company, agents: [agent], teams: state.company.teams.filter((team) => team.leadAgentId === agent.id) }), [state.company, agent]);
  return (
    <>
      <SectionTitle title="Host compatibility" />
      {(["codex", "claude", "docker"] as HostTarget[]).map((target) => {
        const report = compatibility(scoped, target);
        return (
          <div className="compat-block" key={target}>
            <b>{target === "codex" ? "Codex" : target === "claude" ? "Claude Code" : "Self-hosted runner"}</b>
            <ul className="compat-list">
              {report.supported.map((item) => <li key={item} className="good"><CheckCircle />{item}</li>)}
              {report.degraded.map((item) => <li key={item} className="warn"><WarningCircle />{item}</li>)}
              {report.unsupported.map((item) => <li key={item} className="bad"><X />{item}</li>)}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function ManifestEditor<T extends { id: string }>({ value, schema, onApply, lockedKeys }: { value: T; schema: { safeParse: (input: unknown) => { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } }; onApply: (next: Partial<T>) => void; lockedKeys: string[] }) {
  const text = JSON.stringify(value, null, 2);
  const [edited, setEdited] = useState(text);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const draft = dirty ? edited : text;
  function apply() {
    try {
      const parsed = JSON.parse(draft);
      const result = schema.safeParse(parsed);
      if (!result.success) { const issue = result.error!.issues[0]; setError(`${issue.path.join(".") || "manifest"}: ${issue.message}`); return; }
      for (const key of lockedKeys) if (parsed[key] !== (value as Record<string, unknown>)[key]) { setError(`${key} cannot be changed here.`); return; }
      onApply(parsed);
      setError("");
      setDirty(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Invalid JSON"); }
  }
  return (
    <div className="manifest-box">
      <header><b>Advanced manifest</b><span>{dirty ? "Unsaved changes" : "In sync with the guided editor"}</span><button onClick={() => navigator.clipboard.writeText(draft)}><Copy /> Copy</button></header>
      <textarea spellCheck={false} aria-label="Manifest JSON" value={draft} onChange={(event) => { setEdited(event.target.value); setDirty(true); }} rows={22} />
      {error && <p className="form-error">{error}</p>}
      <footer><button className="button" disabled={!dirty} onClick={() => { setDirty(false); setError(""); }}>Revert</button><button className="button primary" disabled={!dirty} onClick={apply}>Apply manifest</button></footer>
    </div>
  );
}

/* ---------- Team editor ---------- */

function TeamEditor({ team }: { team: TeamSpec }) {
  const { state, dispatch } = useStudio();
  const update = (patch: Partial<TeamSpec>) => dispatch({ type: "team.update", id: team.id, patch });
  const lead = state.company.agents.find((agent) => agent.id === team.leadAgentId);
  return (
    <Tabs.Root defaultValue="Structure" className="inspector-tabs">
      <Tabs.List aria-label="Team configuration">{["Structure", "Routing", "Approvals", "Output", "Manifest"].map((tab) => <Tabs.Trigger key={tab} value={tab}>{tab}</Tabs.Trigger>)}</Tabs.List>
      <div className="inspector-scroll">
        <Tabs.Content value="Structure">
          <div className="supervisor-diagram">
            {lead && <><AgentAvatar appearance={lead.appearance} size={44} /><b>{lead.title}</b></>}
            <i />
            <div>{team.memberAgentIds.map((id) => { const member = state.company.agents.find((agent) => agent.id === id); return member ? <AgentAvatar key={id} appearance={member.appearance} size={28} title={member.title} /> : null; })}</div>
          </div>
          <TextField label="Team name" value={team.name} onCommit={(name) => update({ name })} />
          <TextField label="Purpose" value={team.description} multiline onCommit={(description) => update({ description })} />
          <label>Supervisor
            <select value={team.leadAgentId} onChange={(event) => update({ leadAgentId: event.target.value, memberAgentIds: team.memberAgentIds.filter((id) => id !== event.target.value) })}>
              {state.company.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.title} · {agent.name}</option>)}
            </select>
          </label>
          <SectionTitle title="Specialists" />
          <div className="member-list">
            {state.company.agents.filter((agent) => agent.id !== team.leadAgentId).map((agent) => (
              <label key={agent.id} className={team.memberAgentIds.includes(agent.id) ? "on" : ""}>
                <input type="checkbox" checked={team.memberAgentIds.includes(agent.id)} onChange={(event) => update({ memberAgentIds: event.target.checked ? [...team.memberAgentIds, agent.id] : team.memberAgentIds.filter((id) => id !== agent.id) })} />
                <AgentAvatar appearance={agent.appearance} size={20} /><span>{agent.title}<small>{agent.name}</small></span>
              </label>
            ))}
          </div>
          <button className="button danger full" onClick={() => { if (window.confirm(`Delete ${team.name}? You can undo this.`)) dispatch({ type: "team.remove", id: team.id }); }}><Trash /> Delete team</button>
        </Tabs.Content>
        <Tabs.Content value="Routing">
          
          <ListField label="Routing rules" values={team.routingRules} onCommit={(routingRules) => update({ routingRules })} />
          <ListField label="Shared context" values={team.sharedContext} onCommit={(sharedContext) => update({ sharedContext })} />
        </Tabs.Content>
        <Tabs.Content value="Approvals">
          <ListField label="Require approval for" values={team.approvalPolicy.requiredFor} onCommit={(requiredFor) => update({ approvalPolicy: { ...team.approvalPolicy, requiredFor } })} />
          <ListField label="Approvers" values={team.approvalPolicy.approvers} onCommit={(approvers) => update({ approvalPolicy: { ...team.approvalPolicy, approvers } })} />
          <NumberField label="Approval timeout (minutes)" value={team.approvalPolicy.timeoutMinutes} min={1} onCommit={(timeoutMinutes) => update({ approvalPolicy: { ...team.approvalPolicy, timeoutMinutes } })} />
          <div className="two-fields">
            <NumberField label="Token budget" value={team.budget.maxTokens} min={1000} step={1000} onCommit={(maxTokens) => update({ budget: { ...team.budget, maxTokens } })} />
            <NumberField label="Cost cap (USD)" value={team.budget.maxCostUsd ?? 0} min={0} step={1} onCommit={(cost) => update({ budget: { ...team.budget, maxCostUsd: cost > 0 ? cost : undefined } })} />
          </div>
        </Tabs.Content>
        <Tabs.Content value="Output">
          <TextField label="Output contract" value={team.outputContract} multiline rows={5} onCommit={(outputContract) => update({ outputContract })} />
        </Tabs.Content>
        <Tabs.Content value="Manifest">
          <ManifestEditor value={team} schema={teamSchema} onApply={(next) => update(next as Partial<TeamSpec>)} lockedKeys={["id"]} />
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}

/* ---------- Mission inspector ---------- */

function MissionInspector({ mission, token, paired, onRunMission }: { mission: MissionSpec } & InspectorProps) {
  const { state, dispatch } = useStudio();
  const [error, setError] = useState("");
  const traces = state.traces.filter((event) => event.missionId === mission.id);
  const artifacts = traces.filter((event) => event.type === "artifact.created");
  const pendingApproval = [...traces].reverse().find((event) => event.type === "approval.required");
  const owner = mission.assigneeType === "team" ? state.company.teams.find((team) => team.id === mission.assigneeId)?.name : state.company.agents.find((agent) => agent.id === mission.assigneeId)?.title;

  async function act(action: "approve" | "reject" | "cancel") {
    try { await missionAction(mission.id, action, token, pendingApproval?.payload?.approvalId ? { approvalId: pendingApproval.payload.approvalId } : {}); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Action failed"); }
  }

  return (
    <div className="inspector-scroll">
      <div className="mission-inspector-head">
        <span className={`status-badge ${mission.status}`}>{mission.status}</span>
        <p>{mission.objective}</p>
        <dl className="definition-list">
          <div><dt>Owner</dt><dd>{owner ?? "Unassigned"} ({mission.assigneeType})</dd></div>
          <div><dt>Budget</dt><dd>{mission.budget.maxTokens.toLocaleString()} tokens</dd></div>
          <div><dt>Expected artifacts</dt><dd>{mission.artifacts.join(", ") || "None listed"}</dd></div>
        </dl>
      </div>
      <div className="mission-actions">
        {(mission.status === "draft" || mission.status === "failed" || mission.status === "cancelled") && <button className="button primary" onClick={() => onRunMission(mission)}><Play /> {paired ? "Run mission" : "Pair runner to run"}</button>}
        {mission.status === "waiting" && pendingApproval && <><button className="button primary" onClick={() => act("approve")}><CheckCircle /> Approve</button><button className="button" onClick={() => act("reject")}><Prohibit /> Reject</button></>}
        {(mission.status === "running" || mission.status === "queued" || mission.status === "waiting") && <button className="button" onClick={() => act("cancel")}><Stop /> Cancel</button>}
        <button className="icon-button" aria-label="Delete mission" onClick={() => dispatch({ type: "mission.remove", id: mission.id })}><Trash /></button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {pendingApproval && mission.status === "waiting" && <div className="approval-card"><WarningCircle /><div><b>Approval required</b><p>{pendingApproval.message}</p>{typeof pendingApproval.payload?.tool === "string" && <small>Tool: {pendingApproval.payload.tool} · {String(pendingApproval.payload.action ?? "")}</small>}</div></div>}
      {artifacts.length > 0 && (
        <>
          <SectionTitle title="Artifacts" />
          {artifacts.map((event) => {
            const content = String(event.payload?.content ?? "");
            const name = String(event.payload?.name ?? "artifact.md");
            return (
              <article className="artifact-card" key={event.id}>
                <header><b>{name}</b><button className="text-button" onClick={() => { const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }}><DownloadSimple /> Download</button></header>
                <pre>{content}</pre>
              </article>
            );
          })}
        </>
      )}
      <SectionTitle title="Execution trace" />
      {traces.length === 0 ? <div className="trace-empty">No runtime events yet.</div> : (
        <ol className="trace-list">
          {traces.map((event) => {
            const agent = state.company.agents.find((item) => item.id === event.agentId);
            return (
              <li key={event.id}>
                {agent ? <AgentAvatar appearance={agent.appearance} size={18} /> : <i className={`trace-icon ${event.type.replace(".", "-")}`} />}
                <div>
                  <b>{event.message}</b>
                  <time>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}{typeof event.payload?.tokens === "number" ? ` · ${event.payload.tokens.toLocaleString()} tokens` : ""}</time>
                  {typeof event.payload?.content === "string" && event.type !== "artifact.created" && <details><summary>View output</summary><pre>{event.payload.content}</pre></details>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
