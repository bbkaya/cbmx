import type { CSSProperties } from "react";

export const baseCell: CSSProperties = {
  border: "1px solid #222",
  verticalAlign: "top",
  padding: 8,
  fontSize: 12,
  lineHeight: 1.25,
  wordBreak: "break-word",
  background: "white",
};

export const cell: CSSProperties = { ...baseCell };

export const thCell: CSSProperties = {
  ...baseCell,
  fontWeight: 700,
  textAlign: "center",
};

export const rowLabelCell: CSSProperties = {
  ...baseCell,
  width: 220,
  fontWeight: 700,
};

export const rowLabelIndentCell: CSSProperties = {
  ...rowLabelCell,
};

export const networkCell: CSSProperties = {
  ...baseCell,
  fontWeight: 600,
};

export const cellLeft: CSSProperties = {
  ...baseCell,
  textAlign: "left",
};