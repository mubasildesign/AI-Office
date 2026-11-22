import type { AgentAppearance, AvatarEyes, AvatarShape, HairStyle } from "./studio-types";

export const avatarShapes: AvatarShape[] = ["square", "octagon", "flower", "gear", "diamond", "cloud", "drop", "heart", "star", "circle", "triangle", "bean"];
export const avatarEyes: AvatarEyes[] = ["pills", "dots", "happy", "sleepy", "wink"];
export const hairStyles: HairStyle[] = ["short", "long", "bun", "curly", "buzz", "bob"];

export const avatarColors = [
  "#22c1ee", "#e9584b", "#c7c1ef", "#cf3a30", "#a45cc6", "#f6bd1d", "#3fb3a1", "#f2991f",
  "#f29dc4", "#f4e1ad", "#47a35d", "#138f81", "#c6d64a", "#4b8cf0", "#ff8a65", "#8c7ae6",
];

export const skinTones = ["#f7d7b8", "#efbf98", "#d9a173", "#b07a50", "#82563a", "#5e3d29"];
export const hairColors = ["#2a2125", "#5b3a26", "#a5652f", "#e3bb5f", "#c9ccd4", "#7d2f2f", "#22304d", "#d77a9c"];
export const pantsColors = ["#2d3a52", "#3d4250", "#6b5a45", "#24283a", "#4a3f5c"];

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function deriveAppearance(seed: string, index = hash(seed)): AgentAppearance {
  const h = hash(seed);
  return {
    shape: avatarShapes[index % avatarShapes.length],
    color: avatarColors[(index * 5 + 3) % avatarColors.length],
    eyes: avatarEyes[(h >>> 3) % avatarEyes.length],
    skin: skinTones[(h >>> 7) % skinTones.length],
    hair: hairColors[(h >>> 11) % hairColors.length],
    hairStyle: hairStyles[(h >>> 15) % hairStyles.length],
    pants: pantsColors[(h >>> 19) % pantsColors.length],
  };
}

export function luminance(hex: string) {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function shade(hex: string, amount: number) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const next = channels.map((channel) => Math.round(amount < 0 ? channel * (1 + amount) : channel + (255 - channel) * amount));
  return `#${next.map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0")).join("")}`;
}
