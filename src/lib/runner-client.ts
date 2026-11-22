import type { CompanySpec, MissionSpec, TraceEvent } from "./studio-types";

export const RUNNER_URL = "http://127.0.0.1:4317";
const TOKEN_KEY = "ai-office-runner-token";

export interface RunnerHealth {
  ok: boolean;
  version: string;
  paired: boolean;
  providers: { openai: boolean; anthropic: boolean };
}

export function runnerToken() {
  return typeof window === "undefined" ? "" : sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export function setRunnerToken(token: string) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

function headers(token?: string): Record<string, string> {
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export async function getRunnerHealth(token?: string): Promise<RunnerHealth> {
  const response = await fetch(`${RUNNER_URL}/v1/health`, { headers: headers(token) });
  if (!response.ok) throw new Error("Runner unavailable");
  return response.json();
}

export async function pairRunner(code: string): Promise<string> {
  const response = await fetch(`${RUNNER_URL}/v1/pair`, { method: "POST", headers: headers(), body: JSON.stringify({ code }) });
  if (!response.ok) throw new Error("Pairing code was not accepted");
  return (await response.json()).token;
}

export async function startMission(company: CompanySpec, mission: MissionSpec, token: string) {
  const response = await fetch(`${RUNNER_URL}/v1/missions`, { method: "POST", headers: headers(token), body: JSON.stringify({ company, mission }) });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Mission could not start");
  return response.json();
}

export async function missionAction(missionId: string, action: "approve" | "reject" | "cancel", token: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`${RUNNER_URL}/v1/missions/${encodeURIComponent(missionId)}/${action}`, { method: "POST", headers: headers(token), body: JSON.stringify(body) });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `Could not ${action} mission`);
  return response.json();
}

export function subscribeToRunner(token: string, onEvent: (event: TraceEvent) => void, onStatus?: (open: boolean) => void) {
  let socket: WebSocket | null = null;
  let closed = false;
  let retry: number | undefined;
  const connect = () => {
    socket = new WebSocket(`ws://127.0.0.1:4317/v1/events?token=${encodeURIComponent(token)}`);
    socket.onopen = () => onStatus?.(true);
    socket.onmessage = (event) => { try { onEvent(JSON.parse(event.data)); } catch { /* ignore malformed frames */ } };
    socket.onclose = () => { onStatus?.(false); if (!closed) retry = window.setTimeout(connect, 3000); };
  };
  connect();
  return () => { closed = true; window.clearTimeout(retry); socket?.close(); };
}
