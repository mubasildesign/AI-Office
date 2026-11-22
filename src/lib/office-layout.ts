import type { DepartmentId } from "./studio-types";

export const TILE = 16;
export const COLS = 44;
export const ROWS = 26;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export type ZoneId = DepartmentId | "lounge" | "meeting" | "deploy" | "corridor";

export interface Zone {
  id: ZoneId;
  name: string;
  caption: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const zones: Zone[] = [
  { id: "executive", name: "Leadership", caption: "Strategy and direction", x: 1, y: 2, w: 14, h: 10 },
  { id: "product", name: "Product studio", caption: "Research, product, design", x: 15, y: 2, w: 12, h: 10 },
  { id: "operations", name: "People + Ops", caption: "Company operations", x: 27, y: 2, w: 9, h: 10 },
  { id: "lounge", name: "Lounge", caption: "Coffee and breaks", x: 36, y: 2, w: 7, h: 10 },
  { id: "engineering", name: "Engineering", caption: "Build and quality", x: 1, y: 14, w: 14, h: 11 },
  { id: "revenue", name: "Go to market", caption: "Growth and customers", x: 15, y: 14, w: 12, h: 11 },
  { id: "meeting", name: "Team room", caption: "Seat agents to form a team", x: 27, y: 14, w: 9, h: 11 },
  { id: "deploy", name: "Deployment bay", caption: "Runner and exports", x: 36, y: 14, w: 7, h: 11 },
];

export const departmentZones: DepartmentId[] = ["executive", "product", "operations", "engineering", "revenue"];

export interface Seat {
  id: string;
  zone: ZoneId;
  tx: number;
  ty: number;
  facing: "down" | "up";
  kind: "desk" | "meeting" | "lounge";
}

function deskSeats(zone: DepartmentId, columns: number[], rows: number[]): Seat[] {
  const seats: Seat[] = [];
  rows.forEach((ty) => columns.forEach((tx) => seats.push({ id: `${zone}:${seats.length}`, zone, tx, ty, facing: "down", kind: "desk" })));
  return seats;
}

const topRows = [4, 7, 10];
const bottomRows = [16, 19, 22];

export const deskSeatsByZone: Record<DepartmentId, Seat[]> = {
  executive: deskSeats("executive", [3, 6, 9, 12], topRows),
  product: deskSeats("product", [17, 20, 23], topRows),
  operations: deskSeats("operations", [29, 32], topRows),
  engineering: deskSeats("engineering", [3, 6, 9, 12], bottomRows),
  revenue: deskSeats("revenue", [17, 20, 23], bottomRows),
};

export const meetingSeats: Seat[] = [
  ...[29, 30, 31, 32, 33].map((tx, index) => ({ id: `meeting:${index}`, zone: "meeting" as const, tx, ty: 17, facing: "down" as const, kind: "meeting" as const })),
  ...[29, 30, 31, 32, 33].map((tx, index) => ({ id: `meeting:${index + 5}`, zone: "meeting" as const, tx, ty: 21, facing: "up" as const, kind: "meeting" as const })),
  { id: "meeting:10", zone: "meeting", tx: 28, ty: 19, facing: "down", kind: "meeting" },
  { id: "meeting:11", zone: "meeting", tx: 34, ty: 19, facing: "down", kind: "meeting" },
];

export const loungeSpots: Seat[] = [
  { id: "lounge:0", zone: "lounge", tx: 37, ty: 3, facing: "up", kind: "lounge" },
  { id: "lounge:1", zone: "lounge", tx: 40, ty: 3, facing: "up", kind: "lounge" },
  { id: "lounge:2", zone: "lounge", tx: 38, ty: 7, facing: "down", kind: "lounge" },
  { id: "lounge:3", zone: "lounge", tx: 41, ty: 7, facing: "down", kind: "lounge" },
  { id: "lounge:4", zone: "lounge", tx: 37, ty: 10, facing: "up", kind: "lounge" },
  { id: "lounge:5", zone: "lounge", tx: 41, ty: 10, facing: "up", kind: "lounge" },
];

export const allDeskSeats: Seat[] = Object.values(deskSeatsByZone).flat();
const seatIndex = new Map([...allDeskSeats, ...meetingSeats, ...loungeSpots].map((seat) => [seat.id, seat]));

export function seatById(id: string | undefined) {
  return id ? seatIndex.get(id) : undefined;
}

export function zoneAt(tx: number, ty: number): Zone | undefined {
  return zones.find((zone) => tx >= zone.x && tx < zone.x + zone.w && ty >= zone.y && ty < zone.y + zone.h);
}

/** First free desk in a department, preferring `preferred` when it is free. */
export function freeDeskIn(department: DepartmentId, taken: Iterable<string>, preferred?: string) {
  const used = new Set(taken);
  if (preferred && preferred.startsWith(`${department}:`) && !used.has(preferred)) return preferred;
  return deskSeatsByZone[department].find((seat) => !used.has(seat.id))?.id ?? deskSeatsByZone[department][0].id;
}

export interface Blocker { tx: number; ty: number; w: number; h: number }

/** Furniture and walls that people cannot walk through. */
export const blockers: Blocker[] = [
  // Outer walls
  { tx: 0, ty: 0, w: COLS, h: 2 },
  { tx: 0, ty: ROWS - 1, w: COLS, h: 1 },
  { tx: 0, ty: 0, w: 1, h: ROWS },
  { tx: COLS - 1, ty: 0, w: 1, h: ROWS },
  // Desks sit one row in front of every chair
  ...allDeskSeats.map((seat) => ({ tx: seat.tx, ty: seat.ty + 1, w: 1, h: 1 })),
  // Lounge kitchen counter, fridge, sofa, cafe table
  { tx: 36, ty: 2, w: 7, h: 1 },
  { tx: 38, ty: 9, w: 3, h: 1 },
  { tx: 39, ty: 6, w: 1, h: 1 },
  { tx: 42, ty: 5, w: 1, h: 1 },
  // Meeting room glass walls with a door at x=31, and the table
  { tx: 27, ty: 14, w: 4, h: 1 },
  { tx: 32, ty: 14, w: 4, h: 1 },
  { tx: 27, ty: 15, w: 1, h: 10 },
  { tx: 35, ty: 15, w: 1, h: 10 },
  { tx: 29, ty: 18, w: 5, h: 3 },
  // Deployment bay wall with a door at x=39, racks and console
  { tx: 36, ty: 14, w: 3, h: 1 },
  { tx: 40, ty: 14, w: 3, h: 1 },
  { tx: 37, ty: 16, w: 5, h: 1 },
  { tx: 37, ty: 19, w: 5, h: 1 },
  { tx: 38, ty: 22, w: 3, h: 1 },
  // Bookshelves and plants against the walls
  { tx: 1, ty: 2, w: 2, h: 1 },
  { tx: 14, ty: 2, w: 1, h: 1 },
  { tx: 26, ty: 2, w: 1, h: 1 },
  { tx: 1, ty: 24, w: 1, h: 1 },
  { tx: 26, ty: 24, w: 1, h: 1 },
];

let walkGrid: boolean[][] | null = null;

export function walkable(): boolean[][] {
  if (walkGrid) return walkGrid;
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => true));
  for (const block of blockers) {
    for (let y = block.ty; y < block.ty + block.h; y += 1) for (let x = block.tx; x < block.tx + block.w; x += 1) if (grid[y]?.[x] !== undefined) grid[y][x] = false;
  }
  walkGrid = grid;
  return grid;
}

