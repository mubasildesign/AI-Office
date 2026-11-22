import { shade } from "@/lib/appearance";
import { COLS, ROWS, TILE, WORLD_H, WORLD_W, allDeskSeats, zones } from "@/lib/office-layout";
import type { AgentAppearance } from "@/lib/studio-types";

type Ctx = CanvasRenderingContext2D;

export function makeCanvas(width: number, height: number): [HTMLCanvasElement, Ctx] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

function px(ctx: Ctx, color: string, x: number, y: number, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

const INK = "#2b2436";

/** Adds a one-pixel dark outline around every opaque pixel, the classic sprite look. */
function outline(ctx: Ctx, width: number, height: number, color = INK) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * 4 + 3] > 40;
  const edges: Array<[number, number]> = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (solid(x, y)) continue;
    if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) edges.push([x, y]);
  }
  edges.forEach(([x, y]) => px(ctx, color, x, y));
}

export type Pose = "stand" | "walk1" | "walk2" | "type1" | "type2" | "blink" | "held" | "sit" | "mug";
export type Facing = "down" | "up" | "side";

export const CHAR_W = 16;
export const CHAR_H = 24;

function drawHairFront(ctx: Ctx, a: AgentAppearance) {
  const h = a.hair;
  const hi = shade(h, 0.18);
  switch (a.hairStyle) {
    case "buzz":
      px(ctx, h, 4, 2, 8, 2); px(ctx, h, 5, 1, 6, 1);
      break;
    case "curly":
      px(ctx, h, 3, 1, 10, 4); px(ctx, h, 4, 0, 2, 1); px(ctx, h, 7, 0, 2, 1); px(ctx, h, 10, 0, 2, 1);
      px(ctx, h, 3, 5, 1, 3); px(ctx, h, 12, 5, 1, 3); px(ctx, hi, 5, 1, 2, 1); px(ctx, hi, 9, 2, 2, 1);
      break;
    case "long":
      px(ctx, h, 4, 1, 8, 3); px(ctx, h, 5, 0, 6, 1); px(ctx, h, 3, 3, 2, 9); px(ctx, h, 11, 3, 2, 9); px(ctx, h, 5, 4, 2, 1);
      px(ctx, hi, 6, 1, 3, 1);
      break;
    case "bob":
      px(ctx, h, 4, 1, 8, 4); px(ctx, h, 5, 0, 6, 1); px(ctx, h, 3, 3, 2, 6); px(ctx, h, 11, 3, 2, 6);
      px(ctx, hi, 6, 1, 3, 1);
      break;
    case "bun":
      px(ctx, h, 4, 1, 8, 3); px(ctx, h, 6, -1, 4, 2); px(ctx, h, 4, 4, 1, 2); px(ctx, h, 11, 4, 1, 2); px(ctx, h, 9, 4, 2, 1);
      px(ctx, hi, 7, -1, 2, 1);
      break;
    default:
      px(ctx, h, 4, 1, 8, 3); px(ctx, h, 5, 0, 6, 1); px(ctx, h, 4, 4, 1, 2); px(ctx, h, 11, 4, 1, 1); px(ctx, h, 5, 4, 3, 1);
      px(ctx, hi, 6, 1, 3, 1);
  }
}

function drawHairBack(ctx: Ctx, a: AgentAppearance) {
  const h = a.hair;
  if (a.hairStyle === "buzz") { px(ctx, h, 4, 1, 8, 5); return; }
  px(ctx, h, 4, 1, 8, 8); px(ctx, h, 5, 0, 6, 1);
  if (a.hairStyle === "curly") { px(ctx, h, 3, 1, 10, 7); px(ctx, h, 4, 0, 8, 1); }
  if (a.hairStyle === "long") { px(ctx, h, 3, 3, 10, 10); }
  if (a.hairStyle === "bob") { px(ctx, h, 3, 3, 10, 6); }
  if (a.hairStyle === "bun") { px(ctx, h, 6, -1, 4, 2); }
  px(ctx, shade(h, 0.18), 6, 1, 4, 1);
}

