import type { BlueprintSearchParams } from "./adminTypes";

const defaults: BlueprintSearchParams = {
  search: "", type: null, sortBy: "updated_at", sortDirection: "desc", page: 1, pageSize: 25,
};

// Navigation carries inventory controls only; it never supplies authorization.
export function adminInventoryReturnState(state: unknown): { adminInventoryQuery: BlueprintSearchParams } {
  const candidate = state && typeof state === "object" && "adminInventoryQuery" in state
    ? state.adminInventoryQuery : null;
  const query = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
  return { adminInventoryQuery: {
    search: typeof query.search === "string" ? query.search.slice(0, 200) : defaults.search,
    type: query.type === "CBMX" || query.type === "PC" ? query.type : null,
    sortBy: ["blueprint_type", "name", "owner_name", "owner_email", "created_at", "updated_at"].includes(String(query.sortBy))
      ? query.sortBy as BlueprintSearchParams["sortBy"] : defaults.sortBy,
    sortDirection: query.sortDirection === "asc" ? "asc" : "desc",
    page: typeof query.page === "number" && Number.isSafeInteger(query.page) && query.page > 0 ? query.page : 1,
    pageSize: [25, 50, 100].includes(Number(query.pageSize)) ? Number(query.pageSize) : 25,
  } };
}
