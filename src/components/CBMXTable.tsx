import React, { useMemo, useState } from "react";

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

/** Default slots per your rule-of-thumb (can be made configurable later) */
const PER_VALUE_TYPE_SLOTS = 2; // costs/benefits per type
const KPI_SLOTS = 3;
const SERVICE_SLOTS = 3;
const PROCESS_SLOTS = 3;

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
  // Normalize actors into a fixed-length rendering list, and enforce fixed actor types by position.
  const { actors, N } = useMemo(() => normalizeActors(blueprint.actors, actorCount), [blueprint.actors, actorCount]);
  const colspanNetwork = N * 2;

  // --- Generic immutable update helper
  function updateBlueprint(mutator: (draft: CBMXBlueprint) => void) {
    if (!onChange) return;
    const next: CBMXBlueprint = deepClone(blueprint);
    mutator(next);
    // enforce actor types & minimum required arrays on save
    next.actors = normalizeActors(next.actors, next.actors.length).actors;
    onChange(next);
  }

  // --- Network VP
  function setNetworkVP(statement: string) {
    updateBlueprint((next) => {
      next.networkValueProposition = next.networkValueProposition ?? {};
      next.networkValueProposition.statement = statement;
    });
  }

  // --- Actor name / VP statement
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

  // --- Costs/Benefits: slot-based editing (2 per type)
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
          // delete
          arr.splice(realIndex, 1);
        } else {
          arr[realIndex] = { ...arr[realIndex], type, description: cleaned };
        }
      } else {
        // create if non-empty
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

  // --- KPIs: 3 slots, rank = slotIndex+1
  function setKpiSlot(actorId: string, slotIndex: number, name: string) {
    updateBlueprint((next) => {
      const a = next.actors.find((x) => x.id === actorId);
      if (!a) return;

      const arr = (a.kpis ?? []).slice();
      const rank = slotIndex + 1;
      const cleaned = (name ?? "").trim();

      const existingIndex = arr.findIndex((k) => (k.rank ?? 0) === rank);

      if (!cleaned) {
        // delete the KPI of this rank if exists
        if (existingIndex >= 0) arr.splice(existingIndex, 1);
      } else {
        if (existingIndex >= 0) arr[existingIndex] = { ...arr[existingIndex], name: cleaned, rank };
        else arr.push({ name: cleaned, rank });
      }

      // keep ranks stable; do not auto-re-rank others
      a.kpis = arr;
    });
  }

  function getKpiSlotName(a: Actor, slotIndex: number) {
    const rank = slotIndex + 1;
    const k = (a.kpis ?? []).find((x) => (x.rank ?? 0) === rank);
    return k?.name ?? "";
  }

  // --- Services: 3 slots. Edit line supports:
  // "Service name" OR "Service name (op1, op2)"
  function setServiceSlot(actorId: string, slotIndex: number, line: string) {
    updateBlueprint((next) => {
      const a = next.actors.find((x) => x.id === actorId);
      if (!a) return;

      const cleaned = (line ?? "").trim();
      const arr = (a.services ?? []).slice();

      if (!cleaned) {
        // delete slot if exists
        if (slotIndex < arr.length) arr.splice(slotIndex, 1);
        a.services = arr;
        return;
      }

      const parsed = parseServiceLine(cleaned);

      if (slotIndex < arr.length) {
        arr[slotIndex] = parsed;
      } else {
        // create
        arr.push(parsed);
      }
      a.services = arr;
    });
  }

  function getServiceSlotLine(a: Actor, slotIndex: number) {
    const s = (a.services ?? [])[slotIndex];
    if (!s) return "";
    const ops = (s.operations ?? []).map((o) => o.name).filter(Boolean);
    return ops.length ? `${s.name} (${ops.join(", ")})` : `${s.name}`;
  }

  // --- Co-creation processes: 3 slots (name only)
  function setProcessSlot(slotIndex: number, name: string) {
    updateBlueprint((next) => {
      next.coCreationProcesses = next.coCreationProcesses ?? [];
      const arr = next.coCreationProcesses.slice();
      const cleaned = (name ?? "").trim();

      if (!cleaned) {
        if (slotIndex < arr.length) arr.splice(slotIndex, 1);
        next.coCreationProcesses = arr;
        return;
      }

      if (slotIndex < arr.length) {
        arr[slotIndex] = { ...arr[slotIndex], name: cleaned };
      } else {
        arr.push({ id: `P${arr.length + 1}`, name: cleaned, participantActorIds: [] });
      }

      next.coCreationProcesses = arr;
    });
  }

  function getProcessSlotName(slotIndex: number) {
    const p = (blueprint.coCreationProcesses ?? [])[slotIndex];
    return p?.name ?? "";
  }

  // ---------- Render ----------
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
          {/* Net. Value Proposition (merged across all actor subcolumns) */}
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

          {/* Actor Type row: one cell per actor (colspan=2) - read-only by design */}
          <tr>
            <td style={rowLabelCell}>Actor Type</td>
            {actors.map((a) => (
              <td key={a.id} colSpan={2} style={cell}>
                {a.type}
              </td>
            ))}
          </tr>

          {/* Actor row: actor names */}
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

          {/* Actor Value Proposition */}
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

          {/* Costs & Benefits header row */}
          <tr>
            <td style={rowLabelCell}>Costs &amp; Benefits</td>
            {actors.map((a) => (
              <React.Fragment key={a.id}>
                <th style={thCell}>Costs</th>
                <th style={thCell}>Benefits</th>
              </React.Fragment>
            ))}
          </tr>

          {/* Costs/Benefits per type, fixed 2 slots each */}
          {VALUE_TYPES.map(({ label, key }) => (
            <tr key={`row-${key}`}>
              <td style={rowLabelIndentCell}>&nbsp;&nbsp;{label}</td>
              {actors.map((a) => (
                <React.Fragment key={a.id}>
                  <td style={cell}>
                    <SlotStack
                      slots={PER_VALUE_TYPE_SLOTS}
                      readOnly={!onChange || a.id.startsWith("EMPTY-")}
                      getValue={(i) => getNthValueItemDescription(a, "costs", key, i)}
                      placeholder={onChange ? "…" : ""}
                      onCommit={(i, v) => setNthValueItem(a.id, "costs", key, i, v)}
                    />
                  </td>
                  <td style={cell}>
                    <SlotStack
                      slots={PER_VALUE_TYPE_SLOTS}
                      readOnly={!onChange || a.id.startsWith("EMPTY-")}
                      getValue={(i) => getNthValueItemDescription(a, "benefits", key, i)}
                      placeholder={onChange ? "…" : ""}
                      onCommit={(i, v) => setNthValueItem(a.id, "benefits", key, i, v)}
                    />
                  </td>
                </React.Fragment>
              ))}
            </tr>
          ))}

          {/* KPIs (ranked) - 3 slots */}
          <tr>
            <td style={rowLabelCell}>KPIs (ranked)</td>
            {actors.map((a) => (
              <td key={a.id} colSpan={2} style={cell}>
                <SlotStack
                  slots={KPI_SLOTS}
                  readOnly={!onChange || a.id.startsWith("EMPTY-")}
                  getValue={(i) => getKpiSlotName(a, i)}
                  placeholder={onChange ? "…" : ""}
                  prefixLabel={(i) => `${i + 1}. `}
                  onCommit={(i, v) => setKpiSlot(a.id, i, v)}
                />
              </td>
            ))}
          </tr>

          {/* Actor Services - 3 slots (name + optional operations in parentheses) */}
          <tr>
            <td style={rowLabelCell}>Actor Services</td>
            {actors.map((a) => (
              <td key={a.id} colSpan={2} style={cell}>
                <SlotStack
                  slots={SERVICE_SLOTS}
                  readOnly={!onChange || a.id.startsWith("EMPTY-")}
                  getValue={(i) => getServiceSlotLine(a, i)}
                  placeholder={onChange ? "Service (op1, op2)" : ""}
                  onCommit={(i, v) => setServiceSlot(a.id, i, v)}
                />
              </td>
            ))}
          </tr>

          {/* Co-creation Processes - 3 slots */}
          <tr>
            <td style={rowLabelCell}>Co-Creation Processes</td>
            <td colSpan={colspanNetwork} style={cell}>
              <SlotStack
                slots={PROCESS_SLOTS}
                readOnly={!onChange}
                getValue={(i) => getProcessSlotName(i)}
                placeholder={onChange ? "…" : ""}
                onCommit={(i, v) => setProcessSlot(i, v)}
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

  // Keep draft in sync when not editing
  React.useEffect(() => {
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

  const commonStyle: React.CSSProperties = {
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
        <textarea
          autoFocus
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={commonStyle}
        />
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
}: {
  slots: number;
  getValue: (slotIndex: number) => string;
  onCommit: (slotIndex: number, next: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  prefixLabel?: (slotIndex: number) => string;
}) {
  const FONT_SIZE = 12;
  const LINE_HEIGHT = 1.25; // must match EditableText commonStyle lineHeight
  const LINE_PX = FONT_SIZE * LINE_HEIGHT; // 15px

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {Array.from({ length: slots }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          {/* Left marker: either numbering prefix (KPIs) or bullet dot */}
          <div
            style={{
              width: 18,
              flex: "0 0 18px",
              textAlign: "center",

              // Exact vertical alignment with first text line:
              fontSize: FONT_SIZE,
              lineHeight: `${LINE_PX}px`, // 15px
              height: `${LINE_PX}px`,     // lock marker box to 1 line
              paddingTop: 6,              // must match EditableText padding top
              marginTop: 0,

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

  // Enforce fixed actor types by position (1st=Customer, 2nd=Orchestrator, rest=Other)
  if (actors[0]) actors[0].type = "Customer";
  if (actors[1]) actors[1].type = "Orchestrator";
  for (let i = 2; i < actors.length; i++) actors[i].type = "Other";

  // Ensure each actor has >= 1 cost and >= 1 benefit to satisfy your constraint
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

function parseServiceLine(line: string): Service {
  // Accept: "Name" or "Name (op1, op2)"
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

function deepClone<T>(x: T): T {
  // Avoid relying on structuredClone typing/lib settings across TS configs
  return JSON.parse(JSON.stringify(x));
}

/* ---------------- styles (matching your HTML CSS closely) ---------------- */

const baseCell: React.CSSProperties = {
  border: "1px solid #222",
  verticalAlign: "top",
  padding: 8,
  fontSize: 12,
  lineHeight: 1.25,
  wordBreak: "break-word",
  background: "white",
};

const cell: React.CSSProperties = { ...baseCell };

const thCell: React.CSSProperties = {
  ...baseCell,
  fontWeight: 700,
  textAlign: "center",
};

const rowLabelCell: React.CSSProperties = {
  ...baseCell,
  width: 220,
  fontWeight: 700,
};

const rowLabelIndentCell: React.CSSProperties = {
  ...rowLabelCell,
};

const networkCell: React.CSSProperties = {
  ...baseCell,
  fontWeight: 600,
};
