"use client";

import { useRef, useState } from "react";
import { ArrowRight, Buildings, CloudArrowUp, Cube, FileArrowUp, Sparkle, SquaresFour, Users } from "@phosphor-icons/react";
import { AgentAvatar } from "./agent-avatar";
import { useAvatarGaze } from "./use-avatar-gaze";
import { useStudio } from "@/lib/studio-store";
import { blankCompany, seedCompany, startupCompany } from "@/lib/seed";
import { importPackage } from "@/lib/exporter";

const shots = [
  { id: "company", label: "Company", icon: SquaresFour, src: "/shots/company.png" },
  { id: "office", label: "2D office", icon: Buildings, src: "/shots/office.png" },
  { id: "agents", label: "Agent editor", icon: Users, src: "/shots/agents.png" },
  { id: "deploy", label: "Deployments", icon: CloudArrowUp, src: "/shots/deploy.png" },
] as const;

export function Onboarding() {
  const { state, dispatch } = useStudio();
  const [choice, setChoice] = useState<"startup" | "blank">("startup");
  const [name, setName] = useState("Northstar Studio");
  const [shot, setShot] = useState<(typeof shots)[number]["id"]>("office");
  const [error, setError] = useState(state.loadError ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  useAvatarGaze();

  const create = () => dispatch({ type: "company.create", company: choice === "startup" ? startupCompany(name) : blankCompany(name) });

  async function importFile(file: File) {
    try {
      const result = await importPackage(file, null);
      dispatch({ type: "company.create", company: result.company });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That package could not be imported.");
    }
  }

  const active = shots.find((item) => item.id === shot)!;

  return (
    <div className="landing">
      <header className="landing-bar">
        <div className="logo"><span className="logo-mark"><Cube /></span><b>AI Office</b></div>
        <button className="button" onClick={() => fileRef.current?.click()}><FileArrowUp /> Import .agentpack</button>
      </header>

      <section className="landing-hero">
        <h1>Build a company of agents</h1>
        <div className="landing-form">
          <div className="choice-grid" role="radiogroup" aria-label="Company template">
            <button role="radio" aria-checked={choice === "startup"} className={`choice ${choice === "startup" ? "on" : ""}`} onClick={() => { setChoice("startup"); if (!name.trim()) setName("Northstar Studio"); }}>
              <span className="choice-head"><Sparkle /><b>Full startup</b><Tag19 /></span>
              <span className="choice-avatars">{seedCompany.agents.slice(0, 10).map((agent) => <AgentAvatar key={agent.id} appearance={agent.appearance} size={30} />)}</span>
            </button>
            <button role="radio" aria-checked={choice === "blank"} className={`choice ${choice === "blank" ? "on" : ""}`} onClick={() => setChoice("blank")}>
              <span className="choice-head"><Buildings /><b>Blank company</b></span>
              <span className="choice-empty">Start from an empty office</span>
            </button>
          </div>
          <div className="landing-row">
            <label className="field-label sr-only" htmlFor="company-name">Company name</label>
            <input id="company-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Company name" />
            <button className="button primary large" disabled={!name.trim()} onClick={create}>Create company <ArrowRight /></button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </section>

      <section className="showcase" aria-label="Product tour">
        <div className="showcase-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={active.src} src={active.src} alt={`${active.label} screen`} width={1440} height={900} />
        </div>
        <div className="showcase-tabs" role="tablist" aria-label="Product screens">
          {shots.map((item) => (
            <button key={item.id} role="tab" aria-selected={item.id === shot} className={item.id === shot ? "active" : ""} onClick={() => setShot(item.id)}><item.icon />{item.label}</button>
          ))}
        </div>
      </section>
      <input ref={fileRef} type="file" accept=".zip,.agentpack" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} />
    </div>
  );
}

function Tag19() { return <span className="tag tone-neutral">19 agents</span>; }
