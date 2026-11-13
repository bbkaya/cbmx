import { useCallback } from "react";
import { listAdminUsers } from "./AdminData";
import { AdminPagination, ReportError } from "./AdminTableUI";
import { formatAdminDate } from "./adminFormat";
import { useAdminQuery } from "./useAdminQuery";
import { useAdminResource } from "./useAdminResource";

export default function UserInventory() {
  const { query, setQuery, searchInput, setSearchInput } = useAdminQuery({ search: "", page: 1, pageSize: 25 });
  const load = useCallback((signal: AbortSignal) => listAdminUsers(query, signal), [query]);
  const report = useAdminResource(load);
  return <section className="admin-section" aria-labelledby="admin-users-title" aria-busy={report.loading}>
    <div className="admin-section-heading"><h2 id="admin-users-title">Users</h2>
      <button type="button" disabled={report.loading} onClick={report.retry}>Refresh users</button></div>
    <div className="admin-filters"><label className="admin-search">Search users
      <input type="search" maxLength={200} value={searchInput} placeholder="Name or email" onChange={(e) => setSearchInput(e.target.value)} />
    </label></div>
    {report.error ? <ReportError message={report.error} retry={report.retry} /> : <>
      {report.loading && <p role="status">Loading users…</p>}
      <div className="admin-table-scroll" role="region" aria-label="User inventory; scroll horizontally on smaller screens" tabIndex={0}>
        <table><caption className="admin-sr-only">Read-only registered user inventory</caption><thead><tr>
          {['Display Name', 'Email', 'Registration Date', 'Account Status', 'CBMX Blueprints Owned', 'Process Canvases Owned'].map((label) => <th scope="col" key={label}>{label}</th>)}
        </tr></thead><tbody>
          {report.data?.items.map((row) => {
            const status = row.is_banned ? "Banned" : row.is_confirmed ? "Confirmed" : "Unconfirmed";
            return <tr key={row.user_id}><td>{row.display_name?.trim() || "Unnamed user"}</td><td>{row.email || "—"}</td>
              <td>{formatAdminDate(row.registration_date)}</td>
              <td><span className={`admin-account-status admin-account-${status.toLowerCase()}`}>{status}</span></td>
              <td>{row.owned_cbmx_count.toLocaleString()}</td><td>{row.owned_pc_count.toLocaleString()}</td></tr>;
          })}
          {report.data?.items.length === 0 && <tr><td colSpan={6}>No users match these criteria.</td></tr>}
        </tbody></table>
      </div>
      <AdminPagination name="users" page={query.page} pageSize={query.pageSize} total={report.data?.total_count} loading={report.loading}
        onPage={(page) => setQuery((previous) => ({ ...previous, page }))}
        onPageSize={(pageSize) => setQuery((previous) => ({ ...previous, pageSize, page: 1 }))} />
    </>}
  </section>;
}
