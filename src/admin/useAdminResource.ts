import { useCallback, useEffect, useState } from "react";
import { adminErrorMessage, isAdminAuthorizationError } from "./AdminData";
import { useAdminAccess } from "./useAdminAccess";

export function useAdminResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const { denyAccess } = useAdminAccess();
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    load: typeof load; attempt: number; data: T | null; error: string | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.resolve().then(() => load(controller.signal)).then((data) => {
      if (active) setSnapshot({ load, attempt, data, error: null });
    }).catch((error: unknown) => {
      // An authorization failure invalidates this identity even when its search
      // request was superseded. A previous account closes over its old controller.
      if (isAdminAuthorizationError(error)) { denyAccess(); return; }
      if (!active) return;
      setSnapshot({ load, attempt, data: null, error: adminErrorMessage(error) });
    });
    return () => { active = false; controller.abort(); };
  }, [load, attempt, denyAccess]);

  const current = snapshot?.load === load && snapshot.attempt === attempt ? snapshot : null;
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { data: current?.data ?? null, error: current?.error ?? null, loading: current === null, retry };
}
