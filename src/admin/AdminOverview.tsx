import { getAdminStatistics } from "./AdminData";
import { ReportError } from "./AdminTableUI";
import { useAdminResource } from "./useAdminResource";
import type { AdminStatistics } from "./adminTypes";

const statistics: { label: string; key: keyof AdminStatistics }[] = [
  { label: "Registered Users", key: "total_registered_users" },
  { label: "CBMX Blueprints", key: "total_cbmx_blueprints" },
  { label: "Process Canvases", key: "total_pc_blueprints" },
];

export default function AdminOverview() {
  const report = useAdminResource(getAdminStatistics);
  return <section aria-labelledby="admin-overview-title" aria-busy={report.loading}>
    <div className="admin-section-heading"><h2 id="admin-overview-title">Overview</h2>
      <button type="button" disabled={report.loading} onClick={report.retry}>Refresh overview</button></div>
    {report.error ? <ReportError message={report.error} retry={report.retry} /> : <>
      {report.loading && <p role="status">Loading statistics…</p>}
      <div className="admin-statistics">{statistics.map(({ label, key }) => <div className="admin-statistic" key={key}>
        <div>{label}</div><strong>{report.data ? report.data[key].toLocaleString() : "—"}</strong>
      </div>)}</div>
    </>}
  </section>;
}
