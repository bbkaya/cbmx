import { useEditingLock } from "../../editing/EditingLock";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import EditableText from "./ui/EditableText";
import EditableProcess from "./ui/EditableProcess";
import ItemList, { type ListItem } from "./ui/ItemList";
import ActorTypeLabel from "./ui/ActorTypeLabel";
import CBMXRowIcon from "./ui/CBMXRowIcon";
import "./cbmx.css";

import {
  type Actor,
  type CBMXBlueprint,
  type CostBenefitType,
  type ProcessCanvasLinkSummary,
  deepClone,
  normalizeActors,
  validateServiceScenario,
  validateActorTypes,
} from "./cbmxDomain";

import {
  actorListRevision,
  appendActorItem,
  editActorItem,
  removeActorItem,
  processListRevision,
  commitProcessItem,
  type ActorItemKind,
  setActorName,
  setActorType,
  setActorVP,
  setNetworkVP,
  setServiceScenario,
  addActor,
  removeActor,
} from "./cbmxMutators";

import { cell, cellLeft, networkCell, rowLabelCell, rowLabelIndentCell, thCell } from "./styles";

/** Re-export the blueprint type so App.tsx can import it from this module */
export type { CBMXBlueprint, ProcessCanvasLinkSummary } from "./cbmxDomain";

export type ValidationIssue = { level: "error" | "warning"; message: string };

/** Minimal, strict-safe validator used by App.tsx */
export function validateCBMXBlueprint(bp: CBMXBlueprint): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!bp) {
    issues.push({ level: "error", message: "Blueprint is missing." });
    return issues;
  }

  issues.push(...validateServiceScenario(bp));

  const name = (bp.meta?.name ?? "").trim();
  if (!name) issues.push({ level: "warning", message: "Blueprint name is empty (meta.name)." });

  const nvp = (bp.networkValueProposition?.statement ?? "").trim();
  if (!nvp) issues.push({ level: "warning", message: "Network Value Proposition is empty." });

  issues.push(...validateActorTypes(bp.actors));

  if (!Array.isArray(bp.actors) || bp.actors.length === 0) {
    issues.push({ level: "error", message: "Actors array is missing or empty." });
    return issues;
  }

  const ids = new Set<string>();
  for (const a of bp.actors) {
    const id = (a?.id ?? "").trim();
    if (!id) {
      issues.push({ level: "error", message: "An actor is missing an id." });
      continue;
    }
    if (ids.has(id)) issues.push({ level: "error", message: `Duplicate actor id: ${id}` });
    ids.add(id);

    const actorName = (a?.name ?? "").trim();
    if (!actorName) issues.push({ level: "warning", message: `Actor "${id}" has an empty name.` });

    const avp = (a?.actorValueProposition?.statement ?? "").trim();
    if (!avp) issues.push({ level: "warning", message: `Actor "${id}" Value Proposition is empty.` });

    // Rule 4: at least 1 cost and 1 benefit per actor (any type)
    const hasAnyCost =
      Array.isArray(a.costs) && a.costs.some((c) => (c?.description ?? "").trim().length > 0);
    if (!hasAnyCost) issues.push({ level: "warning", message: `Actor "${id}" has no costs.` });

    const hasAnyBenefit =
      Array.isArray(a.benefits) && a.benefits.some((b) => (b?.description ?? "").trim().length > 0);
    if (!hasAnyBenefit) issues.push({ level: "warning", message: `Actor "${id}" has no benefits.` });

    // Rule 5: at least 1 actor service per actor
    const hasAnyService =
      Array.isArray(a.services) &&
      a.services.some((s) => {
        const sName = (s?.name ?? "").trim();
        const hasOps = Array.isArray(s?.operations) && s.operations.some((o) => (o?.name ?? "").trim().length > 0);
        return sName.length > 0 || hasOps;
      });
    if (!hasAnyService) issues.push({ level: "warning", message: `Actor "${id}" has no services.` });
  }

  // Rule 6: at least 1 co-creation process
  const processes = bp.coCreationProcesses ?? [];
  if (!Array.isArray(processes) || processes.length === 0) {
    issues.push({ level: "warning", message: "No co-creation processes defined." });
  }

  // Co-creation processes: ids should be unique and participant ids should exist
  const actorIds = new Set(bp.actors.map((a) => a?.id));
  const processIds = new Set<string>();
  for (const p of processes) {
    const pidValue = (p?.id ?? "").trim();
    const pname = (p?.name ?? "").trim();
    if (!pidValue) {
      issues.push({ level: "warning", message: "A co-creation process is missing an id." });
    } else if (processIds.has(pidValue)) {
      issues.push({ level: "error", message: `Duplicate co-creation process id: ${pidValue}` });
    } else {
      processIds.add(pidValue);
    }
    if (!pname) issues.push({ level: "warning", message: "A co-creation process has an empty name." });

    for (const pid of p?.participantActorIds ?? []) {
      if (!actorIds.has(pid)) {
        issues.push({
          level: "warning",
          message: `Co-creation process references unknown actor id "${pid}".`,
        });
      }
    }
  }

  return issues;
}

