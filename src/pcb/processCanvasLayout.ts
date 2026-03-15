export type PCDimension =
  | "meta"
  | "desirability"
  | "feasibility"
  | "viability"
  | "responsibility";

export type PCCellStyle = {
  backgroundColor?: string;
  color?: string;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  border?: string;
  padding?: string;
  fontStyle?: "normal" | "italic";
  fontWeight?: number;
  fontSize?: string;
  borderRadius?: string;
};

export type PCCanvasBlock = {
  id: string;
  label: string;
  prompt?: string;
  dimension: PCDimension;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  style: PCCellStyle;
};

export type PCCanvasLayout = {
  id: string;
  name: string;
  columnCount: number;
  rowCount: number;
  columnWidths: string[];
  rowHeights: string[];
  blocks: PCCanvasBlock[];
};

const WHITE = "#ffffff";
const DARK_BLUE = "#0d4678";
const MID_BLUE = "#63b3da";
const LIGHT_BLUE = "#87aac6";
const GREY = "#9ea1a3";
const BLACK = "#000000";

const CELL = {
  border: "none",
  padding: "4px 6px",
  borderRadius: "6px",
} as const;

export const PROCESS_CANVAS_LAYOUT_V1: PCCanvasLayout = {
  id: "process-canvas-v1",
  name: "Process Canvas",
  columnCount: 22,
  rowCount: 8,
  columnWidths: ["28px", ...Array(20).fill("1fr"), "28px"],
  rowHeights: [
    "28px",
    "minmax(84px, auto)",
    "minmax(128px, auto)",
    "minmax(112px, auto)",
    "minmax(56px, auto)",
    "minmax(56px, auto)",
    "minmax(56px, auto)",
    "28px",
  ],
  blocks: [
    {
      id: "responsibilityHeader",
      label: "RESPONSIBILITY",
      dimension: "responsibility",
      row: 1,
      col: 2,
      rowSpan: 1,
      colSpan: 20,
      style: {
        backgroundColor: WHITE,
        color: MID_BLUE,
        textAlign: "center",
        verticalAlign: "middle",
        padding: "2px 0",
        border: "none",
      },
    },
    {
      id: "feasibilitySide",
      label: "FEASIBILITY",
      dimension: "feasibility",
      row: 2,
      col: 1,
      rowSpan: 6,
      colSpan: 1,
      style: {
        backgroundColor: WHITE,
        color: DARK_BLUE,
        textAlign: "center",
        verticalAlign: "middle",
        border: "none",
        padding: "0",
      },
    },
    {
      id: "desirabilitySide",
      label: "DESIRABILITY",
      dimension: "desirability",
      row: 2,
      col: 22,
      rowSpan: 6,
      colSpan: 1,
      style: {
        backgroundColor: WHITE,
        color: GREY,
        textAlign: "center",
        verticalAlign: "middle",
        border: "none",
        padding: "0",
      },
    },

    {
      id: "privacySecurity",
      label: "Privacy & Security",
      dimension: "responsibility",
      row: 2,
      col: 2,
      rowSpan: 1,
      colSpan: 5,
      style: {
        backgroundColor: MID_BLUE,
        color: BLACK,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "fairnessEthics",
      label: "Fairness & Ethics",
      dimension: "responsibility",
      row: 2,
      col: 7,
      rowSpan: 1,
      colSpan: 5,
      style: {
        backgroundColor: MID_BLUE,
        color: BLACK,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "transparencyExplainability",
      label: "Transparency & Explainability",
      dimension: "responsibility",
      row: 2,
      col: 12,
      rowSpan: 1,
      colSpan: 5,
      style: {
        backgroundColor: MID_BLUE,
        color: BLACK,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "accountabilityContestability",
      label: "Accountability & Contestability",
      dimension: "responsibility",
      row: 2,
      col: 17,
      rowSpan: 1,
      colSpan: 5,
      style: {
        backgroundColor: MID_BLUE,
        color: BLACK,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },

    {
      id: "keyPartners",
      label: "Key Partners",
      dimension: "feasibility",
      row: 3,
      col: 2,
      rowSpan: 1,
      colSpan: 4,
      style: {
        backgroundColor: DARK_BLUE,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "keyCapabilities",
      label: "Key Capabilities",
      dimension: "feasibility",
      row: 3,
      col: 6,
      rowSpan: 1,
      colSpan: 4,
      style: {
        backgroundColor: DARK_BLUE,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "purposeGoals",
      label: "Purpose & Goal",
      dimension: "meta",
      row: 3,
      col: 10,
      rowSpan: 1,
      colSpan: 4,
      style: {
        backgroundColor: WHITE,
        color: BLACK,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "customerRelationship",
      label: "Customer Relationship",
      dimension: "desirability",
      row: 3,
      col: 14,
      rowSpan: 1,
      colSpan: 4,
      style: {
        backgroundColor: GREY,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "customers",
      label: "Customers",
      dimension: "desirability",
      row: 3,
      col: 18,
      rowSpan: 1,
      colSpan: 4,
      style: {
        backgroundColor: GREY,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },

    {
      id: "keyPoliciesRegulations",
      label: "Key Policies & Regulations",
      dimension: "feasibility",
      row: 4,
      col: 2,
      rowSpan: 1,
      colSpan: 4,
      style: {
        backgroundColor: DARK_BLUE,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "keyResources",
      label: "Key Resources",
      dimension: "feasibility",
      row: 4,
      col: 6,
      rowSpan: 1,
      colSpan: 4,
      style: {
        backgroundColor: DARK_BLUE,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "keyActivities",
      label: "Key Activities",
      dimension: "feasibility",
      row: 4,
      col: 10,
      rowSpan: 1,
      colSpan: 4,
      style: {
        backgroundColor: DARK_BLUE,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "customerChannels",
      label: "Customer Channels",
      dimension: "desirability",
      row: 4,
      col: 14,
      rowSpan: 1,
      colSpan: 4,
      style: {
        backgroundColor: GREY,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "otherBeneficiaries",
      label: "Other Beneficiaries",
      dimension: "desirability",
      row: 4,
      col: 18,
      rowSpan: 1,
      colSpan: 4,
      style: {
        backgroundColor: GREY,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },

    {
      id: "economicCosts",
      label: "Economic Costs / Negative Impact",
      dimension: "viability",
      row: 5,
      col: 2,
      rowSpan: 1,
      colSpan: 10,
      style: {
        backgroundColor: LIGHT_BLUE,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "economicBenefits",
      label: "Economic Benefits / Positive Impact",
      dimension: "viability",
      row: 5,
      col: 12,
      rowSpan: 1,
      colSpan: 10,
      style: {
        backgroundColor: LIGHT_BLUE,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "envNegative",
      label: "Environmental Costs / Negative Impact",
      dimension: "viability",
      row: 6,
      col: 2,
      rowSpan: 1,
      colSpan: 10,
      style: {
        backgroundColor: LIGHT_BLUE,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "envPositive",
      label: "Environmental Benefits / Positive Impact",
      dimension: "viability",
      row: 6,
      col: 12,
      rowSpan: 1,
      colSpan: 10,
      style: {
        backgroundColor: LIGHT_BLUE,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "socialNegative",
      label: "Social Costs / Negative Impact",
      dimension: "viability",
      row: 7,
      col: 2,
      rowSpan: 1,
      colSpan: 10,
      style: {
        backgroundColor: LIGHT_BLUE,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },
    {
      id: "socialPositive",
      label: "Social Benefits / Positive Impact",
      dimension: "viability",
      row: 7,
      col: 12,
      rowSpan: 1,
      colSpan: 10,
      style: {
        backgroundColor: LIGHT_BLUE,
        color: WHITE,
        textAlign: "left",
        verticalAlign: "top",
        ...CELL,
      },
    },

    {
      id: "viabilityFooter",
      label: "VIABILITY",
      dimension: "viability",
      row: 8,
      col: 2,
      rowSpan: 1,
      colSpan: 20,
      style: {
        backgroundColor: WHITE,
        color: "#6f8ea7",
        textAlign: "center",
        verticalAlign: "middle",
        padding: "2px 0",
        border: "none",
      },
    },
  ],
};
