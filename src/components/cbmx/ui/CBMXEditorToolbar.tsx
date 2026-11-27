import type { ReactNode, RefObject } from "react";
import { Link } from "react-router-dom";
import CBMXActionIcon from "./CBMXActionIcon";

export default function CBMXEditorToolbar({ name, readOnly, administrative, autoSaving, dirty, failed, pausedMessage,
  onNameChange, menuOpen, onToggleMenu, menuRef, children }: {
  name: string;
  readOnly: boolean;
  administrative?: boolean;
  autoSaving: boolean;
  dirty: boolean;
  failed?: string | null;
  pausedMessage?: string;
  onNameChange: (name: string) => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
  children?: ReactNode;
}) {
  const state = readOnly ? "readonly" : autoSaving ? "saving" : failed ? "failed" : pausedMessage ? "paused" : dirty ? "dirty" : "saved";
  return <header className="cbmx-toolbar">
    <div className="cbmx-toolbar-identity">
      <Link to="/app" className="cbmx-back-link">← Back to My Blueprints</Link>
      <div className="cbmx-blueprint-heading">
        <span className="cbmx-editor-title">CBMX Editor</span>
        {readOnly ? <div className="cbmx-blueprint-name">{name}</div> :
          <input disabled={autoSaving} className="cbmx-blueprint-name" value={name} onChange={(event) => onNameChange(event.target.value)}
            placeholder="Blueprint name" aria-label="Blueprint name" />}
      </div>
      <span className={`cbmx-mode cbmx-mode--${readOnly ? "readonly" : "editing"}`}>
        <CBMXActionIcon kind={readOnly ? "lock" : "edit"} />
        {readOnly ? administrative ? "Admin View — Read Only" : "View only" : "Edit mode"}
      </span>
    </div>
    <div className="cbmx-toolbar-actions">
      <span className="cbmx-save-status" data-state={state} role="status" aria-live="polite">
        <CBMXActionIcon kind={readOnly ? "lock" : autoSaving || dirty ? "pending" : "check"} />
        {readOnly ? "Read-only access" : autoSaving ? "Saving…" : failed ? failed : pausedMessage ? pausedMessage : dirty ? "Unsaved changes" : "Saved"}
      </span>
      <div ref={menuRef} className="cbmx-toolbar-menu-anchor">
        <button type="button" className="cbmx-toolbar-button" onClick={onToggleMenu} disabled={autoSaving}
          aria-haspopup="menu" aria-expanded={menuOpen}
          title={readOnly ? "Export options" : "Import/Export (auto-saves first when needed)"}>
          <CBMXActionIcon kind="transfer" />{readOnly ? "Export ▾" : "Export/Import ▾"}
        </button>
        {children}
      </div>
    </div>
  </header>;
}
