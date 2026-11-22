import { Application, CanvasSource, Container, Graphics, Sprite, Texture } from "pixi.js";
import { TILE, WORLD_H, WORLD_W, allDeskSeats, findPath, loungeSpots, meetingSeats, seatById, walkable, zoneAt, zones, type Seat } from "@/lib/office-layout";
import type { AgentAppearance, AgentState, DepartmentId, MissionSpec } from "@/lib/studio-types";
import {
  paintBubble, paintCafeTable, paintChair, paintCharacter, paintConsole, paintDesk, paintFloorPlan, paintFolder, paintGlassWall,
  paintMeetingTable, paintPaper, paintPlant, paintRack, paintSofa, paintWaterCooler, type BubbleKind, type Facing, type Pose,
} from "./pixel-art";

export interface EngineAgent {
  id: string;
  state: AgentState;
  seat: string;
  appearance: AgentAppearance;
  missionStatus?: MissionSpec["status"];
}

export interface EngineInput {
  agents: EngineAgent[];
  meeting: string[];
  selectedId: string | null;
  runnerOnline: boolean;
}

export type DropTarget =
  | { kind: "desk"; seat: string; department: DepartmentId }
  | { kind: "zone"; department: DepartmentId }
  | { kind: "meeting" }
  | { kind: "lounge" }
  | null;

export type OfficeEffect =
  | { type: "handoff"; from: string; to: string }
  | { type: "artifact"; agentId: string }
  | { type: "complete"; agentId: string }
  | { type: "tool"; agentId: string }
  | { type: "fail"; agentId: string };

const SIT = 4;
const SPEED = 68;
const folderColors: Record<string, string> = { draft: "#c9ced8", queued: "#7ea2ff", running: "#2f5bea", waiting: "#f6bd1d", completed: "#3fb37a", failed: "#e9584b", cancelled: "#9aa4b2" };

function texture(canvas: HTMLCanvasElement) {
  return new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: "nearest" }) });
}

function seatPoint(seat: Seat) {
  return { x: seat.tx * TILE + 8, y: seat.ty * TILE + 15 + (seat.kind === "lounge" ? 0 : SIT) };
}

interface Walker {
  id: string;
  appearanceKey: string;
  appearance: AgentAppearance;
  root: Container;
  body: Sprite;
  shadow: Graphics;
  ring: Graphics;
  bubble: Sprite;
  textures: Map<string, Texture>;
  x: number;
  y: number;
  tile: { tx: number; ty: number };
  path: Array<{ x: number; y: number; tx: number; ty: number }>;
  facing: "down" | "up" | "left" | "right";
  mode: "sit" | "walk" | "held" | "stand";
  targetKey: string;
  state: AgentState;
  anim: number;
  blinkAt: number;
  blinkUntil: number;
  breakSpot?: Seat;
  breakUntil?: number;
  flash?: { kind: BubbleKind; until: number };
  overlay?: HTMLElement | null;
}

interface Desk { seat: Seat; glow: Graphics; folder: Sprite }
interface Effect { sprite: Container; start: number; duration: number; update: (progress: number) => void }

export class OfficeEngine {
  private app: Application;
  private host: HTMLElement;
  private overlayRoot: HTMLElement;
  private world = new Container();
  private actors = new Container();
  private highlight = new Graphics();
  private walkers = new Map<string, Walker>();
  private desks = new Map<string, Desk>();
  private leds: Array<{ g: Graphics; phase: number }> = [];
  private effects: Effect[] = [];
  private bubbles = new Map<BubbleKind, Texture>();
  private folders = new Map<string, Texture>();
  private paper!: Texture;
  private input: EngineInput = { agents: [], meeting: [], selectedId: null, runnerOnline: false };
  private hoverId: string | null = null;
  private scale = 1;
  private now = 0;
  private reduced = false;
  private observer: ResizeObserver;
  private destroyed = false;

