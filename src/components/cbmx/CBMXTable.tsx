import { Fragment, useMemo } from "react";
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
  addCostBenefitSlot,
  addKpiSlot,
  addProcessSlot,
  addServiceSlot,
  getKpiSlotNameFlexible,
  setActorName,
  setActorVP,
  setKpiSlotFlexible,
  setNetworkVP,
  setNthValueItem,
  setProcessSlot,
  setServiceSlot,
} from "./cbmxMutators";

import { cell, cellLeft, networkCell, rowLabelCell, rowLabelIndentCell, thCell } from "./styles";

/** Default slots per your rule-of-thumb (can be made configurable later) */
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

export default function CBMXTable({
  blueprint,
  actorCount = 5,
  onChange,
}: {
  blueprint: CBMXBlueprint;
  actorCount?: number;
  onChange?: (next: CBMXBlueprint) => void;
}) {
  const { actors, N } = useMemo(() => normalizeActors(blueprint.actors, actorCount), [blueprint.actors, actorCount]);
  const colspanNetwork = N * 2;

  // Slot sizing (aligned across actors)
  const costSlotsByType = useMemo(() => {
    const map = new Map<CostBenefitType, number>();
    for (const { key } of VALUE_TYPES) {
      const maxCount = Math.max(0, ...actors.map((a) => countOfType(a.costs, key)));
      map.set(key, Math.max(DEFAULT_PER_VALUE_TYPE_SLOTS, maxCount));
    }
    return map;
  }, [actors]);

  const benefitSlotsByType = useMemo(() => {
    const map = new Map<CostBenefitType, number>();
    for (const { key } of VALUE_TYPES) {
      const maxCount = Math.max(0, ...actors.map((a) => countOfType(a.benefits, key)));
      map.set(key, Math.max(DEFAULT_PER_VALUE_TYPE_SLOTS, maxCount));
    }
    return map;
  }, [actors]);

  const kpiSlots = useMemo(() => Math.max(DEFAULT_KPI_SLOTS, ...actors.map((a) => (a.kpis ?? []).length)), [actors]);
  const serviceSlots = useMemo(
    () => Math.max(DEFAULT_SERVICE_SLOTS, ...actors.map((a) => (a.services ?? []).length)),
    [actors]
  );
  const processSlots = useMemo(
    () => Math.max(DEFAULT_PROCESS_SLOTS, (blueprint.coCreationProcesses ?? []).length),
    [blueprint.coCreationProcesses]
  );

  function updateBlueprint(mutator: (draft: CBMXBlueprint) => void) {
    if (!onChange) return;
    const next: CBMXBlueprint = deepClone(blueprint);
    mutator(next);
    next.actors = normalizeActors(next.actors, next.actors.length).actors;
    onChange(next);
  }

  function getNthValueItemDescription(
    a: Actor,
    kind: "costs" | "benefits",
    type: CostBenefitType,
    slotIndex: number
  ) {
    const arr = (a[kind] ?? []) as { type: CostBenefitType; description: string }[];
    const idxs = indicesOfType(arr, type);
    if (slotIndex >= idxs.length) return "";
    return arr[idxs[slotIndex]]?.description ?? "";
  }

  function getServiceSlotLine(a: Actor, slotIndex: number) {
    const s = (a.services ?? [])[slotIndex];
    if (!s) return "";
    const ops = (s.operations ?? []).map((o) => o.name).filter(Boolean);
    const name = (s.name ?? "").trim();
    return ops.length ? `${name} (${ops.join(", ")})` : name;
  }

  function getProcessSlotLine(slotIndex: number) {
    const p = (blueprint.coCreationProcesses ?? [])[slotIndex];
    if (!p) return "";

    const name = (p.name ?? "").trim();
    const ids = p.participantActorIds ?? [];

    const idToName = new Map((actors ?? []).map((a) => [a.id, a.name]));
    const names = ids.map((id) => idToName.get(id) ?? id).filter(Boolean);

    return names.length ? `${name} (${names.join(", ")})` : name;
  }

  return (
    <div style={{ display: "inline-block", padding: 14, border: "1px solid #ddd", borderRadius: 10, background: "#fff" }}>
      <table style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 220 }} />
          {Array.from({ length: colspanNetwork }).map((_, i: number) => (
            <col key={i} style={{ width: 170 }} />
          ))}
        </colgroup>

        <tbody>
          <tr>
            <td style={rowLabelCell}>Net. Value Proposition</td>
            <td colSpan={colspanNetwork} style={networkCell}>
              <EditableText
                value={blueprint.networkValueProposition?.statement ?? ""}
                placeholder={onChange ? "Click to edit…" : ""}
                multiline
                readOnly={!onChange}
                onCommit={(v: string) => updateBlueprint((next) => setNetworkVP(next, v))}
              />
            </td>
          </tr>

          <tr>
            <td style={rowLabelCell}>Actor Type</td>
            {actors.map((a) => (
              <td key={a.id} colSpan={2} style={cell}>
                {a.type === "Other" ? "" : a.type}
              </td>
            ))}
          </tr>

          <tr>
            <td style={rowLabelCell}>Actor</td>
            {actors.map((a) => (
              <td key={a.id} colSpan={2} style={cell}>
                <EditableText
                  value={a.name ?? ""}
                  placeholder={onChange ? "Click to edit…" : ""}
                  readOnly={!onChange || a.id.startsWith("EMPTY-")}
                  onCommit={(v: string) => updateBlueprint((next) => setActorName(next, a.id, v))}
                />
              </td>
            ))}
          </tr>

          <tr>
            <td style={rowLabelCell}>Actor Value Proposition</td>
            {actors.map((a) => (
              <td key={a.id} colSpan={2} style={cell}>
                <EditableText
                  value={a.actorValueProposition?.statement ?? ""}
                  placeholder={onChange ? "Click to edit…" : ""}
                  multiline
                  readOnly={!onChange || a.id.startsWith("EMPTY-")}
                  onCommit={(v: string) => updateBlueprint((next) => setActorVP(next, a.id, v))}
                />
              </td>
            ))}
          </tr>

          <tr>
            <td style={rowLabelCell}>Costs &amp; Benefits</td>
            {actors.map((a) => (
              <Fragment key={a.id}>
                <th style={thCell}>Costs</th>
                <th style={thCell}>Benefits</th>
              </Fragment>
            ))}
          </tr>

          {VALUE_TYPES.map(({ label, key }) => {
            const costSlots = costSlotsByType.get(key) ?? DEFAULT_PER_VALUE_TYPE_SLOTS;
            const benefitSlots = benefitSlotsByType.get(key) ?? DEFAULT_PER_VALUE_TYPE_SLOTS;

            return (
              <tr key={`row-${key}`}>
                <td style={rowLabelIndentCell}>&nbsp;&nbsp;{label}</td>
                {actors.map((a) => (
                  <Fragment key={a.id}>
                    <td style={cellLeft}>
                      <SlotStack
                        slots={costSlots}
                        readOnly={!onChange || a.id.startsWith("EMPTY-")}
                        getValue={(i: number) => getNthValueItemDescription(a, "costs", key, i)}
                        placeholder={onChange ? "…" : ""}
                        onCommit={(i: number, v: string) =>
                          updateBlueprint((next) => setNthValueItem(next, a.id, "costs", key, i, v))
                        }
                        onAdd={() => updateBlueprint((next) => addCostBenefitSlot(next, a.id, "costs", key))}
                      />
                    </td>

                    <td style={cellLeft}>
                      <SlotStack
                        slots={benefitSlots}
                        readOnly={!onChange || a.id.startsWith("EMPTY-")}
                        getValue={(i: number) => getNthValueItemDescription(a, "benefits", key, i)}
                        placeholder={onChange ? "…" : ""}
                        onCommit={(i: number, v: string) =>
                          updateBlueprint((next) => setNthValueItem(next, a.id, "benefits", key, i, v))
                        }
                        onAdd={() => updateBlueprint((next) => addCostBenefitSlot(next, a.id, "benefits", key))}
                      />
                    </td>
                  </Fragment>
                ))}
              </tr>
            );
          })}

          <tr>
            <td style={rowLabelCell}>KPIs</td>
            {actors.map((a) => (
              <td key={a.id} colSpan={2} style={cellLeft}>
                <SlotStack
                  slots={kpiSlots}
                  readOnly={!onChange || a.id.startsWith("EMPTY-")}
                  getValue={(i: number) => getKpiSlotNameFlexible(a, i)}
                  placeholder={onChange ? "…" : ""}
                  prefixLabel={(i: number) => `${i + 1}.`}
                  onCommit={(i: number, v: string) => updateBlueprint((next) => setKpiSlotFlexible(next, a.id, i, v))}
                  onAdd={() => updateBlueprint((next) => addKpiSlot(next, a.id))}
                />
              </td>
            ))}
          </tr>

          <tr>
            <td style={rowLabelCell}>Actor Services</td>
            {actors.map((a) => (
              <td key={a.id} colSpan={2} style={cellLeft}>
                <SlotStack
                  slots={serviceSlots}
                  readOnly={!onChange || a.id.startsWith("EMPTY-")}
                  getValue={(i: number) => getServiceSlotLine(a, i)}
                  placeholder={onChange ? "Service (op1, op2)" : ""}
                  onCommit={(i: number, v: string) => updateBlueprint((next) => setServiceSlot(next, a.id, i, v))}
                  onAdd={() => updateBlueprint((next) => addServiceSlot(next, a.id))}
                />
              </td>
            ))}
          </tr>

          <tr>
            <td style={rowLabelCell}>Co-Creation Processes</td>
            <td colSpan={colspanNetwork} style={cellLeft}>
              <SlotStack
                slots={processSlots}
                readOnly={!onChange}
                getValue={(i: number) => getProcessSlotLine(i)}
                placeholder={onChange ? "Process (Actor 1, Actor 2)" : ""}
                onCommit={(i: number, v: string) => updateBlueprint((next) => setProcessSlot(next, i, v))}
                onAdd={() => updateBlueprint((next) => addProcessSlot(next))}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}