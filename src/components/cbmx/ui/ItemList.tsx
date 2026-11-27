import { useEditingLock } from "../../../editing/EditingLock";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import EditableText from "./EditableText";
import CBMXActionIcon from "./CBMXActionIcon";

export type ListItem = { key: string; value: string; displayValue?: ReactNode };
type ItemActions = { commit: (value: string) => void; editingChange: (editing: boolean) => void };

/** UI identity is scoped to a complete source-list revision, never to filtered positions. */
export default function ItemList({ items, revision, label, addLabel, readOnly, numbered, onCommit, onAdd, onRemove, onEditingChange, renderItem, renderAddition, className = "" }: {
  items: ListItem[];
  revision: string;
  label: string;
  addLabel: string;
  readOnly?: boolean;
  numbered?: boolean;
  onCommit: (key: string, value: string) => void;
  onAdd: (value: string) => void;
  onRemove?: (key: string) => void;
  onEditingChange?: (editing: boolean) => void;
  renderItem?: (item: ListItem, actions: ItemActions) => ReactNode;
  renderAddition?: (commit: (value: string) => void, cancel: () => void) => ReactNode;
  className?: string;
}) {
  const lock = useEditingLock();
  const [view, setView] = useState({ revision, epoch: 0, adding: false, active: [] as string[], notice: "" });
  const listRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const [focusTarget, setFocusTarget] = useState<{ key?: string; position?: number } | null>(null);

  const handledFocus = useRef<typeof focusTarget>(null);
  const hasDraft = view.revision === revision && (view.adding || view.active.length > 0);

  useLayoutEffect(() => {
    onEditingChange?.(hasDraft);
    return () => onEditingChange?.(false);
  }, [hasDraft, onEditingChange]);

  if (view.revision !== revision) {
    // Discard stale drafts before React can reuse an index for a different source record.
    setView({ revision, epoch: view.epoch + 1, adding: false, active: [],
      notice: view.adding || view.active.length ? "This list changed. Uncommitted edits were cancelled." : "" });
  }

  useLayoutEffect(() => {
    if (!focusTarget || handledFocus.current === focusTarget) return;
    handledFocus.current = focusTarget;
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-item-key]") ?? [])];
    const row = focusTarget.position === undefined ? rows.find(element => element.dataset.itemKey === focusTarget.key) : rows[focusTarget.position];
    const trigger = row?.querySelector<HTMLElement>('[title="Click to edit"]');
    (trigger ?? addRef.current)?.focus({ preventScroll: true });
  }, [focusTarget, view.epoch]);

  useLayoutEffect(() => {
    if (view.notice) addRef.current?.focus({ preventScroll: true });
  }, [view.epoch, view.notice]);

  function editingChange(key: string, editing: boolean) {
    setView(current => current.revision !== revision ? current : { ...current,
      active: editing ? [...new Set([...current.active, key])] : current.active.filter(value => value !== key) });
  }
  function commit(key: string, value: string) {
    if (lock.blocked()) throw new Error("Saving… Please try again when saving finishes.");
    onCommit(key, value); // A stale snapshot or validation failure keeps the editor open.
    editingChange(key, false);
    setFocusTarget({ key });
  }
  function cancelAddition() {
    setView(current => ({ ...current, adding: false }));
    setFocusTarget({ key: "add" });
  }
  function add(value: string) {
    if (lock.blocked()) throw new Error("Saving… Please try again when saving finishes.");
    if (!value.trim()) throw new Error("Enter an item before adding it.");
    onAdd(value);
    cancelAddition();
  }

  return <div ref={listRef} className={`cbmx-item-list ${className}`} aria-label={label}>
    {view.notice && !readOnly && <div role="status" className="cbmx-list-notice">{view.notice}</div>}
    {items.map((item, index) => <div key={`${view.epoch}:${item.key}`} data-item-key={item.key}
      className={renderItem ? "cbmx-custom-item" : `cbmx-item${!readOnly && onRemove ? " cbmx-item--removable" : ""}`}>
      {renderItem ? renderItem(item, { commit: value => commit(item.key, value), editingChange: editing => editingChange(item.key, editing) }) : <>
        <span className="cbmx-item-marker" aria-hidden="true">{numbered ? `${index + 1}.` : "•"}</span>
        <div className="cbmx-item-content"><EditableText value={item.value} displayValue={item.displayValue}
          label={`${label}, item ${index + 1}`} readOnly={readOnly}
          onEditingChange={editing => editingChange(item.key, editing)} onCommit={value => commit(item.key, value)} /></div>
        {!readOnly && onRemove && <button type="button" disabled={lock.locked} className="cbmx-remove-item"
          title={`Remove ${label}, item ${index + 1}: ${item.value}`} aria-label={`Remove ${label}, item ${index + 1}: ${item.value}`}
          onClick={() => {
            try {
              if (lock.blocked()) return;
              onRemove(item.key);
              editingChange(item.key, false);
              setFocusTarget({ position: Math.min(index, items.length - 2) });
            } catch (error) {
              setView(current => ({ ...current, notice: error instanceof Error ? error.message : "Could not remove this item." }));
            }
          }}><CBMXActionIcon kind="trash" /></button>}
      </>}
    </div>)}
    {!readOnly && <>
      {view.adding && <div key={`addition:${view.epoch}`} className="cbmx-addition">
        {renderAddition ? renderAddition(add, cancelAddition) : <EditableText value="" initiallyEditing
          label={`New ${label}`} onCommit={add} onCancel={cancelAddition} />}
      </div>}
      <button ref={addRef} type="button" className="cbmx-add-item" title={addLabel} aria-label={`${addLabel}: ${label}`}
        disabled={view.adding || lock.locked} onClick={() => { if (!lock.blocked()) setView(current => ({ ...current, adding: true, notice: "" })); }}><span aria-hidden="true">+</span></button>
    </>}
  </div>;
}
