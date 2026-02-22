import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";

type CostBenefitType = "Financial" | "Environmental" | "Social" | "OtherNonFinancial";

type CBItem = { type: CostBenefitType; description: string };
type KPI = { name: string; rank: number };
type Operation = { name: string };
type Service = { name: string; operations: Operation[] };

type Actor = {
  id: string;
  type: "Customer" | "Orchestrator" | "Other";
  name: string;
  actorValueProposition: { statement: string };
  costs: CBItem[];
  benefits: CBItem[];
  kpis: KPI[];
  services: Service[];
};

export type CBMXBlueprint = {
  meta?: { id?: string; name?: string };
  networkValueProposition?: { statement?: string };
  actors: Actor[];
  coCreationProcesses?: { id: string; name: string; participantActorIds?: string[] }[];
};

/** Exported validation (used in App.tsx). No throwing. */
export function validateCBMXBlueprint(
  bp: CBMXBlueprint
): { level: "error" | "warning"; message: string }[] {
  const issues: { level: "error" | "warning"; message: string }[] = [];

  if (!bp || !Array.isArray(bp.actors)) {
    issues.push({ level: "error", message: "Blueprint is missing the actors array." });
    return issues;
  }

  if (bp.actors.length < 2) {
    issues.push({ level: "error", message: "At least 2 actors are required (Customer + Orchestrator)." });
    return issues;
  }

  const customers = bp.actors.filter((a) => a.type === "Customer").length;
  const orch = bp.actors.filter((a) => a.type === "Orchestrator").length;

  if (customers !== 1) issues.push({ level: "error", message: "Constraint: exactly 1 Customer actor is required." });
  if (orch !== 1) issues.push({ level: "error", message: "Constraint: exactly 1 Orchestrator actor is required." });

  // Position-based rule (UI design): 1st=Customer, 2nd=Orchestrator
  if (bp.actors[0]?.type !== "Customer") {
    issues.push({ level: "warning", message: "By convention, actor #1 should be the Customer." });
  }
  if (bp.actors[1]?.type !== "Orchestrator") {
    issues.push({ level: "warning", message: "By convention, actor #2 should be the Orchestrator." });
  }

  for (const a of bp.actors) {
    const name = (a?.name ?? "").trim() || a?.id || "Unknown actor";

    if (!Array.isArray(a.costs) || a.costs.length < 1) {
      issues.push({ level: "error", message: `Actor "${name}" must have at least 1 Cost item.` });
    } else {
      const nonEmpty = a.costs.some((c) => (c.description ?? "").trim().length > 0);
      if (!nonEmpty) issues.push({ level: "warning", message: `Actor "${name}" has costs but all descriptions are empty.` });
    }

    if (!Array.isArray(a.benefits) || a.benefits.length < 1) {
      issues.push({ level: "error", message: `Actor "${name}" must have at least 1 Benefit item.` });
    } else {
      const nonEmpty = a.benefits.some((b) => (b.description ?? "").trim().length > 0);
      if (!nonEmpty) issues.push({ level: "warning", message: `Actor "${name}" has benefits but all descriptions are empty.` });
    }

    const vp = (a.actorValueProposition?.statement ?? "").trim();
    if (!vp) issues.push({ level: "warning", message: `Actor "${name}" value proposition statement is empty.` });
  }

  const nvp = (bp.networkValueProposition?.statement ?? "").trim();
  if (!nvp) issues.push({ level: "warning", message: "Network value proposition statement is empty." });

  return issues;
}

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

  function setNetworkVP(statement: string) {
    updateBlueprint((next) => {
      next.networkValueProposition = next.networkValueProposition ?? {};
      next.networkValueProposition.statement = statement;
    });
  }

  function setActorName(actorId: string, name: string) {
    updateBlueprint((next) => {
      const a = next.actors.find((x) => x.id === actorId);
      if (!a) return;
      a.name = name;
    });
  }

  function setActorVP(actorId: string, statement: string) {
    updateBlueprint((next) => {
      const a = next.actors.find((x) => x.id === actorId);
      if (!a) return;
      a.actorValueProposition = a.actorValueProposition ?? { statement: "" };
      a.actorValueProposition.statement = statement;
    });
  }

  function setNthValueItem(
    actorId: string,
    kind: "costs" | "benefits",
    type: CostBenefitType,
    slotIndex: number,
    description: string
  ) {
    updateBlueprint((next) => {
      const a = next.actors.find((x) => x.id === actorId);
      if (!a) return;

      const arr = (a[kind] ?? []) as CBItem[];
      const idxs = indicesOfType(arr, type);

      const cleaned = (description ?? "").trim();

      if (slotIndex < idxs.length) {
        const realIndex = idxs[slotIndex];
        if (!cleaned) {
          arr.splice(realIndex, 1);
        } else {
          arr[realIndex] = { ...arr[realIndex], type, description: cleaned };
        }
      } else {
        if (!cleaned) return;
        arr.push({ type, description: cleaned });
      }

      a[kind] = arr;
      ensureMinCostBenefit(a);
    });
  }

  function getNthValueItemDescription(a: Actor, kind: "costs" | "benefits", type: CostBenefitType, slotIndex: number) {
    const arr = (a[kind] ?? []) as CBItem[];
    const idxs = indicesOfType(arr, type);
    if (slotIndex >= idxs.length) return "";
    return arr[idxs[slotIndex]]?.description ?? "";
  }

  function getKpiSlotNameFlexible(a: Actor, slotIndex: number) {
    const sorted = (a.kpis ?? []).slice().sort((x, y) => (x.rank ?? 999) - (y.rank ?? 999));
    return sorted[slotIndex]?.name ?? "";
  }

  function setKpiSlotFlexible(actorId: string, slotIndex: number, name: string) {
    updateBlueprint((next) => {
      const a = next.actors.find((x) => x.id === actorId);
      if (!a) return;

      a.kpis = Array.isArray(a.kpis) ? a.kpis : [];
      const sorted = a.kpis.slice().sort((x, y) => (x.rank ?? 999) - (y.rank ?? 999));

      const cleaned = (name ?? "").trim();
      const target = sorted[slotIndex];

      if (!target) {
        // creating via editing a virtual slot: append with next rank
        if (!cleaned) return;
        const maxRank = a.kpis.reduce((m, k) => Math.max(m, k.rank ?? 0), 0);
        a.kpis.push({ name: cleaned, rank: maxRank + 1 });
        return;
      }

      // update/delete existing KPI by rank identity
      const idx = a.kpis.findIndex(
        (k) => (k.rank ?? 0) === (target.rank ?? 0) && (k.name ?? "") === (target.name ?? "")
      );
      if (idx < 0) return;

      if (!cleaned) a.kpis.splice(idx, 1);
      else a.kpis[idx] = { ...a.kpis[idx], name: cleaned };
    });
  }

  function setServiceSlot(actorId: string, slotIndex: number, line: string) {
    updateBlueprint((next) => {
      const a = next.actors.find((x) => x.id === actorId);
      if (!a) return;

      a.services = Array.isArray(a.services) ? a.services : [];
      const arr = a.services.slice();
      const cleaned = (line ?? "").trim();

      if (!cleaned) {
        if (slotIndex < arr.length) arr.splice(slotIndex, 1);
        a.services = arr;
        return;
      }

      const parsed = parseServiceLine(cleaned);
      if (!parsed.name) {
        // If user typed only "(op1, op2)" etc., treat as empty -> delete
        if (slotIndex < arr.length) arr.splice(slotIndex, 1);
        a.services = arr;
        return;
      }

      if (slotIndex < arr.length) arr[slotIndex] = parsed;
      else arr.push(parsed);

      a.services = arr;
    });
  }

  /** Added: render services as "Service (op1, op2)" */
  function getServiceSlotLine(a: Actor, slotIndex: number) {
    const s = (a.services ?? [])[slotIndex];
    if (!s) return "";
    const ops = (s.operations ?? []).map((o) => o.name).filter(Boolean);
    const name = (s.name ?? "").trim();
    return ops.length ? `${name} (${ops.join(", ")})` : name;
  }

  /** Updated: processes accept "Process (Actor1, Actor2)" and store ids */
  function setProcessSlot(slotIndex: number, line: string) {
    updateBlueprint((next) => {
      next.coCreationProcesses = next.coCreationProcesses ?? [];
      const arr = next.coCreationProcesses.slice();
      const cleaned = (line ?? "").trim();

      if (!cleaned) {
        if (slotIndex < arr.length) arr.splice(slotIndex, 1);
        next.coCreationProcesses = arr;
        return;
      }

      const parsed = parseProcessLine(cleaned, next.actors ?? []);

      if (slotIndex < arr.length) {
        arr[slotIndex] = {
          ...arr[slotIndex],
          name: parsed.name,
          participantActorIds: parsed.participantActorIds,
        };
      } else {
        arr.push({
          id: `P${arr.length + 1}`,
          name: parsed.name,
          participantActorIds: parsed.participantActorIds,
        });
      }

      next.coCreationProcesses = arr;
    });
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

  function addCostBenefitSlot(actorId: string, kind: "costs" | "benefits", type: CostBenefitType) {
    updateBlueprint((next) => {
      const a = next.actors.find((x) => x.id === actorId);
      if (!a) return;
      a[kind] = Array.isArray(a[kind]) ? a[kind] : [];
      (a[kind] as CBItem[]).push({ type, description: "" });
      ensureMinCostBenefit(a);
    });
  }

  function addKpiSlot(actorId: string) {
    updateBlueprint((next) => {
      const a = next.actors.find((x) => x.id === actorId);
      if (!a) return;
      a.kpis = Array.isArray(a.kpis) ? a.kpis : [];
      const maxRank = a.kpis.reduce((m, k) => Math.max(m, k.rank ?? 0), 0);
      a.kpis.push({ name: "", rank: maxRank + 1 });
    });
  }

  function addServiceSlot(actorId: string) {
    updateBlueprint((next) => {
      const a = next.actors.find((x) => x.id === actorId);
      if (!a) return;
      a.services = Array.isArray(a.services) ? a.services : [];
      a.services.push({ name: "", operations: [] });
    });
  }

  function addProcessSlot() {
    updateBlueprint((next) => {
      next.coCreationProcesses = Array.isArray(next.coCreationProcesses) ? next.coCreationProcesses : [];
      const arr = next.coCreationProcesses;
      arr.push({ id: `P${arr.length + 1}`, name: "", participantActorIds: [] });
    });
  }

  return (
    <div style={{ display: "inline-block", padding: 14, border: "1px solid #ddd", borderRadius: 10, background: "#fff" }}>
      <table style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 220 }} />
          {Array.from({ length: colspanNetwork }).map((_, i) => (
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
                onCommit={setNetworkVP}
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
                  onCommit={(v) => setActorName(a.id, v)}
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
                  onCommit={(v) => setActorVP(a.id, v)}
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
                        getValue={(i) => getNthValueItemDescription(a, "costs", key, i)}
                        placeholder={onChange ? "…" : ""}
                        onCommit={(i, v) => setNthValueItem(a.id, "costs", key, i, v)}
                        onAdd={() => addCostBenefitSlot(a.id, "costs", key)}
                      />
                    </td>

                    <td style={cellLeft}>
                      <SlotStack
                        slots={benefitSlots}
                        readOnly={!onChange || a.id.startsWith("EMPTY-")}
                        getValue={(i) => getNthValueItemDescription(a, "benefits", key, i)}
                        placeholder={onChange ? "…" : ""}
                        onCommit={(i, v) => setNthValueItem(a.id, "benefits", key, i, v)}
                        onAdd={() => addCostBenefitSlot(a.id, "benefits", key)}
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
                  getValue={(i) => getKpiSlotNameFlexible(a, i)}
                  placeholder={onChange ? "…" : ""}
                  prefixLabel={(i) => `${i + 1}.`}
                  onCommit={(i, v) => setKpiSlotFlexible(a.id, i, v)}
                  onAdd={() => addKpiSlot(a.id)}
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
                  getValue={(i) => getServiceSlotLine(a, i)}
                  placeholder={onChange ? "Service (op1, op2)" : ""}
                  onCommit={(i, v) => setServiceSlot(a.id, i, v)}
                  onAdd={() => addServiceSlot(a.id)}
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
                getValue={(i) => getProcessSlotLine(i)}
                placeholder={onChange ? "Process (Actor 1, Actor 2)" : ""}
                onCommit={(i, v) => setProcessSlot(i, v)}
                onAdd={() => addProcessSlot()}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Editable components ---------------- */

function EditableText({
  value,
  onCommit,
  placeholder,
  readOnly,
  multiline,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  if (readOnly) {
    const shown = (value ?? "").trim();
    return shown ? <div>{shown}</div> : <div style={{ color: "#888" }}>{placeholder ?? ""}</div>;
  }

  if (!editing) {
    const shown = (value ?? "").trim();
    return (
      <div
        onClick={() => setEditing(true)}
        title="Click to edit"
        style={{
          cursor: "pointer",
          padding: 2,
          borderRadius: 4,
          minHeight: multiline ? 28 : undefined,
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.outline = "2px solid #bbb")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.outline = "none")}
      >
        {shown ? shown : <span style={{ color: "#888" }}>{placeholder ?? "Click to edit…"}</span>}
      </div>
    );
  }

  const commonStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    font: "inherit",
    fontSize: 12,
    lineHeight: 1.25,
    padding: 6,
    border: "1px solid #999",
    borderRadius: 6,
    outline: "none",
  };

  return (
    <div>
      {multiline ? (
        <textarea autoFocus rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} style={commonStyle} />
      ) : (
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} style={commonStyle} />
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button
          type="button"
          onClick={() => {
            onCommit(draft);
            setEditing(false);
          }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(value ?? "");
            setEditing(false);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function SlotStack({
  slots,
  getValue,
  onCommit,
  readOnly,
  placeholder,
  prefixLabel,
  onAdd,
}: {
  slots: number;
  getValue: (slotIndex: number) => string;
  onCommit: (slotIndex: number, next: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  prefixLabel?: (slotIndex: number) => string;
  onAdd?: () => void;
}) {
  const FONT_SIZE = 12;
  const LINE_HEIGHT = 1.25;
  const LINE_PX = FONT_SIZE * LINE_HEIGHT;

  return (
    <div style={{ position: "relative" }}>
      {onAdd && !readOnly ? (
        <button
          type="button"
          onClick={onAdd}
          title="Add"
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            width: 22,
            height: 22,
            borderRadius: 6,
            border: "1px solid #bbb",
            background: "white",
            cursor: "pointer",
            fontWeight: 700,
            lineHeight: "18px",
          }}
        >
          +
        </button>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingRight: onAdd && !readOnly ? 26 : 0 }}>
        {Array.from({ length: slots }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div
              style={{
                width: 18,
                flex: "0 0 18px",
                textAlign: "center",
                fontSize: FONT_SIZE,
                lineHeight: `${LINE_PX}px`,
                height: `${LINE_PX}px`,
                paddingTop: 6,
                color: "#111",
                userSelect: "none",
              }}
              aria-hidden="true"
            >
              {prefixLabel ? prefixLabel(i) : "•"}
            </div>

            <div style={{ flex: 1 }}>
              <EditableText
                value={getValue(i) ?? ""}
                placeholder={placeholder ?? "…"}
                readOnly={readOnly}
                onCommit={(v) => onCommit(i, v)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- domain helpers ---------------- */

function normalizeActors(actorsIn: Actor[], actorCount: number) {
  if (!Array.isArray(actorsIn)) actorsIn = [];
  const N = actorCount ?? actorsIn.length;
  const actors = actorsIn.slice(0, N).map((a) => ({
    ...a,
    actorValueProposition: a.actorValueProposition ?? { statement: "" },
    costs: Array.isArray(a.costs) ? a.costs.slice() : [],
    benefits: Array.isArray(a.benefits) ? a.benefits.slice() : [],
    kpis: Array.isArray(a.kpis) ? a.kpis.slice() : [],
    services: Array.isArray(a.services) ? a.services.slice() : [],
  }));

  while (actors.length < N) {
    actors.push({
      id: `EMPTY-${actors.length + 1}`,
      type: "Other",
      name: `Actor ${actors.length + 1}`,
      actorValueProposition: { statement: "" },
      costs: [],
      benefits: [],
      kpis: [],
      services: [],
    });
  }

  // Enforce fixed actor types by position
  if (actors[0]) actors[0].type = "Customer";
  if (actors[1]) actors[1].type = "Orchestrator";
  for (let i = 2; i < actors.length; i++) actors[i].type = "Other";

  for (const a of actors) ensureMinCostBenefit(a);

  return { actors, N };
}

function ensureMinCostBenefit(a: Actor) {
  a.costs = Array.isArray(a.costs) ? a.costs : [];
  a.benefits = Array.isArray(a.benefits) ? a.benefits : [];

  if (a.costs.length < 1) a.costs.push({ type: "Financial", description: "" });
  if (a.benefits.length < 1) a.benefits.push({ type: "Financial", description: "" });
}

function indicesOfType(items: CBItem[], type: CostBenefitType) {
  const idxs: number[] = [];
  for (let i = 0; i < (items ?? []).length; i++) {
    if (items[i]?.type === type) idxs.push(i);
  }
  return idxs;
}

function countOfType(items: CBItem[] | undefined, type: CostBenefitType) {
  return (items ?? []).filter((x) => x?.type === type).length;
}

function parseServiceLine(line: string): Service {
  const trimmed = line.trim();
  const m = trimmed.match(/^(.*?)(?:\s*\((.*?)\))?\s*$/);
  const name = (m?.[1] ?? "").trim();
  const opsRaw = (m?.[2] ?? "").trim();

  const operations: Operation[] = opsRaw
    ? opsRaw
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((name) => ({ name }))
    : [];

  return { name, operations };
}

function parseProcessLine(
  line: string,
  actorsIn: { id: string; name: string }[]
): { name: string; participantActorIds: string[] } {
  const trimmed = (line ?? "").trim();
  const m = trimmed.match(/^(.*?)(?:\s*\((.*?)\))?\s*$/);
  const name = (m?.[1] ?? "").trim();
  const raw = (m?.[2] ?? "").trim();

  if (!raw) return { name, participantActorIds: [] };

  // token -> actorId (by id and by name, case-insensitive)
  const lookup = new Map<string, string>();
  for (const a of actorsIn ?? []) {
    if (!a) continue;
    lookup.set((a.id ?? "").trim().toLowerCase(), a.id);
    lookup.set((a.name ?? "").trim().toLowerCase(), a.id);
  }

  const participantActorIds: string[] = [];
  for (const token of raw.split(",").map((x) => x.trim()).filter(Boolean)) {
    const id = lookup.get(token.toLowerCase());
    if (id && !participantActorIds.includes(id)) participantActorIds.push(id);
  }

  return { name, participantActorIds };
}

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

/* ---------------- styles ---------------- */

const baseCell: CSSProperties = {
  border: "1px solid #222",
  verticalAlign: "top",
  padding: 8,
  fontSize: 12,
  lineHeight: 1.25,
  wordBreak: "break-word",
  background: "white",
};

const cell: CSSProperties = { ...baseCell };

const thCell: CSSProperties = {
  ...baseCell,
  fontWeight: 700,
  textAlign: "center",
};

const rowLabelCell: CSSProperties = {
  ...baseCell,
  width: 220,
  fontWeight: 700,
};

const rowLabelIndentCell: CSSProperties = {
  ...rowLabelCell,
};

const networkCell: CSSProperties = {
  ...baseCell,
  fontWeight: 600,
};

const cellLeft: CSSProperties = {
  ...baseCell,
  textAlign: "left",
};
