const paths = {
  networkValueProposition: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  actorType: <><circle cx="9" cy="7" r="3" /><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v1" /></>,
  actor: <><circle cx="10" cy="7" r="3" /><path d="M3 20v-3a7 7 0 0 1 14 0v3H3Zm14-16a4 4 0 0 1 0 7m3 3a7 7 0 0 1 1 4" /></>,
  actorValueProposition: <><path d="m3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M7 3l5 18 5-18M7 8l5-5 5 5" /></>,
  costsBenefits: <><path d="M4 21V12h4v9m2 0V7h4v14m2 0V3h4v18M2 21h20" /></>,
  financial: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 9v.01M18 15v.01" /></>,
  environmental: <><path d="M20 3C9 2 3 8 5 15c3 7 15 5 15-12Z" /><path d="M3 21 15 9m-6 6v-5m0 5h5" /></>,
  social: <><circle cx="9" cy="7" r="3" /><path d="M3 20v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5v1" /></>,
  otherNonFinancial: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h4" /></>,
  kpis: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="m12 12 9-9m-5 0h5v5" /></>,
  actorServices: <><path d="m9 3-1 3-3 1-2 4 2 2v3l3 2 1 3h6l1-3 3-2v-3l2-2-2-4-3-1-1-3H9Z" /><circle cx="12" cy="12" r="3" /></>,
  coCreationProcesses: <><circle cx="12" cy="5" r="3" /><circle cx="5" cy="19" r="3" /><circle cx="19" cy="19" r="3" /><path d="m10 8-4 8m8-8 4 8M8 19h8" /></>,
  serviceScenario: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
};

export type CBMXRowIconKind = keyof typeof paths;

export default function CBMXRowIcon({ kind }: { kind: CBMXRowIconKind }) {
  return <svg className="cbmx-row-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{paths[kind]}</svg>;
}