  static async create(host: HTMLElement, overlayRoot: HTMLElement) {
    const app = new Application();
    const width = Math.max(320, host.clientWidth);
    await app.init({ width, height: Math.round((width * WORLD_H) / WORLD_W), backgroundAlpha: 0, antialias: false, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true, roundPixels: true });
    return new OfficeEngine(app, host, overlayRoot);
  }

  private constructor(app: Application, host: HTMLElement, overlayRoot: HTMLElement) {
    this.app = app;
    this.host = host;
    this.overlayRoot = overlayRoot;
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    app.canvas.setAttribute("aria-hidden", "true");
    app.canvas.classList.add("office-canvas");
    host.prepend(app.canvas);
    app.stage.addChild(this.world);
    this.buildWorld();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    app.ticker.add((ticker) => this.tick(ticker.deltaMS));
  }

  private buildWorld() {
    this.world.addChild(new Sprite(texture(paintFloorPlan())));
    this.actors.sortableChildren = true;
    this.world.addChild(this.actors);
    this.highlight.zIndex = 1;
    this.world.addChild(this.highlight);
    this.actors.zIndex = 2;
    this.world.sortableChildren = true;

    const add = (canvas: HTMLCanvasElement, x: number, y: number, z: number, anchorX = 0, anchorY = 0) => {
      const sprite = new Sprite(texture(canvas));
      sprite.anchor.set(anchorX, anchorY);
      sprite.position.set(x, y);
      sprite.zIndex = z;
      this.actors.addChild(sprite);
      return sprite;
    };

    const chair = paintChair();
    allDeskSeats.forEach((seat, index) => {
      const cx = seat.tx * TILE + 8;
      const top = seat.ty * TILE + 3;
      add(chair, cx, seat.ty * TILE + 12, seat.ty * TILE + 17, 0.5, 1);
      add(paintDesk(index), cx, top, seat.ty * TILE + 27, 0.5, 0);
      const glow = new Graphics().rect(cx - 15, top - 1, 13, 11).fill({ color: 0x7fe3ff });
      glow.blendMode = "add";
      glow.alpha = 0;
      glow.zIndex = seat.ty * TILE + 28;
      this.actors.addChild(glow);
      const folder = new Sprite(Texture.EMPTY);
      folder.position.set(cx + 4, top + 5);
      folder.zIndex = seat.ty * TILE + 28;
      folder.visible = false;
      this.actors.addChild(folder);
      this.desks.set(seat.id, { seat, glow, folder });
    });

    add(paintMeetingTable(), 29 * TILE - 2, 18 * TILE - 2, 21 * TILE, 0, 0);
    add(paintGlassWall(64), 27 * TILE, 15 * TILE, 15 * TILE, 0, 1);
    add(paintGlassWall(64), 32 * TILE, 15 * TILE, 15 * TILE, 0, 1);
    add(paintGlassWall(48, true), 36 * TILE, 15 * TILE, 15 * TILE, 0, 1);
    add(paintGlassWall(48, true), 40 * TILE, 15 * TILE, 15 * TILE, 0, 1);
    // Meeting room screen
    const screen = new Graphics().rect(30 * TILE - 4, 15 * TILE + 2, 40, 10).fill({ color: 0x1c2333 }).rect(30 * TILE - 2, 15 * TILE + 3, 36, 8).fill({ color: 0x3557c9 });
    screen.zIndex = 15 * TILE + 3;
    this.actors.addChild(screen);

    [16, 19].forEach((ty) => [37, 38, 39, 40, 41].forEach((tx, index) => {
      add(paintRack(), tx * TILE, (ty + 1) * TILE, (ty + 1) * TILE, 0, 1);
      for (let row = 0; row < 3; row += 1) {
        const g = new Graphics().rect(tx * TILE + 11, (ty - 1) * TILE + 5 + row * 8, 2, 1).fill({ color: 0xffffff });
        g.zIndex = (ty + 1) * TILE + 1;
        this.actors.addChild(g);
        this.leds.push({ g, phase: index * 0.7 + row * 1.3 + ty });
      }
    }));
    add(paintConsole(), 39 * TILE + 8, 23 * TILE + 4, 23 * TILE + 4, 0.5, 1);

    add(paintSofa(), 38 * TILE - 1, 10 * TILE + 4, 10 * TILE + 4, 0, 1);
    add(paintCafeTable(), 39 * TILE + 8, 7 * TILE + 2, 7 * TILE + 2, 0.5, 1);
    add(paintWaterCooler(), 42 * TILE + 8, 6 * TILE + 2, 6 * TILE + 2, 0.5, 1);
    add(paintPlant("tall"), 14 * TILE + 8, 3 * TILE + 2, 3 * TILE + 2, 0.5, 1);
    add(paintPlant("tall"), 26 * TILE + 8, 3 * TILE + 2, 3 * TILE + 2, 0.5, 1);
    add(paintPlant("small"), 1 * TILE + 8, 25 * TILE, 25 * TILE, 0.5, 1);
    add(paintPlant("small"), 26 * TILE + 8, 25 * TILE, 25 * TILE, 0.5, 1);

    (["dots1", "dots2", "dots3", "alert", "question", "blocked", "done", "coffee", "tool"] as BubbleKind[]).forEach((kind) => this.bubbles.set(kind, texture(paintBubble(kind))));
    Object.entries(folderColors).forEach(([status, color]) => this.folders.set(status, texture(paintFolder(color))));
    this.paper = texture(paintPaper());
  }

