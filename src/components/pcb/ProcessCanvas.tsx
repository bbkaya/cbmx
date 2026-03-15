import { useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEventHandler, type KeyboardEventHandler } from "react";
import { PROCESS_CANVAS_LAYOUT_V1 } from "../../pcb/processCanvasLayout";
import type {
  Customer,
  CustomerChannel,
  CustomerRelationship,
  Goal,
  KeyActivity,
  KeyCapability,
  KeyPartner,
  KeyPolicyRegulation,
  KeyResource,
  OtherBeneficiary,
  ProcessCanvasBlueprint,
  ResponsibilityPoint,
  ValueItem,
} from "../../pcb/processCanvasDomain";

type Props = {
  blueprint: ProcessCanvasBlueprint;
  onChange: (next: ProcessCanvasBlueprint) => void;
  showHelpPanel?: boolean;
};

type CommitFieldProps = {
  value: string;
  placeholder?: string;
  dark?: boolean;
  centered?: boolean;
  multiline?: boolean;
  onCommit: (next: string) => void;
};

const BASE_URL = import.meta.env.BASE_URL ?? "/";
const SIDE_IMAGES = {
  responsibilityHeader: `${BASE_URL}images/responsibility.png`,
  feasibilitySide: `${BASE_URL}images/feasibility.png`,
  desirabilitySide: `${BASE_URL}images/desirability.png`,
  viabilityFooter: `${BASE_URL}images/viability.png`,
} as const;

const MIN_SLOTS = {
  goals: 1,
  customers: 1,
  otherBeneficiaries: 1,
  customerRelationships: 1,
  customerChannels: 1,
  keyActivities: 1,
  keyPoliciesRegulations: 1,
  partnerSupplier: 1,
  partnerEnabler: 1,
  capabilityExecution: 1,
  capabilityDynamic: 1,
  resourceHuman: 1,
  resourcePhysical: 1,
  resourceDigital: 1,
  valueItems: 1,
  responsibility: 1,
} as const;

type HelpContent = {
  title: string;
  question: string;
  examples?: string[];
  subgroups?: Array<{ label: string; examples: string[] }>;
};

