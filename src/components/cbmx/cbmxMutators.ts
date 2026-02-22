import {
  type Actor,
  type CBItem,
  type CBMXBlueprint,
  type CostBenefitType,
  type Service,
  ensureMinCostBenefit,
  indicesOfType,
  parseProcessLine,
  parseServiceLine,
} from "./cbmxDomain";

export function setNetworkVP(next: CBMXBlueprint, statement: string) {
  next.networkValueProposition = next.networkValueProposition ?? {};
  next.networkValueProposition.statement = statement;
}

export function setActorName(next: CBMXBlueprint, actorId: string, name: string) {
  const a = next.actors.find((x) => x.id === actorId);
  if (!a) return;
  a.name = name;
}

export function setActorVP(next: CBMXBlueprint, actorId: string, statement: string) {
  const a = next.actors.find((x) => x.id === actorId);
  if (!a) return;
  a.actorValueProposition = a.actorValueProposition ?? { statement: "" };
  a.actorValueProposition.statement = statement;
}

export function setNthValueItem(
  next: CBMXBlueprint,
  actorId: string,
  kind: "costs" | "benefits",
  type: CostBenefitType,
  slotIndex: number,
  description: string
) {
  const a = next.actors.find((x) => x.id === actorId);
  if (!a) return;

  const arr = (a[kind] ?? []) as CBItem[];
  const idxs = indicesOfType(arr, type);
  const cleaned = (description ?? "").trim();

  if (slotIndex < idxs.length) {
    const realIndex = idxs[slotIndex];
    if (!cleaned) arr.splice(realIndex, 1);
    else arr[realIndex] = { ...arr[realIndex], type, description: cleaned };
  } else {
    if (!cleaned) return;
    arr.push({ type, description: cleaned });
  }

  a[kind] = arr;
  ensureMinCostBenefit(a);
}

export function addCostBenefitSlot(
  next: CBMXBlueprint,
  actorId: string,
  kind: "costs" | "benefits",
  type: CostBenefitType
) {
  const a = next.actors.find((x) => x.id === actorId);
  if (!a) return;
  a[kind] = Array.isArray(a[kind]) ? a[kind] : [];
  (a[kind] as CBItem[]).push({ type, description: "" });
  ensureMinCostBenefit(a);
}

export function getKpiSlotNameFlexible(a: Actor, slotIndex: number) {
  const sorted = (a.kpis ?? []).slice().sort((x, y) => (x.rank ?? 999) - (y.rank ?? 999));
  return sorted[slotIndex]?.name ?? "";
}

export function setKpiSlotFlexible(next: CBMXBlueprint, actorId: string, slotIndex: number, name: string) {
  const a = next.actors.find((x) => x.id === actorId);
  if (!a) return;

  a.kpis = Array.isArray(a.kpis) ? a.kpis : [];
  const sorted = a.kpis.slice().sort((x, y) => (x.rank ?? 999) - (y.rank ?? 999));

  const cleaned = (name ?? "").trim();
  const target = sorted[slotIndex];

  if (!target) {
    if (!cleaned) return;
    const maxRank = a.kpis.reduce((m, k) => Math.max(m, k.rank ?? 0), 0);
    a.kpis.push({ name: cleaned, rank: maxRank + 1 });
    return;
  }

  const idx = a.kpis.findIndex((k) => (k.rank ?? 0) === (target.rank ?? 0) && (k.name ?? "") === (target.name ?? ""));
  if (idx < 0) return;

  if (!cleaned) a.kpis.splice(idx, 1);
  else a.kpis[idx] = { ...a.kpis[idx], name: cleaned };
}

export function addKpiSlot(next: CBMXBlueprint, actorId: string) {
  const a = next.actors.find((x) => x.id === actorId);
  if (!a) return;
  a.kpis = Array.isArray(a.kpis) ? a.kpis : [];
  const maxRank = a.kpis.reduce((m, k) => Math.max(m, k.rank ?? 0), 0);
  a.kpis.push({ name: "", rank: maxRank + 1 });
}

export function setServiceSlot(next: CBMXBlueprint, actorId: string, slotIndex: number, line: string) {
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

  const parsed: Service = parseServiceLine(cleaned);
  if (!parsed.name) {
    if (slotIndex < arr.length) arr.splice(slotIndex, 1);
    a.services = arr;
    return;
  }

  if (slotIndex < arr.length) arr[slotIndex] = parsed;
  else arr.push(parsed);

  a.services = arr;
}

export function addServiceSlot(next: CBMXBlueprint, actorId: string) {
  const a = next.actors.find((x) => x.id === actorId);
  if (!a) return;
  a.services = Array.isArray(a.services) ? a.services : [];
  a.services.push({ name: "", operations: [] });
}

export function setProcessSlot(next: CBMXBlueprint, slotIndex: number, line: string) {
  next.coCreationProcesses = Array.isArray(next.coCreationProcesses) ? next.coCreationProcesses : [];
  const arr = next.coCreationProcesses.slice();
  const cleaned = (line ?? "").trim();

  if (!cleaned) {
    if (slotIndex < arr.length) arr.splice(slotIndex, 1);
    next.coCreationProcesses = arr;
    return;
  }

  const parsed = parseProcessLine(cleaned, next.actors ?? []);

  if (slotIndex < arr.length) {
    arr[slotIndex] = { ...arr[slotIndex], name: parsed.name, participantActorIds: parsed.participantActorIds };
  } else {
    arr.push({ id: `P${arr.length + 1}`, name: parsed.name, participantActorIds: parsed.participantActorIds });
  }

  next.coCreationProcesses = arr;
}


export function addProcessSlot(next: CBMXBlueprint) {
  next.coCreationProcesses = Array.isArray(next.coCreationProcesses) ? next.coCreationProcesses : [];
  const arr = next.coCreationProcesses;
  arr.push({ id: `P${arr.length + 1}`, name: "", participantActorIds: [] });
}