function drawLegs(ctx: Ctx, a: AgentAppearance, pose: Pose, facing: Facing) {
  const pants = a.pants;
  const shoe = "#2a2a33";
  if (pose === "sit" || pose === "type1" || pose === "type2") return;
  if (facing === "side") {
    if (pose === "walk1" || pose === "walk2") {
      const front = pose === "walk1" ? 9 : 6;
      const back = pose === "walk1" ? 6 : 9;
      px(ctx, shade(pants, -0.2), back, 17, 2, 4); px(ctx, shoe, back, 21, 2, 1);
      px(ctx, pants, front, 17, 2, 4); px(ctx, shoe, front, 21, 3, 1);
    } else {
      px(ctx, pants, 7, 17, 3, 4); px(ctx, shoe, 7, 21, 4, 1);
    }
    return;
  }
  const lift = (left: boolean) => (pose === "walk1" && left) || (pose === "walk2" && !left) ? 1 : 0;
  const legH = (left: boolean) => 4 - lift(left);
  px(ctx, pants, 5, 17, 3, legH(true)); px(ctx, shoe, 5, 17 + legH(true), 3, 1);
  px(ctx, pants, 8, 17, 3, legH(false)); px(ctx, shoe, 8, 17 + legH(false), 3, 1);
  if (pose === "held") { px(ctx, pants, 5, 17, 3, 5); px(ctx, pants, 8, 17, 3, 5); px(ctx, shoe, 5, 22, 3, 1); px(ctx, shoe, 8, 22, 3, 1); }
}

function drawCharacter(ctx: Ctx, a: AgentAppearance, facing: Facing, pose: Pose) {
  const shirt = a.color;
  const shirtDark = shade(shirt, -0.18);
  const skin = a.skin;
  const skinDark = shade(skin, -0.12);
  ctx.save();
  ctx.translate(0, 1);
  drawLegs(ctx, a, pose, facing);

  if (facing === "side") {
    px(ctx, shirt, 6, 11, 5, 7); px(ctx, shirtDark, 6, 16, 5, 1);
    const armX = pose === "walk1" ? 9 : pose === "walk2" ? 6 : 8;
    px(ctx, shirtDark, armX, 12, 2, 4); px(ctx, skin, armX, 16, 2, 1);
    px(ctx, skinDark, 8, 10, 2, 1);
    px(ctx, skin, 5, 2, 7, 8);
    px(ctx, INK, 10, 5, 1, pose === "blink" ? 1 : 2);
    px(ctx, "#f2a0a0", 10, 8, 1, 1);
    const h = a.hair;
    px(ctx, h, 5, 1, 7, 3); px(ctx, h, 4, 2, 1, 4); px(ctx, h, 5, 4, 3, 3);
    if (a.hairStyle === "long" || a.hairStyle === "bob") px(ctx, h, 4, 4, 3, a.hairStyle === "long" ? 8 : 5);
    if (a.hairStyle === "bun") px(ctx, h, 3, 1, 2, 3);
    if (a.hairStyle === "curly") { px(ctx, h, 4, 0, 8, 2); px(ctx, h, 4, 2, 3, 6); }
    ctx.restore();
    return;
  }

  // Torso and arms
  px(ctx, shirt, 4, 11, 8, 7);
  px(ctx, shirtDark, 4, 17, 8, 1);
  if (facing === "down") { px(ctx, skin, 7, 11, 2, 1); px(ctx, shirtDark, 7, 12, 2, 1); }
  if (pose === "held") {
    px(ctx, shirt, 2, 6, 2, 6); px(ctx, shirt, 12, 6, 2, 6); px(ctx, skin, 2, 5, 2, 1); px(ctx, skin, 12, 5, 2, 1);
  } else if ((pose === "type1" || pose === "type2") && facing === "down") {
    px(ctx, shirtDark, 3, 12, 1, 4); px(ctx, shirtDark, 12, 12, 1, 4);
    px(ctx, shirtDark, 4, 15, 2, 1); px(ctx, shirtDark, 10, 15, 2, 1);
    px(ctx, skin, 5, pose === "type1" ? 16 : 15, 2, 1); px(ctx, skin, 9, pose === "type1" ? 15 : 16, 2, 1);
  } else {
    const swing = pose === "walk1" ? 1 : pose === "walk2" ? -1 : 0;
    px(ctx, shirtDark, 2, 12, 2, 5 + swing); px(ctx, skin, 2, 17 + swing, 2, 1);
    px(ctx, shirtDark, 12, 12, 2, 5 - swing); px(ctx, skin, 12, 17 - swing, 2, 1);
    if (pose === "mug" && facing === "down") { px(ctx, "#ffffff", 12, 14, 3, 3); px(ctx, "#8b5a3c", 12, 14, 3, 1); px(ctx, "#ffffff", 15, 15, 1, 1); }
  }

  // Head
  px(ctx, skinDark, 7, 10, 2, 1);
  px(ctx, skin, 4, 2, 8, 8);
  if (facing === "down") {
    px(ctx, INK, 6, pose === "blink" ? 6 : 5, 1, pose === "blink" ? 1 : 2);
    px(ctx, INK, 9, pose === "blink" ? 6 : 5, 1, pose === "blink" ? 1 : 2);
    px(ctx, "#f2a0a0", 5, 7, 1, 1); px(ctx, "#f2a0a0", 10, 7, 1, 1);
    px(ctx, skinDark, 7, 8, 2, 1);
    drawHairFront(ctx, a);
  } else {
    drawHairBack(ctx, a);
  }
  ctx.restore();
}

