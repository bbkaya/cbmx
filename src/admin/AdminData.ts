import { supabase } from "../supabaseClient";
import type { AdminBlueprint, AdminStatistics, AdminUser, BlueprintSearchParams, PaginatedResult, UserSearchParams } from "./adminTypes";

export class AdminRpcError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "", status = 0) {
    super(message);
    this.name = "AdminRpcError";
    this.code = code;
    this.status = status;
  }
}

export function isAdminAuthorizationError(error: unknown): boolean {
  return error instanceof AdminRpcError && (error.code === "42501" || error.status === 401 || error.status === 403);
}

export function adminErrorMessage(error: unknown): string {
  return error instanceof AdminRpcError ? error.message : "Unable to load administrator data. Please try again.";
}

function contractError(): never {
  throw new AdminRpcError("The administrator service returned an unexpected response. Please contact the application maintainer.", "RPC_CONTRACT");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return contractError();
  return value as Record<string, unknown>;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return contractError();
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") return contractError();
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value) return contractError();
  return value;
}
function nullableText(value: unknown): string | null {
  return value === null ? null : typeof value === "string" ? value : contractError();
}
function page<T>(value: unknown, params: UserSearchParams, parse: (value: unknown) => T): PaginatedResult<T> {
  const result = record(value);
  if (!Array.isArray(result.items) || result.page !== params.page || result.page_size !== params.pageSize || result.items.length > params.pageSize) return contractError();
  return { items: result.items.map(parse), total_count: count(result.total_count), page: params.page, page_size: params.pageSize };
}

// This module is the only admin entry point to Supabase. No table access, Auth
// administration API, elevated client, or persistent report cache is used.
async function rpc(name: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  try {
    const request = supabase.rpc(name, params);
    const { data, error, status } = await (signal ? request.abortSignal(signal) : request);
    if (error) {
      const message = error.code === "42501" || status === 403
        ? "Administrator access is no longer available for this account."
        : status === 401 ? "Your session could not be authorized. Please sign in again."
          : error.code === "PGRST202" ? "The administrator service is unavailable. Please contact the application maintainer."
            : "Unable to load administrator data. Please try again.";
      throw new AdminRpcError(message, error.code, status);
    }
    return data;
  } catch (error) {
    if (error instanceof AdminRpcError) throw error;
    throw new AdminRpcError("Unable to load administrator data. Check your connection and try again.");
  }
}

export async function getAdminAccess(signal?: AbortSignal): Promise<boolean> {
  return boolean(await rpc("admin_get_access", undefined, signal));
}
export async function getAdminStatistics(signal?: AbortSignal): Promise<AdminStatistics> {
  const value = record(await rpc("admin_get_statistics", undefined, signal));
  return {
    total_registered_users: count(value.total_registered_users),
    total_cbmx_blueprints: count(value.total_cbmx_blueprints),
    total_pc_blueprints: count(value.total_pc_blueprints),
  };
}
export async function listAdminBlueprints(params: BlueprintSearchParams, signal?: AbortSignal): Promise<PaginatedResult<AdminBlueprint>> {
  const value = await rpc("admin_list_blueprints", {
    p_search: params.search, p_blueprint_type: params.type, p_sort_by: params.sortBy,
    p_sort_direction: params.sortDirection, p_page: params.page, p_page_size: params.pageSize,
  }, signal);
  return page(value, params, (item) => {
    const row = record(item);
    if (row.blueprint_type !== "CBMX" && row.blueprint_type !== "PC") return contractError();
    // Reconstruct only the reporting contract, discarding unexpected payloads.
    return {
      blueprint_type: row.blueprint_type, blueprint_id: text(row.blueprint_id),
      name: nullableText(row.name), owner_user_id: nullableText(row.owner_user_id),
      owner_name: nullableText(row.owner_name), owner_email: nullableText(row.owner_email),
      created_at: nullableText(row.created_at), updated_at: nullableText(row.updated_at),
    };
  });
}
export async function listAdminUsers(params: UserSearchParams, signal?: AbortSignal): Promise<PaginatedResult<AdminUser>> {
  const value = await rpc("admin_list_users", { p_search: params.search, p_page: params.page, p_page_size: params.pageSize }, signal);
  return page(value, params, (item) => {
    const row = record(item);
    return {
      user_id: text(row.user_id), email: nullableText(row.email), display_name: nullableText(row.display_name),
      registration_date: nullableText(row.registration_date), is_confirmed: boolean(row.is_confirmed), is_banned: boolean(row.is_banned),
      owned_cbmx_count: count(row.owned_cbmx_count), owned_pc_count: count(row.owned_pc_count),
    };
  });
}
