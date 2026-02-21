import React from "react";

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
  networkValueProposition?: { statement?: string; targetCustomer?: string };
  actors: Actor[];
  coCreationProcesses?: { id: string; name: string; participantActorIds?: string[] }[];
};

export default function CBMXTable({ blueprint, actorCount = 5 }: { blueprint: CBMXBlueprint; actorCount?: number }) {
  const bp = blueprint;
  validateBlueprint(bp);

  const { actors, N } = normalizeActors(bp.actors, actorCount);
  const colspanNetwork = N * 2;

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
          {/* Network Value Proposition (merged across all actor subcolumns) */}
          <tr>
            <td style={rowLabelCell}>Network Value Proposition</td>
            <td colSpan={colspanNetwork} style={networkCell}>
              <div>
                <strong>Statement:</strong>{" "}
                {bp.networkValueProposition?.statement ?? ""}
              </div>
              <div style={smallText}>
                <strong>Target customer:</strong>{" "}
                {bp.networkValueProposition?.targetCustomer ?? ""}
              </div>
            </td>
          </tr>

          {/* Actor Type row: one cell per actor (colspan=2) */}
          <tr>
            <td style={rowLabelCell}>Actor Type</td>
            {actors.map((a) => (
              <td key={a.id} colSpan={2} style={cell}>
                {a.type}
              </td>
            ))}
          </tr>

          {/* Actor row: actor names (one cell per actor, spanning both subcolumns) */}
          <tr>
            <td style={rowLabelCell}>Actor</td>
            {actors.map((a) => (
              <td key={a.id} colSpan={2} style={cell}>
                {a.name}
              </td>
            ))}
          </tr>

          {/* Actor Value Proposition */}
          <tr>
            <td style={rowLabelCell}>Actor Value Proposition</td>
            {actors.map((a) => (
              <td key={a.id} colSpan={2} style={cell}>
                {a.actorValueProposition?.statement ?? ""}
              </td>
            ))}
          </tr>

          {/* Costs & Benefits row carries the "Costs" and "Benefits" headings */}
          <tr>
            <td style={rowLabelCell}>Costs &amp; Benefits</td>
            {actors.map((a) => (
              <React.Fragment key={a.id}>
                <th style={thCell}>Costs</th>
                <th style={thCell}>Benefits</th>
              </React.Fragment>
            ))}
          </tr>

          {rowByType("Financial", "Financial", actors)}
          {rowByType("Environmental", "Environmental", actors)}
          {rowByType("Social", "Social", actors)}
          {rowByType("Other Non-Financial", "OtherNonFinancial", actors)}

          {/* KPIs */}
          <tr>
            <td style={rowLabelCell}>KPIs</td>
            {actors.map((a) => {
              const kpis = (a.kpis || [])
                .slice()
                .sort((x, y) => (x.rank ?? 999) - (y.rank ?? 999))
                .map((k) => `${k.rank}. ${k.name}`.trim());
              return (
                <td key={a.id} colSpan={2} style={cell}>
                  {renderList(kpis)}
                </td>
              );
            })}
          </tr>

          {/* Actor Services */}
          <tr>
            <td style={rowLabelCell}>Actor Services</td>
            {actors.map((a) => {
              const lines = (a.services || []).map((s) => {
                const ops = (s.operations || []).map((o) => o.name).filter(Boolean);
                return ops.length ? `${s.name} (${ops.join(", ")})` : `${s.name}`;
              });
              return (
                <td key={a.id} colSpan={2} style={cell}>
                  {renderList(lines)}
                </td>
              );
            })}
          </tr>

          {/* Co-creation Processes (merged across all actor subcolumns) */}
          <tr>
            <td style={rowLabelCell}>Co-creation Processes</td>
            <td colSpan={colspanNetwork} style={cell}>
              {renderList((bp.coCreationProcesses || []).map((p) => p.name))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- helpers (ported from your HTML renderer) ---------------- */

function validateBlueprint(bp: CBMXBlueprint) {
  if (!bp || !Array.isArray(bp.actors)) throw new Error("Blueprint missing actors.");
  if (bp.actors.length < 2) throw new Error("Need at least 2 actors.");

  const customers = bp.actors.filter((a) => a.type === "Customer").length;
  const orch = bp.actors.filter((a) => a.type === "Orchestrator").length;
  if (customers !== 1) throw new Error("Constraint violated: exactly 1 Customer required.");
  if (orch !== 1) throw new Error("Constraint violated: exactly 1 Orchestrator required.");

  for (const a of bp.actors) {
    if (!a.costs || a.costs.length < 1) throw new Error(`Actor ${a.name} must have at least 1 Cost item.`);
    if (!a.benefits || a.benefits.length < 1) throw new Error(`Actor ${a.name} must have at least 1 Benefit item.`);
  }
}

function normalizeActors(actorsIn: Actor[], actorCount: number) {
  const N = actorCount ?? actorsIn.length;
  const actors = actorsIn.slice(0, N).map((a) => ({ ...a }));

  while (actors.length < N) {
    actors.push({
      id: `EMPTY-${actors.length + 1}`,
      type: "Other",
      name: `Actor ${actors.length + 1}`,
      actorValueProposition: { statement: "" },
      costs: [{ type: "Financial", description: "" }],
      benefits: [{ type: "Financial", description: "" }],
      kpis: [{ name: "", rank: 1 }],
      services: [{ name: "", operations: [] }],
    });
  }
  return { actors, N };
}

function groupItemsByType(items: CBItem[]) {
  const map: Record<CostBenefitType, string[]> = {
    Financial: [],
    Environmental: [],
    Social: [],
    OtherNonFinancial: [],
  };
  for (const it of items || []) map[it.type]?.push(it.description || "");
  return map;
}

function rowByType(label: string, typeKey: CostBenefitType, actors: Actor[]) {
  return (
    <tr key={`row-${typeKey}`}>
      <td style={rowLabelIndentCell}>&nbsp;&nbsp;{label}</td>
      {actors.map((a) => {
        const c = groupItemsByType(a.costs)[typeKey];
        const b = groupItemsByType(a.benefits)[typeKey];
        return (
          <React.Fragment key={a.id}>
            <td style={cell}>{renderList(c)}</td>
            <td style={cell}>{renderList(b)}</td>
          </React.Fragment>
        );
      })}
    </tr>
  );
}

function renderList(items: string[]) {
  const cleaned = (items || []).map((x) => (x ?? "").trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {cleaned.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
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

const smallText: React.CSSProperties = {
  fontSize: 11,
  color: "#333",
  marginTop: 4,
};