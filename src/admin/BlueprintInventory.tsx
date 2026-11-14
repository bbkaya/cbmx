import { useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { listAdminBlueprints } from "./AdminData";
import { AdminPagination, ReportError } from "./AdminTableUI";
import { formatAdminDate } from "./adminFormat";
import { useAdminQuery } from "./useAdminQuery";
import { useAdminResource } from "./useAdminResource";
import type { BlueprintSearchParams, BlueprintSort, BlueprintType } from "./adminTypes";
import { adminInventoryReturnState } from "./adminNavigation";
import "../pages/dashboard.css";

const columns: { key: BlueprintSort; label: string }[] = [
  { key: "blueprint_type", label: "Type" }, { key: "name", label: "Blueprint Name" },
  { key: "owner_name", label: "Owner Name" }, { key: "owner_email", label: "Owner Email" },
  { key: "created_at", label: "Created" }, { key: "updated_at", label: "Last Modified" },
];

export default function BlueprintInventory() {
  const location = useLocation();
  const { query, setQuery, searchInput, setSearchInput } = useAdminQuery<BlueprintSearchParams>(
    adminInventoryReturnState(location.state).adminInventoryQuery);
  const load = useCallback((signal: AbortSignal) => listAdminBlueprints(query, signal), [query]);
  const report = useAdminResource(load);
  const sort = (column: BlueprintSort) => setQuery((previous) => ({
    ...previous, page: 1, sortBy: column,
    sortDirection: previous.sortBy === column && previous.sortDirection === "asc" ? "desc" : "asc",
  }));

  return <section className="admin-section" aria-labelledby="admin-blueprints-title" aria-busy={report.loading}>
    <div className="admin-section-heading"><h2 id="admin-blueprints-title">Blueprints</h2>
      <button type="button" disabled={report.loading} onClick={report.retry}>Refresh blueprints</button></div>
    <div className="admin-filters">
      <label className="admin-search">Search blueprints
        <input type="search" maxLength={200} value={searchInput} placeholder="Blueprint name, owner name or email"
          onChange={(e) => setSearchInput(e.target.value)} /></label>
      <label>Blueprint type
        <select value={query.type ?? ""} onChange={(e) => setQuery((previous) => ({ ...previous, type: (e.target.value || null) as BlueprintType | null, page: 1 }))}>
          <option value="">All types</option><option value="CBMX">CBMX</option><option value="PC">Process Canvas</option>
        </select></label>
    </div>
    {report.error ? <ReportError message={report.error} retry={report.retry} /> : <>
      {report.loading && <p role="status">Loading blueprints…</p>}
      <div className="admin-table-scroll" role="region" aria-label="Blueprint inventory; scroll horizontally on smaller screens" tabIndex={0}>
        <table><caption className="admin-sr-only">Read-only blueprint inventory</caption><thead><tr>
          {columns.map(({ key, label }) => <th key={key} scope="col" aria-sort={query.sortBy === key ? query.sortDirection === "asc" ? "ascending" : "descending" : "none"}>
            <button type="button" className="admin-sort" onClick={() => sort(key)} aria-label={`Sort by ${label}`}>
              {label}{query.sortBy === key && <span aria-hidden="true"> {query.sortDirection === "asc" ? "↑" : "↓"}</span>}
            </button></th>)}
        </tr></thead><tbody>
          {report.data?.items.map((row) => <tr key={`${row.blueprint_type}:${row.blueprint_id}`}>
            <td><span className="admin-type">{row.blueprint_type}</span></td>
            <td><Link className="blueprint-name-link" to={`/app/admin/${row.blueprint_type === "CBMX" ? "b" : "pcb"}/${row.blueprint_id}`}
              state={{ adminInventoryQuery: query }}>{row.name?.trim() || "Untitled blueprint"}</Link></td><td>{row.owner_name?.trim() || "Unknown owner"}</td>
            <td>{row.owner_email || "—"}</td><td>{formatAdminDate(row.created_at)}</td><td>{formatAdminDate(row.updated_at)}</td>
          </tr>)}
          {report.data?.items.length === 0 && <tr><td colSpan={6}>No blueprints match these criteria.</td></tr>}
        </tbody></table>
      </div>
      <AdminPagination name="blueprints" page={query.page} pageSize={query.pageSize} total={report.data?.total_count} loading={report.loading}
        onPage={(page) => setQuery((previous) => ({ ...previous, page }))}
        onPageSize={(pageSize) => setQuery((previous) => ({ ...previous, pageSize, page: 1 }))} />
    </>}
  </section>;
}