export function paintCharacter(a: AgentAppearance, facing: Facing, pose: Pose, flip = false) {
  const [canvas, ctx] = makeCanvas(CHAR_W, CHAR_H);
  if (flip) { ctx.translate(CHAR_W, 0); ctx.scale(-1, 1); }
  drawCharacter(ctx, a, facing, pose);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  outline(ctx, CHAR_W, CHAR_H);
  return canvas;
}

/* ---------- Props ---------- */

export function paintDesk(variant: number) {
  const [canvas, ctx] = makeCanvas(32, 24);
  px(ctx, "rgba(20,24,40,0.16)", 2, 21, 28, 3);
  // Monitor (back side faces the viewer)
  px(ctx, "#3a4152", 2, 0, 11, 8); px(ctx, "#4b5569", 3, 1, 9, 6); px(ctx, "#2c3240", 6, 8, 3, 2);
  // Desk surface and front panel
  px(ctx, "#d7a46f", 0, 9, 32, 2); px(ctx, "#c48f5a", 0, 11, 32, 3); px(ctx, "#9b6a40", 0, 14, 32, 7);
  px(ctx, "#8a5c36", 1, 15, 30, 1); px(ctx, "#b07b4b", 0, 9, 32, 1);
  // Desk clutter
  if (variant % 3 === 0) { px(ctx, "#ffffff", 25, 6, 4, 4); px(ctx, "#6b4a35", 25, 6, 4, 1); px(ctx, "#ffffff", 29, 7, 1, 2); }
  if (variant % 3 === 1) { px(ctx, "#f4f1ea", 18, 8, 7, 2); px(ctx, "#e4ded2", 19, 7, 6, 1); }
  if (variant % 3 === 2) { px(ctx, "#4ea865", 26, 5, 3, 3); px(ctx, "#a35b3c", 26, 8, 3, 2); }
  outline(ctx, 32, 24, "#5b3d27");
  return canvas;
}

export function paintChair() {
  const [canvas, ctx] = makeCanvas(16, 14);
  px(ctx, "#3d63b8", 3, 0, 10, 1); px(ctx, "#3d63b8", 2, 1, 12, 8); px(ctx, "#5a82d6", 3, 1, 10, 2); px(ctx, "#7fa2ea", 4, 1, 3, 1);
  px(ctx, "#2d4d96", 2, 7, 12, 2);
  px(ctx, "#2a2f3a", 0, 6, 2, 4); px(ctx, "#2a2f3a", 14, 6, 2, 4);
  px(ctx, "#2a2f3a", 7, 9, 2, 3); px(ctx, "#2a2f3a", 3, 12, 10, 1); px(ctx, "#2a2f3a", 2, 13, 2, 1); px(ctx, "#2a2f3a", 12, 13, 2, 1);
  outline(ctx, 16, 14, "#1d2a4d");
  return canvas;
}

