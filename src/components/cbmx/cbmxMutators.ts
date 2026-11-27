import {
  type Actor,
  type CBItem,
  type CBMXBlueprint,
  type CoCreationProcess,
  type CostBenefitType,
  type Service,
  ensureMinCostBenefit,
  indicesOfType,
  makeNewProcessId,
  parseProcessLine,
  parseServiceLine,
} from "./cbmxDomain";

export function setNetworkVP(next: CBMXBlueprint, statement: string) {
  next.networkValueProposition = next.networkValueProposition ?? {};
  next.networkValueProposition.statement = statement;
}

export function setServiceScenario(next: CBMXBlueprint, text: string) {
  next.serviceScenario = text;
}

export function setActorType(next: CBMXBlueprint, actorId: string, type: "Customer" | "Other") {
  if (type !== "Customer" && type !== "Other") return;
  const index = next.actors.findIndex(actor => actor.id === actorId);
  if (index < 2 || next.actors[index].type === type) return;
  next.actors[index].type = type;
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

  const parsed = parseProcessLine(cleaned, next.actors ?? []);
  if (!parsed.name.trim()) throw new Error("Enter a co-creation process name.");

  if (slotIndex < arr.length) {
    arr[slotIndex] = { ...arr[slotIndex], name: parsed.name, participantActorIds: parsed.participantActorIds };
  } else {
    const newProcess: CoCreationProcess = {
      id: makeNewProcessId(arr),
      name: parsed.name,
      participantActorIds: parsed.participantActorIds,
    };
    arr.push(newProcess);
  }

  next.coCreationProcesses = arr;
}

export function renameProcessById(next: CBMXBlueprint, processId: string, line: string) {
  const index = (next.coCreationProcesses ?? []).findIndex((process) => process.id === processId);
  if (index < 0) throw new Error("This co-creation process no longer exists. Reload the blueprint.");
  setProcessSlot(next, index, line);
}

export function addProcessSlot(next: CBMXBlueprint) {
  next.coCreationProcesses = Array.isArray(next.coCreationProcesses) ? next.coCreationProcesses : [];
  const arr = next.coCreationProcesses;
  arr.push({ id: makeNewProcessId(arr), name: "", participantActorIds: [] });
}

export function getProcessById(next: CBMXBlueprint, processId: string) {
  return (next.coCreationProcesses ?? []).find((p) => p.id === processId);
}

export function removeProcessById(next: CBMXBlueprint, processId: string) {
  next.coCreationProcesses = (next.coCreationProcesses ?? []).filter((p) => p.id !== processId);
}

/* ---------------- actors ---------------- */

export function moveActor(next: CBMXBlueprint, actorId: string, direction: "left" | "right") {
  if (direction !== "left" && direction !== "right") return;
  const index = next.actors.findIndex(actor => actor.id === actorId);
  if (index < 2) return;
  const targetIndex = direction === "left" ? index - 1 : index + 1;
  if (targetIndex < 2 || targetIndex >= next.actors.length) return;
  const [actor] = next.actors.splice(index, 1);
  next.actors.splice(targetIndex, 0, actor);
}

function nextActorNumericId(actors: Actor[]): number {
  let maxN = 0;
  for (const a of actors) {
    const m = /^A(\d+)$/.exec(a.id);
    if (m) maxN = Math.max(maxN, Number(m[1]));
  }
  return maxN + 1;
}

function makeNewActor(id: string): Actor {
  return {
    id,
    type: "Other",
    name: "Click to edit",
    actorValueProposition: { statement: "Click to edit" },
    costs: [{ type: "Financial", description: "Click to edit" }],
    benefits: [{ type: "Financial", description: "Click to edit" }],
    kpis: [],
    services: [{ name: "Click to edit", operations: [] }],
  };
}

export function addActor(next: CBMXBlueprint) {
  next.actors = Array.isArray(next.actors) ? next.actors : [];
  if (next.actors.length >= 10) return;

  const n = nextActorNumericId(next.actors);
  const id = `A${n}`;
  next.actors.push(makeNewActor(id));

  if (Array.isArray(next.coCreationProcesses)) {
    for (const p of next.coCreationProcesses) {
      p.participantActorIds = Array.isArray(p.participantActorIds) ? p.participantActorIds : [];
      if (!p.participantActorIds.includes(id)) p.participantActorIds.push(id);
    }
  }
}