const VALUE_TYPES: { label: string; key: CostBenefitType }[] = [
  { label: "Financial", key: "Financial" },
  { label: "Environmental", key: "Environmental" },
  { label: "Social", key: "Social" },
  { label: "Other Non-Financial", key: "OtherNonFinancial" },
];

/** Tooltip texts for the ⓘ bubbles next to first-column labels */
const CBMX_HELP = {
  networkValueProposition:
    "The value the collaborative network collectively offers to one or more customers, addressing their problems or needs through joint value creation by the participating actors. (E.g., Provide affordable, flexible, low-emission urban mobility through an e-bike network.)",
  actorType:
    "The role category of an actor in the collaborative network: Customer (problem owner), Orchestrator (responsible for coordinating collaborative value creation), or Other network member. A blueprint may have multiple Customer actors but exactly one Orchestrator.",
  actor:
    "A role (and optionally the concrete organization(s)) participating in the collaborative business model. (E.g., Traveler, Service Operator, Municipality, Service Provider.)",
  actorValueProposition:
    "The distinct value an actor contributes as part of delivering the network value proposition. E.g., Safe public-space integration and policy alignment",
  costsBenefits:
    "An outcome is an actor-specific consequence of the collaborative business model. It is a change in the situation of a specific actor resulting directly or indirectly from the co-creation processes. Outcomes may be positive (benefits) or negative (costs). Actors participate because expected benefits outweigh the costs of joining and contributing to the network.",
  financial: "Direct economic gains or losses. These are outcomes expressed in monetary or economic terms, including revenues, costs, savings, investments, fees, subsidies, financial risks, or changes in economic viability.",
  environmental:
    "Outcomes related to natural resources, emissions, energy, waste, pollution, circularity, biodiversity, or ecological footprint, as experienced or caused by a specific actor.",
  social:
    "Outcomes related to people, users, employees, communities, accessibility, inclusion, safety, health, well-being, fairness, skills, workload, or social acceptance, as experienced or caused by a specific actor.",
  otherNonFinancial:
    "Actor-specific outcomes that are not primarily financial, environmental, or social, but still matter for the actor’s participation in the collaborative business model. These may include strategic, operational, relational, reputational, learning, data-related, legitimacy-related, or capability-related outcomes.",
  kpis:
    "Key Performance Indicators for an actor, used for viability evaluation and performance monitoring. (E.g., User adoption rate, average daily emission)",
  actorServices:
    "An actor’s capabilities that collectively realize its value proposition and define how it participates in value co-creation. Services may be detailed into operations (optional), which can map to process tasks/activities. (E.g., Fleet maintenance.)",
  coCreationProcesses:
    "Processes that operationalize the network value proposition. Multiple actors (potentially including customers) participate and exchange services with customers and each other. (E.g., Incident handling (across operator and city authorities).)",
  serviceScenario:
    "A narrative description of how the Network Value Proposition is realized from the customer(s)' perspective and how participating actors contribute to its realization through their activities, interactions and service exchanges.",
} as const;

type HelpKey = keyof typeof CBMX_HELP;

const HELP_LABELS: Record<HelpKey, string> = {
  networkValueProposition: "Network Value Proposition",
  actorType: "Actor Type",
  actor: "Actor",
  actorValueProposition: "Actor Value Proposition",
  costsBenefits: "Actor-specific Outcomes (Costs & Benefits)",
  financial: "Financial",
  environmental: "Environmental",
  social: "Social",
  otherNonFinancial: "Other Non-Financial",
  kpis: "KPIs (Success Criteria)",
  actorServices: "Actor Services",
  coCreationProcesses: "Co-Creation Processes",
  serviceScenario: "Service Scenario",
};