export function paintPlant(size: "small" | "tall") {
  const [canvas, ctx] = makeCanvas(16, size === "tall" ? 28 : 20);
  const h = canvas.height;
  px(ctx, "rgba(20,24,40,0.18)", 3, h - 2, 10, 2);
  px(ctx, "#c4704b", 4, h - 8, 8, 6); px(ctx, "#a95a3a", 4, h - 3, 8, 1); px(ctx, "#d98a62", 3, h - 9, 10, 2);
  const leaf = ["#2f7d47", "#3f9b5a", "#5cb870"];
  const top = size === "tall" ? 1 : 2;
  px(ctx, leaf[1], 5, top, 6, h - 12); px(ctx, leaf[0], 3, top + 4, 4, h - 16); px(ctx, leaf[0], 9, top + 3, 4, h - 15);
  px(ctx, leaf[2], 6, top + 1, 2, 4); px(ctx, leaf[2], 10, top + 5, 2, 3); px(ctx, leaf[2], 4, top + 7, 2, 3);
  outline(ctx, 16, h, "#1f4d2e");
  return canvas;
}

export function paintMeetingTable() {
  const [canvas, ctx] = makeCanvas(84, 52);
  px(ctx, "rgba(20,24,40,0.16)", 3, 46, 80, 5);
  px(ctx, "#f3f4f7", 2, 2, 80, 38); px(ctx, "#dfe3ea", 2, 34, 80, 6); px(ctx, "#b9c1ce", 2, 40, 80, 6);
  px(ctx, "#ffffff", 4, 4, 76, 2);
  // Laptops and notes
  [10, 34, 58].forEach((x, index) => { px(ctx, "#6d7890", x, 8, 12, 8); px(ctx, "#9fb2d6", x + 1, 9, 10, 6); px(ctx, "#c2c9d6", x - 1, 16, 14, 2); if (index === 1) px(ctx, "#ffd25e", x + 18, 24, 6, 5); });
  px(ctx, "#ffffff", 18, 24, 8, 6); px(ctx, "#9ad1b5", 66, 26, 7, 5);
  outline(ctx, 84, 52, "#7a8496");
  return canvas;
}

export function paintSofa() {
  const [canvas, ctx] = makeCanvas(50, 24);
  px(ctx, "rgba(20,24,40,0.16)", 2, 21, 46, 3);
  px(ctx, "#3f8f8a", 1, 2, 48, 10); px(ctx, "#4fa9a3", 2, 3, 46, 6); px(ctx, "#357a76", 1, 12, 48, 8);
  px(ctx, "#4fa9a3", 4, 12, 20, 4); px(ctx, "#4fa9a3", 26, 12, 20, 4); px(ctx, "#2c6663", 0, 6, 3, 14); px(ctx, "#2c6663", 47, 6, 3, 14);
  px(ctx, "#f0c75e", 6, 6, 6, 5);
  outline(ctx, 50, 24, "#1f4a47");
  return canvas;
}

export function paintCafeTable() {
  const [canvas, ctx] = makeCanvas(20, 20);
  px(ctx, "rgba(20,24,40,0.16)", 4, 17, 12, 3);
  px(ctx, "#f2ece2", 2, 3, 16, 7); px(ctx, "#d6cbb8", 2, 9, 16, 2); px(ctx, "#5d5149", 9, 11, 2, 6); px(ctx, "#5d5149", 6, 17, 8, 1);
  px(ctx, "#ffffff", 5, 4, 3, 3); px(ctx, "#8b5a3c", 5, 4, 3, 1);
  outline(ctx, 20, 20, "#7b6c5b");
  return canvas;
}

