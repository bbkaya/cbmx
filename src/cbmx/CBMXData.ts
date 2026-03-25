// src/cbmx/CBMXData.ts
import { supabase } from "../supabaseClient";
import type { CBMXBlueprint } from "../components/cbmx/CBMXTable";

export type BlueprintAccessRole = "owner" | "editor" | "viewer";

export type AccessibleBlueprintRow = {
  id: string;
  name: string;
  owner_user_id: string;
  updated_at: string;
  role: BlueprintAccessRole;
  owner_display_name: string | null;
  owner_email: string | null;
};

export type CBMXRow = {
  id: string;
  name: string;
  owner_user_id: string;
  blueprint_json: CBMXBlueprint;
  created_at?: string;
  updated_at: string;
  version_no: number;
  updated_by_user_id: string | null;
};

type BlueprintRowBase = {
  id: string;
  name: string;
  owner_user_id: string;
  updated_at: string;
};

type BlueprintMemberRow = {
  blueprint_id: string;
  user_id: string;
  role: BlueprintAccessRole;
};

type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
};


export type BlueprintMemberListRow = {
  blueprint_id: string;
  user_id: string;
  role: BlueprintAccessRole;
  display_name: string | null;
  email: string | null;
};

export async function listBlueprintMembers(
  blueprintId: string,
): Promise<BlueprintMemberListRow[]> {
  const { data, error } = await supabase.rpc("list_blueprint_members", {
    p_blueprint_id: blueprintId,
  });

  if (error) {
    throw new Error(error.message || "Could not load blueprint members.");
  }

  return ((data ?? []) as BlueprintMemberListRow[]).map((row) => ({
    blueprint_id: row.blueprint_id,
    user_id: row.user_id,
    role: row.role,
    display_name: row.display_name ?? null,
    email: row.email ?? null,
  }));
}

export async function addBlueprintMember(args: {
  blueprintId: string;
  userId: string;
  role: Exclude<BlueprintAccessRole, "owner">;
}): Promise<void> {
  const { error } = await supabase.rpc("add_blueprint_member", {
    p_blueprint_id: args.blueprintId,
    p_user_id: args.userId,
    p_role: args.role,
  });

  if (error) {
    throw new Error(error.message || "Could not add blueprint member.");
  }
}

export async function updateBlueprintMemberRole(args: {
  blueprintId: string;
  userId: string;
  role: Exclude<BlueprintAccessRole, "owner">;
}): Promise<void> {
  const { error } = await supabase.rpc("update_blueprint_member_role", {
    p_blueprint_id: args.blueprintId,
    p_user_id: args.userId,
    p_role: args.role,
  });

  if (error) {
    throw new Error(error.message || "Could not update blueprint member role.");
  }
}

export async function removeBlueprintMember(args: {
  blueprintId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase.rpc("remove_blueprint_member", {
    p_blueprint_id: args.blueprintId,
    p_user_id: args.userId,
  });

  if (error) {
    throw new Error(error.message || "Could not remove blueprint member.");
  }
}

export async function leaveBlueprint(blueprintId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_blueprint", {
    p_blueprint_id: blueprintId,
  });

  if (error) {
    throw new Error(error.message || "Could not leave blueprint.");
  }
}

export type SaveCBMXResult =
  | {
      ok: true;
      row: CBMXRow;
    }
  | {
      ok: false;
      reason: "stale" | "forbidden" | "not_found";
    };

export function canRoleViewBlueprint(role: BlueprintAccessRole | null | undefined): boolean {
  return role === "owner" || role === "editor" || role === "viewer";
}

export function canRoleEditBlueprint(role: BlueprintAccessRole | null | undefined): boolean {
  return role === "owner" || role === "editor";
}

export async function getBlueprintRole(
  blueprintId: string,
  userId: string,
): Promise<BlueprintAccessRole | null> {
  const { data, error } = await supabase
    .from("blueprint_members")
    .select("role")
    .eq("blueprint_id", blueprintId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not load blueprint membership.");
  }

  const row = data as { role?: BlueprintAccessRole | null } | null;
  return row?.role ?? null;
}

export async function canViewBlueprint(blueprintId: string, userId: string): Promise<boolean> {
  const role = await getBlueprintRole(blueprintId, userId);
  return canRoleViewBlueprint(role);
}

export async function canEditBlueprint(blueprintId: string, userId: string): Promise<boolean> {
  const role = await getBlueprintRole(blueprintId, userId);
  return canRoleEditBlueprint(role);
}

