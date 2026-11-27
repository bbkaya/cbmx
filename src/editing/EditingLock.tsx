import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";

// Temporary operation availability is independent of permission-based read-only mode.
export const EditingLockContext = createContext<{ locked: boolean; blocked: () => boolean }>({ locked: false, blocked: () => false });
export const useEditingLock = () => useContext(EditingLockContext);

export function useSaveLock() {
  const active = useRef(false);
  const alive = useRef(true);
  const [locked, setLocked] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // Invalidate old continuations during the unmount commit, before passive effects.
  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  function begin() {
    if (active.current || !alive.current) return false;
    // Set synchronously, before taking a snapshot or awaiting anything.
    active.current = true;
    setLocked(true);
    setFailed(null);
    return true;
  }
  function end() {
    active.current = false;
    if (alive.current) setLocked(false);
  }
  const isCurrent = () => alive.current;
  const blocked = () => active.current || !alive.current;
  return { active, locked, failed, setFailed, begin, end, isCurrent, blocked };
}
