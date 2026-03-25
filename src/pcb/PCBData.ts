// src/pcb/PCBXData.ts
import { supabase } from "../supabaseClient";
import type { ProcessCanvasBlueprint } from "./processCanvasDomain";

export type PCBRow = {
  id: string;
  owner_user_id: string;
  name: string;
  blueprint_json: ProcessCanvasBlueprint;
  created_at?: string;
  updated_at: string;
  version_no: number;
  updated_by_user_id: string | null;
};

export type PCBAccessRole = "owner" | "editor" | "viewer";

export type AccessiblePCBRow = {
  id: string;
  owner_user_id: string;
  name: string;
  updated_at: string;
  role: PCBAccessRole;
  owner_display_name: string | null;
  owner_email: string | null;
};

export type PCBLinkContext = {
  link_id: string;
  cbmx_blueprint_id: string;
  cbmx_process_id: string;
  cbmx_blueprint_name: string;
  cbmx_process_name: string;
};

type PCBRowBase = {
  id: string;
  owner_user_id: string;
  name: string;
  updated_at: string;
};

type PCBMemberRow = {
  process_canvas_blueprint_id: string;
  user_id: string;
  role: PCBAccessRole;
};

type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
};


export type PCBMemberListRow = {
  process_canvas_blueprint_id: string;
  user_id: string;
  role: PCBAccessRole;
  display_name: string | null;
  email: string | null;
};

export async function listPCBMembers(
  pcbId: string,
): Promise<PCBMemberListRow[]> {
  const { data, error } = await supabase.rpc("list_process_canvas_blueprint_members", {
    p_process_canvas_blueprint_id: pcbId,
  });

  if (error) {
    throw new Error(error.message || "Could not load PCB members.");
  }

  return ((data ?? []) as PCBMemberListRow[]).map((row) => ({
    process_canvas_blueprint_id: row.process_canvas_blueprint_id,
    user_id: row.user_id,
    role: row.role,
    display_name: row.display_name ?? null,
    email: row.email ?? null,
  }));
}

export async function addPCBMember(args: {
  pcbId: string;
  userId: string;
  role: Exclude<PCBAccessRole, "owner">;
}): Promise<void> {
  const { error } = await supabase.rpc("add_process_canvas_blueprint_member", {
    p_process_canvas_blueprint_id: args.pcbId,
    p_user_id: args.userId,
    p_role: args.role,
  });

  if (error) {
    throw new Error(error.message || "Could not add PCB member.");
  }
}

export async function updatePCBMemberRole(args: {
  pcbId: string;
  userId: string;
  role: Exclude<PCBAccessRole, "owner">;
}): Promise<void> {
  const { error } = await supabase.rpc("update_process_canvas_blueprint_member_role", {
    p_process_canvas_blueprint_id: args.pcbId,
    p_user_id: args.userId,
    p_role: args.role,
  });

  if (error) {
    throw new Error(error.message || "Could not update PCB member role.");
  }
}

export async function removePCBMember(args: {
  pcbId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase.rpc("remove_process_canvas_blueprint_member", {
    p_process_canvas_blueprint_id: args.pcbId,
    p_user_id: args.userId,
  });

  if (error) {
    throw new Error(error.message || "Could not remove PCB member.");
  }
}

export async function leavePCB(pcbId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_process_canvas_blueprint", {
    p_process_canvas_blueprint_id: pcbId,
  });

  if (error) {
    throw new Error(error.message || "Could not leave PCB.");
  }
}

export type SavePCBResult =
  | {
      ok: true;
      row: PCBRow;
    }
  | {
      ok: false;
      reason: "stale" | "forbidden" | "not_found";
    };

export function canRoleViewPCB(role: PCBAccessRole | null | undefined): boolean {
  return role === "owner" || role === "editor" || role === "viewer";
}

export function canRoleEditPCB(role: PCBAccessRole | null | undefined): boolean {
  return role === "owner" || role === "editor";
}

export async function getPCBRole(
  pcbId: string,
  userId: string,
): Promise<PCBAccessRole | null> {
  const { data, error } = await supabase
    .from("process_canvas_blueprint_members")
    .select("role")
    .eq("process_canvas_blueprint_id", pcbId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not load PCB membership.");
  }

  const row = data as { role?: PCBAccessRole | null } | null;
  return row?.role ?? null;
}

export async function canViewPCB(pcbId: string, userId: string): Promise<boolean> {
  const role = await getPCBRole(pcbId, userId);
  return canRoleViewPCB(role);
}

export async function canEditPCB(pcbId: string, userId: string): Promise<boolean> {
  const role = await getPCBRole(pcbId, userId);
  return canRoleEditPCB(role);
}

export async function listAccessiblePCBs(userId: string): Promise<AccessiblePCBRow[]> {
  const { data: pcbs, error: pcbError } = await supabase
    .from("process_canvas_blueprints")
    .select("id,owner_user_id,name,updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (pcbError) {
    throw new Error(pcbError.message || "Could not list accessible Process Canvas blueprints.");
  }

  const rows = (pcbs ?? []) as PCBRowBase[];
  if (rows.length === 0) return [];

  const pcbIds = rows.map((r) => r.id);
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_user_id).filter(Boolean)));

  const { data: members, error: memberError } = await supabase
    .from("process_canvas_blueprint_members")
    .select("process_canvas_blueprint_id,user_id,role")
    .in("process_canvas_blueprint_id", pcbIds)
    .eq("user_id", userId);

  if (memberError) {
    throw new Error(memberError.message || "Could not load PCB memberships.");
  }

  const { data: owners, error: ownerError } = await supabase
    .from("profiles")
    .select("id,email,display_name")
    .in("id", ownerIds);

  if (ownerError) {
    throw new Error(ownerError.message || "Could not load PCB owner profiles.");
  }

  const memberByPcbId = new Map<string, PCBMemberRow>();
  for (const row of (members ?? []) as PCBMemberRow[]) {
    memberByPcbId.set(row.process_canvas_blueprint_id, row);
  }

  const ownerById = new Map<string, ProfileRow>();
  for (const row of (owners ?? []) as ProfileRow[]) {
    ownerById.set(row.id, row);
  }

  return rows
    .map((pcb) => {
      const membership = memberByPcbId.get(pcb.id);
      if (!membership) return null;

      const owner = ownerById.get(pcb.owner_user_id);

      return {
        id: pcb.id,
        owner_user_id: pcb.owner_user_id,
        name: pcb.name,
        updated_at: pcb.updated_at,
        role: membership.role,
        owner_display_name: owner?.display_name ?? null,
        owner_email: owner?.email ?? null,
      } satisfies AccessiblePCBRow;
    })
    .filter((x): x is AccessiblePCBRow => Boolean(x));
}

