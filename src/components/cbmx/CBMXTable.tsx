import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import EditableText from "./ui/EditableText";
import EditableProcess from "./ui/EditableProcess";
import SlotStack from "./ui/SlotStack";
import CBMXRowIcon from "./ui/CBMXRowIcon";
import "./cbmx.css";

import {
  type Actor,
  type CBMXBlueprint,
  type CostBenefitType,
  type ProcessCanvasLinkSummary,
  countOfType,
  deepClone,
  indicesOfType,
  normalizeActors,
  validateServiceScenario,
} from "./cbmxDomain";

import {
  getKpiSlotNameFlexible,
  setActorName,
  setActorVP,
  setKpiSlotFlexible,
  setNetworkVP,
  setServiceScenario,
  setNthValueItem,
  setProcessSlot,
  renameProcessById,
  setServiceSlot,
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
  const actorIds = new Set(bp.actors.map((a) => a.id));
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

/** Default slots (can be made configurable later) */
const DEFAULT_PER_VALUE_TYPE_SLOTS = 2;
const DEFAULT_KPI_SLOTS = 3;
const DEFAULT_SERVICE_SLOTS = 3;
const DEFAULT_PROCESS_SLOTS = 3;

const VALUE_TYPES: { label: string; key: CostBenefitType }[] = [
  { label: "Financial", key: "Financial" },
  { label: "Environmental", key: "Environmental" },
  { label: "Social", key: "Social" },
  { label: "Other Non-Financial", key: "OtherNonFinancial" },
];

/** Tooltip texts for the ⓘ bubbles next to first-column labels */
const CBMX_HELP = {
  networkValueProposition:
    "The value the collaborative network collectively offers to a specific customer. It is achieved through joint value creation by the participating actors. (E.g., Provide affordable, flexible, low-emission urban mobility through an e-bike network.)",
  actorType:
    "The role category of an actor in the network: Customer (problem owner and target), Orchestrator (facilitates interactions and alignment; leadership role), or Other network member.",
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
    "Processes that operationalize the network value proposition. Multiple actors (potentially including the customer) participate and exchange services with the customer and each other. (E.g., Incident handling (across operator and city authorities).)",
  serviceScenario:
    "A narrative description of how the network value proposition is realized from the customer's perspective and how other actors contribute to its realization through their activities, interactions, and service exchanges",
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
}: {
  text: string;
  helpKey?: HelpKey;
  indent?: boolean;
}) {
  const tip = helpKey ? CBMX_HELP[helpKey] : undefined;

  return (
    <div className={`cbmx-row-label${indent ? " cbmx-row-label--category" : ""}`}>
      {helpKey && <CBMXRowIcon kind={helpKey} />}
      <span>{text}</span>
      {tip ? (
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
  onChange,
  processLinks,
  onCreatePCBForProcess,
  onLinkExistingPCBToProcess,
  onOpenLinkedPCB,
  onUnlinkPCBFromProcess,
  onDeleteProcess,
}: {
  blueprint: CBMXBlueprint;
  onChange?: (next: CBMXBlueprint) => void;
  processLinks?: ProcessCanvasLinkSummary[];
  onCreatePCBForProcess?: (processId: string) => void;
  onLinkExistingPCBToProcess?: (processId: string) => void;
  onOpenLinkedPCB?: (processCanvasBlueprintId: string) => void;
  onUnlinkPCBFromProcess?: (processId: string) => void;
  onDeleteProcess?: (processId: string) => Promise<boolean>;
}) {
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

  // Slot sizing (aligned across actors)
  const costSlotsByType = useMemo(() => {
    const extra = onChange ? 1 : 0; // Always show one additional empty slot when editable
    const map = new Map<CostBenefitType, number>();
    for (const { key } of VALUE_TYPES) {
      const maxCount = Math.max(0, ...actors.map((a) => countOfType(a.costs, key)));
      map.set(key, Math.max(DEFAULT_PER_VALUE_TYPE_SLOTS, maxCount + extra));
    }
    return map;
  }, [actors, onChange]);

  const benefitSlotsByType = useMemo(() => {
    const extra = onChange ? 1 : 0; // Always show one additional empty slot when editable
    const map = new Map<CostBenefitType, number>();
    for (const { key } of VALUE_TYPES) {
      const maxCount = Math.max(0, ...actors.map((a) => countOfType(a.benefits, key)));
      map.set(key, Math.max(DEFAULT_PER_VALUE_TYPE_SLOTS, maxCount + extra));
    }
    return map;
  }, [actors, onChange]);

const kpiSlots = useMemo(() => {
  const maxLen = Math.max(0, ...actors.map((a) => (a.kpis ?? []).length));
  const base = Math.max(DEFAULT_KPI_SLOTS, maxLen);
  return onChange ? Math.max(DEFAULT_KPI_SLOTS, maxLen + 1) : base;
}, [actors, onChange]);

const serviceSlots = useMemo(() => {
  const maxLen = Math.max(0, ...actors.map((a) => (a.services ?? []).length));
  const base = Math.max(DEFAULT_SERVICE_SLOTS, maxLen);
  return onChange ? Math.max(DEFAULT_SERVICE_SLOTS, maxLen + 1) : base;
}, [actors, onChange]);

const processSlots = useMemo(() => {
  const maxLen = Math.max(0, (blueprint.coCreationProcesses ?? []).length);
  const base = Math.max(DEFAULT_PROCESS_SLOTS, maxLen);
  return onChange ? Math.max(DEFAULT_PROCESS_SLOTS, maxLen + 1) : base;
}, [blueprint.coCreationProcesses, onChange]);

  function updateBlueprint(mutator: (draft: CBMXBlueprint) => void) {
    if (!onChange) return;
    const next = deepClone(blueprint);
    mutator(next);
    onChange(next);
  }

  function getNthValueItemDescription(a: Actor, kind: "costs" | "benefits", type: CostBenefitType, slotIndex: number) {
    const arr = (a[kind] ?? []) as { type: CostBenefitType; description: string }[];
    const idxs = indicesOfType(arr, type);
    const realIndex = idxs[slotIndex];
    return realIndex == null ? "" : (arr[realIndex]?.description ?? "");
  }

  function getServiceSlotLine(a: Actor, slotIndex: number) {
    const s = (a.services ?? [])[slotIndex];
    if (!s) return "";
    const ops = (s.operations ?? []).map((o) => (o?.name ?? "").trim()).filter(Boolean);
    return ops.length ? `${s.name} (${ops.join(", ")})` : (s.name ?? "");
  }

  const processes = blueprint.coCreationProcesses ?? [];

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
                <RowLabel text="Network Value Proposition" helpKey="networkValueProposition" />
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
                <RowLabel text="Actor Type" helpKey="actorType" />
              </td>
              {actors.map((a) => (
                <Fragment key={a.id}>
                  <td colSpan={2} style={cell}>
                    {a.id.startsWith("EMPTY-") ? "" : a.type === "Other" ? "" : (
                      <span className={`cbmx-role cbmx-role--${a.type.toLowerCase()}`}>
                        <CBMXRowIcon kind={a.type === "Customer" ? "actor" : "coCreationProcesses"} />{a.type}
                      </span>
                    )}
                  </td>
                </Fragment>
              ))}
            </tr>

            <tr className="cbmx-row cbmx-row--actor" {...rowHelpProps("actor", setActiveHelpKey)}>
              <td style={rowLabelCell}>
                <div className="cbmx-actor-label">
                  <RowLabel text="Actor" helpKey="actor" />
                  {onChange ? (
                    <button
                      type="button"
                      onClick={() => updateBlueprint((next) => addActor(next))}
                      title="Add actor"
                      className="cbmx-add-actor"
                    >
                      + Add Actor
                    </button>
                  ) : null}
                </div>
              </td>
              {actors.map((a) => (
                <Fragment key={a.id}>
                  <td colSpan={2} style={{ ...cellLeft, textAlign: "center" }}>
                    {a.id.startsWith("EMPTY-") ? null : (
                      <div className="cbmx-actor-header">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <EditableText
                            label={`Actor name: ${a.name || a.id}`}
                            value={a.name ?? ""}
                            readOnly={!onChange}
                            placeholder={onChange ? "Click to edit" : ""}
                            onCommit={(v) => updateBlueprint((next) => setActorName(next, a.id, v))}
                          />
                        </div>

                        {onChange && a.type !== "Customer" && a.type !== "Orchestrator" ? (
                          <button
                            type="button"
                            title="Remove actor"
                            onClick={() => {
                              const actorLabel = `${a.id} — ${a.name?.trim() || "Unnamed actor"}`;
                              const ok = window.confirm(
                                `Remove actor ${actorLabel}?\n\nThis will also remove the actor from any participant lists (e.g., co-creation processes).`
                              );
                              if (!ok) return;
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
                <RowLabel text="Actor Value Proposition" helpKey="actorValueProposition" />
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
                <RowLabel text="Outcomes (Costs & Benefits)" helpKey="costsBenefits" />
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
              const costSlots = costSlotsByType.get(key) ?? DEFAULT_PER_VALUE_TYPE_SLOTS;
              const benefitSlots = benefitSlotsByType.get(key) ?? DEFAULT_PER_VALUE_TYPE_SLOTS;

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
                    <RowLabel text={label} helpKey={helpKey} indent />
                  </td>
                  {actors.map((a) => (
                    <Fragment key={a.id}>
                      <td style={cellLeft}>
                        <SlotStack
                          label={`${label} cost for ${a.name || a.id}`}
                          slots={costSlots}
                          readOnly={!onChange || a.id.startsWith("EMPTY-")}
                          getValue={(i: number) => getNthValueItemDescription(a, "costs", key, i)}
                          placeholder={onChange ? "…" : ""}
                          onCommit={(i: number, v: string) =>
                            updateBlueprint((next) => setNthValueItem(next, a.id, "costs", key, i, v))
                          }
                        />
                      </td>

                      <td style={cellLeft}>
                        <SlotStack
                          label={`${label} benefit for ${a.name || a.id}`}
                          slots={benefitSlots}
                          readOnly={!onChange || a.id.startsWith("EMPTY-")}
                          getValue={(i: number) => getNthValueItemDescription(a, "benefits", key, i)}
                          placeholder={onChange ? "…" : ""}
                          onCommit={(i: number, v: string) =>
                            updateBlueprint((next) => setNthValueItem(next, a.id, "benefits", key, i, v))
                          }
                        />
                      </td>
                    </Fragment>
                  ))}
                </tr>
              );
            })}

            <tr className="cbmx-row cbmx-row--kpis" {...rowHelpProps("kpis", setActiveHelpKey)}>
              <td style={rowLabelCell}>
                <RowLabel text="KPIs (Success Criteria)" helpKey="kpis" />
              </td>
              {actors.map((a) => (
                <td key={a.id} colSpan={2} style={cellLeft}>
                  <SlotStack
                    label={`KPI for ${a.name || a.id}`}
                    slots={kpiSlots}
                    readOnly={!onChange || a.id.startsWith("EMPTY-")}
                    getValue={(i: number) => getKpiSlotNameFlexible(a, i)}
                    placeholder={onChange ? "…" : ""}
                    prefixLabel={(i: number) => `${i + 1}`}
                    onCommit={(i: number, v: string) => updateBlueprint((next) => setKpiSlotFlexible(next, a.id, i, v))}
                  />
                </td>
              ))}
            </tr>

            <tr className="cbmx-row cbmx-row--services" {...rowHelpProps("actorServices", setActiveHelpKey)}>
              <td style={rowLabelCell}>
                <RowLabel text="Actor Services" helpKey="actorServices" />
              </td>
              {actors.map((a) => (
                <td key={a.id} colSpan={2} style={cellLeft}>
                  <SlotStack
                    label={`Service for ${a.name || a.id}`}
                    slots={serviceSlots}
                    readOnly={!onChange || a.id.startsWith("EMPTY-")}
                    getValue={(i: number) => getServiceSlotLine(a, i)}
                    renderValue={(i) => a.services?.[i] ? <>
                      <strong className="cbmx-service-name">{a.services[i].name}</strong>
                      <span className="cbmx-service-operations">{getServiceSlotLine(a, i).slice((a.services[i].name ?? "").length)}</span>
                    </> : undefined}
                    placeholder={onChange ? "Service (op1, op2)" : ""}
                    onCommit={(i: number, v: string) => updateBlueprint((next) => setServiceSlot(next, a.id, i, v))}
                  />
                </td>
              ))}
            </tr>

            <tr className="cbmx-row cbmx-row--processes" {...rowHelpProps("coCreationProcesses", setActiveHelpKey)}>
              <td style={rowLabelCell}>
                <RowLabel text="Co-Creation Processes" helpKey="coCreationProcesses" />
              </td>
              <td colSpan={colspanNetwork} style={cellLeft}>
                <div className="cbmx-process-list">
                  {Array.from({ length: processSlots }).map((_, i) => {
                    const p = processes[i];
                    if (!p) {
                      return (
                        <div
                          key={`process-edit-${i}`}
                          className="cbmx-process-row cbmx-process-row--empty"
                        >
                          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                            <EditableProcess
                              value=""
                              readOnly={!onChange}
                              onCommit={(v) => updateBlueprint((next) => setProcessSlot(next, i, v))}
                            />
                          </div>
                        </div>
                      );
                    }

                    const link = getProcessLink(p.id);
                    return (
                      <div
                        key={p.id}
                        className="cbmx-process-row"
                      >
                        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                          <EditableProcess
                            value={getProcessSlotLine(i)}
                            displayValue={<><strong>{p.name}</strong><span className="cbmx-process-participants">
                              {getProcessSlotLine(i).slice((p.name ?? "").length)}
                            </span></>}
                            existing
                            readOnly={!onChange}
                            onCommit={(v) => updateBlueprint((next) => renameProcessById(next, p.id, v))}
                            onDelete={onDeleteProcess ? () => onDeleteProcess(p.id) : undefined}
                          />
                        </div>

                        <div
                          className="cbmx-process-link"
                        >
                          <span className={`cbmx-link-status${link?.link_exists ? " cbmx-link-status--linked" : ""}`}>
                            {!link?.link_exists
                              ? "No PCB linked"
                              : link.has_pcb_access
                                ? `PCB: ${link.process_canvas_blueprint_name ?? link.process_canvas_blueprint_id ?? "Unnamed PCB"}`
                                : "Linked PCB (no access)"}
                          </span>

                          {onChange ? (
                            <div ref={openPCBMenuProcessId === p.id ? pcbMenuRef : null} style={{ position: "relative" }}>
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenPCBMenuProcessId((current) => (current === p.id ? null : p.id))
                                }
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
                                        type="button"
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
                                        type="button"
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
                                  ) : link.has_pcb_access ? (
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              </td>
            </tr>
            <tr className="cbmx-row cbmx-row--serviceScenario" {...rowHelpProps("serviceScenario", setActiveHelpKey)}>
              <td style={rowLabelCell}>
                <RowLabel text="Service Scenario" helpKey="serviceScenario" />
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

      <div className={`cbmx-help${helpOpen ? " cbmx-help--open" : ""}`}>
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
      </div>
    </div>
  );
}
