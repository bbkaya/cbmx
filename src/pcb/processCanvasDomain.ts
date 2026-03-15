export type Goal = {
  id: string;
  statement: string;
};

export type Customer = {
  id: string;
  name: string;
};

export type OtherBeneficiary = {
  id: string;
  name: string;
  benefitDescription?: string;
};

export type CustomerRelationship = {
  id: string;
  description: string;
};

export type CustomerChannel = {
  id: string;
  description: string;
};

export type KeyActivity = {
  id: string;
  description: string;
};

export type KeyPartnerType = "supplier" | "enabler";

export type KeyPartner = {
  id: string;
  type: KeyPartnerType;
  name: string;
  description?: string;
};

export type KeyCapabilityType = "executionCapability" | "dynamicCapability";

export type KeyCapability = {
  id: string;
  type: KeyCapabilityType;
  description: string;
};

export type KeyPolicyRegulation = {
  id: string;
  name: string;
  description?: string;
};

export type KeyResourceType = "humanResource" | "physicalResource" | "digitalResource";

export type KeyResource = {
  id: string;
  type: KeyResourceType;
  name: string;
  description?: string;
};

export type ValueItem = {
  id: string;
  description: string;
};

export type ResponsibilityPoint = {
  id: string;
  description: string;
};

export type ProcessCanvasBlueprint = {
  meta: {
    id: string;
    name: string;
    version: string;
    createdAt?: string;
    updatedAt?: string;
  };

  goals: Goal[];

  desirability: {
    purpose: string;
    customers: Customer[];
    otherBeneficiaries: OtherBeneficiary[];
    customerRelationships: CustomerRelationship[];
    customerChannels: CustomerChannel[];
  };

  feasibility: {
    keyActivities: KeyActivity[];
    keyPartners: KeyPartner[];
    keyCapabilities: KeyCapability[];
    keyPoliciesRegulations: KeyPolicyRegulation[];
    keyResources: KeyResource[];
  };

  viability: {
    economic: {
      costs: ValueItem[];
      benefits: ValueItem[];
    };
    environmental: {
      negative: ValueItem[];
      positive: ValueItem[];
    };
    social: {
      negative: ValueItem[];
      positive: ValueItem[];
    };
  };

  responsibility: {
    privacySecurity: ResponsibilityPoint[];
    fairnessEthics: ResponsibilityPoint[];
    transparencyExplainability: ResponsibilityPoint[];
    accountabilityContestability: ResponsibilityPoint[];
  };
};

export type ValidationIssue = {
  level: "error" | "warning";
  message: string;
};

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeBlankProcessCanvasBlueprint(): ProcessCanvasBlueprint {
  const now = new Date().toISOString();

  return {
    meta: {
      id: makeId("pcb"),
      name: "Untitled Process Canvas",
      version: "1.0.0",
      createdAt: now,
      updatedAt: now,
    },

    goals: [{ id: makeId("goal"), statement: "" }],

    desirability: {
      purpose: "...",
      customers: [{ id: makeId("cust"), name: "" }],
      otherBeneficiaries: [],
      customerRelationships: [],
      customerChannels: [],
    },

    feasibility: {
      keyActivities: [{ id: makeId("act"), description: "..." }],
      keyPartners: [],
      keyCapabilities: [],
      keyPoliciesRegulations: [],
      keyResources: [],
    },

    viability: {
      economic: { costs: [], benefits: [] },
      environmental: { negative: [], positive: [] },
      social: { negative: [], positive: [] },
    },

    responsibility: {
      privacySecurity: [],
      fairnessEthics: [],
      transparencyExplainability: [],
      accountabilityContestability: [],
    },
  };
}

export function deepClonePCB(bp: ProcessCanvasBlueprint): ProcessCanvasBlueprint {
  return JSON.parse(JSON.stringify(bp)) as ProcessCanvasBlueprint;
}

export function validateProcessCanvasBlueprint(bp: ProcessCanvasBlueprint): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!bp.meta.name.trim()) {
    issues.push({ level: "warning", message: "Please provide a name for your Process Canvas Blueprint." });
  }

  if (!bp.desirability.purpose.trim()) {
    issues.push({ level: "warning", message: "Please provide a Purpose for the process. The Purpose represents the value this process creates for its customers and stakeholders." });
  }

  if (bp.goals.length === 0) {
    issues.push({ level: "warning", message: "Please define one or more Goals for the process. A Goal represents the key operational outcomes the process should deliver consistently." });
  }

  if (bp.desirability.customers.length === 0) {
    issues.push({ level: "warning", message: "Please define at least one Customer for the process. The customer is the main beneficiary of the value that the process creates." });
  }

  if (bp.feasibility.keyActivities.length === 0) {
    issues.push({ level: "warning", message: "Please define at least one Key Activity for the process." });
  }

  return issues;
}