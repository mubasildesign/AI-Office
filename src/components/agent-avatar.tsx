"use client";

import { useId } from "react";
import { luminance, shade } from "@/lib/appearance";
import type { AgentAppearance, AgentState, AvatarEyes, AvatarShape } from "@/lib/studio-types";

function starPoints(cx: number, cy: number, outer: number, inner: number) {
  return Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(" ");
}

function ring(count: number, radius: number, size: number, cx = 32, cy = 32) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    return <circle key={index} cx={cx + radius * Math.cos(angle)} cy={cy + radius * Math.sin(angle)} r={size} />;
  });
}

function ShapeBody({ shape }: { shape: AvatarShape }) {
  switch (shape) {
    case "square": return <rect x="10" y="10" width="44" height="44" rx="10" />;
    case "octagon": return <polygon points="23,8 41,8 56,23 56,41 41,56 23,56 8,41 8,23" />;
    case "flower": return <>{ring(5, 14, 12, 32, 33)}<circle cx="32" cy="33" r="14" /></>;
    case "gear": return <>{ring(9, 19, 7.5)}<circle cx="32" cy="32" r="20" /></>;
    case "diamond": return <polygon points="32,7 57,32 32,57 7,32" />;
    case "cloud": return <><circle cx="21" cy="37" r="12" /><circle cx="34" cy="27" r="14" /><circle cx="45" cy="37" r="11" /><rect x="11" y="34" width="44" height="17" rx="8.5" /></>;
    case "drop": return <path d="M32 7 C 36 14 52 28 52 40 A 20 20 0 0 1 12 40 C 12 28 28 14 32 7 Z" />;
    case "heart": return <path d="M32 54 C 12 41 7 30 10 20 C 13 11 26 9 32 18 C 38 9 51 11 54 20 C 57 30 52 41 32 54 Z" />;
    case "star": return <polygon points={starPoints(32, 34, 26, 13)} />;
    case "circle": return <circle cx="32" cy="32" r="24" />;
    case "triangle": return <polygon points="32,10 56,52 8,52" />;
    case "bean": return <ellipse cx="32" cy="33" rx="26" ry="19" />;
  }
}

const eyeCenter: Partial<Record<AvatarShape, [number, number]>> = { triangle: [32, 41], drop: [32, 40], heart: [32, 30], star: [32, 37], cloud: [33, 38], flower: [32, 34] };

function Eyes({ eyes, color, cx, cy }: { eyes: AvatarEyes; color: string; cx: number; cy: number }) {
  const pill = (x: number) => <rect x={x - 2.4} y={cy - 4} width="4.8" height="8.5" rx="2.4" fill={color} />;
  const arc = (x: number) => <path d={`M ${x - 3.6} ${cy + 1.5} Q ${x} ${cy - 3.5} ${x + 3.6} ${cy + 1.5}`} stroke={color} strokeWidth="2.6" strokeLinecap="round" fill="none" />;
  const left = cx - 6;
  const right = cx + 6;
  switch (eyes) {
    case "pills": return <>{pill(left)}{pill(right)}</>;
    case "dots": return <><circle cx={left} cy={cy} r="3.2" fill={color} /><circle cx={right} cy={cy} r="3.2" fill={color} /></>;
    case "happy": return <>{arc(left)}{arc(right)}</>;
    case "sleepy": return <><path d={`M ${left - 3.5} ${cy} H ${left + 3.5} M ${right - 3.5} ${cy} H ${right + 3.5}`} stroke={color} strokeWidth="2.6" strokeLinecap="round" /></>;
    case "wink": return <>{pill(left)}{arc(right)}</>;
  }
}

export function AgentAvatar({ appearance, size = 32, state, title, className }: { appearance: AgentAppearance; size?: number; state?: AgentState; title?: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const [cx, cy] = eyeCenter[appearance.shape] ?? [32, 34];
  const eyeColor = luminance(appearance.color) > 0.7 ? "#2b2438" : "#ffffff";
  return (
    <span className={`agent-blob ${className ?? ""}`} style={{ width: size, height: size }} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <defs>
          <mask id={`m${id}`}>
            <g fill="#fff" stroke="#fff" strokeWidth="6" strokeLinejoin="round"><ShapeBody shape={appearance.shape} /></g>
          </mask>
          <radialGradient id={`h${id}`} cx="0.32" cy="0.22" r="0.75">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0.12" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.55" stopColor={shade(appearance.color, -0.35)} stopOpacity="0" />
            <stop offset="1" stopColor={shade(appearance.color, -0.35)} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <ellipse cx="32" cy="60" rx="17" ry="2.6" fill="#0d1526" opacity="0.14" />
        <g className="blob-body" mask={`url(#m${id})`}>
          <rect width="64" height="64" fill={appearance.color} />
          <rect width="64" height="64" fill={`url(#s${id})`} />
          <rect width="64" height="64" fill={`url(#h${id})`} />
          <ellipse cx="22" cy="17" rx="6" ry="3.2" fill="#fff" opacity="0.38" transform="rotate(-28 22 17)" />
        </g>
        <g className="blob-eyes"><g className="blob-lids"><Eyes eyes={appearance.eyes} color={eyeColor} cx={cx} cy={cy} /></g></g>
      </svg>
      {state && <i className={`state-dot ${state}`} />}
    </span>
  );
}