export function removeActor(next: CBMXBlueprint, actorId: string) {
  next.actors = Array.isArray(next.actors) ? next.actors : [];
  if (next.actors.length <= 2) return;

  const idx = next.actors.findIndex((a) => a.id === actorId);
  if (idx < 0) return;

  if (idx === 0 || idx === 1) return;

  next.actors = next.actors.filter((a) => a.id !== actorId);

  if (Array.isArray(next.coCreationProcesses)) {
    for (const p of next.coCreationProcesses) {
      if (!Array.isArray(p.participantActorIds)) continue;
      p.participantActorIds = p.participantActorIds.filter((id) => id !== actorId);
    }
  }
}

/* Item-list operations retain source positions and reject drafts from an older list. */
export type ActorItemKind = "costs" | "benefits" | "kpis" | "services";
export function actorListRevision(actor: Actor | undefined, kind: ActorItemKind): string {
  return JSON.stringify(actor?.[kind] ?? []);
}

function guardedActorList(next: CBMXBlueprint, actorId: string, kind: ActorItemKind, revision: string, index?: number) {
  const actor = next.actors.find(item => item.id === actorId);
  if (!actor || actorListRevision(actor, kind) !== revision)
    throw new Error("This list changed. Cancel this edit and try again.");
  const list = actor[kind] ?? [];
  if (index !== undefined && (!Number.isInteger(index) || index < 0 || index >= list.length))
    throw new Error("This item no longer exists. Cancel this edit and try again.");
  return actor;
}

export function editActorItem(next: CBMXBlueprint, actorId: string, kind: ActorItemKind, revision: string, index: number, value: string) {
  const actor = guardedActorList(next, actorId, kind, revision, index);
  const cleaned = value.trim();
  if (!cleaned) { removeActorItem(next, actorId, kind, revision, index); return; }
  if (kind === "costs" || kind === "benefits") {
    actor[kind][index] = { ...actor[kind][index], description: cleaned };
    ensureMinCostBenefit(actor);
  } else if (kind === "kpis") actor.kpis[index] = { ...actor.kpis[index], name: cleaned };
  else {
    const service = parseServiceLine(cleaned);
    if (!service.name) { removeActorItem(next, actorId, kind, revision, index); return; }
    actor.services[index] = { ...actor.services[index], ...service };
  }
}

export function appendActorItem(next: CBMXBlueprint, actorId: string, kind: ActorItemKind, revision: string, value: string, type?: CostBenefitType) {
  const actor = guardedActorList(next, actorId, kind, revision);
  const cleaned = value.trim();
  if (!cleaned) throw new Error("Enter an item before adding it.");
  if (kind === "costs" || kind === "benefits") {
    if (!type) throw new Error("Select an outcome category.");
    actor[kind] = [...(actor[kind] ?? []), { type, description: cleaned }];
    ensureMinCostBenefit(actor);
  } else if (kind === "kpis") {
    const rank = (actor.kpis ?? []).reduce((max, item) => Math.max(max, item.rank ?? 0), 0) + 1;
    actor.kpis = [...(actor.kpis ?? []), { name: cleaned, rank }];
  } else {
    const service = parseServiceLine(cleaned);
    if (!service.name) throw new Error("Enter a service name.");
    actor.services = [...(actor.services ?? []), service];
  }
}

export function removeActorItem(next: CBMXBlueprint, actorId: string, kind: ActorItemKind, revision: string, index: number) {
  const actor = guardedActorList(next, actorId, kind, revision, index);
  actor[kind].splice(index, 1);
  if (kind === "costs" || kind === "benefits") ensureMinCostBenefit(actor);
}

export function processListRevision(next: CBMXBlueprint): string {
  // Participant parsing uses actor names as well as IDs. An actor rename invalidates that draft too.
  return JSON.stringify([next.coCreationProcesses ?? [], next.actors.map(({ id, name }) => ({ id, name }))]);
}
export function commitProcessItem(next: CBMXBlueprint, revision: string, processId: string | null, value: string) {
  if (processListRevision(next) !== revision) throw new Error("This process list changed. Cancel this edit and try again.");
  if (processId === null) setProcessSlot(next, (next.coCreationProcesses ?? []).length, value);
  else renameProcessById(next, processId, value);
}
