"use client";

import type { ReactNode } from "react";
import { Columns, Rows } from "@phosphor-icons/react";
import type { AgentState, MissionSpec } from "@/lib/studio-types";

export type Tone = "neutral" | "accent" | "success" | "warning" | "critical";

export function Tag({ tone = "neutral", children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return <span className={`tag tone-${tone}${dot ? " with-dot" : ""}`}>{children}</span>;
}

export const missionTone: Record<MissionSpec["status"], Tone> = {
  draft: "neutral", queued: "accent", running: "accent", waiting: "warning", completed: "success", failed: "critical", cancelled: "neutral",
};

export const stateTone: Record<AgentState, Tone> = { idle: "success", working: "accent", waiting: "warning", review: "accent", blocked: "critical" };
export const stateName: Record<AgentState, string> = { idle: "Available", working: "Working", waiting: "Waiting", review: "In review", blocked: "Blocked" };

export function PageHeader({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return <div className="page-heading"><h1>{title}</h1>{count !== undefined && <span className="count">{count}</span>}{children && <div className="heading-actions">{children}</div>}</div>;
}

export type ViewMode = "list" | "board";

export function ViewSwitch({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="view-switch" role="group" aria-label="Layout">
      <button className={value === "list" ? "active" : ""} aria-pressed={value === "list"} title="List" aria-label="List" onClick={() => onChange("list")}><Rows /></button>
      <button className={value === "board" ? "active" : ""} aria-pressed={value === "board"} title="Board" aria-label="Board" onClick={() => onChange("board")}><Columns /></button>
    </div>
  );
}

export interface TabItem<T extends string> { id: T; label: string; count?: number }

export function TabBar<T extends string>({ tabs, value, onChange, label }: { tabs: Array<TabItem<T>>; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div className="tab-bar" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button key={tab.id} role="tab" aria-selected={tab.id === value} className={tab.id === value ? "active" : ""} onClick={() => onChange(tab.id)}>
          {tab.label}{tab.count !== undefined && <span className="count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Kpi({ label, value, unit, tag, children, onClick }: { label: string; value: ReactNode; unit?: string; tag?: { tone: Tone; text: string }; children?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value"><strong>{value}</strong>{unit && <em>{unit}</em>}{tag && <span className={`delta tone-${tag.tone}`}>{tag.text}</span>}</span>
      {children}
    </>
  );
  return onClick ? <button className="kpi" onClick={onClick}>{body}</button> : <div className="kpi">{body}</div>;
}
