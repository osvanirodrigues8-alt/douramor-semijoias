// Stack de undo/redo simples (até 50 passos).
import type { Edge, Node } from "@xyflow/react";

export type Snapshot = { nodes: Node[]; edges: Edge[] };

export class HistoryStack {
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  private current: Snapshot | null = null;
  private max = 50;

  init(s: Snapshot) {
    this.past = [];
    this.future = [];
    this.current = clone(s);
  }

  push(s: Snapshot) {
    if (this.current) this.past.push(this.current);
    if (this.past.length > this.max) this.past.shift();
    this.current = clone(s);
    this.future = [];
  }

  undo(): Snapshot | null {
    const prev = this.past.pop();
    if (!prev) return null;
    if (this.current) this.future.push(this.current);
    this.current = prev;
    return clone(prev);
  }

  redo(): Snapshot | null {
    const next = this.future.pop();
    if (!next) return null;
    if (this.current) this.past.push(this.current);
    this.current = next;
    return clone(next);
  }

  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }
}

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }
