"use client";

import { MousePointer2, PenLine, Eraser } from "lucide-react";
import type { DrawingTool } from "@/lib/tablet/ink-editor";
import "./tablet-tools.css";

const TOOLS = [
  { key: "select", label: "부위 선택", icon: MousePointer2 },
  { key: "pen", label: "펜", icon: PenLine },
  { key: "eraser", label: "지우개", icon: Eraser },
] as const;

export function TabletToolSelector({ value, onChange, disabled }: { value: DrawingTool; onChange: (tool: DrawingTool) => void; disabled: boolean }) {
  return <div className="tablet-tool-selector" role="radiogroup" aria-label="입력 도구" onKeyDown={event => {
    if (disabled) return;
    const current = TOOLS.findIndex(tool => tool.key === value);
    const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : ["ArrowRight", "ArrowDown"].includes(event.key) ? (current + 1) % 3 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? (current + 2) % 3 : -1;
    if (next < 0) return;
    event.preventDefault(); onChange(TOOLS[next].key);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }}>
    {TOOLS.map(tool => <button key={tool.key} type="button" role="radio" aria-checked={value === tool.key} tabIndex={value === tool.key ? 0 : -1} disabled={disabled} onClick={() => onChange(tool.key)}><tool.icon size={17} aria-hidden="true"/><span>{tool.label}</span></button>)}
  </div>;
}