export async function loadPCB(pcbId: string): Promise<PCBRow> {
  const { data, error } = await supabase
    .from("process_canvas_blueprints")
    .select("id, owner_user_id, name, blueprint_json, created_at, updated_at, version_no, updated_by_user_id")
    .eq("id", pcbId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not load Process Canvas Blueprint.");
  }

  return data as PCBRow;
}

export async function createPCB(args: {
  ownerUserId: string;
  name: string;
  blueprint: ProcessCanvasBlueprint;
}): Promise<PCBRow> {
  const { data, error } = await supabase
    .from("process_canvas_blueprints")
    .insert({
      owner_user_id: args.ownerUserId,
      name: args.name,
      blueprint_json: args.blueprint,
    })
    .select("id, owner_user_id, name, blueprint_json, created_at, updated_at, version_no, updated_by_user_id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not create Process Canvas Blueprint.");
  }

  return data as PCBRow;
}

export async function updatePCB(args: {
  pcbId: string;
  name: string;
  blueprint: ProcessCanvasBlueprint;
}): Promise<void> {
  const { error } = await supabase
    .from("process_canvas_blueprints")
    .update({
      name: args.name,
      blueprint_json: args.blueprint,
    })
    .eq("id", args.pcbId);

  if (error) {
    throw new Error(error.message || "Could not save Process Canvas Blueprint.");
  }
}

export async function updatePCBWithVersion(args: {
  pcbId: string;
  loadedVersionNo: number;
  userId: string;
  name: string;
  blueprint: ProcessCanvasBlueprint;
}): Promise<SavePCBResult> {
  const { data, error } = await supabase.rpc("save_process_canvas_blueprint_with_version", {
    p_process_canvas_blueprint_id: args.pcbId,
    p_loaded_version_no: args.loadedVersionNo,
    p_name: args.name,
    p_blueprint_json: args.blueprint,
  });

  if (error) {
    throw new Error(error.message || "Could not save Process Canvas Blueprint.");
  }

  const rows = (data ?? []) as Array<{
    ok: boolean;
    reason: "ok" | "stale" | "forbidden" | "not_found";
    id: string | null;
    owner_user_id: string | null;
    name: string | null;
    blueprint_json: ProcessCanvasBlueprint | null;
    created_at: string | null;
    updated_at: string | null;
    version_no: number | null;
    updated_by_user_id: string | null;
  }>;

  const row = rows[0];
  if (!row) {
    throw new Error("Could not save Process Canvas Blueprint.");
  }

if (!row.ok || row.reason !== "ok") {
  const reason: "stale" | "forbidden" | "not_found" =
    row.reason === "ok" ? "stale" : row.reason;
  return { ok: false, reason };
}

  if (
    !row.id ||
    !row.owner_user_id ||
    !row.name ||
    !row.blueprint_json ||
    !row.updated_at ||
    row.version_no == null
  ) {
    throw new Error("Process Canvas save returned an incomplete row.");
  }

  return {
    ok: true,
    row: {
      id: row.id,
      owner_user_id: row.owner_user_id,
      name: row.name,
      blueprint_json: row.blueprint_json,
      created_at: row.created_at ?? undefined,
      updated_at: row.updated_at,
      version_no: row.version_no,
      updated_by_user_id: row.updated_by_user_id,
    },
  };
}

export async function loadPCBLinkContext(pcbId: string): Promise<PCBLinkContext | null> {
  const { data, error } = await supabase
    .from("cbmx_process_links")
    .select(`
      id,
      cbmx_blueprint_id,
      cbmx_process_id,
      blueprints!inner (
        id,
        name,
        blueprint_json
      )
    `)
    .eq("process_canvas_blueprint_id", pcbId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not load Process Canvas link context.");
  }

  if (!data) return null;

  type LinkedBlueprint = {
    id: string;
    name: string;
    blueprint_json?: {
      coCreationProcesses?: Array<{ id: string; name?: string }>;
    };
  };

  type LinkRow = {
    id: string;
    cbmx_blueprint_id: string;
    cbmx_process_id: string;
    blueprints?: LinkedBlueprint | LinkedBlueprint[] | null;
  };

  const row = data as unknown as LinkRow;

  const blueprintRow = Array.isArray(row.blueprints)
    ? row.blueprints[0]
    : row.blueprints ?? undefined;

  const processName =
    blueprintRow?.blueprint_json?.coCreationProcesses?.find(
      (p) => p.id === row.cbmx_process_id,
    )?.name || row.cbmx_process_id;

  return {
    link_id: row.id,
    cbmx_blueprint_id: row.cbmx_blueprint_id,
    cbmx_process_id: row.cbmx_process_id,
    cbmx_blueprint_name: blueprintRow?.name || "CBMX Blueprint",
    cbmx_process_name: processName,
  };
}