import { useId, useState } from "react";
import CBMXActionIcon from "./CBMXActionIcon";

export default function CBMXValidationPanel({ issues }: {
  issues: { level: "error" | "warning"; message: string }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const messagesId = useId();
  const errors = issues.filter((issue) => issue.level === "error").length;
  const warnings = issues.filter((issue) => issue.level === "warning").length;
  const state = errors ? "error" : warnings ? "warning" : "valid";
  return <section className="cbmx-validation" data-state={state} aria-label="Blueprint validation">
    <button type="button" className="cbmx-validation-toggle" aria-expanded={expanded} aria-controls={messagesId}
      onClick={() => setExpanded((current) => !current)}>
      <CBMXActionIcon kind={issues.length ? "warning" : "check"} />
      <strong>Validation</strong>
      <span className="cbmx-validation-summary" aria-live="polite">
        {errors > 0 && <strong>{errors} error{errors === 1 ? "" : "s"} — Saving blocked</strong>}
        {warnings > 0 && <span>{errors ? " · " : ""}{warnings} warning{warnings === 1 ? "" : "s"}</span>}
        {!issues.length && "No issues found"}
      </span>
      <span className="cbmx-disclosure" aria-hidden="true">{expanded ? "▴" : "▾"}</span>
    </button>
    <div id={messagesId} className="cbmx-validation-messages" hidden={!expanded}>
      {issues.length ? <ul>{issues.map((issue, index) => <li key={index} data-level={issue.level}>
        <strong>{issue.level === "error" ? "Error" : "Warning"}:</strong> {issue.message}
      </li>)}</ul> : <p>No validation errors or warnings.</p>}
    </div>
  </section>;
}
