export type AdminAccessStatus = "checking" | "signed-out" | "allowed" | "denied" | "error";
export interface AdminAccessState {
  status: AdminAccessStatus;
  error: string | null;
}
export interface AdminStatistics {
  total_registered_users: number;
  total_cbmx_blueprints: number;
  total_pc_blueprints: number;
}
export type BlueprintType = "CBMX" | "PC";
export type BlueprintSort = "blueprint_type" | "name" | "owner_name" | "owner_email" | "created_at" | "updated_at";
export type SortDirection = "asc" | "desc";
export interface AdminBlueprint {
  blueprint_type: BlueprintType;
  blueprint_id: string;
  name: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  created_at: string | null;
  updated_at: string | null;
}
export interface AdminUser {
  user_id: string;
  email: string | null;
  display_name: string | null;
  registration_date: string | null;
  is_confirmed: boolean;
  is_banned: boolean;
  owned_cbmx_count: number;
  owned_pc_count: number;
}
export interface PaginatedResult<T> {
  items: T[];
  total_count: number;
  page: number;
  page_size: number;
}
export interface UserSearchParams {
  search: string;
  page: number;
  pageSize: number;
}
export interface BlueprintSearchParams extends UserSearchParams {
  type: BlueprintType | null;
  sortBy: BlueprintSort;
  sortDirection: SortDirection;
}
