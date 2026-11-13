export function ReportError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="admin-error" role="alert"><p>{message}</p><button type="button" onClick={retry}>Try again</button></div>;
}

export function AdminPagination({ name, page, pageSize, total, loading, onPage, onPageSize }: {
  name: string; page: number; pageSize: number; total: number | undefined; loading: boolean;
  onPage: (page: number) => void; onPageSize: (size: number) => void;
}) {
  const last = Math.max(1, Math.ceil((total ?? 0) / pageSize));
  const label = total === 1 ? name === "users" ? "user" : "blueprint" : name;
  return <div className="admin-pagination">
    <p aria-live="polite">{total === undefined ? "Loading results…" : <>
      {total.toLocaleString()} matching {label} · Page {page}{page <= last ? ` of ${last}` : ` (last available page ${last})`}
    </>}</p>
    <div className="admin-controls">
      <label>Rows per page <select aria-label={`${name} rows per page`} value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
        {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
      </select></label>
      <button type="button" aria-label={`First ${name} page`} disabled={loading || page === 1} onClick={() => onPage(1)}>First</button>
      <button type="button" aria-label={`Previous ${name} page`} disabled={loading || page === 1} onClick={() => onPage(page - 1)}>Previous</button>
      <button type="button" aria-label={`Next ${name} page`} disabled={loading || total === undefined || page >= last} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  </div>;
}
