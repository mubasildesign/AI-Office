"use client";

import { ArrowUUpLeft, ArrowUUpRight, Buildings, CaretDown, CheckCircle, CloudArrowUp, Cube, DownloadSimple, FileArrowUp, Graph, MagnifyingGlass, Play, Plus, Pulse, Robot, SidebarSimple, SquaresFour, Users, WarningCircle, Wrench, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CommandPalette, type PaletteCommand } from "./command-palette";
import { Inspector } from "./inspector";
import { OfficeView } from "./office-view";
import { Onboarding } from "./onboarding";
import { OperationsView } from "./operations-view";
import { PageHeader, Tag } from "./ui";
import { useAvatarGaze } from "./use-avatar-gaze";
import { StudioProvider, useStudio, type Section } from "@/lib/studio-store";
import { compatibility, exportPackage, importPackage, type PackScope } from "@/lib/exporter";
import { listCompanies, switchCompany } from "@/lib/db";
import { getRunnerHealth, pairRunner, runnerToken, setRunnerToken, startMission, subscribeToRunner, type RunnerHealth } from "@/lib/runner-client";
import { blankAgent } from "@/lib/seed";
import { freeDeskIn } from "@/lib/office-layout";
import { validateCompany } from "@/lib/schema";
import type { HostTarget, MissionSpec } from "@/lib/studio-types";

type NavItem = { id: Section | "office"; label: string; icon: typeof SquaresFour };
const navGroups: Array<{ label?: string; items: NavItem[] }> = [
  { items: [{ id: "overview", label: "Company", icon: SquaresFour }, { id: "office", label: "2D office", icon: Buildings }] },
  { label: "Work", items: [{ id: "missions", label: "Missions", icon: Play }, { id: "agents", label: "Agents", icon: Robot }, { id: "teams", label: "Teams", icon: Users }] },
  { label: "Manage", items: [{ id: "tools", label: "Tools", icon: Wrench }, { id: "deployments", label: "Deployments", icon: CloudArrowUp }, { id: "activity", label: "Activity", icon: Pulse }] },
];

const targetName: Record<HostTarget, string> = { agentpack: "Canonical AgentPack", codex: "Codex project", claude: "Claude Code plugin", docker: "Self-hosted runner" };

export function StudioApp() { return <StudioProvider><StudioRoot /></StudioProvider>; }

function StudioRoot() {
  const { state } = useStudio();
  if (!state.ready) return <div className="studio-loading"><span /> Loading</div>;
  if (!state.company.id) return <Onboarding />;
  return <StudioShell />;
}

function useRunner() {
  const { dispatch } = useStudio();
  const [runner, setRunner] = useState<RunnerHealth | null>(null);
  const [token, setToken] = useState(() => runnerToken());
  const [socketOpen, setSocketOpen] = useState(false);
  useEffect(() => {
    const check = () => getRunnerHealth(token).then((health) => { setRunner(health); if (token && !health.paired) { setRunnerToken(""); setToken(""); } }).catch(() => setRunner(null));
    check();
    const timer = window.setInterval(check, 5000);
    return () => window.clearInterval(timer);
  }, [token]);
  useEffect(() => {
    if (!token || !runner) return;
    return subscribeToRunner(token, (event) => dispatch({ type: "trace.add", event }), setSocketOpen);
  }, [token, Boolean(runner), dispatch]); // eslint-disable-line react-hooks/exhaustive-deps
  const pair = useCallback(async (code: string) => {
    const next = await pairRunner(code);
    setRunnerToken(next);
    setToken(next);
    setRunner(await getRunnerHealth(next));
  }, []);
  return { runner, token, paired: Boolean(runner && token && runner.paired), socketOpen, pair };
}