  /* ---------- Public API ---------- */

  sync(input: EngineInput) {
    if (this.destroyed) return;
    this.input = input;
    const seen = new Set<string>();
    for (const agent of input.agents) {
      seen.add(agent.id);
      let walker = this.walkers.get(agent.id);
      if (!walker) walker = this.createWalker(agent);
      const key = JSON.stringify(agent.appearance);
      if (key !== walker.appearanceKey) {
        walker.textures.forEach((item) => item.destroy(true));
        walker.textures.clear();
        walker.appearance = agent.appearance;
        walker.appearanceKey = key;
      }
      walker.state = agent.state;
      if (walker.mode !== "held") this.plan(walker);
    }
    for (const [id, walker] of this.walkers) {
      if (seen.has(id)) continue;
      walker.root.destroy({ children: true });
      walker.textures.forEach((item) => item.destroy(true));
      this.walkers.delete(id);
    }
    this.updateDesks();
  }

  bindOverlay(id: string, element: HTMLElement | null) {
    const walker = this.walkers.get(id);
    if (walker) walker.overlay = element;
    if (element && walker) this.placeOverlay(walker);
  }

  setHover(id: string | null) { this.hoverId = id; }

  /** World point for a viewport coordinate. */
  toWorld(clientX: number, clientY: number) {
    const rect = this.app.canvas.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * WORLD_W, y: ((clientY - rect.top) / rect.height) * WORLD_H };
  }

  dropTargetAt(clientX: number, clientY: number, agentId?: string): DropTarget {
    const { x, y } = this.toWorld(clientX, clientY);
    const zone = zoneAt(Math.floor(x / TILE), Math.floor(y / TILE));
    if (!zone) return null;
    if (zone.id === "meeting") return { kind: "meeting" };
    if (zone.id === "lounge") return { kind: "lounge" };
    if (zone.id === "deploy" || zone.id === "corridor") return null;
    const department = zone.id as DepartmentId;
    const taken = new Set(this.input.agents.filter((agent) => agent.id !== agentId).map((agent) => agent.seat));
    const near = allDeskSeats
      .filter((seat) => seat.zone === department)
      .map((seat) => ({ seat, d: Math.hypot(seat.tx * TILE + 8 - x, seat.ty * TILE + 10 - y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (near && near.d < 22 && !taken.has(near.seat.id)) return { kind: "desk", seat: near.seat.id, department };
    return { kind: "zone", department };
  }

  beginDrag(id: string) {
    const walker = this.walkers.get(id);
    if (!walker) return;
    walker.mode = "held";
    walker.path = [];
    walker.breakSpot = undefined;
  }

  dragTo(id: string, clientX: number, clientY: number) {
    const walker = this.walkers.get(id);
    if (!walker) return null;
    const point = this.toWorld(clientX, clientY);
    walker.x = Math.max(8, Math.min(WORLD_W - 8, point.x));
    walker.y = Math.max(28, Math.min(WORLD_H - 4, point.y + 12));
    const target = this.dropTargetAt(clientX, clientY, id);
    this.drawHighlight(target);
    return target;
  }

  endDrag(id: string) {
    this.drawHighlight(null);
    const walker = this.walkers.get(id);
    if (!walker) return;
    walker.tile = this.nearestWalkable(walker.x, walker.y);
    walker.mode = "stand";
    walker.targetKey = "";
    this.plan(walker);
  }

  coffeeBreak(id: string) {
    const walker = this.walkers.get(id);
    if (!walker || walker.mode === "held") return false;
    const used = new Set([...this.walkers.values()].map((item) => item.breakSpot?.id).filter(Boolean));
    const spot = loungeSpots.find((item) => !used.has(item.id));
    if (!spot) return false;
    walker.breakSpot = spot;
    walker.breakUntil = undefined;
    this.plan(walker);
    return true;
  }

  effect(effect: OfficeEffect) {
    if (this.destroyed) return;
    if (effect.type === "handoff") {
      const from = this.walkers.get(effect.from);
      const to = this.walkers.get(effect.to);
      if (!from || !to) return;
      const sprite = new Sprite(this.paper);
      sprite.anchor.set(0.5);
      sprite.zIndex = 10000;
      this.actors.addChild(sprite);
      const sx = from.x, sy = from.y - 20;
      this.effects.push({ sprite, start: this.now, duration: this.reduced ? 1 : 1000, update: (p) => {
        const ex = to.x, ey = to.y - 20;
        sprite.position.set(sx + (ex - sx) * p, sy + (ey - sy) * p - Math.sin(p * Math.PI) * 30);
        sprite.rotation = Math.sin(p * Math.PI * 4) * 0.2;
      } });
      to.flash = { kind: "alert", until: this.now + 1400 };
      return;
    }
    const walker = this.walkers.get(effect.agentId);
    if (!walker) return;
    if (effect.type === "tool") { walker.flash = { kind: "tool", until: this.now + 1800 }; return; }
    if (effect.type === "fail") { walker.flash = { kind: "blocked", until: this.now + 2200 }; return; }
    if (effect.type === "artifact") {
      const sprite = new Sprite(this.paper);
      sprite.anchor.set(0.5);
      sprite.zIndex = 10000;
      sprite.scale.set(1.4);
      this.actors.addChild(sprite);
      this.effects.push({ sprite, start: this.now, duration: 1600, update: (p) => { sprite.position.set(walker.x, walker.y - 26 - p * 22); sprite.alpha = 1 - Math.max(0, p - 0.6) / 0.4; } });
    }
    walker.flash = { kind: "done", until: this.now + 2000 };
    const burst = new Container();
    burst.zIndex = 10001;
    const colors = [0xffd166, 0x7fe3ff, 0xff8fb1, 0x9be7b6];
    const bits = Array.from({ length: 10 }, (_, index) => {
      const g = new Graphics().rect(0, 0, 2, 2).fill({ color: colors[index % colors.length] });
      burst.addChild(g);
      return { g, angle: (index / 10) * Math.PI * 2 };
    });
    this.actors.addChild(burst);
    this.effects.push({ sprite: burst, start: this.now, duration: 900, update: (p) => {
      bits.forEach(({ g, angle }) => g.position.set(walker.x + Math.cos(angle) * p * 18, walker.y - 22 + Math.sin(angle) * p * 14 + p * p * 10));
      burst.alpha = 1 - p;
    } });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer.disconnect();
    this.app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
  }

  /* ---------- Internals ---------- */

  private createWalker(agent: EngineAgent): Walker {
    const root = new Container();
    const shadow = new Graphics().ellipse(0, 0, 6, 2).fill({ color: 0x141828, alpha: 0.22 });
    const ring = new Graphics();
    const body = new Sprite(Texture.EMPTY);
    body.anchor.set(0.5, 1);
    const bubble = new Sprite(Texture.EMPTY);
    bubble.anchor.set(0.5, 1);
    bubble.position.set(0, -25);
    root.addChild(ring, shadow, body, bubble);
    this.actors.addChild(root);
    const seat = seatById(agent.seat) ?? allDeskSeats[0];
    const point = seatPoint(seat);
    const walker: Walker = {
      id: agent.id, appearanceKey: JSON.stringify(agent.appearance), appearance: agent.appearance, root, body, shadow, ring, bubble,
      textures: new Map(), x: point.x, y: point.y, tile: { tx: seat.tx, ty: seat.ty }, path: [], facing: seat.facing, mode: "sit",
      targetKey: seat.id, state: agent.state, anim: Math.random() * 1000, blinkAt: 1500 + Math.random() * 4000, blinkUntil: 0,
    };
    this.walkers.set(agent.id, walker);
    return walker;
  }

  private targetSeat(walker: Walker): Seat {
    const meetingIndex = this.input.meeting.indexOf(walker.id);
    if (meetingIndex >= 0) return meetingSeats[meetingIndex] ?? meetingSeats[0];
    if (walker.breakSpot) return walker.breakSpot;
    const agent = this.input.agents.find((item) => item.id === walker.id);
    return seatById(agent?.seat) ?? allDeskSeats[0];
  }

  private plan(walker: Walker) {
    const seat = this.targetSeat(walker);
    if (walker.targetKey === seat.id && (walker.path.length || walker.mode === "sit" || walker.mode === "stand")) return;
    walker.targetKey = seat.id;
    if (this.reduced) {
      const point = seatPoint(seat);
      walker.x = point.x; walker.y = point.y; walker.tile = { tx: seat.tx, ty: seat.ty }; walker.path = [];
      this.arrive(walker, seat);
      return;
    }
    const tiles = findPath(walker.tile, { tx: seat.tx, ty: seat.ty });
    if (!tiles.length) tiles.push({ tx: seat.tx, ty: seat.ty });
    walker.path = tiles.map(({ tx, ty }) => ({ tx, ty, x: tx * TILE + 8, y: ty * TILE + 15 }));
    const last = walker.path[walker.path.length - 1];
    const point = seatPoint(seat);
    last.x = point.x; last.y = point.y;
    if (walker.mode === "sit") walker.y -= SIT;
    walker.mode = "walk";
  }

  private arrive(walker: Walker, seat: Seat) {
    walker.facing = seat.facing;
    walker.mode = seat.kind === "lounge" ? "stand" : "sit";
    if (seat.kind === "lounge") walker.breakUntil = this.now + 7000;
  }

  private nearestWalkable(x: number, y: number) {
    const grid = walkable();
    const base = { tx: Math.floor(x / TILE), ty: Math.floor((y - 6) / TILE) };
    for (let radius = 0; radius < 6; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
        const tx = base.tx + dx, ty = base.ty + dy;
        if (grid[ty]?.[tx]) return { tx, ty };
      }
    }
    return base;
  }

  private tex(walker: Walker, facing: Walker["facing"], pose: Pose) {
    const paintFacing: Facing = facing === "left" || facing === "right" ? "side" : facing;
    const flip = facing === "left";
    const key = `${paintFacing}:${pose}:${flip}`;
    let value = walker.textures.get(key);
    if (!value) {
      value = texture(paintCharacter(walker.appearance, paintFacing, pose, flip));
      walker.textures.set(key, value);
    }
    return value;
  }

  private updateDesks() {
    const occupant = new Map<string, EngineAgent>();
    for (const agent of this.input.agents) if (!this.input.meeting.includes(agent.id)) occupant.set(agent.seat, agent);
    for (const [seatId, desk] of this.desks) {
      const agent = occupant.get(seatId);
      const status = agent?.missionStatus;
      desk.folder.visible = Boolean(status);
      if (status) desk.folder.texture = this.folders.get(status) ?? Texture.EMPTY;
    }
  }

  private drawHighlight(target: DropTarget) {
    const g = this.highlight;
    g.clear();
    if (!target) return;
    if (target.kind === "desk") {
      const seat = seatById(target.seat)!;
      g.roundRect(seat.tx * TILE - 9, seat.ty * TILE - 10, 34, 40, 4).fill({ color: 0x2f5bea, alpha: 0.16 }).stroke({ color: 0x2f5bea, width: 1.5, alpha: 0.9 });
      return;
    }
    const zone = zones.find((item) => item.id === (target.kind === "zone" ? target.department : target.kind));
    if (!zone) return;
    const color = target.kind === "meeting" ? 0x8b5cf6 : target.kind === "lounge" ? 0xd97706 : 0x2f5bea;
    g.roundRect(zone.x * TILE + 2, zone.y * TILE + 2, zone.w * TILE - 4, zone.h * TILE - 4, 6).fill({ color, alpha: 0.1 }).stroke({ color, width: 2, alpha: 0.85 });
  }

  private resize() {
    if (this.destroyed) return;
    const width = Math.max(320, this.host.clientWidth);
    const height = Math.round((width * WORLD_H) / WORLD_W);
    this.app.renderer.resize(width, height);
    this.scale = width / WORLD_W;
    this.world.scale.set(this.scale);
    this.host.style.height = `${height}px`;
    this.overlayRoot.style.setProperty("--office-scale", String(this.scale));
    this.walkers.forEach((walker) => this.placeOverlay(walker));
  }

  private placeOverlay(walker: Walker) {
    if (!walker.overlay) return;
    walker.overlay.style.transform = `translate3d(${(walker.x * this.scale).toFixed(1)}px, ${(walker.y * this.scale).toFixed(1)}px, 0)`;
  }

  private tick(delta: number) {
    if (this.destroyed) return;
    this.now += delta;
    const selected = this.input.selectedId;
    for (const walker of this.walkers.values()) {
      walker.anim += delta;
      if (walker.mode === "walk") this.step(walker, delta);
      if (walker.breakSpot && walker.breakUntil && this.now > walker.breakUntil && walker.mode !== "walk") {
        walker.breakSpot = undefined;
        walker.breakUntil = undefined;
        this.plan(walker);
      }

      let pose: Pose = "stand";
      if (walker.mode === "held") pose = "held";
      else if (walker.mode === "walk") pose = Math.floor(walker.anim / 150) % 4 === 1 ? "walk1" : Math.floor(walker.anim / 150) % 4 === 3 ? "walk2" : "stand";
      else if (walker.mode === "sit") {
        const atDesk = seatById(walker.targetKey)?.kind === "desk";
        if (walker.state === "working" && atDesk && walker.facing === "down") pose = Math.floor(walker.anim / 210) % 2 ? "type1" : "type2";
        else pose = "sit";
      } else if (walker.breakSpot && walker.breakUntil) pose = "mug";
      if ((pose === "sit" || pose === "stand") && walker.facing === "down") {
        if (this.now > walker.blinkAt) { walker.blinkUntil = this.now + 130; walker.blinkAt = this.now + 2200 + Math.random() * 4200; }
        if (this.now < walker.blinkUntil) pose = "blink";
      }
      const facing = walker.mode === "held" ? "down" : walker.facing;
      walker.body.texture = this.tex(walker, facing, pose === "mug" && facing !== "down" ? "stand" : pose);

      const bob = walker.mode === "held" ? Math.sin(this.now / 120) * 1.5 : 0;
      walker.root.position.set(Math.round(walker.x), Math.round(walker.y + bob));
      walker.root.zIndex = walker.mode === "held" ? 20000 : Math.round(walker.y);
      walker.shadow.position.set(0, walker.mode === "held" ? 10 - bob : 0);
      walker.shadow.alpha = walker.mode === "held" ? 0.5 : 1;

      const isSelected = selected === walker.id;
      const isHover = this.hoverId === walker.id;
      walker.ring.clear();
      if (isSelected || isHover) {
        const pulse = isSelected ? 1 + Math.sin(this.now / 260) * 0.12 : 1;
        walker.ring.ellipse(0, 0, 9 * pulse, 3.5 * pulse).stroke({ color: isSelected ? 0x2f5bea : 0x8fa6ff, width: 1.5, alpha: 0.95 });
        if (isSelected) walker.ring.ellipse(0, 0, 9, 3.5).fill({ color: 0x2f5bea, alpha: 0.18 });
      }

      let bubble: BubbleKind | null = null;
      if (walker.flash && this.now < walker.flash.until) bubble = walker.flash.kind;
      else if (walker.breakSpot && walker.breakUntil) bubble = "coffee";
      else if (walker.state === "working") bubble = (["dots1", "dots2", "dots3"] as BubbleKind[])[Math.floor(walker.anim / 380) % 3];
      else if (walker.state === "waiting") bubble = "alert";
      else if (walker.state === "review") bubble = "question";
      else if (walker.state === "blocked") bubble = "blocked";
      walker.bubble.visible = Boolean(bubble) && walker.mode !== "held";
      if (bubble) {
        walker.bubble.texture = this.bubbles.get(bubble)!;
        walker.bubble.y = -26 + (bubble === "alert" ? Math.round(Math.sin(this.now / 160)) : 0);
      }
      this.placeOverlay(walker);
    }

    for (const [seatId, desk] of this.desks) {
      const owner = [...this.walkers.values()].find((walker) => walker.targetKey === seatId && walker.mode === "sit");
      desk.glow.alpha = owner?.state === "working" ? 0.28 + Math.sin(this.now / 300) * 0.12 : 0;
    }

    this.leds.forEach(({ g, phase }) => {
      if (this.input.runnerOnline) {
        const on = Math.sin(this.now / 240 + phase * 3) > -0.2;
        g.tint = on ? (phase % 3 < 1 ? 0x43d9a6 : 0x5cc8ff) : 0x1d4d3d;
      } else {
        g.tint = 0x5a2a2a;
      }
    });

    this.effects = this.effects.filter((effect) => {
      const progress = Math.min(1, (this.now - effect.start) / effect.duration);
      effect.update(progress);
      if (progress >= 1) { effect.sprite.destroy({ children: true }); return false; }
      return true;
    });
  }

  private step(walker: Walker, delta: number) {
    const next = walker.path[0];
    if (!next) {
      this.arrive(walker, this.targetSeat(walker));
      return;
    }
    const dx = next.x - walker.x;
    const dy = next.y - walker.y;
    const distance = Math.hypot(dx, dy);
    const move = (SPEED * delta) / 1000;
    if (Math.abs(dx) > Math.abs(dy)) walker.facing = dx > 0 ? "right" : "left";
    else if (Math.abs(dy) > 0.1) walker.facing = dy > 0 ? "down" : "up";
    if (distance <= move) {
      walker.x = next.x;
      walker.y = next.y;
      walker.tile = { tx: next.tx, ty: next.ty };
      walker.path.shift();
      if (!walker.path.length) this.arrive(walker, this.targetSeat(walker));
    } else {
      walker.x += (dx / distance) * move;
      walker.y += (dy / distance) * move;
    }
  }
}
