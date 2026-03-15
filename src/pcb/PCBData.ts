import { supabase } from "../supabaseClient";
import type { ProcessCanvasBlueprint } from "./processCanvasDomain";

export type PCBRow = {
  id: string;
  owner_user_id: string;
  name: string;
  blueprint_json: ProcessCanvasBlueprint;
  created_at: string;
  updated_at: string;
};

export type PCBLinkContext = {
  link_id: string;
  cbmx_blueprint_id: string;
  cbmx_process_id: string;
  cbmx_blueprint_name: string;
  cbmx_process_name: string;
};

export async function loadPCB(pcbId: string): Promise<PCBRow> {
  const { data, error } = await supabase
    .from("process_canvas_blueprints")
    .select("id, owner_user_id, name, blueprint_json, created_at, updated_at")
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
    .select("id, owner_user_id, name, blueprint_json, created_at, updated_at")
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

  const blueprintRow = Array.isArray((data as { blueprints?: unknown }).blueprints)
    ? (data as { blueprints: Array<{ id: string; name: string; blueprint_json?: { coCreationProcesses?: Array<{ id: string; name?: string }> } }> }).blueprints[0]
    : (data as { blueprints?: { id: string; name: string; blueprint_json?: { coCreationProcesses?: Array<{ id: string; name?: string }> } } }).blueprints;

  const processName =
    blueprintRow?.blueprint_json?.coCreationProcesses?.find(
      (p) => p.id === (data as { cbmx_process_id: string }).cbmx_process_id,
    )?.name || (data as { cbmx_process_id: string }).cbmx_process_id;

  return {
    link_id: (data as { id: string }).id,
    cbmx_blueprint_id: (data as { cbmx_blueprint_id: string }).cbmx_blueprint_id,
    cbmx_process_id: (data as { cbmx_process_id: string }).cbmx_process_id,
    cbmx_blueprint_name: blueprintRow?.name || "CBMX Blueprint",
    cbmx_process_name: processName,
  };
}