function StudioShell() {
  const { state, dispatch } = useStudio();
  const { runner, token, paired, pair } = useRunner();
  const [missionOpen, setMissionOpen] = useState(false);
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("ai-office-nav") === "collapsed");
  useEffect(() => { localStorage.setItem("ai-office-nav", collapsed ? "collapsed" : "open"); }, [collapsed]);
  const importRef = useRef<HTMLInputElement>(null);

  useAvatarGaze();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen((value) => !value); return; }
      if (mod && event.key.toLowerCase() === "z" && !typing) { event.preventDefault(); dispatch({ type: event.shiftKey ? "redo" : "undo" }); return; }
      if (mod && event.key.toLowerCase() === "y" && !typing) { event.preventDefault(); dispatch({ type: "redo" }); return; }
      if (event.key === "[" && !typing && !mod) { setCollapsed((value) => !value); return; }
      if (event.key === "Escape" && !typing && state.selection) dispatch({ type: "select", selection: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, state.selection]);
  useEffect(() => { if (!state.notice) return; const timer = window.setTimeout(() => dispatch({ type: "notice" }), 5000); return () => window.clearTimeout(timer); }, [state.notice, dispatch]);

  const runMission = useCallback(async (mission: MissionSpec) => {
    if (!paired) { setRunnerOpen(true); return; }
    dispatch({ type: "mission.status", id: mission.id, status: "queued" });
    try { await startMission(state.company, mission, token); }
    catch (reason) { dispatch({ type: "mission.status", id: mission.id, status: "failed" }); dispatch({ type: "notice", notice: reason instanceof Error ? reason.message : "Mission could not start" }); }
  }, [paired, dispatch, state.company, token]);

  const addAgent = useCallback(() => {
    const department = "operations";
    const seat = freeDeskIn(department, state.company.agents.map((agent) => agent.seat));
    dispatch({ type: "agent.add", agent: blankAgent(state.company, department, seat) });
  }, [dispatch, state.company]);

  async function importFile(file: File) {
    try {
      const result = await importPackage(file, state.company);
      dispatch({ type: "company.replace", company: result.company, notice: `${result.summary} Undo is available.` });
    } catch (reason) {
      dispatch({ type: "notice", notice: reason instanceof Error ? reason.message : "Import failed" });
    }
  }

  const paletteCommands = useMemo<PaletteCommand[]>(() => [
    { id: "new-mission", label: "New mission", group: "Create", run: () => setMissionOpen(true) },
    { id: "new-agent", label: "New agent", group: "Create", run: addAgent },
    { id: "import", label: "Import .agentpack", group: "Create", run: () => importRef.current?.click() },
    ...(["agentpack", "codex", "claude", "docker"] as HostTarget[]).map((target) => ({ id: `export-${target}`, label: `Export company: ${targetName[target]}`, group: "Export", run: () => void exportPackage(state.company, target) })),
    { id: "runner", label: "Connect local runner", group: "Runtime", run: () => setRunnerOpen(true) },
  ], [addAgent, state.company]);

  const issues = useMemo(() => validateCompany(state.company), [state.company]);

  return (
    <div className={`studio-shell ${state.selection ? "with-inspector" : ""} ${drawer ? "drawer-open" : ""} ${collapsed ? "nav-collapsed" : ""}`}>
      <header className="shell-bar">
        <button className="icon-button drawer-toggle" aria-label="Open navigation" onClick={() => setDrawer(!drawer)}><SquaresFour /></button>
        <CompanySwitcher onImport={() => importRef.current?.click()} />
        <button className="command-button" onClick={() => setPaletteOpen(true)}><MagnifyingGlass /><span>Search</span><kbd>⌘K</kbd></button>
        <div className="top-actions">
          <button className="icon-button" title="Undo (⌘Z)" aria-label="Undo" disabled={!state.past.length} onClick={() => dispatch({ type: "undo" })}><ArrowUUpLeft /></button>
          <button className="icon-button" title="Redo (⇧⌘Z)" aria-label="Redo" disabled={!state.future.length} onClick={() => dispatch({ type: "redo" })}><ArrowUUpRight /></button>
          <button className={`runner-button ${paired ? "online" : runner ? "found" : ""}`} onClick={() => setRunnerOpen(true)}><i /><span>{paired ? "Runner live" : runner ? "Pair runner" : "Runner offline"}</span></button>
          <ExportMenu />
        </div>
      </header>
      <div className="shell-body">
        <aside className="sidebar">
          <button className="nav-new" data-tip="New mission" aria-label="New mission" onClick={() => { setMissionOpen(true); setDrawer(false); }}><Plus /><span className="nav-label">New mission</span></button>
          <nav aria-label="Studio navigation">
            {navGroups.map((group, index) => (
              <div className="nav-group" key={index}>
                {group.label && <h3>{group.label}</h3>}
                {group.items.map((item) => {
                  const active = item.id === "office" ? state.view === "office" : state.view === "operations" && state.section === item.id;
                  const errorCount = issues.filter((issue) => issue.level === "error").length;
                  return (
                    <button key={item.id} className={active ? "active" : ""} data-tip={item.label} aria-label={item.label} aria-current={active ? "page" : undefined} onClick={() => { dispatch(item.id === "office" ? { type: "view", view: "office" } : { type: "section", section: item.id }); setDrawer(false); }}>
                      <item.icon /><span className="nav-label">{item.label}</span>
                      {item.id === "agents" && <em>{state.company.agents.length}</em>}
                      {item.id === "activity" && errorCount > 0 && <em className="alert">{errorCount}</em>}
                    </button>
                  );
                })}
              </div>
            ))}
            {state.company.teams.length > 0 && (
              <div className="nav-group nav-teams">
                <h3>Teams</h3>
                {state.company.teams.map((team) => (
                  <button key={team.id} className={state.selection?.kind === "team" && state.selection.id === team.id ? "active" : ""} onClick={() => { dispatch({ type: "select", selection: { kind: "team", id: team.id } }); setDrawer(false); }}>
                    <span className="team-dot">{team.name.charAt(0).toUpperCase()}</span><span className="nav-label">{team.name}</span>
                  </button>
                ))}
              </div>
            )}
          </nav>
          <button className="nav-toggle" data-tip="Expand" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>
            <SidebarSimple /><span className="nav-label">Collapse</span><kbd className="nav-label">[</kbd>
          </button>
        </aside>
        <main className="studio-main">
          <div className="work-area" id="workspace">
            {state.view === "office"
              ? <OfficeView runnerOnline={Boolean(runner)} paired={paired} onOpenRunner={() => setRunnerOpen(true)} onNewMission={() => setMissionOpen(true)} onRunMission={runMission} />
              : state.section === "tools" ? <ToolsView />
                : state.section === "deployments" ? <DeploymentView />
                  : state.section === "activity" ? <ActivityView />
                    : <OperationsView onNewMission={() => setMissionOpen(true)} onAddAgent={addAgent} onRunMission={runMission} />}
          </div>
        </main>
        <Inspector token={token} paired={paired} onRunMission={runMission} />
      </div>
      {drawer && <button className="drawer-scrim" aria-label="Close navigation" onClick={() => setDrawer(false)} />}
      <RunnerDialog open={runnerOpen} onOpenChange={setRunnerOpen} runner={runner} paired={paired} onPair={pair} />
      <MissionDialog key={missionOpen ? "open" : "closed"} open={missionOpen} onOpenChange={setMissionOpen} paired={paired} onRun={runMission} onNeedRunner={() => setRunnerOpen(true)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} extra={paletteCommands} />
      <input ref={importRef} type="file" accept=".zip,.agentpack" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} />
      {state.notice && <div className="toast" role="status"><CheckCircle /><span>{state.notice}</span><button aria-label="Dismiss" onClick={() => dispatch({ type: "notice" })}><X /></button></div>}
    </div>
  );
}

