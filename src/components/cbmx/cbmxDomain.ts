export type CostBenefitType = "Financial" | "Environmental" | "Social" | "OtherNonFinancial";


export type CBItem = { type: CostBenefitType; description: string };
export type KPI = { name: string; rank: number };
export type Operation = { name: string };
export type Service = { name: string; operations: Operation[] };

export type Actor = {
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
      if (!nonEmpty) issues.push({
        level: "warning",
        message: `Actor "${name}" has costs but all descriptions are empty.`,
      });
    }

    if (!Array.isArray(a.benefits) || a.benefits.length < 1) {
      issues.push({ level: "error", message: `Actor "${name}" must have at least 1 Benefit item.` });
    } else {
      const nonEmpty = a.benefits.some((b) => (b.description ?? "").trim().length > 0);
      if (!nonEmpty) issues.push({
        level: "warning",
        message: `Actor "${name}" has benefits but all descriptions are empty.`,
      });
    }

    const vp = (a.actorValueProposition?.statement ?? "").trim();
    if (!vp) issues.push({ level: "warning", message: `Actor "${name}" value proposition statement is empty.` });
  }

  const nvp = (bp.networkValueProposition?.statement ?? "").trim();
  if (!nvp) issues.push({ level: "warning", message: "Network value proposition statement is empty." });

  return issues;
}

/* ---------------- domain helpers ---------------- */

export function normalizeActors(actorsIn: Actor[], actorCount?: number) {
  const safeIn: Actor[] = Array.isArray(actorsIn) ? actorsIn : [];
  const N = Math.max(0, Math.min(actorCount ?? safeIn.length, safeIn.length));

  const actors: Actor[] = safeIn.slice(0, N).map((a) => ({
    ...a,
    actorValueProposition: a.actorValueProposition ?? { statement: "" },
    costs: Array.isArray(a.costs) ? a.costs.slice() : [],
    benefits: Array.isArray(a.benefits) ? a.benefits.slice() : [],
    kpis: Array.isArray(a.kpis) ? a.kpis.slice() : [],
    services: Array.isArray(a.services) ? a.services.slice() : [],
  }));

  // Enforce fixed actor types by position
  if (actors[0]) actors[0].type = "Customer";
  if (actors[1]) actors[1].type = "Orchestrator";
  for (let i = 2; i < actors.length; i++) actors[i].type = "Other";

  for (const a of actors) ensureMinCostBenefit(a);

  return { actors, N: actors.length };
}

export function ensureMinCostBenefit(a: Actor) {
  a.costs = Array.isArray(a.costs) ? a.costs : [];
  a.benefits = Array.isArray(a.benefits) ? a.benefits : [];

  if (a.costs.length < 1) a.costs.push({ type: "Financial", description: "" });
  if (a.benefits.length < 1) a.benefits.push({ type: "Financial", description: "" });
}

export function indicesOfType(items: CBItem[], type: CostBenefitType) {
  const idxs: number[] = [];
  for (let i = 0; i < (items ?? []).length; i++) {
    if (items[i]?.type === type) idxs.push(i);
  }
  return idxs;
}

export function countOfType(items: CBItem[] | undefined, type: CostBenefitType) {
  return (items ?? []).filter((x) => x?.type === type).length;
}

export function parseServiceLine(line: string): Service {
  const trimmed = (line ?? "").trim();
  const m = trimmed.match(/^(.*?)(?:\s*\((.*?)\))?\s*$/);
  const name = (m?.[1] ?? "").trim();
  const opsRaw = (m?.[2] ?? "").trim();

  const operations: Operation[] = opsRaw
    ? opsRaw
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((opName) => ({ name: opName }))
    : [];

  return { name, operations };
}

export function parseProcessLine(
  line: string,
  actorsIn: { id: string; name: string }[]
): { name: string; participantActorIds: string[] } {
  const trimmed = (line ?? "").trim();
  const m = trimmed.match(/^(.*?)(?:\s*\((.*?)\))?\s*$/);
  const name = (m?.[1] ?? "").trim();
  const raw = (m?.[2] ?? "").trim();

  if (!raw) return { name, participantActorIds: [] };

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

export function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}