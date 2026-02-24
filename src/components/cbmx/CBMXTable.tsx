import { Fragment, useMemo, type CSSProperties } from "react";
import EditableText from "./ui/EditableText";
import SlotStack from "./ui/SlotStack";

import {
  type Actor,
  type CBMXBlueprint,
  type CostBenefitType,
  countOfType,
  deepClone,
  indicesOfType,
  normalizeActors,
} from "./cbmxDomain";

import {
  getKpiSlotNameFlexible,
  setActorName,
  setActorVP,
  setKpiSlotFlexible,
  setNetworkVP,
  setNthValueItem,
  setProcessSlot,
  setServiceSlot,
  addActor,
  removeActor,
} from "./cbmxMutators";

import { cell, cellLeft, networkCell, rowLabelCell, rowLabelIndentCell, thCell } from "./styles";

/** Re-export the blueprint type so App.tsx can import it from this module */
export type { CBMXBlueprint } from "./cbmxDomain";

export type ValidationIssue = { level: "error" | "warning"; message: string };

/** Minimal, strict-safe validator used by App.tsx */
export function validateCBMXBlueprint(bp: CBMXBlueprint): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!bp) {
    issues.push({ level: "error", message: "Blueprint is missing." });
    return issues;
  }

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

  // Co-creation processes: participant ids should exist
  const actorIds = new Set(bp.actors.map((a) => a.id));
  for (const p of processes) {
    const pname = (p?.name ?? "").trim();
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
const CBMX_HELP: Record<string, string> = {
  networkValueProposition:
    "The value the collaborative network collectively offers to a specific customer. It is achieved through joint value creation by the participating actors.",
  actorType:
    "The role category of an actor in the network: Customer (problem owner and target), Orchestrator (facilitates interactions and alignment; leadership role), or Other network member.",
  actor:
    "A role (and optionally the concrete organization(s)) participating in the collaborative business model.",
  actorValueProposition:
    "The distinct value an actor contributes as part of delivering the network value proposition.",
  costsBenefits:
    "Actors participate because expected benefits outweigh the costs of joining and contributing to the network.",
  financial: "Direct economic gains or losses.",
  environmental:
    "Impact on the natural environment (e.g., air pollution/emissions, material reuse/recycling, energy use).",
  social:
    "Impact on social welfare and well-being (e.g., accessibility, diversity, inclusiveness).",
  otherNonFinancial:
    "Other non-financial effects (e.g., reputation and trust, stakeholder relations, brand awareness/recognition).",
  kpis:
    "Key Performance Indicators for an actor, used for viability evaluation and performance monitoring.",
  actorServices:
    "An actor’s capabilities that collectively realize its value proposition and define how it participates in value co-creation. Services may be detailed into operations (optional), which can map to process tasks/activities.",
  coCreationProcesses:
    "Processes that operationalize the network value proposition. Multiple actors (potentially including the customer) participate and exchange services with the customer and each other.",
};

/** --- TIGHT SPACING OVERRIDES (local, no global CSS needed) --- */
const PAD_TD = "2px 3px";
const PAD_TH = "2px 3px";
const PAD_LABEL = "2px 4px";
const LINE = 1.1;

const cellTight = { ...cell, padding: PAD_TD, lineHeight: LINE } as const;
const cellLeftTight = { ...cellLeft, padding: PAD_TD, lineHeight: LINE } as const;
const thCellTight = { ...thCell, padding: PAD_TH, lineHeight: LINE } as const;
const rowLabelCellTight = { ...rowLabelCell, padding: PAD_LABEL, lineHeight: LINE } as const;
const rowLabelIndentCellTight = { ...rowLabelIndentCell, padding: PAD_LABEL, lineHeight: LINE } as const;
const networkCellTight = { ...networkCell, padding: PAD_TD, lineHeight: LINE } as const;

type RowKind =
  | "networkVP"
  | "actorType"
  | "actor"
  | "actorVP"
  | "costsBenefitsHeader"
  | "valueFinancial"
  | "valueEnvironmental"
  | "valueSocial"
  | "valueOther"
  | "kpis"
  | "services"
  | "processes";

function rowStyle(kind: RowKind): React.CSSProperties {
  // light, print/export friendly pastels
  switch (kind) {
    case "networkVP":
      return { backgroundColor: "#f8fafc" };
    case "actorType":
      return { backgroundColor: "#ffffff" };
    case "actor":
      return { backgroundColor: "#f8fafc" };
    case "actorVP":
      return { backgroundColor: "#ffffff" };
    case "costsBenefitsHeader":
      return { backgroundColor: "#f1f5f9" };

    case "valueFinancial":
      return { backgroundColor: "#ecfdf5" };
    case "valueEnvironmental":
      return { backgroundColor: "#f0fdf4" };
    case "valueSocial":
      return { backgroundColor: "#f0f9ff" };
    case "valueOther":
      return { backgroundColor: "#faf5ff" };

    case "kpis":
      return { backgroundColor: "#ffffff" };
    case "services":
      return { backgroundColor: "#f8fafc" };
    case "processes":
      return { backgroundColor: "#ffffff" };
    default:
      return {};
  }
}


/** Reusable label renderer (Option B): label + ⓘ icon with native tooltip */
function RowLabel({
  text,
  helpKey,
  indent = false,
}: {
  text: string;
  helpKey?: keyof typeof CBMX_HELP;
  indent?: boolean;
}) {
  const tip = helpKey ? CBMX_HELP[helpKey] : undefined;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8, width: "100%" }}>
      <span style={indent ? { paddingLeft: 15 } : undefined}>{text}</span>
      {tip ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Info: ${text}`}
          title={tip}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            height: 16,
            borderRadius: 999,
            fontSize: 12,
            lineHeight: "16px",
            cursor: "help",
            border: "1px solid #bbb",
            userSelect: "none",
            flex: "0 0 auto",
          }}
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

export default function CBMXTable({
  blueprint,
  onChange,
}: {
  blueprint: CBMXBlueprint;
  onChange?: (next: CBMXBlueprint) => void;
}) {
  const { actors, N } = useMemo(() => normalizeActors(blueprint.actors), [blueprint.actors]);
  const colspanNetwork = N * 2;

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

  function getProcessSlotLine(slotIndex: number) {
    const p = (blueprint.coCreationProcesses ?? [])[slotIndex];
    if (!p) return "";
    const names =
      (p.participantActorIds ?? [])
        .map((id) => actors.find((a) => a.id === id)?.name ?? id)
        .filter(Boolean)
        .join(", ") ?? "";
    return names ? `${p.name} (${names})` : (p.name ?? "");
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>

        <tbody>
          <tr style={rowStyle("networkVP")}>
            <td style={rowLabelCellTight}>
              <RowLabel text="Network Value Proposition" helpKey="networkValueProposition" />
            </td>
            <td colSpan={colspanNetwork} style={networkCellTight}>
              <EditableText
                value={blueprint.networkValueProposition?.statement ?? ""}
                readOnly={!onChange}
                placeholder={onChange ? "Click to edit" : ""}
                onCommit={(v) => updateBlueprint((next) => setNetworkVP(next, v))}
              />
            </td>
          </tr>

          <tr style={rowStyle("actorType")}>
            <td style={rowLabelCellTight}>
              <RowLabel text="Actor Type" helpKey="actorType" />
            </td>
            {actors.map((a) => (
              <Fragment key={a.id}>
                <td colSpan={2} style={cellTight}>
                  {a.id.startsWith("EMPTY-") ? "" : a.type === "Other" ? "" : a.type}
                </td>
              </Fragment>
            ))}
          </tr>

          <tr style={rowStyle("actor")}>
            <td style={rowLabelCellTight}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <RowLabel text="Actor" helpKey="actor" />
                {onChange ? (
                  <button
                    type="button"
                    onClick={() => updateBlueprint((next) => addActor(next))}
                    title="Add actor"
                    style={{
                      border: "1px solid #bbb",
                      background: "white",
                      borderRadius: 6,
                      cursor: "pointer",
                      padding: "2px 8px",
                      fontSize: 12,
                      lineHeight: "14px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    +A
                  </button>
                ) : null}
              </div>
            </td>
            {actors.map((a) => (
              <Fragment key={a.id}>
                <td colSpan={2} style={cellLeftTight}>
                  {a.id.startsWith("EMPTY-") ? null : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <EditableText
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
    style={{
      border: "1px solid #bbb",
      background: "white",
      borderRadius: 4,
      cursor: "pointer",
      padding: "1px 3px",
      fontSize: 14,
      lineHeight: "14px",
      flex: "0 0 auto",
    }}
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

          <tr style={rowStyle("actorVP")}>
            <td style={rowLabelCellTight}>
              <RowLabel text="Actor Value Proposition" helpKey="actorValueProposition" />
            </td>
            {actors.map((a) => (
              <Fragment key={a.id}>
                <td colSpan={2} style={cellLeftTight}>
                  {a.id.startsWith("EMPTY-") ? null : (
                    <EditableText
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

          </tr>

<tr style={rowStyle("costsBenefitsHeader")}>
  <td style={rowLabelCellTight}>
    <RowLabel text="Costs & Benefits" helpKey="costsBenefits" />
  </td>
  {actors.map((a) => (
    <Fragment key={a.id}>
      <th style={thCellTight}>Costs</th>
      <th style={thCellTight}>Benefits</th>
    </Fragment>
  ))}
</tr>

          {VALUE_TYPES.map(({ label, key }) => {
            const costSlots = costSlotsByType.get(key) ?? DEFAULT_PER_VALUE_TYPE_SLOTS;
            const benefitSlots = benefitSlotsByType.get(key) ?? DEFAULT_PER_VALUE_TYPE_SLOTS;

            const helpKey =
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
  style={rowStyle(
    key === "Financial"
      ? "valueFinancial"
      : key === "Environmental"
      ? "valueEnvironmental"
      : key === "Social"
      ? "valueSocial"
      : "valueOther"
  )}
>
                <td style={rowLabelIndentCellTight}>
                  <RowLabel text={label} helpKey={helpKey} indent />
                </td>
                {actors.map((a) => (
                  <Fragment key={a.id}>
                    <td style={cellLeftTight}>
                      <SlotStack
                        slots={costSlots}
                        readOnly={!onChange || a.id.startsWith("EMPTY-")}
                        getValue={(i: number) => getNthValueItemDescription(a, "costs", key, i)}
                        placeholder={onChange ? "…" : ""}
                        onCommit={(i: number, v: string) =>
                          updateBlueprint((next) => setNthValueItem(next, a.id, "costs", key, i, v))
                        }
                      />
                    </td>

                    <td style={cellLeftTight}>
                      <SlotStack
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

          <tr style={rowStyle("kpis")}>
            <td style={rowLabelCellTight}>
              <RowLabel text="KPIs" helpKey="kpis" />
            </td>
            {actors.map((a) => (
              <td key={a.id} colSpan={2} style={cellLeftTight}>
                <SlotStack
                  slots={kpiSlots}
                  readOnly={!onChange || a.id.startsWith("EMPTY-")}
                  getValue={(i: number) => getKpiSlotNameFlexible(a, i)}
                  placeholder={onChange ? "…" : ""}
                  prefixLabel={(i: number) => `${i + 1}.`}
                  onCommit={(i: number, v: string) => updateBlueprint((next) => setKpiSlotFlexible(next, a.id, i, v))}
                />
              </td>
            ))}
          </tr>

          <tr style={rowStyle("services")}>
            <td style={rowLabelCellTight}>
              <RowLabel text="Actor Services" helpKey="actorServices" />
            </td>
            {actors.map((a) => (
              <td key={a.id} colSpan={2} style={cellLeftTight}>
                <SlotStack
                  slots={serviceSlots}
                  readOnly={!onChange || a.id.startsWith("EMPTY-")}
                  getValue={(i: number) => getServiceSlotLine(a, i)}
                  placeholder={onChange ? "Service (op1, op2)" : ""}
                  onCommit={(i: number, v: string) => updateBlueprint((next) => setServiceSlot(next, a.id, i, v))}
                />
              </td>
            ))}
          </tr>

          <tr style={rowStyle("processes")}>
            <td style={rowLabelCellTight}>
              <RowLabel text="Co-Creation Processes" helpKey="coCreationProcesses" />
            </td>
            <td colSpan={colspanNetwork} style={cellLeftTight}>
              <SlotStack
                slots={processSlots}
                readOnly={!onChange}
                getValue={(i: number) => getProcessSlotLine(i)}
                placeholder={onChange ? "Process (Actor 1, Actor 2)" : ""}
                onCommit={(i: number, v: string) => updateBlueprint((next) => setProcessSlot(next, i, v))}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
