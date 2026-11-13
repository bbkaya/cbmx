import { adminErrorMessage, isAdminAuthorizationError } from "./AdminData";
import type { AdminAccessState, AdminAccessStatus } from "./adminTypes";

export class AdminAccessController {
  private state: AdminAccessState;
  private listeners = new Set<() => void>();
  private generation = 0;
  private pending: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private checkedAt = 0;
  private load: (signal: AbortSignal) => Promise<boolean>;

  constructor(load: (signal: AbortSignal) => Promise<boolean>, status: AdminAccessStatus) {
    this.load = load;
    this.state = { status, error: null };
  }
  getSnapshot = (): AdminAccessState => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(state: AdminAccessState) {
    if (state.status === this.state.status && state.error === this.state.error) return;
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  isRefreshDue = () => Date.now() - this.checkedAt >= 60_000;
  cancelPending = () => {
    this.generation += 1;
    this.abort?.abort();
    this.pending = null;
  };
  denyAccess = () => {
    this.cancelPending();
    this.publish({ status: "denied", error: null });
  };
  refresh = (): Promise<void> => {
    if (this.state.status === "signed-out") return Promise.resolve();
    if (this.pending) return this.pending;
    const generation = ++this.generation;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.checkedAt = Date.now();
    // Background revalidation does not discard a valid page or reset its filters.
    if (this.state.status !== "allowed") this.publish({ status: "checking", error: null });
    this.pending = Promise.resolve().then(() => this.load(signal)).then((allowed) => {
      if (generation === this.generation) this.publish({ status: allowed ? "allowed" : "denied", error: null });
    }).catch((error: unknown) => {
      if (generation !== this.generation) return;
      this.publish(isAdminAuthorizationError(error)
        ? { status: "denied", error: null }
        : { status: "error", error: adminErrorMessage(error) });
    }).finally(() => {
      if (generation === this.generation) this.pending = null;
    });
    return this.pending;
  };
}