export async function listAccessibleBlueprints(userId: string): Promise<AccessibleBlueprintRow[]> {
  const { data: blueprints, error: bpError } = await supabase
    .from("blueprints")
    .select("id,name,owner_user_id,updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (bpError) {
    throw new Error(bpError.message || "Could not list accessible blueprints.");
  }

  const rows = (blueprints ?? []) as BlueprintRowBase[];
  if (rows.length === 0) return [];

  const blueprintIds = rows.map((r) => r.id);
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_user_id).filter(Boolean)));

  const { data: members, error: memberError } = await supabase
    .from("blueprint_members")
    .select("blueprint_id,user_id,role")
    .in("blueprint_id", blueprintIds)
    .eq("user_id", userId);

  if (memberError) {
    throw new Error(memberError.message || "Could not load blueprint memberships.");
  }

  const { data: owners, error: ownerError } = await supabase
    .from("profiles")
    .select("id,email,display_name")
    .in("id", ownerIds);

  if (ownerError) {
    throw new Error(ownerError.message || "Could not load blueprint owner profiles.");
  }

  const memberByBlueprintId = new Map<string, BlueprintMemberRow>();
  for (const row of (members ?? []) as BlueprintMemberRow[]) {
    memberByBlueprintId.set(row.blueprint_id, row);
  }

  const ownerById = new Map<string, ProfileRow>();
  for (const row of (owners ?? []) as ProfileRow[]) {
    ownerById.set(row.id, row);
  }

  return rows
    .map((bp) => {
      const membership = memberByBlueprintId.get(bp.id);
      if (!membership) return null;

      const owner = ownerById.get(bp.owner_user_id);

      return {
        id: bp.id,
        name: bp.name,
        owner_user_id: bp.owner_user_id,
        updated_at: bp.updated_at,
        role: membership.role,
        owner_display_name: owner?.display_name ?? null,
        owner_email: owner?.email ?? null,
      } satisfies AccessibleBlueprintRow;
    })
    .filter((x): x is AccessibleBlueprintRow => Boolean(x));
}

export async function loadBlueprint(blueprintId: string): Promise<CBMXRow> {
  const { data, error } = await supabase
    .from("blueprints")
    .select("id,name,owner_user_id,blueprint_json,created_at,updated_at,version_no,updated_by_user_id")
    .eq("id", blueprintId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not load blueprint.");
  }

  return data as CBMXRow;
}

export async function createBlueprint(args: {
  ownerUserId: string;
  name: string;
  blueprint: CBMXBlueprint;
}): Promise<CBMXRow> {
  const { data, error } = await supabase
    .from("blueprints")
    .insert({
      owner_user_id: args.ownerUserId,
      name: args.name,
      blueprint_json: args.blueprint,
    })
    .select("id,name,owner_user_id,blueprint_json,created_at,updated_at,version_no,updated_by_user_id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not create blueprint.");
  }

  return data as CBMXRow;
}

export async function updateBlueprintWithVersion(args: {
  blueprintId: string;
  loadedVersionNo: number;
  userId: string;
  name: string;
  blueprint: CBMXBlueprint;
}): Promise<SaveCBMXResult> {
  const { data, error } = await supabase.rpc("save_blueprint_with_version", {
    p_blueprint_id: args.blueprintId,
    p_loaded_version_no: args.loadedVersionNo,
    p_name: args.name,
    p_blueprint_json: args.blueprint,
  });

  if (error) {
    throw new Error(error.message || "Could not save blueprint.");
  }

  const rows = (data ?? []) as Array<{
    ok: boolean;
    reason: "ok" | "stale" | "forbidden" | "not_found";
    id: string | null;
    name: string | null;
    owner_user_id: string | null;
    blueprint_json: CBMXBlueprint | null;
    created_at: string | null;
    updated_at: string | null;
    version_no: number | null;
    updated_by_user_id: string | null;
  }>;

  const row = rows[0];
  if (!row) {
    throw new Error("Could not save blueprint.");
  }

if (!row.ok || row.reason !== "ok") {
  const reason: "stale" | "forbidden" | "not_found" =
    row.reason === "ok" ? "stale" : row.reason;
  return { ok: false, reason };
}

  if (
    !row.id ||
    !row.name ||
    !row.owner_user_id ||
    !row.blueprint_json ||
    !row.updated_at ||
    row.version_no == null
  ) {
    throw new Error("Blueprint save returned an incomplete row.");
  }

  return {
    ok: true,
    row: {
      id: row.id,
      name: row.name,
      owner_user_id: row.owner_user_id,
      blueprint_json: row.blueprint_json,
      created_at: row.created_at ?? undefined,
      updated_at: row.updated_at,
      version_no: row.version_no,
      updated_by_user_id: row.updated_by_user_id,
    },
  };
}
