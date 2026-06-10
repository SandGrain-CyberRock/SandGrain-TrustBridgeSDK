import { Session } from "./index";

export class SessionPool {
  private readonly slots: (Session | null)[];

  constructor(capacity: number) {
    this.slots = new Array(capacity).fill(null);
  }

  acquire(): number | null {
    const idx = this.slots.findIndex((s) => s === null);
    return idx === -1 ? null : idx;
  }

  put(idx: number, session: Session): void {
    this.slots[idx] = session;
  }

  release(idx: number): void {
    this.slots[idx] = null;
  }
}
