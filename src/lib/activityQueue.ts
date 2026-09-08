export interface ActivityEvent { id: string; userId: string; sessionId: string; route: string; label: string; release: string; attempts: number }

/** Bounded in-memory queue; stores no customer text or record identifiers. */
export class ActivityQueue {
  private pending: ActivityEvent[] = [];
  private running = false;
  enqueue(event: ActivityEvent) {
    if (this.pending.some(item => item.id === event.id)) return;
    this.pending.push(event);
    if (this.pending.length > 50) this.pending.shift();
  }
  get size() { return this.pending.length; }
  async flush(userId: string, send: (event: ActivityEvent) => Promise<boolean>) {
    if (this.running) return;
    this.running = true;
    try {
      this.pending = this.pending.filter(event => event.userId === userId);
      while (this.pending.length) {
        const event = this.pending[0];
        let success = false;
        try { success = await send(event); } catch { /* bounded retry */ }
        if (success || ++event.attempts >= 3) this.pending.shift();
        else break;
      }
    } finally { this.running = false; }
  }
}