export function paintRack() {
  const [canvas, ctx] = makeCanvas(16, 32);
  px(ctx, "rgba(0,0,0,0.25)", 1, 29, 14, 3);
  px(ctx, "#1f2531", 1, 0, 14, 29); px(ctx, "#2b3344", 2, 1, 12, 27);
  for (let y = 3; y < 27; y += 4) { px(ctx, "#394459", 3, y, 10, 3); px(ctx, "#151a24", 3, y + 2, 10, 1); }
  outline(ctx, 16, 32, "#0e1219");
  return canvas;
}

export function paintConsole() {
  const [canvas, ctx] = makeCanvas(52, 26);
  px(ctx, "rgba(0,0,0,0.25)", 2, 23, 48, 3);
  [3, 19, 35].forEach((x) => { px(ctx, "#1c222d", x, 0, 14, 10); px(ctx, "#1b6f5c", x + 1, 1, 12, 8); px(ctx, "#43d9a6", x + 2, 3, 6, 1); px(ctx, "#43d9a6", x + 2, 5, 9, 1); px(ctx, "#2c3240", x + 6, 10, 2, 2); });
  px(ctx, "#596274", 0, 12, 52, 3); px(ctx, "#3d4555", 0, 15, 52, 8);
  outline(ctx, 52, 26, "#141821");
  return canvas;
}

export function paintGlassWall(width: number, solid = false) {
  const [canvas, ctx] = makeCanvas(width, 22);
  if (solid) {
    px(ctx, "#cfd6e0", 0, 2, width, 18); px(ctx, "#b4bdca", 0, 18, width, 4); px(ctx, "#4b5568", 0, 0, width, 3);
  } else {
    px(ctx, "rgba(170,210,240,0.42)", 0, 3, width, 16); px(ctx, "#8a97aa", 0, 0, width, 3); px(ctx, "#8a97aa", 0, 19, width, 3);
    for (let x = 0; x < width; x += 16) px(ctx, "#8a97aa", x, 3, 1, 16);
    for (let x = 4; x < width - 6; x += 22) { px(ctx, "rgba(255,255,255,0.55)", x, 5, 2, 10); px(ctx, "rgba(255,255,255,0.35)", x + 3, 5, 1, 6); }
  }
  return canvas;
}

export function paintWaterCooler() {
  const [canvas, ctx] = makeCanvas(12, 26);
  px(ctx, "rgba(20,24,40,0.16)", 1, 23, 10, 3);
  px(ctx, "#8fd0f5", 3, 0, 6, 8); px(ctx, "#c4e8fb", 4, 1, 2, 5); px(ctx, "#eef1f5", 1, 8, 10, 15); px(ctx, "#cfd6e0", 1, 19, 10, 4); px(ctx, "#3d84d6", 4, 12, 2, 2); px(ctx, "#d6463c", 7, 12, 2, 2);
  outline(ctx, 12, 26, "#6e7a8d");
  return canvas;
}

/* ---------- Status bubbles and effects ---------- */

export type BubbleKind = "dots1" | "dots2" | "dots3" | "alert" | "question" | "blocked" | "done" | "coffee" | "tool";