function CompanySwitcher({ onImport }: { onImport: () => void }) {
  const { state, dispatch } = useStudio();
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; agents: number }>>([]);
  return (
    <DropdownMenu.Root onOpenChange={(open) => { if (open) void listCompanies().then(setCompanies); }}>
      <DropdownMenu.Trigger asChild>
        <button className="company-switcher"><span className="logo-mark">{state.company.name.trim().charAt(0).toUpperCase() || "A"}</span><b>{state.company.name}</b><CaretDown /></button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu-content" side="bottom" align="start" sideOffset={6}>
          {companies.map((company) => (
            <DropdownMenu.Item key={company.id} onSelect={() => { if (company.id !== state.company.id) void switchCompany(company.id).then((next) => next && dispatch({ type: "company.create", company: next })); }}>
              <Buildings /><span>{company.name}</span>{company.id === state.company.id && <CheckCircle className="menu-check" />}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="menu-separator" />
          <DropdownMenu.Item onSelect={onImport}><FileArrowUp /><span>Import .agentpack</span></DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => dispatch({ type: "company.close" })}><Plus /><span>New company</span></DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ExportMenu() {
  const { state } = useStudio();
  const selection = state.selection;
  const scopes: Array<{ scope: PackScope; label: string }> = [{ scope: { kind: "company" }, label: "Whole company" }];
  if (selection?.kind === "agent") scopes.push({ scope: { kind: "agent", id: selection.id }, label: `Agent: ${state.company.agents.find((agent) => agent.id === selection.id)?.title ?? ""}` });
  if (selection?.kind === "team") scopes.push({ scope: { kind: "team", id: selection.id }, label: `Team: ${state.company.teams.find((team) => team.id === selection.id)?.name ?? ""}` });
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild><button className="button primary export-button"><DownloadSimple /> <span>Export</span></button></DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu-content" align="end" sideOffset={8}>
          {scopes.map(({ scope, label }) => (
            <DropdownMenu.Group key={label}>
              <DropdownMenu.Label>{label}</DropdownMenu.Label>
              {(["agentpack", "codex", "claude", "docker"] as HostTarget[]).map((target) => {
                const report = compatibility(state.company, target);
                return (
                  <DropdownMenu.Item key={target} onSelect={() => void exportPackage(state.company, target, scope)}>
                    <PackageIcon target={target} /><span>{targetName[target]}</span>
                    {report.degraded.length + report.unsupported.length > 0 && <Tag tone="warning" dot={false}>{report.degraded.length + report.unsupported.length}</Tag>}
                  </DropdownMenu.Item>
                );
              })}
            </DropdownMenu.Group>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function PackageIcon({ target }: { target: HostTarget }) { return target === "docker" ? <Cube /> : target === "agentpack" ? <Graph /> : <Robot />; }

function RunnerDialog({ open, onOpenChange, runner, paired, onPair }: { open: boolean; onOpenChange: (open: boolean) => void; runner: RunnerHealth | null; paired: boolean; onPair: (code: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  async function submit() { try { await onPair(code.trim()); setError(""); setCode(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not pair"); } }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card" aria-describedby={undefined}>
          <header className="dialog-head"><Dialog.Title>Local runner</Dialog.Title><Dialog.Close className="icon-button ghost" aria-label="Close"><X /></Dialog.Close></header>
          <dl className="status-list">
            <div><dt>Status</dt><dd>{runner ? <Tag tone={paired ? "success" : "warning"}>{paired ? "Paired" : "Found, not paired"}</Tag> : <Tag tone="critical">Not detected</Tag>}</dd></div>
            {runner && <><div><dt>OpenAI</dt><dd><Tag tone={runner.providers.openai ? "success" : "neutral"}>{runner.providers.openai ? "Ready" : "No key"}</Tag></dd></div><div><dt>Anthropic</dt><dd><Tag tone={runner.providers.anthropic ? "success" : "neutral"}>{runner.providers.anthropic ? "Ready" : "No key"}</Tag></dd></div></>}
          </dl>
          {!runner && <pre className="command-line">OPENAI_API_KEY=… ANTHROPIC_API_KEY=… npm run runner</pre>}
          {runner && !paired && (
            <>
              <label>Pairing code<input autoFocus inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} onKeyDown={(event) => { if (event.key === "Enter" && code.length === 6) void submit(); }} placeholder="6 digits from the runner terminal" /></label>
              {error && <p className="form-error">{error}</p>}
              <button className="button primary full" disabled={code.length !== 6} onClick={submit}>Pair this browser</button>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MissionDialog({ open, onOpenChange, paired, onRun, onNeedRunner }: { open: boolean; onOpenChange: (open: boolean) => void; paired: boolean; onRun: (mission: MissionSpec) => void; onNeedRunner: () => void }) {
  const { state, dispatch } = useStudio();
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [context, setContext] = useState("");
  const [artifacts, setArtifacts] = useState("Final recommendation");
  const [budget, setBudget] = useState(60000);
  const defaultAssignee = state.selection?.kind === "agent" || state.selection?.kind === "team" ? `${state.selection.kind}:${state.selection.id}` : state.company.teams[0] ? `team:${state.company.teams[0].id}` : state.company.agents[0] ? `agent:${state.company.agents[0].id}` : "";
  const [assignee, setAssignee] = useState(defaultAssignee);

  function create(run: boolean) {
    const [assigneeType, assigneeId] = assignee.split(":") as ["agent" | "team", string];
    const now = new Date().toISOString();
    const mission: MissionSpec = { id: crypto.randomUUID(), title: title.trim() || "Untitled mission", objective: objective.trim(), assigneeType, assigneeId, context, artifacts: artifacts.split("\n").map((item) => item.trim()).filter(Boolean), budget: { maxTokens: budget }, status: "draft", createdAt: now, updatedAt: now };
    dispatch({ type: "mission.add", mission });
    onOpenChange(false);
    setTitle(""); setObjective(""); setContext("");
    if (run) { if (paired) onRun(mission); else onNeedRunner(); }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card mission-dialog" aria-describedby={undefined}>
          <header className="dialog-head"><Dialog.Title>New mission</Dialog.Title><Dialog.Close className="icon-button ghost" aria-label="Close"><X /></Dialog.Close></header>
          <label>Title<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Prepare our Q1 product launch" /></label>
          <label>Objective<textarea rows={3} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="What must be true when the work is done?" /></label>
          <label>Assign to
            <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
              <optgroup label="Teams">{state.company.teams.map((team) => <option key={team.id} value={`team:${team.id}`}>{team.name}</option>)}</optgroup>
              <optgroup label="Agents">{state.company.agents.map((agent) => <option key={agent.id} value={`agent:${agent.id}`}>{agent.title} · {agent.name}</option>)}</optgroup>
            </select>
          </label>
          <label>Context<textarea rows={2} value={context} onChange={(event) => setContext(event.target.value)} placeholder="Evidence, constraints, links" /></label>
          <div className="two-fields">
            <label>Artifacts<textarea rows={2} value={artifacts} onChange={(event) => setArtifacts(event.target.value)} /></label>
            <label>Token budget<input type="number" min={1000} step={1000} value={budget} onChange={(event) => setBudget(Number(event.target.value) || 1000)} /></label>
          </div>
          <div className="dialog-actions">
            <button className="button" disabled={!objective.trim() || !assignee} onClick={() => create(false)}>Save draft</button>
            <button className="button primary" disabled={!objective.trim() || !assignee} onClick={() => create(true)}><Play /> {paired ? "Start mission" : "Save and pair runner"}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ToolsView() {
  const { state } = useStudio();
  return (
    <section className="operations-page">
      <PageHeader title="Tools and permissions" />
      <div className="table-panel">
        <table>
          <thead><tr><th>Tool</th><th>Transport</th><th>Capabilities</th><th>Approval</th><th>Agents</th><th>Status</th></tr></thead>
          <tbody>
            {state.company.tools.map((tool) => (
              <tr key={tool.id}>
                <td><div className="table-person"><span className="tool-glyph"><Wrench /></span><div><b>{tool.name}</b></div></div></td>
                <td>{tool.command ? "MCP stdio" : tool.url ? "MCP HTTP" : tool.transport.toUpperCase()}</td>
                <td>{tool.capabilities.join(", ")}</td>
                <td className="capitalize">{tool.approval === "writes" ? "Before writes" : tool.approval}</td>
                <td>{state.company.agents.filter((agent) => agent.toolIds.includes(tool.id)).length}</td>
                <td><Tag tone={tool.enabled ? "success" : "neutral"}>{tool.enabled ? "Declared" : "Disabled"}</Tag></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="message-strip"><WarningCircle /><span>Credentials are never packaged. Exports contain declarations only.</span></div>
    </section>
  );
}

function DeploymentView() {
  const { state } = useStudio();
  return (
    <section className="operations-page">
      <PageHeader title="Deployments" />
      <div className="deployment-grid">
        {(["agentpack", "codex", "claude", "docker"] as HostTarget[]).map((target) => {
          const report = compatibility(state.company, target);
          return (
            <article className="deployment-card" key={target}>
              <header><span className="deployment-icon"><PackageIcon target={target} /></span><h2>{targetName[target]}</h2></header>
              <div className="deployment-counts">
                <Tag tone="success">{report.supported.length} supported</Tag>
                {report.degraded.length > 0 && <Tag tone="warning">{report.degraded.length} degraded</Tag>}
                {report.unsupported.length > 0 && <Tag tone="critical">{report.unsupported.length} unsupported</Tag>}
              </div>
              <ul className="compat-list">
                {report.supported.map((item) => <li key={item} className="good"><CheckCircle />{item}</li>)}
                {report.degraded.map((item) => <li key={item} className="warn"><WarningCircle />{item}</li>)}
                {report.unsupported.map((item) => <li key={item} className="bad"><X />{item}</li>)}
              </ul>
              <button className="button full" onClick={() => void exportPackage(state.company, target)}><DownloadSimple /> Export</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ActivityView() {
  const { state, dispatch } = useStudio();
  const issues = validateCompany(state.company);
  const events = [...state.traces].reverse().slice(0, 200);
  return (
    <section className="operations-page">
      <PageHeader title="Activity" />
      <div className="dashboard-grid">
        <article className="panel">
          <header><h2>Runner events</h2></header>
          {events.length === 0 ? <p className="panel-empty">No events yet</p> : (
            <ol className="trace-list activity-trace">
              {events.map((event) => {
                const agent = state.company.agents.find((item) => item.id === event.agentId);
                const mission = state.company.missions.find((item) => item.id === event.missionId);
                return <li key={event.id}><i className={`trace-icon ${event.type.replace(".", "-")}`} /><div><b>{event.message}</b><small>{mission?.title ?? "Mission"}{agent ? ` · ${agent.title}` : ""} · <time>{new Date(event.timestamp).toLocaleTimeString()}</time></small></div></li>;
              })}
            </ol>
          )}
        </article>
        <article className="panel">
          <header><h2>Validation</h2><Tag tone={issues.length ? "warning" : "success"}>{issues.length || "Clear"}</Tag></header>
          <ul className="issue-list">
            {issues.length === 0 && <li className="good"><CheckCircle /> Ready to export</li>}
            {issues.map((issue, index) => <li key={index} className={issue.level}><WarningCircle /><button onClick={() => issue.target && dispatch({ type: "select", selection: issue.target })}>{issue.message}</button></li>)}
          </ul>
        </article>
      </div>
    </section>
  );
}
