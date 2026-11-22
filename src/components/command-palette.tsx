"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AgentAvatar } from "./agent-avatar";
import { useStudio, type Section } from "@/lib/studio-store";

export interface PaletteCommand { id: string; label: string; group: string; hint?: string; run: () => void; avatar?: React.ReactNode }

export function CommandPalette({ open, onOpenChange, extra }: { open: boolean; onOpenChange: (open: boolean) => void; extra: PaletteCommand[] }) {
  const { state, dispatch } = useStudio();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const commands = useMemo<PaletteCommand[]>(() => {
    const sections: Array<[Section, string]> = [["overview", "Company overview"], ["agents", "Agents"], ["teams", "Teams"], ["missions", "Missions"], ["tools", "Tools"], ["deployments", "Deployments"], ["activity", "Activity"]];
    return [
      ...extra,
      ...sections.map(([section, label]) => ({ id: `go-${section}`, label: `Go to ${label}`, group: "Navigate", run: () => dispatch({ type: "section", section }) })),
      { id: "office", label: "Open 2D office", group: "Navigate", hint: "G O", run: () => dispatch({ type: "view", view: "office" }) },
      { id: "undo", label: "Undo", group: "Edit", hint: "⌘Z", run: () => dispatch({ type: "undo" }) },
      { id: "redo", label: "Redo", group: "Edit", hint: "⇧⌘Z", run: () => dispatch({ type: "redo" }) },
      ...state.company.agents.map((agent) => ({ id: `agent-${agent.id}`, label: `${agent.title} · ${agent.name}`, group: "Agents", avatar: <AgentAvatar appearance={agent.appearance} size={20} />, run: () => dispatch({ type: "select", selection: { kind: "agent", id: agent.id } }) })),
      ...state.company.teams.map((team) => ({ id: `team-${team.id}`, label: team.name, group: "Teams", run: () => dispatch({ type: "select", selection: { kind: "team", id: team.id } }) })),
      ...state.company.missions.map((mission) => ({ id: `mission-${mission.id}`, label: mission.title, group: "Missions", hint: mission.status, run: () => dispatch({ type: "select", selection: { kind: "mission", id: mission.id } }) })),
    ];
  }, [extra, state.company, dispatch]);

  const filtered = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter((command) => terms.every((term) => `${command.label} ${command.group}`.toLowerCase().includes(term))).slice(0, 40);
  }, [commands, query]);

  const current = Math.min(active, Math.max(0, filtered.length - 1));

  function setOpen(next: boolean) {
    if (!next) { setQuery(""); setActive(0); }
    onOpenChange(next);
  }

  function run(command: PaletteCommand | undefined) {
    if (!command) return;
    setOpen(false);
    command.run();
  }

  let lastGroup = "";
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="palette" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="palette-input">
            <MagnifyingGlass />
            <input
              autoFocus
              value={query}
              placeholder="Search agents, teams, missions, or run a command"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-list"
              aria-activedescendant={filtered[current] ? `cmd-${filtered[current].id}` : undefined}
              onChange={(event) => { setQuery(event.target.value); setActive(0); }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") { event.preventDefault(); setActive(Math.min(filtered.length - 1, current + 1)); }
                if (event.key === "ArrowUp") { event.preventDefault(); setActive(Math.max(0, current - 1)); }
                if (event.key === "Enter") { event.preventDefault(); run(filtered[current]); }
              }}
            />
          </div>
          <ul id="palette-list" role="listbox" className="palette-list">
            {filtered.length === 0 && <li className="palette-empty">No matches</li>}
            {filtered.map((command, index) => {
              const header = command.group !== lastGroup ? command.group : null;
              lastGroup = command.group;
              return (
                <li key={command.id} role="presentation">
                  {header && <div className="palette-group">{header}</div>}
                  <button id={`cmd-${command.id}`} role="option" aria-selected={index === current} className={index === current ? "active" : ""} onMouseEnter={() => setActive(index)} onClick={() => run(command)}>
                    {command.avatar}<span>{command.label}</span>{command.hint && <kbd>{command.hint}</kbd>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