let costGrid: number[][] | null = null;

/** People keep to corridors: crossing a department floor costs more, and walking through someone's seat costs most. */
function stepCosts(): number[][] {
  if (costGrid) return costGrid;
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 1));
  for (const zone of zones) {
    if (!departmentZones.includes(zone.id as DepartmentId)) continue;
    for (let y = zone.y; y < zone.y + zone.h; y += 1) for (let x = zone.x; x < zone.x + zone.w; x += 1) grid[y][x] = 2;
  }
  for (const seat of [...allDeskSeats, ...meetingSeats]) grid[seat.ty][seat.tx] = 8;
  costGrid = grid;
  return grid;
}

const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Least-cost path between tiles with a small turn penalty; returns the tile sequence excluding the start. */
export function findPath(from: { tx: number; ty: number }, to: { tx: number; ty: number }): Array<{ tx: number; ty: number }> {
  const grid = walkable();
  const costs = stepCosts();
  const start = { tx: Math.max(0, Math.min(COLS - 1, from.tx)), ty: Math.max(0, Math.min(ROWS - 1, from.ty)) };
  const target = to.ty * COLS + to.tx;
  const startTile = start.ty * COLS + start.tx;
  if (target === startTile) return [];
  // State = tile * 5 + heading (4 = no heading yet)
  const best = new Float64Array(ROWS * COLS * 5).fill(Infinity);
  const previous = new Int32Array(ROWS * COLS * 5).fill(-1);
  const heap: Array<[number, number]> = [];
  const push = (cost: number, state: number) => {
    heap.push([cost, state]);
    let i = heap.length - 1;
    while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent][0] <= heap[i][0]) break; [heap[parent], heap[i]] = [heap[i], heap[parent]]; i = parent; }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1, right = left + 1;
        let smallest = i;
        if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
        if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
      }
    }
    return top;
  };
  const startState = startTile * 5 + 4;
  best[startState] = 0;
  push(0, startState);
  let reached = -1;
  while (heap.length) {
    const [cost, state] = pop();
    if (cost > best[state]) continue;
    const tile = Math.floor(state / 5);
    if (tile === target) { reached = state; break; }
    const heading = state % 5;
    const x = tile % COLS, y = Math.floor(tile / COLS);
    directions.forEach(([dx, dy], dir) => {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return;
      const nextTile = ny * COLS + nx;
      if (!grid[ny][nx] && nextTile !== target) return;
      const step = (nextTile === target ? 1 : costs[ny][nx]) + (heading !== 4 && heading !== dir ? 0.4 : 0);
      const nextState = nextTile * 5 + dir;
      if (cost + step < best[nextState]) { best[nextState] = cost + step; previous[nextState] = state; push(cost + step, nextState); }
    });
  }
  if (reached < 0) return [to];
  const path: Array<{ tx: number; ty: number }> = [];
  for (let state = reached; state !== startState && state >= 0; state = previous[state]) {
    const tile = Math.floor(state / 5);
    path.unshift({ tx: tile % COLS, ty: Math.floor(tile / COLS) });
  }
  return path;
}