const HELP_CONTENT: Record<string, HelpContent> = {
  purposeGoals: {
    title: "Purpose & Goals",
    question: "Purpose: What fundamental value does this process create for its customers and other beneficiaries? --- Goals: What operational outcomes should it deliver consistently?",
    subgroups: [
     {
        label: "Purpose",
        examples: [
          "Enable seamless green mobility for every city commuter",
          "Enable responsible and accessible financing for individuals",
        ],
      },
      {
        label: "Goals",
        examples: [
          "Balance availability, accessibility, and reliability of e-bikes while maintaining a frictionless and cost-effective travel experience",
          "Process applications efficiently, assess risk, and disburse loans to eligible customers while ensuring compliance",
        ],
      },
    ],
  },
  keyActivities: {
    title: "Key Activities",
    question: "What are the critical steps that define the flow of this process?",
    examples: [
      "Verify identity",
      "Locate available e-bikes and reserve",
      "Unlock the e-bike via the app",
      "Ride to the destination and leave the vehicle in a designated zone",
    ],
  },
  customers: {
    title: "Customers",
    question: "Who are the main beneficiaries of the value that the process creates?",
    examples: [
      "Traveler for a shared micromobility journey",
      "Retail customers seeking personal loans, mortgages, auto loans, or student loans",
    ],
  },
  otherBeneficiaries: {
    title: "Other Beneficiaries",
    question: "Who besides the primary customer benefits indirectly from this process, and in what way?",
    examples: [
      "Municipality through reduced congestion and better mobility access",
      "Investors, credit bureaus, and financial data providers in loan processing",
    ],
  },
  customerRelationship: {
    title: "Customer Relationship",
    question: "How does the process interact with and support customers throughout their journey?",
    examples: [
      "Self-service and automated decision-making",
      "Human support for complex cases",
      "Personalized assisted advisory",
    ],
  },
  customerChannels: {
    title: "Customer Channels",
    question: "How do customers access, initiate, or receive updates about the process?",
    examples: [
      "Online banking",
      "Mobile app",
      "Bank branch visits",
      "Phone and video calls",
    ],
  },
  keyPartners: {
    title: "Key Partners",
    question: "Which external actors contribute to or enable this process?",
    subgroups: [
      {
        label: "Suppliers",
        examples: [
          "Maintenance providers",
          "Mobile app developers",
          "GPS tracking providers",
          "Payment gateway providers",
        ],
      },
      {
        label: "Enablers",
        examples: [
          "Municipality",
          "Public transport authority",
          "Certification or standards bodies",
        ],
      },
    ],
  },
  keyCapabilities: {
    title: "Key Capabilities",
    question: "Which capabilities are needed to execute and adapt this process?",
    subgroups: [
      {
        label: "Execution Capabilities",
        examples: [
          "Booking",
          "Unlocking",
          "Riding",
          "Issue reporting",
          "Customer support",
          "Billing and payment",
        ],
      },
      {
        label: "Dynamic Capabilities",
        examples: [
          "Detect shifts in user demand or regulation",
          "Rebalance fleet size in high-demand areas",
          "Integrate predictive maintenance or new digital features",
        ],
      },
    ],
  },
  keyPoliciesRegulations: {
    title: "Key Policies & Regulations",
    question: "What laws, standards, regulatory bodies, and organizational policies govern this process?",
    examples: [
      "Age restrictions",
      "Parking zone regulations",
      "Ride-time limits",
      "Subsidy rules",
      "GDPR and security requirements",
    ],
  },
  keyResources: {
    title: "Key Resources",
    question: "What human, physical, and digital resources are essential for executing this process?",
    subgroups: [
      {
        label: "Human",
        examples: [
          "Service operators",
          "Maintenance teams",
          "Customer support",
          "Data analysts",
          "Municipality liaisons",
        ],
      },
      {
        label: "Physical",
        examples: [
          "E-bikes",
          "Repair centres",
          "Charging infrastructure",
          "IoT-connected smart locks",
        ],
      },
      {
        label: "Digital",
        examples: [
          "Mobile app",
          "GPS tracking system",
          "Payment gateway",
          "Customer data analytics",
        ],
      },
    ],
  },
  economicCosts: {
    title: "Economic Viability — Costs",
    question: "What cost items or negative economic effects are associated with this process?",
    examples: ["Charging", "Issue fixing", "Insurance", "Operational support"],
  },
  economicBenefits: {
    title: "Economic Viability — Benefits",
    question: "What revenue streams or positive economic effects are associated with this process?",
    examples: ["Pay-per-use payments", "Subscriptions", "Service fees"],
  },
  envNegative: {
    title: "Environmental Viability — Negative",
    question: "What negative environmental impacts does the process create?",
    examples: ["Energy used for charging", "Battery replacement impact", "Rebalancing vehicle emissions"],
  },
  envPositive: {
    title: "Environmental Viability — Positive",
    question: "What positive environmental impacts does the process create?",
    examples: ["Reduced car traffic", "Lower emissions", "Better use of shared assets"],
  },
  socialNegative: {
    title: "Social Viability — Negative",
    question: "What negative social impacts can arise from this process?",
    examples: ["Competition with public transportation", "Obstructed sidewalks", "Increased accident risk"],
  },
  socialPositive: {
    title: "Social Viability — Positive",
    question: "What positive social impacts can arise from this process?",
    examples: ["Convenience and wellness for travelers", "Improved urban liveability", "Better accessibility"],
  },
  privacySecurity: {
    title: "Privacy & Security",
    question: "How does the process protect sensitive data, comply with regulation, and mitigate security risks?",
    examples: ["Anonymized trip data", "GDPR compliance", "Secure payments", "Fraud prevention"],
  },
  fairnessEthics: {
    title: "Fairness & Ethics",
    question: "How does the process ensure fairness, inclusivity, and ethical decision-making?",
    examples: ["Fair pricing", "Inclusive service access", "Age checks", "Internationalization"],
  },
  transparencyExplainability: {
    title: "Transparency & Explainability",
    question: "How are process decisions transparent, understandable, and accessible to stakeholders?",
    examples: [
      "Detailed cost breakdown before booking",
      "Transparent complaint handling",
      "Periodic reports on reliability and sustainability impact",
    ],
  },
  accountabilityContestability: {
    title: "Accountability & Contestability",
    question: "Who is accountable for outcomes, and how can customers or stakeholders challenge decisions?",
    examples: [
      "Clear accountability for pricing, availability, maintenance, and disputes",
      "Municipality oversight for safety and public-space compliance",
      "App-based contestation with supporting evidence such as photos",
    ],
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function AutoGrowTextarea({
  value,
  onChange,
  onKeyDown,
  onBlur,
  dark = false,
  centered = false,
}: {
  value: string;
  onChange: (next: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  onBlur?: FocusEventHandler<HTMLTextAreaElement>;
  dark?: boolean;
  centered?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "0px";
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      autoFocus
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      style={{
        width: "100%",
        resize: "none",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.28)",
        outline: "none",
        borderRadius: 8,
        padding: "4px 6px",
        background: dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.84)",
        color: dark ? "#fff" : "#111827",
        font: "inherit",
        lineHeight: 1.24,
        textAlign: centered ? "center" : "left",
        boxSizing: "border-box",
      }}
    />
  );
}

function CommitField({
  value,
  placeholder = "...",
  dark = false,
  centered = false,
  multiline = false,
  onCommit,
}: CommitFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit() {
    setEditing(false);
    onCommit(draft.trim());
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  const shown = value.trim() || placeholder;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{
          display: "block",
          width: "100%",
          border: "none",
          background: "transparent",
          padding: 0,
          margin: 0,
          textAlign: centered ? "center" : "left",
          color: value.trim() ? (dark ? "#fff" : "#111827") : dark ? "rgba(255,255,255,0.82)" : "#6b7280",
          cursor: "text",
          font: "inherit",
          lineHeight: 1.24,
          minHeight: 16,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {shown}
      </button>
    );
  }

  return (
    <div>
      {multiline ? (
        <AutoGrowTextarea
          value={draft}
          onChange={setDraft}
          dark={dark}
          centered={centered}
          onBlur={commit}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
        />
      ) : (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          style={{
            width: "100%",
            border: "1px solid rgba(255,255,255,0.28)",
            outline: "none",
            borderRadius: 8,
            padding: "4px 6px",
            background: dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.84)",
            color: dark ? "#fff" : "#111827",
            font: "inherit",
            lineHeight: 1.24,
            textAlign: centered ? "center" : "left",
            boxSizing: "border-box",
          }}
        />
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={commit} style={miniButton(dark)}>
          Save
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancel} style={miniButton(dark)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function miniButton(dark = false): CSSProperties {
  return {
    border: `1px solid ${dark ? "rgba(255,255,255,0.42)" : "#cbd5e1"}`,
    background: dark ? "rgba(255,255,255,0.08)" : "#fff",
    color: dark ? "#fff" : "#334155",
    borderRadius: 6,
    padding: "2px 7px",
    fontSize: 11,
    lineHeight: 1.1,
    cursor: "pointer",
  };
}

function sectionTitle(title: string, dark = false) {
  return <div style={{ fontWeight: 700, fontSize: 11.5, marginBottom: 4, color: dark ? "#fff" : "#111827" }}>{title}</div>;
}

function cardStyle(base?: CSSProperties): CSSProperties {
  return {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    overflow: "visible",
    ...base,
  };
}

function listContainerStyle(): CSSProperties {
  return { display: "grid", gap: 3 };
}

function listRowStyle(): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "12px 1fr",
    gap: 4,
    alignItems: "start",
  };
}

function bulletStyle(dark = false): CSSProperties {
  return {
    paddingTop: 1,
    color: dark ? "rgba(255,255,255,0.94)" : "#334155",
    fontSize: 12,
    lineHeight: 1.2,
  };
}

function isMeaningful(value: string): boolean {
  return value.trim().length > 0;
}

function computeVisibleSlotCount(values: string[], minSlots: number): number {
  const baseCount = Math.max(values.length, minSlots);
  const filledCount = values.filter((x) => isMeaningful(x)).length;
  return filledCount >= baseCount ? baseCount + 1 : baseCount;
}

function parseNameWithOptionalDescription(value: string): { name: string; description: string } {
  const match = value.match(/^(.+?)\s*\((.*)\)\s*$/);
  if (!match) return { name: value.trim(), description: "" };
  return { name: match[1].trim(), description: match[2].trim() };
}

export default function ProcessCanvas({ blueprint, onChange, showHelpPanel = true }: Props) {
  const layout = PROCESS_CANVAS_LAYOUT_V1;
  const [helpOpen, setHelpOpen] = useState(true);
  const [activeHelpId, setActiveHelpId] = useState<string>("purposeGoals");
  const activeHelp = HELP_CONTENT[activeHelpId] ?? HELP_CONTENT.purposeGoals;

  const update = (mutator: (draft: ProcessCanvasBlueprint) => void) => {
    const next = clone(blueprint);
    mutator(next);
    next.meta.updatedAt = new Date().toISOString();
    onChange(next);
  };

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: layout.columnWidths.join(" "),
  gridTemplateRows: layout.rowHeights.join(" "),
  width: "100%",
  minWidth: 0,
  gap: 6,
  background: "#ffffff",
  alignItems: "stretch",
};

  function renderImageBand(id: keyof typeof SIDE_IMAGES, alt: string, vertical = false) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          width: "100%",
          overflow: "hidden",
        }}
      >
        <img
          src={SIDE_IMAGES[id]}
          alt={alt}
          style={
            vertical
              ? { maxWidth: 42, width: "88%", height: "auto", display: "block", objectFit: "contain" }
              : { maxHeight: 42, height: "88%", width: "auto", display: "block", objectFit: "contain" }
          }
        />
      </div>
    );
  }

  function renderAutoList<T extends { id: string }>(args: {
    title: string;
    items: T[];
    minSlots: number;
    dark?: boolean;
    getText: (item: T) => string;
    setText: (item: T, value: string) => T;
    makeItem: (initialText?: string) => T;
    onChange: (next: T[]) => void;
  }) {
    const values = args.items.map(args.getText);
    const visibleCount = computeVisibleSlotCount(values, args.minSlots);

    return (
      <div>
        {sectionTitle(args.title, args.dark)}
        <div style={listContainerStyle()}>
          {Array.from({ length: visibleCount }).map((_, index) => {
            const existing = args.items[index];
            const slotValue = existing ? args.getText(existing) : "";

            return (
              <div key={existing?.id ?? `${args.title}-${index}`} style={listRowStyle()}>
                <div style={bulletStyle(args.dark)}>•</div>
                <CommitField
                  value={slotValue}
                  placeholder="..."
                  dark={args.dark}
                  multiline
                  onCommit={(nextValue) => {
                    if (existing) {
                      if (!nextValue) {
                        args.onChange(args.items.filter((_, i) => i !== index));
                        return;
                      }
                      args.onChange(args.items.map((item, i) => (i === index ? args.setText(item, nextValue) : item)));
                      return;
                    }
                    if (!nextValue) return;
                    args.onChange([...args.items, args.makeItem(nextValue)]);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderTypedGroups<T extends { id: string; type: string }>(args: {
    title: string;
    groups: Array<{
      key: string;
      label: string;
      minSlots: number;
      getText: (item: T) => string;
      setText: (item: T, value: string) => T;
      makeItem: (initialText?: string) => T;
    }>;
    items: T[];
    dark?: boolean;
    onChange: (next: T[]) => void;
  }) {
    return (
      <div>
        {sectionTitle(args.title, args.dark)}
        <div style={{ display: "grid", gap: 7 }}>
          {args.groups.map((group) => {
            const groupItems = args.items.filter((x) => x.type === group.key);
            const values = groupItems.map(group.getText);
            const visibleCount = computeVisibleSlotCount(values, group.minSlots);

            return (
              <div key={group.key}>
                <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 3, color: args.dark ? "rgba(255,255,255,0.96)" : "#334155" }}>
                  {group.label}
                </div>
                <div style={listContainerStyle()}>
                  {Array.from({ length: visibleCount }).map((_, index) => {
                    const existing = groupItems[index];
                    const slotValue = existing ? group.getText(existing) : "";

                    return (
                      <div key={existing?.id ?? `${group.key}-${index}`} style={listRowStyle()}>
                        <div style={bulletStyle(args.dark)}>•</div>
                        <CommitField
                          value={slotValue}
                          placeholder="..."
                          dark={args.dark}
                          multiline
                          onCommit={(nextValue) => {
                            if (existing) {
                              if (!nextValue) {
                                args.onChange(args.items.filter((x) => x.id !== existing.id));
                                return;
                              }
                              args.onChange(
                                args.items.map((x) => (x.id === existing.id ? group.setText(x, nextValue) : x))
                              );
                              return;
                            }
                            if (!nextValue) return;
                            args.onChange([...args.items, group.makeItem(nextValue)]);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const getBlockContent = (id: string) => {
    switch (id) {
      case "responsibilityHeader":
        return renderImageBand("responsibilityHeader", "Responsibility");
      case "feasibilitySide":
        return renderImageBand("feasibilitySide", "Feasibility", true);
      case "desirabilitySide":
        return renderImageBand("desirabilitySide", "Desirability", true);
      case "viabilityFooter":
        return renderImageBand("viabilityFooter", "Viability");

      case "purposeGoals":
        return (
          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 8, height: "100%" }}>
            <div
              style={{
                background: "#9ea1a3",
                color: "#ffffff",
                borderRadius: 8,
                padding: "8px 10px",
                minHeight: 0,
              }}
            >
              {sectionTitle("Purpose", true)}
              <CommitField
                value={blueprint.desirability.purpose}
                dark
                centered
                multiline
                onCommit={(next) => update((d) => { d.desirability.purpose = next; })}
              />
            </div>
            <div
              style={{
                background: "#ffffff",
                color: "#111827",
                borderRadius: 8,
                padding: "8px 10px",
                minHeight: 0,
              }}
            >
              {renderAutoList<Goal>({
                title: "Goals",
                items: blueprint.goals,
                minSlots: MIN_SLOTS.goals,
                getText: (x) => x.statement,
                setText: (x, value) => ({ ...x, statement: value }),
                makeItem: (initialText = "") => ({ id: makeId("goal"), statement: initialText }),
                onChange: (next) => update((d) => { d.goals = next; }),
              })}
            </div>
          </div>
        );

      case "customers":
        return renderAutoList<Customer>({
          title: "Customers",
          items: blueprint.desirability.customers,
          minSlots: MIN_SLOTS.customers,
          dark: true,
          getText: (x) => x.name,
          setText: (x, value) => ({ ...x, name: value }),
          makeItem: (initialText = "") => ({ id: makeId("cust"), name: initialText }),
          onChange: (next) => update((d) => { d.desirability.customers = next; }),
        });

      case "otherBeneficiaries":
        return renderAutoList<OtherBeneficiary>({
          title: "Other Beneficiaries",
          items: blueprint.desirability.otherBeneficiaries,
          minSlots: MIN_SLOTS.otherBeneficiaries,
          dark: true,
          getText: (x) => (x.benefitDescription?.trim() ? `${x.name} (${x.benefitDescription})` : x.name),
          setText: (x, value) => {
            const parsed = parseNameWithOptionalDescription(value);
            return { ...x, name: parsed.name, benefitDescription: parsed.description };
          },
          makeItem: (initialText = "") => {
            const parsed = parseNameWithOptionalDescription(initialText);
            return { id: makeId("benef"), name: parsed.name, benefitDescription: parsed.description };
          },
          onChange: (next) => update((d) => { d.desirability.otherBeneficiaries = next; }),
        });

      case "customerRelationship":
        return renderAutoList<CustomerRelationship>({
          title: "Customer Relationship",
          items: blueprint.desirability.customerRelationships,
          minSlots: MIN_SLOTS.customerRelationships,
          dark: true,
          getText: (x) => x.description,
          setText: (x, value) => ({ ...x, description: value }),
          makeItem: (initialText = "") => ({ id: makeId("rel"), description: initialText }),
          onChange: (next) => update((d) => { d.desirability.customerRelationships = next; }),
        });

      case "customerChannels":
        return renderAutoList<CustomerChannel>({
          title: "Customer Channels",
          items: blueprint.desirability.customerChannels,
          minSlots: MIN_SLOTS.customerChannels,
          dark: true,
          getText: (x) => x.description,
          setText: (x, value) => ({ ...x, description: value }),
          makeItem: (initialText = "") => ({ id: makeId("chan"), description: initialText }),
          onChange: (next) => update((d) => { d.desirability.customerChannels = next; }),
        });

      case "keyActivities":
        return renderAutoList<KeyActivity>({
          title: "Key Activities",
          items: blueprint.feasibility.keyActivities,
          minSlots: MIN_SLOTS.keyActivities,
          dark: true,
          getText: (x) => x.description,
          setText: (x, value) => ({ ...x, description: value }),
          makeItem: (initialText = "") => ({ id: makeId("act"), description: initialText }),
          onChange: (next) => update((d) => { d.feasibility.keyActivities = next; }),
        });

      case "keyPoliciesRegulations":
        return renderAutoList<KeyPolicyRegulation>({
          title: "Key Policies & Regulations",
          items: blueprint.feasibility.keyPoliciesRegulations,
          minSlots: MIN_SLOTS.keyPoliciesRegulations,
          dark: true,
          getText: (x) => (x.description?.trim() ? `${x.name} (${x.description})` : x.name),
          setText: (x, value) => {
            const parsed = parseNameWithOptionalDescription(value);
            return { ...x, name: parsed.name, description: parsed.description };
          },
          makeItem: (initialText = "") => {
            const parsed = parseNameWithOptionalDescription(initialText);
            return { id: makeId("pol"), name: parsed.name, description: parsed.description };
          },
          onChange: (next) => update((d) => { d.feasibility.keyPoliciesRegulations = next; }),
        });

      case "keyPartners":
        return renderTypedGroups<KeyPartner>({
          title: "Key Partners",
          dark: true,
          groups: [
            {
              key: "supplier",
              label: "Suppliers",
              minSlots: MIN_SLOTS.partnerSupplier,
              getText: (x) => x.name,
              setText: (x, value) => ({ ...x, name: value }),
              makeItem: (initialText = "") => ({ id: makeId("partner"), type: "supplier", name: initialText }),
            },
            {
              key: "enabler",
              label: "Enablers",
              minSlots: MIN_SLOTS.partnerEnabler,
              getText: (x) => x.name,
              setText: (x, value) => ({ ...x, name: value }),
              makeItem: (initialText = "") => ({ id: makeId("partner"), type: "enabler", name: initialText }),
            },
          ],
          items: blueprint.feasibility.keyPartners,
          onChange: (next) => update((d) => { d.feasibility.keyPartners = next; }),
        });

      case "keyCapabilities":
        return renderTypedGroups<KeyCapability>({
          title: "Key Capabilities",
          dark: true,
          groups: [
            {
              key: "executionCapability",
              label: "Execution Capabilities",
              minSlots: MIN_SLOTS.capabilityExecution,
              getText: (x) => x.description,
              setText: (x, value) => ({ ...x, description: value }),
              makeItem: (initialText = "") => ({ id: makeId("cap"), type: "executionCapability", description: initialText }),
            },
            {
              key: "dynamicCapability",
              label: "Dynamic Capabilities",
              minSlots: MIN_SLOTS.capabilityDynamic,
              getText: (x) => x.description,
              setText: (x, value) => ({ ...x, description: value }),
              makeItem: (initialText = "") => ({ id: makeId("cap"), type: "dynamicCapability", description: initialText }),
            },
          ],
          items: blueprint.feasibility.keyCapabilities,
          onChange: (next) => update((d) => { d.feasibility.keyCapabilities = next; }),
        });

      case "keyResources":
        return renderTypedGroups<KeyResource>({
          title: "Key Resources",
          dark: true,
          groups: [
            {
              key: "humanResource",
              label: "Human",
              minSlots: MIN_SLOTS.resourceHuman,
              getText: (x) => x.name,
              setText: (x, value) => ({ ...x, name: value }),
              makeItem: (initialText = "") => ({ id: makeId("res"), type: "humanResource", name: initialText }),
            },
            {
              key: "physicalResource",
              label: "Physical",
              minSlots: MIN_SLOTS.resourcePhysical,
              getText: (x) => x.name,
              setText: (x, value) => ({ ...x, name: value }),
              makeItem: (initialText = "") => ({ id: makeId("res"), type: "physicalResource", name: initialText }),
            },
            {
              key: "digitalResource",
              label: "Digital",
              minSlots: MIN_SLOTS.resourceDigital,
              getText: (x) => x.name,
              setText: (x, value) => ({ ...x, name: value }),
              makeItem: (initialText = "") => ({ id: makeId("res"), type: "digitalResource", name: initialText }),
            },
          ],
          items: blueprint.feasibility.keyResources,
          onChange: (next) => update((d) => { d.feasibility.keyResources = next; }),
        });

      case "economicCosts":
        return renderAutoList<ValueItem>({
          title: "Economic: Costs / Negative Impact",
          items: blueprint.viability.economic.costs,
          minSlots: MIN_SLOTS.valueItems,
          dark: true,
          getText: (x) => x.description,
          setText: (x, value) => ({ ...x, description: value }),
          makeItem: (initialText = "") => ({ id: makeId("cost"), description: initialText }),
          onChange: (next) => update((d) => { d.viability.economic.costs = next; }),
        });

      case "economicBenefits":
        return renderAutoList<ValueItem>({
          title: "Economic: Benefits / Positive Impact",
          items: blueprint.viability.economic.benefits,
          minSlots: MIN_SLOTS.valueItems,
          dark: true,
          getText: (x) => x.description,
          setText: (x, value) => ({ ...x, description: value }),
          makeItem: (initialText = "") => ({ id: makeId("ben"), description: initialText }),
          onChange: (next) => update((d) => { d.viability.economic.benefits = next; }),
        });

      case "envNegative":
        return renderAutoList<ValueItem>({
          title: "Environmental: Costs / Negative Impact",
          items: blueprint.viability.environmental.negative,
          minSlots: MIN_SLOTS.valueItems,
          dark: true,
          getText: (x) => x.description,
          setText: (x, value) => ({ ...x, description: value }),
          makeItem: (initialText = "") => ({ id: makeId("envn"), description: initialText }),
          onChange: (next) => update((d) => { d.viability.environmental.negative = next; }),
        });

      case "envPositive":
        return renderAutoList<ValueItem>({
          title: "Environmental: Benefits / Positive Impact",
          items: blueprint.viability.environmental.positive,
          minSlots: MIN_SLOTS.valueItems,
          dark: true,
          getText: (x) => x.description,
          setText: (x, value) => ({ ...x, description: value }),
          makeItem: (initialText = "") => ({ id: makeId("envp"), description: initialText }),
          onChange: (next) => update((d) => { d.viability.environmental.positive = next; }),
        });

      case "socialNegative":
        return renderAutoList<ValueItem>({
          title: "Social: Costs / Negative Impact",
          items: blueprint.viability.social.negative,
          minSlots: MIN_SLOTS.valueItems,
          dark: true,
          getText: (x) => x.description,
          setText: (x, value) => ({ ...x, description: value }),
          makeItem: (initialText = "") => ({ id: makeId("socn"), description: initialText }),
          onChange: (next) => update((d) => { d.viability.social.negative = next; }),
        });

      case "socialPositive":
        return renderAutoList<ValueItem>({
          title: "Social: Benefits / Positive Impact",
          items: blueprint.viability.social.positive,
          minSlots: MIN_SLOTS.valueItems,
          dark: true,
          getText: (x) => x.description,
          setText: (x, value) => ({ ...x, description: value }),
          makeItem: (initialText = "") => ({ id: makeId("socp"), description: initialText }),
          onChange: (next) => update((d) => { d.viability.social.positive = next; }),
        });

      case "privacySecurity":
        return renderAutoList<ResponsibilityPoint>({
          title: "Privacy & Security",
          items: blueprint.responsibility.privacySecurity,
          minSlots: MIN_SLOTS.responsibility,
          getText: (x) => x.description,
          setText: (x, value) => ({ ...x, description: value }),
          makeItem: (initialText = "") => ({ id: makeId("priv"), description: initialText }),
          onChange: (next) => update((d) => { d.responsibility.privacySecurity = next; }),
        });

      case "fairnessEthics":
        return renderAutoList<ResponsibilityPoint>({
          title: "Fairness & Ethics",
          items: blueprint.responsibility.fairnessEthics,
          minSlots: MIN_SLOTS.responsibility,
          getText: (x) => x.description,
          setText: (x, value) => ({ ...x, description: value }),
          makeItem: (initialText = "") => ({ id: makeId("fair"), description: initialText }),
          onChange: (next) => update((d) => { d.responsibility.fairnessEthics = next; }),
        });

      case "transparencyExplainability":
        return renderAutoList<ResponsibilityPoint>({
          title: "Transparency & Explainability",
          items: blueprint.responsibility.transparencyExplainability,
          minSlots: MIN_SLOTS.responsibility,
          getText: (x) => x.description,
          setText: (x, value) => ({ ...x, description: value }),
          makeItem: (initialText = "") => ({ id: makeId("tran"), description: initialText }),
          onChange: (next) => update((d) => { d.responsibility.transparencyExplainability = next; }),
        });

      case "accountabilityContestability":
        return renderAutoList<ResponsibilityPoint>({
          title: "Accountability & Contestability",
          items: blueprint.responsibility.accountabilityContestability,
          minSlots: MIN_SLOTS.responsibility,
          getText: (x) => x.description,
          setText: (x, value) => ({ ...x, description: value }),
          makeItem: (initialText = "") => ({ id: makeId("acct"), description: initialText }),
          onChange: (next) => update((d) => { d.responsibility.accountabilityContestability = next; }),
        });

      default:
        return <div>{id}</div>;
    }
  };

  const renderedBlocks = useMemo(
    () =>
      layout.blocks.map((block) => {
        const style: CSSProperties = {
          ...cardStyle({
            background: block.style.backgroundColor,
            color: block.style.color,
            textAlign: block.style.textAlign,
            verticalAlign: block.style.verticalAlign,
            border: block.style.border,
            padding: block.style.padding,
            fontStyle: block.style.fontStyle,
            fontWeight: block.style.fontWeight,
            fontSize: block.style.fontSize ?? 12.5,
            borderRadius: block.style.borderRadius ?? 8,
          }),
          gridColumn: `${block.col} / span ${block.colSpan}`,
          gridRow: `${block.row} / span ${block.rowSpan}`,
          alignSelf: "stretch",
          cursor: HELP_CONTENT[block.id] ? "default" : "default",
          boxShadow: activeHelpId === block.id ? "0 0 0 2px rgba(13,70,120,0.18) inset" : undefined,
        };

        return (
          <div
            key={block.id}
            style={style}
            onMouseEnter={() => {
              if (!HELP_CONTENT[block.id]) return;
              setActiveHelpId(block.id);
            }}
            onFocus={() => {
              if (!HELP_CONTENT[block.id]) return;
              setActiveHelpId(block.id);
            }}
          >
            {getBlockContent(block.id)}
          </div>
        );
      }),
    [blueprint, activeHelpId]
  );

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: showHelpPanel
            ? helpOpen
              ? "minmax(0, 1fr) 200px"
              : "minmax(0, 1fr) 30px"
            : "minmax(0, 1fr)",
          gap: 12,
          alignItems: "start",
          width: "100%",
          minWidth: 0,
          transition: "grid-template-columns 180ms ease",
        }}
      >
        <div style={{ minWidth: 0, width: "100%", overflowX: "auto" }}>
          <div id="process-canvas-export-root" style={gridStyle}>
            {renderedBlocks}
          </div>
        </div>

        {showHelpPanel ? (
          <aside
            data-export-exclude="true"
            style={{
              position: "sticky",
              top: 12,
              alignSelf: "start",
              width: helpOpen ? 200 : 30,
              minWidth: helpOpen ? 200 : 30,
              maxWidth: helpOpen ? 200 : 30,
              border: "1px solid #d7dde5",
              borderRadius: 12,
              background: "#ffffff",
              boxShadow: "0 10px 28px rgba(15, 23, 42, 0.08)",
              overflow: "hidden",
              transition: "width 180ms ease, min-width 180ms ease, max-width 180ms ease",
            }}
          >
            {helpOpen ? (
              <div style={{ display: "grid", gridTemplateRows: "auto 1fr", minHeight: 220 }}>
                <button
                  type="button"
                  onClick={() => setHelpOpen(false)}
                  style={{
                    width: "100%",
                    border: "none",
                    background: "#eef4f8",
                    color: "#0f172a",
                    padding: "7px 7px",
                    cursor: "pointer",
                    fontWeight: 600,
                    textAlign: "left",
                  }}
                >
                  Help ‹click to collapse››
                </button>

                <div style={{ padding: 12, display: "grid", gap: 10, fontSize: 13, color: "#334155", lineHeight: 1.45 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 4, textAlign: "left" }}>{activeHelp.title}</div>
                    <div style={{ textAlign: "left" }}>{activeHelp.question}</div>
                  </div>

                  {activeHelp.subgroups?.map((group) => (
                    <div key={group.label} style={{ width: "100%", textAlign: "left" }}>
                      <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>{group.label}</div>
                      <ul style={{ margin: 0, paddingLeft: 18, textAlign: "left" }}>
                        {group.examples.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  {activeHelp.examples?.length ? (
                    <div>
                      <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Examples</div>
                      <ul style={{ margin: 0, paddingLeft: 18, textAlign: "left" }}>
                        {activeHelp.examples.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div style={{ fontSize: 12, color: "#64748b", borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
                    Move the pointer over a canvas element to load context-specific guidance here.
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                style={{
                  width: "100%",
                  minHeight: 220,
                  border: "none",
                  background: "#eef4f8",
                  color: "#0f172a",
                  cursor: "pointer",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                  letterSpacing: "0.03em",
                  padding: "10px 4px",
                }}
                aria-label="Open help panel"
              >
                Help ‹‹
              </button>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
