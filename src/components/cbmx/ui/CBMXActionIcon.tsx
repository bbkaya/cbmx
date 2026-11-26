const paths = {
  edit: <><path d="m4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4M4 16l4 4" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  pending: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  transfer: <><path d="M7 17V3m-4 4 4-4 4 4m6 0v14m-4-4 4 4 4-4" /></>,
  warning: <><path d="m12 3 10 18H2L12 3Zm0 6v5m0 3v.01" /></>,
};

export default function CBMXActionIcon({ kind }: { kind: keyof typeof paths }) {
  return <svg className="cbmx-action-icon" width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{paths[kind]}</svg>;
}
