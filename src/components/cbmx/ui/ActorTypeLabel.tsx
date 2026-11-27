import { useId, useLayoutEffect, useRef, useState } from "react";
import { useEditingLock } from "../../../editing/EditingLock";
import type { Actor } from "../cbmxDomain";
import CBMXRowIcon from "./CBMXRowIcon";

type SelectableType = "Customer" | "Other";
const choices: SelectableType[] = ["Customer", "Other"];
const roleClass = (type: Actor["type"]) => `cbmx-role cbmx-actor--${type.toLowerCase()}`;
function RoleContent({ type }: { type: Actor["type"] }) {
  return <><CBMXRowIcon kind={type === "Orchestrator" ? "coCreationProcesses" : type === "Customer" ? "actor" : "actorType"} />{type}</>;
}

export default function ActorTypeLabel({ actor, readOnly, onChange }: {
  actor: Actor; readOnly: boolean; onChange: (type: SelectableType) => void;
}) {
  const lock = useEditingLock();
  return readOnly || lock.locked
    ? <span className={roleClass(actor.type)}><RoleContent type={actor.type} /></span>
    : <ActorTypeMenu actor={actor} onChange={onChange} />;
}

function ActorTypeMenu({ actor, onChange }: { actor: Actor; onChange: (type: SelectableType) => void }) {
  const lock = useEditingLock();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const initialFocus = useRef(0);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    options.current[initialFocus.current]?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function close() { setOpen(false); trigger.current?.focus(); }
  function show(index = choices.indexOf(actor.type as SelectableType)) {
    if (lock.blocked()) return;
    initialFocus.current = Math.max(0, index);
    setOpen(true);
  }

  return <div className="cbmx-role-picker" ref={wrapper}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); }
    }}>
    <button type="button" ref={trigger} className={`${roleClass(actor.type)} cbmx-role-trigger`}
      aria-label={`Actor type for ${actor.name || actor.id}: ${actor.type}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => open ? close() : show()}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); show(event.key === "ArrowDown" ? 0 : choices.length - 1);
        }
      }}>
      <RoleContent type={actor.type} />
      <svg className="cbmx-role-chevron" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>
    </button>
    {open && <div id={menuId} className="cbmx-role-menu" role="menu" aria-label={`Actor type for ${actor.name || actor.id}`}
      onKeyDown={event => {
        const index = options.current.indexOf(document.activeElement as HTMLButtonElement);
        let next: number;
        if (event.key === "ArrowDown") next = (index + 1) % choices.length;
        else if (event.key === "ArrowUp") next = (index + choices.length - 1) % choices.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = choices.length - 1;
        else return;
        event.preventDefault(); event.stopPropagation(); options.current[next]?.focus();
      }}>
      {choices.map((type, index) => <button type="button" key={type} role="menuitemradio"
        aria-checked={actor.type === type} tabIndex={-1} ref={node => { options.current[index] = node; }}
        onClick={() => {
          if (lock.blocked()) return;
          onChange(type);
          close();
        }}>
        <span>{type}</span><span aria-hidden="true">{actor.type === type ? "✓" : ""}</span>
      </button>)}
    </div>}
  </div>;
}