export function paintBubble(kind: BubbleKind) {
  const [canvas, ctx] = makeCanvas(13, 12);
  const fill = kind === "alert" ? "#ffd166" : kind === "blocked" ? "#ff8a80" : kind === "done" ? "#9be7b6" : kind === "question" ? "#d9c8ff" : "#ffffff";
  px(ctx, fill, 1, 1, 11, 7); px(ctx, fill, 2, 0, 9, 1); px(ctx, fill, 2, 8, 9, 1); px(ctx, fill, 5, 9, 3, 1); px(ctx, fill, 6, 10, 1, 1);
  const ink = "#2b2436";
  if (kind.startsWith("dots")) {
    const count = Number(kind.slice(4));
    for (let index = 0; index < 3; index += 1) px(ctx, index < count ? ink : "#c9ced8", 3 + index * 3, 4, 1, 1);
  }
  if (kind === "alert") { px(ctx, ink, 6, 2, 1, 3); px(ctx, ink, 6, 6, 1, 1); }
  if (kind === "question") { px(ctx, ink, 5, 2, 3, 1); px(ctx, ink, 7, 3, 1, 1); px(ctx, ink, 6, 4, 1, 1); px(ctx, ink, 6, 6, 1, 1); }
  if (kind === "blocked") { px(ctx, ink, 4, 2, 1, 1); px(ctx, ink, 5, 3, 1, 1); px(ctx, ink, 6, 4, 1, 1); px(ctx, ink, 7, 5, 1, 1); px(ctx, ink, 8, 6, 1, 1); px(ctx, ink, 8, 2, 1, 1); px(ctx, ink, 7, 3, 1, 1); px(ctx, ink, 5, 5, 1, 1); px(ctx, ink, 4, 6, 1, 1); }
  if (kind === "done") { px(ctx, ink, 4, 4, 1, 1); px(ctx, ink, 5, 5, 1, 1); px(ctx, ink, 6, 4, 1, 1); px(ctx, ink, 7, 3, 1, 1); px(ctx, ink, 8, 2, 1, 1); }
  if (kind === "coffee") { px(ctx, "#8b5a3c", 4, 3, 4, 1); px(ctx, "#d7dbe2", 4, 4, 4, 3); px(ctx, "#d7dbe2", 8, 4, 1, 2); }
  if (kind === "tool") { px(ctx, "#59647a", 4, 5, 2, 2); px(ctx, "#59647a", 6, 4, 1, 1); px(ctx, "#59647a", 7, 3, 1, 1); px(ctx, "#59647a", 7, 2, 2, 1); px(ctx, "#59647a", 8, 3, 1, 2); }
  outline(ctx, 13, 12);
  return canvas;
}

export function paintPaper() {
  const [canvas, ctx] = makeCanvas(9, 10);
  px(ctx, "#ffffff", 1, 1, 7, 8); px(ctx, "#9aa6b8", 2, 3, 5, 1); px(ctx, "#9aa6b8", 2, 5, 4, 1); px(ctx, "#2f5bea", 2, 7, 3, 1);
  outline(ctx, 9, 10, "#4a5568");
  return canvas;
}

export function paintFolder(color: string) {
  const [canvas, ctx] = makeCanvas(10, 8);
  px(ctx, shade(color, -0.2), 1, 1, 4, 1); px(ctx, color, 1, 2, 8, 5); px(ctx, shade(color, 0.25), 1, 2, 8, 1);
  outline(ctx, 10, 8, "#3a2f2a");
  return canvas;
}

/* ---------- Static floor plan ---------- */

const carpet: Record<string, [string, string, string]> = {
  executive: ["#dcdaf1", "#d3d1ec", "#b9b6dd"],
  product: ["#f3dde8", "#ecd2df", "#d9b3c6"],
  operations: ["#e1e9d5", "#d8e2ca", "#bccaa9"],
  engineering: ["#d5ece9", "#cae5e1", "#a7cfc9"],
  revenue: ["#f6e4d1", "#f0d9c2", "#dcbb98"],
};