/** Reusable label renderer (Option B): label + ⓘ icon with native tooltip */
function RowLabel({
  text,
  helpKey,
  indent = false,
  exportMode = false,
}: {
  text: string;
  helpKey?: HelpKey;
  indent?: boolean;
  exportMode?: boolean;
}) {
  const tip = helpKey ? CBMX_HELP[helpKey] : undefined;

  return (
    <div className={`cbmx-row-label${indent ? " cbmx-row-label--category" : ""}`}>
      {helpKey && <CBMXRowIcon kind={helpKey} />}
      <span>{text}</span>
      {tip && !exportMode ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Info: ${text}`}
          title={tip}
          className="cbmx-info"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.preventDefault();
          }}
        >
          i
        </span>
      ) : null}
    </div>
  );
}

function rowHelpProps(helpKey: HelpKey, setActiveHelpKey: (key: HelpKey) => void) {
  return {
    onMouseEnter: () => setActiveHelpKey(helpKey),
    onFocusCapture: () => setActiveHelpKey(helpKey),
    onClickCapture: () => setActiveHelpKey(helpKey),
  } as const;
}

export default function CBMXTable({
  blueprint,
  onChange: requestedOnChange,
  presentation = "editor",
  processLinks,
  onCreatePCBForProcess,
  onLinkExistingPCBToProcess,
  onOpenLinkedPCB,
  onUnlinkPCBFromProcess,
  onDeleteProcess,
}: {
  blueprint: CBMXBlueprint;
  presentation?: "editor" | "readonly" | "export";
  onChange?: (next: CBMXBlueprint) => void;
  processLinks?: ProcessCanvasLinkSummary[];
  onCreatePCBForProcess?: (processId: string) => void;
  onLinkExistingPCBToProcess?: (processId: string) => void;
  onOpenLinkedPCB?: (processCanvasBlueprintId: string) => void;
  onUnlinkPCBFromProcess?: (processId: string) => void;
  onDeleteProcess?: (processId: string) => Promise<boolean>;
}) {
  const lock = useEditingLock();
  const exportMode = presentation === "export";
  const onChange = presentation === "editor" ? requestedOnChange : undefined;
  const { actors, N } = useMemo(() => normalizeActors(blueprint.actors), [blueprint.actors]);
  const colspanNetwork = N * 2;
  // A display fallback must not add defaults to legacy JSON and trigger autosave.
  const serviceScenario = typeof blueprint.serviceScenario === "string" ? blueprint.serviceScenario : "";
  const [activeHelpKey, setActiveHelpKey] = useState<HelpKey>("networkValueProposition");
  const [helpOpen, setHelpOpen] = useState(false);
  const [openPCBMenuProcessId, setOpenPCBMenuProcessId] = useState<string | null>(null);
  const pcbMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!pcbMenuRef.current) return;
      const target = event.target;
      if (target instanceof Node && !pcbMenuRef.current.contains(target)) {
        setOpenPCBMenuProcessId(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  // Serialize mutations even when two UI events arrive before controlled props rerender.
  const latestBlueprint = useRef(blueprint);
  useLayoutEffect(() => { latestBlueprint.current = blueprint; }, [blueprint]);

  function updateBlueprint(mutator: (draft: CBMXBlueprint) => void) {
    if (lock.blocked()) throw new Error("Saving… Please try again when saving finishes.");
    if (!onChange) return;
    const next = deepClone(latestBlueprint.current);
    mutator(next);
    if (JSON.stringify(next) === JSON.stringify(latestBlueprint.current)) return;
    onChange(next);
    latestBlueprint.current = next;
  }

  function actorItems(a: Actor, kind: ActorItemKind, type?: CostBenefitType): ListItem[] {
    const raw = blueprint.actors.find(actor => actor.id === a.id);
    if (!raw) return [];
    if (kind === "costs" || kind === "benefits") return (raw[kind] ?? [])
      .map((item, index) => ({ ...item, key: String(index), value: item.description ?? "" }))
      .filter(item => item.type === type && item.value.trim());
    if (kind === "kpis") return (raw.kpis ?? [])
      .map((item, index) => ({ key: String(index), value: item.name ?? "", rank: item.rank ?? 999 }))
      .sort((a, b) => a.rank - b.rank)
      .filter(item => item.value.trim());
    return (raw.services ?? []).map((service, index) => ({ key: String(index), value: getServiceSlotLine(raw, index),
      displayValue: <><strong className="cbmx-service-name">{service.name}</strong>
        <span className="cbmx-service-operations">{getServiceSlotLine(raw, index).slice((service.name ?? "").length)}</span></> }))
      .filter(item => item.value.trim());
  }

  function renderActorItems(a: Actor, kind: ActorItemKind, label: string, addLabel: string, type?: CostBenefitType) {
    const revision = actorListRevision(blueprint.actors.find(actor => actor.id === a.id), kind);
    return <ItemList items={actorItems(a, kind, type)} revision={revision} label={`${label} for ${a.name || a.id}`}
      addLabel={addLabel} numbered={kind === "kpis"} readOnly={!onChange || a.id.startsWith("EMPTY-")}
      onCommit={(index, value) => updateBlueprint(next => editActorItem(next, a.id, kind, revision, Number(index), value))}
      onAdd={value => updateBlueprint(next => appendActorItem(next, a.id, kind, revision, value, type))}
      onRemove={index => updateBlueprint(next => removeActorItem(next, a.id, kind, revision, Number(index)))} />;
  }

  function getServiceSlotLine(a: Actor, slotIndex: number) {
    const s = (a.services ?? [])[slotIndex];
    if (!s) return "";
    const ops = (s.operations ?? []).map((o) => (o?.name ?? "").trim()).filter(Boolean);
    return ops.length ? `${s.name} (${ops.join(", ")})` : (s.name ?? "");
  }

  const processes = (blueprint.coCreationProcesses ?? []).filter(process => {
    const link = getProcessLink(process.id);
    return onChange || process.name?.trim() || process.participantActorIds?.length || getAuthorizedPCBName(process.id) ||
      (!exportMode && canViewLinkedPCB(link) && link?.process_canvas_blueprint_id);
  });
  const processRevision = processListRevision(blueprint);

  function getProcessSlotLine(slotIndex: number) {
    const p = processes[slotIndex];
    if (!p) return "";
    const names =
      (p.participantActorIds ?? [])
        .map((id) => actors.find((a) => a.id === id)?.name ?? id)
        .filter(Boolean)
        .join(", ") ?? "";
    return names ? `${p.name} (${names})` : (p.name ?? "");
  }

function getProcessLink(processId: string) {
  return (processLinks ?? []).find((x) => x.cbmx_process_id === processId) ?? null;
}

function getAuthorizedPCBName(processId: string) {
  const link = getProcessLink(processId);
  return canViewLinkedPCB(link) ? link?.process_canvas_blueprint_name?.trim() ?? "" : "";
}

function canViewLinkedPCB(link: ProcessCanvasLinkSummary | null | undefined) {
  return Boolean(link?.link_exists && link.has_pcb_access && canRoleViewPCB(link.pcb_access_role));
}

function canRoleViewPCB(role: "owner" | "editor" | "viewer" | null | undefined) {
  return role === "owner" || role === "editor" || role === "viewer";
}

function canRoleMutatePCBLink(role: "owner" | "editor" | "viewer" | null | undefined) {
  return role === "owner" || role === "editor";
}

  function closePCBMenu() {
    setOpenPCBMenuProcessId(null);
  }

  function runPCBAction(action: () => void) {
    action();
    closePCBMenu();
  }

  return (
    <div className="cbmx-matrix">
      <div className="cbmx-matrix-scroll">
        <table className="cbmx-table" data-export-width={190 + N * 210}
          style={{ minWidth: 174 + N * 196 + (N * 2 + 2) * 3 }}>
          <colgroup>
            <col style={{ width: 174 }} />
            {actors.map((actor) => <Fragment key={actor.id}><col /><col /></Fragment>)}
          </colgroup>
          <tbody>
            <tr className="cbmx-row cbmx-row--networkVP" {...rowHelpProps("networkValueProposition", setActiveHelpKey)}>
              <td style={rowLabelCell}>
                <RowLabel exportMode={exportMode} text="Network Value Proposition" helpKey="networkValueProposition" />
              </td>
              <td colSpan={colspanNetwork} style={networkCell}>
                <EditableText
                  label="Network Value Proposition"
                  value={blueprint.networkValueProposition?.statement ?? ""}
                  readOnly={!onChange}
                  placeholder={onChange ? "Click to edit" : ""}
                  onCommit={(v) => updateBlueprint((next) => setNetworkVP(next, v))}
                />
              </td>
            </tr>

            <tr className="cbmx-row cbmx-row--actorType" {...rowHelpProps("actorType", setActiveHelpKey)}>
              <td style={rowLabelCell}>
                <RowLabel exportMode={exportMode} text="Actor Type" helpKey="actorType" />
              </td>
              {actors.map((a, index) => (
                <Fragment key={a.id}>
                  <td colSpan={2} style={cell}>
                    {a.id.startsWith("EMPTY-") ? "" : (
                      <ActorTypeLabel actor={a} readOnly={!onChange || index < 2}
                        onChange={type => updateBlueprint(next => setActorType(next, a.id, type))} />
                    )}
                  </td>
                </Fragment>
              ))}
            </tr>

            <tr className="cbmx-row cbmx-row--actor" {...rowHelpProps("actor", setActiveHelpKey)}>
              <td style={rowLabelCell}>
                <div className="cbmx-actor-label">
                  <RowLabel exportMode={exportMode} text="Actor" helpKey="actor" />
                  {onChange ? (
                    <button
                      type="button"
                      onClick={() => updateBlueprint((next) => addActor(next))}
                      disabled={lock.locked || N >= 10}
                      title="Add actor"
                      className="cbmx-add-actor"
                    >
                      + Add Actor
                    </button>
                  ) : null}
                </div>
              </td>
              {actors.map((a, index) => (
                <Fragment key={a.id}>
                  <td colSpan={2} style={{ ...cellLeft, textAlign: "center" }}>
                    {a.id.startsWith("EMPTY-") ? null : (
                      <div className={`cbmx-actor-header cbmx-actor--${a.type.toLowerCase()}`}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <EditableText
                            label={`Actor name: ${a.name || a.id}`}
                            value={a.name ?? ""}
                            readOnly={!onChange}
                            placeholder={onChange ? "Click to edit" : ""}
                            onCommit={(v) => updateBlueprint((next) => setActorName(next, a.id, v))}
                          />
                        </div>

                        {onChange && index >= 2 ? (
                          <button
                            type="button"
                            disabled={lock.locked}
                            title="Remove actor"
                            onClick={() => {
                              const actorLabel = `${a.id} — ${a.name?.trim() || "Unnamed actor"}`;
                              const ok = window.confirm(
                                `Remove actor ${actorLabel}?\n\nThis will also remove the actor from any participant lists (e.g., co-creation processes).`
                              );
                              if (!ok || lock.blocked()) return;
                              updateBlueprint((next) => removeActor(next, a.id));
                            }}
                            className="cbmx-remove-actor"
                            aria-label={`Remove actor ${a.name?.trim() || a.id}`}
                          >
                            −
                          </button>
                        ) : null}
                      </div>
                    )}
                  </td>
                </Fragment>
              ))}
            </tr>

            <tr className="cbmx-row cbmx-row--actorVP" {...rowHelpProps("actorValueProposition", setActiveHelpKey)}>
              <td style={rowLabelCell}>
                <RowLabel exportMode={exportMode} text="Actor Value Proposition" helpKey="actorValueProposition" />
              </td>
              {actors.map((a) => (
                <Fragment key={a.id}>
                  <td colSpan={2} style={cellLeft}>
                    {a.id.startsWith("EMPTY-") ? null : (
                      <EditableText
                        label={`Actor Value Proposition: ${a.name || a.id}`}
                        value={a.actorValueProposition?.statement ?? ""}
                        readOnly={!onChange}
                        placeholder={onChange ? "Click to edit" : ""}
                        onCommit={(v) => updateBlueprint((next) => setActorVP(next, a.id, v))}
                      />
                    )}
                  </td>
                </Fragment>
              ))}
            </tr>

            <tr className="cbmx-row cbmx-row--costsBenefitsHeader" {...rowHelpProps("costsBenefits", setActiveHelpKey)}>
              <td style={rowLabelCell}>
                <RowLabel exportMode={exportMode} text="Outcomes (Costs & Benefits)" helpKey="costsBenefits" />
              </td>
              {actors.map((a) => (
                <Fragment key={a.id}>
                  <th style={thCell}>
                    <div className="cbmx-outcome-heading cbmx-outcome-heading--cost">Costs (Negative)</div>
                  </th>
                  <th style={thCell}>
                    <div className="cbmx-outcome-heading cbmx-outcome-heading--benefit">Benefits (Positive)</div>
                  </th>
                </Fragment>
              ))}
            </tr>

            {VALUE_TYPES.map(({ label, key }) => {
              const helpKey: HelpKey =
                key === "Financial"
                  ? "financial"
                  : key === "Environmental"
                  ? "environmental"
                  : key === "Social"
                  ? "social"
                  : "otherNonFinancial";

              return (
                <tr
                  key={`row-${key}`}
                  className={`cbmx-row cbmx-row--${key}`}
                  {...rowHelpProps(helpKey, setActiveHelpKey)}
                >
                  <td style={rowLabelIndentCell}>
                    <RowLabel exportMode={exportMode} text={label} helpKey={helpKey} indent />
                  </td>
                  {actors.map((a) => (
                    <Fragment key={a.id}>
                      <td style={cellLeft}>
                        {renderActorItems(a, "costs", `${label} cost`, `Add ${label.toLowerCase()} cost`, key)}
                      </td>
                      <td style={cellLeft}>
                        {renderActorItems(a, "benefits", `${label} benefit`, `Add ${label.toLowerCase()} benefit`, key)}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              );
            })}

            <tr className="cbmx-row cbmx-row--kpis" {...rowHelpProps("kpis", setActiveHelpKey)}>
              <td style={rowLabelCell}>
                <RowLabel exportMode={exportMode} text="KPIs (Success Criteria)" helpKey="kpis" />
              </td>
              {actors.map((a) => (
                <td key={a.id} colSpan={2} style={cellLeft}>
                  {renderActorItems(a, "kpis", "KPI", "Add KPI")}
                </td>
              ))}
            </tr>

            <tr className="cbmx-row cbmx-row--services" {...rowHelpProps("actorServices", setActiveHelpKey)}>
              <td style={rowLabelCell}>
                <RowLabel exportMode={exportMode} text="Actor Services" helpKey="actorServices" />
              </td>
              {actors.map((a) => (
                <td key={a.id} colSpan={2} style={cellLeft}>
                  {renderActorItems(a, "services", "Service", "Add service")}
                </td>
              ))}
            </tr>

            <tr className="cbmx-row cbmx-row--processes" {...rowHelpProps("coCreationProcesses", setActiveHelpKey)}>
              <td style={rowLabelCell}>
                <RowLabel exportMode={exportMode} text="Co-Creation Processes" helpKey="coCreationProcesses" />
              </td>
              <td colSpan={colspanNetwork} style={cellLeft}>
                <ItemList className="cbmx-process-list" items={processes.map((p, i) => ({ key: p.id, value: getProcessSlotLine(i) }))}
                  revision={processRevision} label="Co-creation processes" addLabel="Add process" readOnly={!onChange}
                  onCommit={(id, value) => updateBlueprint(next => commitProcessItem(next, processRevision, id, value))}
                  onAdd={value => updateBlueprint(next => commitProcessItem(next, processRevision, null, value))}
                  renderAddition={(commit, cancel) => <EditableProcess value="" initiallyEditing onCommit={commit} onCancel={cancel} />}
                  renderItem={(item, actions) => {
                    const p = processes.find(process => process.id === item.key)!;
                    const link = getProcessLink(p.id);
                    const canViewPCB = canViewLinkedPCB(link);
                    const pcbName = getAuthorizedPCBName(p.id);
                    return (
                      <div
                        key={p.id}
                        className="cbmx-process-row"
                      >
                        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                          <EditableProcess
                            value={item.value}
                            displayValue={<><strong>{p.name?.trim() || (onChange ? `Unnamed process (${p.id})` : "")}</strong><span className="cbmx-process-participants">
                              {item.value.slice((p.name ?? "").length)}
                            </span></>}
                            existing
                            readOnly={!onChange}
                            onCommit={actions.commit}
                            onEditingChange={actions.editingChange}
                            onDelete={onDeleteProcess ? () => onDeleteProcess(p.id) : undefined}
                          />
                        </div>

                        {exportMode ? (getAuthorizedPCBName(p.id) && <div className="cbmx-process-link">
                          <span className="cbmx-link-status cbmx-link-status--linked">PCB: {getAuthorizedPCBName(p.id)}</span>
                        </div>) : <div
                          className="cbmx-process-link"
                        >
                          {!onChange && canViewPCB && link?.process_canvas_blueprint_id && onOpenLinkedPCB ? (
                            <button type="button" className="cbmx-pcb-open cbmx-link-status cbmx-link-status--linked"
                              title="Open linked Process Canvas"
                              aria-label={`Open linked Process Canvas: ${pcbName || "Linked Process Canvas"}`}
                              onClick={() => { if (link.process_canvas_blueprint_id) onOpenLinkedPCB(link.process_canvas_blueprint_id); }}>
                              PCB: {pcbName || "Linked Process Canvas"}
                            </button>
                          ) : <span className={`cbmx-link-status${link?.link_exists ? " cbmx-link-status--linked" : ""}`}>
                            {!link?.link_exists
                              ? "No PCB linked"
                              : canViewPCB
                                ? `PCB: ${pcbName || "Linked Process Canvas"}`
                                : "Linked PCB (no access)"}
                          </span>}

                          {onChange ? (
                            <div ref={openPCBMenuProcessId === p.id ? pcbMenuRef : null} style={{ position: "relative" }}>
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenPCBMenuProcessId((current) => (current === p.id ? null : p.id))
                                }
                                disabled={lock.locked}
                                aria-haspopup="menu"
                                aria-expanded={openPCBMenuProcessId === p.id}
                                className="cbmx-pcb-button"
                              >
                                Process Canvas ▾
                              </button>

                              {openPCBMenuProcessId === p.id ? (
                                <div
                                  role="menu"
                                  style={{
                                    position: "absolute",
                                    top: "calc(100% + 4px)",
                                    right: 0,
                                    minWidth: 260,
                                    border: "1px solid #d7dde5",
                                    borderRadius: 8,
                                    background: "#ffffff",
                                    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)",
                                    padding: 4,
                                    zIndex: 20,
                                  }}
                                >
                                  {!link?.link_exists ? (
                                    <>
                                      <button
                                        type="button" disabled={lock.locked}
                                        role="menuitem"
                                        onClick={() =>
                                          runPCBAction(() => onCreatePCBForProcess?.(p.id))
                                        }
                                        style={{
                                          display: "block",
                                          width: "100%",
                                          textAlign: "left",
                                          border: "none",
                                          background: "transparent",
                                          borderRadius: 6,
                                          cursor: "pointer",
                                          padding: "4px 8px",
                                          fontSize: 12,
                                        }}
                                      >
                                        Create Process Canvas
                                      </button>
                                      <button
                                        type="button" disabled={lock.locked}
                                        role="menuitem"
                                        onClick={() =>
                                          runPCBAction(() => onLinkExistingPCBToProcess?.(p.id))
                                        }
                                        style={{
                                          display: "block",
                                          width: "100%",
                                          textAlign: "left",
                                          border: "none",
                                          background: "transparent",
                                          borderRadius: 6,
                                          cursor: "pointer",
                                          padding: "4px 8px",
                                          fontSize: 12,
                                        }}
                                      >
                                        Link existing Canvas
                                      </button>
                                    </>
                                  ) : canViewPCB ? (
                                    <>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                          if (link.process_canvas_blueprint_id && canRoleViewPCB(link.pcb_access_role)) {
                                            runPCBAction(() =>
                                              onOpenLinkedPCB?.(link.process_canvas_blueprint_id as string)
                                            );
                                          }
                                        }}
                                        style={{
                                          display: "block",
                                          width: "100%",
                                          textAlign: "left",
                                          border: "none",
                                          background: "transparent",
                                          borderRadius: 6,
                                          cursor: "pointer",
                                          padding: "4px 8px",
                                          fontSize: 12,
                                        }}
                                      >
                                        Open linked Canvas
                                      </button>

                                      {canRoleMutatePCBLink(link.pcb_access_role) ? (
                                        <>
                                          <button
                                            type="button"
                                            role="menuitem"
                                            disabled={lock.locked}
                                            onClick={() =>
                                              runPCBAction(() => onCreatePCBForProcess?.(p.id))
                                            }
                                            style={{
                                              display: "block",
                                              width: "100%",
                                              textAlign: "left",
                                              border: "none",
                                              background: "transparent",
                                              borderRadius: 6,
                                              cursor: "pointer",
                                              padding: "4px 8px",
                                              fontSize: 12,
                                            }}
                                          >
                                            Replace with new Canvas
                                          </button>
                                          <button
                                            type="button"
                                            role="menuitem"
                                            disabled={lock.locked}
                                            onClick={() =>
                                              runPCBAction(() => onLinkExistingPCBToProcess?.(p.id))
                                            }
                                            style={{
                                              display: "block",
                                              width: "100%",
                                              textAlign: "left",
                                              border: "none",
                                              background: "transparent",
                                              borderRadius: 6,
                                              cursor: "pointer",
                                              padding: "4px 8px",
                                              fontSize: 12,
                                            }}
                                          >
                                            Relink to existing Canvas
                                          </button>
                                          <button
                                            type="button"
                                            role="menuitem"
                                            disabled={lock.locked}
                                            onClick={() =>
                                              runPCBAction(() => onUnlinkPCBFromProcess?.(p.id))
                                            }
                                            style={{
                                              display: "block",
                                              width: "100%",
                                              textAlign: "left",
                                              border: "none",
                                              background: "transparent",
                                              borderRadius: 6,
                                              cursor: "pointer",
                                              padding: "4px 8px",
                                              fontSize: 12,
                                            }}
                                          >
                                            Remove link
                                          </button>
                                        </>
                                      ) : (
                                        <div
                                          style={{
                                            padding: "6px 8px",
                                            fontSize: 12,
                                            color: "#64748b",
                                            lineHeight: 1.35,
                                          }}
                                        >
                                          You can open this linked Process Canvas, but only PCB editors can replace, relink, or unlink it.
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        disabled
                                        style={{
                                          display: "block",
                                          width: "100%",
                                          textAlign: "left",
                                          border: "none",
                                          background: "transparent",
                                          borderRadius: 6,
                                          cursor: "not-allowed",
                                          padding: "4px 8px",
                                          fontSize: 12,
                                          color: "#94a3b8",
                                        }}
                                      >
                                        Open linked Canvas
                                      </button>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        disabled
                                        style={{
                                          display: "block",
                                          width: "100%",
                                          textAlign: "left",
                                          border: "none",
                                          background: "transparent",
                                          borderRadius: 6,
                                          cursor: "not-allowed",
                                          padding: "4px 8px",
                                          fontSize: 12,
                                          color: "#94a3b8",
                                        }}
                                      >
                                        Create Process Canvas
                                      </button>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        disabled
                                        style={{
                                          display: "block",
                                          width: "100%",
                                          textAlign: "left",
                                          border: "none",
                                          background: "transparent",
                                          borderRadius: 6,
                                          cursor: "not-allowed",
                                          padding: "4px 8px",
                                          fontSize: 12,
                                          color: "#94a3b8",
                                        }}
                                      >
                                        Link existing Canvas
                                      </button>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        disabled
                                        style={{
                                          display: "block",
                                          width: "100%",
                                          textAlign: "left",
                                          border: "none",
                                          background: "transparent",
                                          borderRadius: 6,
                                          cursor: "not-allowed",
                                          padding: "4px 8px",
                                          fontSize: 12,
                                          color: "#94a3b8",
                                        }}
                                      >
                                        Remove link
                                      </button>
                                      <div
                                        style={{
                                          padding: "6px 8px",
                                          fontSize: 12,
                                          color: "#64748b",
                                          lineHeight: 1.35,
                                        }}
                                      >
                                        This co-creation process is already linked to a Process Canvas. Ask the owner to share that canvas if you need access.
                                      </div>
                                    </>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>}
                      </div>
                    );
                  }} />
              </td>
            </tr>
            <tr className="cbmx-row cbmx-row--serviceScenario" {...rowHelpProps("serviceScenario", setActiveHelpKey)}>
              <td style={rowLabelCell}>
                <RowLabel exportMode={exportMode} text="Service Scenario" helpKey="serviceScenario" />
              </td>
              <td colSpan={colspanNetwork} style={cellLeft}>
                <EditableText
                  label="Service Scenario"
                  value={serviceScenario}
                  multiline
                  readOnly={!onChange}
                  placeholder={onChange ? "Click to edit" : ""}
                  onCommit={(value) => {
                    if (value !== serviceScenario) {
                      updateBlueprint((next) => setServiceScenario(next, value));
                    }
                  }}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {!exportMode && <div className={`cbmx-help${helpOpen ? " cbmx-help--open" : ""}`}>
        {helpOpen ? (
          <aside aria-live="polite" className="cbmx-help-panel">
            <button type="button" onClick={() => setHelpOpen(false)}
              aria-label="Collapse tips panel" title="Collapse tips" className="cbmx-help-toggle">
              ››
            </button>
            <div className="cbmx-help-content">
              <div className="cbmx-help-title">{HELP_LABELS[activeHelpKey]}</div>
              <div>{CBMX_HELP[activeHelpKey]}</div>
            </div>
          </aside>
        ) : (
          <button type="button" onClick={() => setHelpOpen(true)}
            aria-label="Open help panel" title="Open help" className="cbmx-help-toggle cbmx-help-toggle--closed">
            ›› Help ‹‹
          </button>
        )}
      </div>}
    </div>
  );
}
