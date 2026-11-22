import type { AgentState, TraceEvent } from "./studio-types";

/** Agent states implied by a mission's trace up to and including `index`. */
export function statesAt(events: TraceEvent[], index: number): Record<string, AgentState> {
  const states: Record<string, AgentState> = {};
  for (const event of events.slice(0, index + 1)) {
    const from = typeof event.payload?.from === "string" ? event.payload.from : undefined;
    const to = typeof event.payload?.to === "string" ? event.payload.to : undefined;
    switch (event.type) {
      case "agent.started":
      case "tool.requested": if (event.agentId) states[event.agentId] = "working"; break;
      case "agent.handoff": if (from) states[from] = "waiting"; if (to) states[to] = "working"; break;
      case "approval.required": if (event.agentId) states[event.agentId] = "waiting"; break;
      case "artifact.created": if (event.agentId) states[event.agentId] = "review"; break;
      case "agent.completed": if (event.agentId) states[event.agentId] = "idle"; break;
      case "mission.completed":
      case "mission.failed":
      case "mission.cancelled": Object.keys(states).forEach((id) => { states[id] = "idle"; }); break;
      default: break;
    }
  }
  return states;
}

export function effectFor(event: TraceEvent) {
  const from = typeof event.payload?.from === "string" ? event.payload.from : undefined;
  const to = typeof event.payload?.to === "string" ? event.payload.to : undefined;
  if (event.type === "agent.handoff" && from && to) return { type: "handoff" as const, from, to };
  if (event.type === "tool.requested" && event.agentId) return { type: "tool" as const, agentId: event.agentId };
  if (event.type === "artifact.created" && event.agentId) return { type: "artifact" as const, agentId: event.agentId };
  if (event.type === "mission.completed" && event.agentId) return { type: "complete" as const, agentId: event.agentId };
  if (event.type === "mission.failed" && event.agentId) return { type: "fail" as const, agentId: event.agentId };
  return null;
}