export function paintFloorPlan() {
  const [canvas, ctx] = makeCanvas(WORLD_W, WORLD_H);

  // Wooden corridor floor everywhere first
  for (let y = 0; y < WORLD_H; y += 5) {
    px(ctx, (y / 5) % 2 ? "#d9b88f" : "#d3b086", 0, y, WORLD_W, 5);
    for (let x = ((y / 5) % 3) * 13; x < WORLD_W; x += 38) px(ctx, "#bf9a6d", x, y, 1, 5);
    px(ctx, "#c8a479", 0, y + 4, WORLD_W, 1);
  }

  for (const zone of zones) {
    const x = zone.x * TILE;
    const y = zone.y * TILE;
    const w = zone.w * TILE;
    const h = zone.h * TILE;
    if (carpet[zone.id]) {
      const [a, b, edge] = carpet[zone.id];
      px(ctx, edge, x + 2, y + 2, w - 4, h - 4);
      for (let ty = y + 4; ty < y + h - 4; ty += 8) for (let tx = x + 4; tx < x + w - 4; tx += 8) px(ctx, ((tx + ty) / 8) % 2 ? a : b, tx, ty, Math.min(8, x + w - 4 - tx), Math.min(8, y + h - 4 - ty));
    } else if (zone.id === "lounge") {
      for (let ty = y; ty < y + h; ty += 8) for (let tx = x; tx < x + w; tx += 8) px(ctx, ((tx + ty) / 8) % 2 ? "#efe9df" : "#e2d9ca", tx, ty, 8, 8);
      px(ctx, "#d98f6a", x + 26, y + 98, 62, 46); px(ctx, "#e7a582", x + 28, y + 100, 58, 42); px(ctx, "#f2c1a4", x + 32, y + 104, 50, 34);
    } else if (zone.id === "meeting") {
      px(ctx, "#e6e9ee", x, y, w, h);
      for (let tx = x; tx < x + w; tx += 16) px(ctx, "#d8dce3", tx, y, 1, h);
      for (let ty = y; ty < y + h; ty += 16) px(ctx, "#d8dce3", x, ty, w, 1);
      px(ctx, "#c9d5ec", x + 22, y + 46, w - 44, h - 70);
    } else if (zone.id === "deploy") {
      px(ctx, "#263042", x, y, w, h);
      for (let tx = x; tx < x + w; tx += 8) px(ctx, "#2e3a50", tx, y, 1, h);
      for (let ty = y; ty < y + h; ty += 8) px(ctx, "#2e3a50", x, ty, w, 1);
      px(ctx, "#3b6fd8", x + 8, y + h - 10, w - 16, 2);
    }
  }

  // Leadership rug
  px(ctx, "#8a86c9", 2 * TILE + 4, 3 * TILE + 6, 12 * TILE - 8, 2);

  // Top wall with windows, whiteboard, clock and kitchen cabinets
  px(ctx, "#eef1f5", 0, 0, WORLD_W, 32); px(ctx, "#4b5568", 0, 0, WORLD_W, 5); px(ctx, "#b8c1cd", 0, 28, WORLD_W, 4); px(ctx, "#d9dee6", 0, 26, WORLD_W, 2);
  const windows = [4, 9, 28, 32];
  windows.forEach((tx) => {
    const x = tx * TILE;
    px(ctx, "#8a97aa", x, 7, 44, 18); px(ctx, "#a7d3f4", x + 2, 9, 40, 14); px(ctx, "#c9e6fb", x + 2, 9, 40, 5);
    px(ctx, "#ffffff", x + 6, 12, 8, 2); px(ctx, "#ffffff", x + 9, 11, 4, 1); px(ctx, "#8a97aa", x + 21, 9, 2, 14);
    px(ctx, "rgba(255,255,255,0.6)", x + 26, 10, 2, 10); px(ctx, "rgba(255,255,255,0.4)", x + 30, 10, 1, 6);
  });
  // Product whiteboard
  px(ctx, "#9aa4b2", 18 * TILE, 7, 70, 19); px(ctx, "#ffffff", 18 * TILE + 2, 9, 66, 15);
  [["#e9584b", 6, 12, 18], ["#2f5bea", 6, 16, 26], ["#3fb3a1", 36, 12, 22], ["#f2991f", 36, 17, 14]].forEach(([color, ox, oy, w]) => px(ctx, color as string, 18 * TILE + (ox as number), oy as number, w as number, 2));
  px(ctx, "#ffd25e", 18 * TILE + 52, 18, 6, 5);
  // Clock above leadership
  px(ctx, "#4b5568", 14 * TILE - 2, 9, 12, 12); px(ctx, "#ffffff", 14 * TILE - 1, 10, 10, 10); px(ctx, "#2b2436", 14 * TILE + 3, 12, 1, 4); px(ctx, "#2b2436", 14 * TILE + 4, 15, 3, 1);
  // Posters in engineering-side wall area (top wall above ops)
  px(ctx, "#5b5bd6", 24 * TILE + 6, 9, 14, 16); px(ctx, "#ffd25e", 24 * TILE + 9, 13, 8, 8);
  // Kitchen: upper cabinets, counter, coffee machine, sink, fridge
  px(ctx, "#cfd6e0", 36 * TILE, 6, 7 * TILE - 16, 14); for (let x = 36 * TILE; x < 42 * TILE; x += 16) px(ctx, "#b0bac8", x, 6, 1, 14);
  px(ctx, "#e6e8ec", 36 * TILE, 2 * TILE, 6 * TILE, 4); px(ctx, "#b9c0cb", 36 * TILE, 2 * TILE + 4, 6 * TILE, 12); px(ctx, "#a2aab7", 36 * TILE, 3 * TILE - 2, 6 * TILE, 2);
  px(ctx, "#3a3f4a", 37 * TILE + 2, 2 * TILE - 10, 12, 14); px(ctx, "#ec5a4a", 37 * TILE + 9, 2 * TILE - 7, 2, 2); px(ctx, "#ffffff", 37 * TILE + 4, 2 * TILE - 1, 4, 3);
  px(ctx, "#9aa4b2", 39 * TILE + 2, 2 * TILE + 1, 14, 3); px(ctx, "#cfd6e0", 39 * TILE + 8, 2 * TILE - 6, 2, 7);
  px(ctx, "#f4f6f9", 42 * TILE - 2, 6, 16, 2 * TILE + 10); px(ctx, "#dfe4ea", 42 * TILE - 2, 22, 16, 2); px(ctx, "#9aa4b2", 42 * TILE, 12, 1, 6); px(ctx, "#9aa4b2", 42 * TILE, 28, 1, 8);
  // Bookshelf in leadership
  px(ctx, "#8b5e3c", TILE, 10, 32, 2 * TILE + 6); px(ctx, "#6e4a2f", TILE + 2, 12, 28, 2 * TILE + 2);
  [14, 22, 30, 38].forEach((y, row) => { for (let x = TILE + 3; x < TILE + 29; x += 4) px(ctx, ["#e9584b", "#2f5bea", "#f6bd1d", "#3fb3a1", "#a45cc6"][(x + row) % 5], x, y, 3, 7); px(ctx, "#8b5e3c", TILE + 2, y + 7, 28, 1); });

  // Outer wall caps
  px(ctx, "#4b5568", 0, 0, 6, WORLD_H); px(ctx, "#4b5568", WORLD_W - 6, 0, 6, WORLD_H); px(ctx, "#4b5568", 0, WORLD_H - 8, WORLD_W, 8);
  px(ctx, "rgba(0,0,0,0.12)", 6, 32, 4, WORLD_H - 40); px(ctx, "rgba(0,0,0,0.1)", 0, 32, WORLD_W, 3);

  // Meeting room side glass walls
  [27, 35].forEach((tx) => {
    const x = tx * TILE + 6;
    px(ctx, "rgba(150,195,230,0.55)", x, 15 * TILE, 4, 10 * TILE); px(ctx, "#8a97aa", x, 15 * TILE, 1, 10 * TILE); px(ctx, "#8a97aa", x + 3, 15 * TILE, 1, 10 * TILE);
  });
  // Meeting room screen on the far wall (drawn on glass top area)
  // Corridor runner rug
  px(ctx, "#b98b5f", TILE, 12 * TILE + 7, (COLS - 2) * TILE, 1);
  px(ctx, "#b98b5f", TILE, 13 * TILE + 9, (COLS - 2) * TILE, 1);

  // Soft shadows where desks meet the floor are part of desk sprites; mark desk positions faintly for empty desks.
  allDeskSeats.forEach((seat) => px(ctx, "rgba(40,30,60,0.05)", seat.tx * TILE - 6, seat.ty * TILE + 2, 28, 12));
  void ROWS;
  return canvas;
}
