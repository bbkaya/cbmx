import type { CSSProperties } from "react";

export const baseCell: CSSProperties = {
  verticalAlign: "top",
};

export const cell: CSSProperties = { ...baseCell };

export const thCell: CSSProperties = {
  ...baseCell,
  fontWeight: 700,
  textAlign: "center",
};

export const rowLabelCell: CSSProperties = {
  ...baseCell,
  width: 174,
  fontWeight: 700,
};

export const rowLabelIndentCell: CSSProperties = {
  ...rowLabelCell,
};

export const networkCell: CSSProperties = {
  ...baseCell,
};


export const cellLeft: CSSProperties = {
  ...baseCell,
  textAlign: "left",
};
