import EditableText from "./EditableText";
import type { ReactNode } from "react";


export default function SlotStack({
  slots,
  getValue,
  onCommit,
  readOnly,
  placeholder,
  prefixLabel,
  onAdd,
  renderValue,
  label,
}: {
  slots: number;
  getValue: (slotIndex: number) => string;
  onCommit: (slotIndex: number, next: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  prefixLabel?: (slotIndex: number) => string;
  onAdd?: () => void;
  renderValue?: (slotIndex: number) => ReactNode;
  label?: string;
}) {
  const FONT_SIZE = 12;
  const LINE_HEIGHT = 1.25;
  const LINE_PX = FONT_SIZE * LINE_HEIGHT;

  return (
    <div className="cbmx-slot-stack" style={{ position: "relative" }}>
      {onAdd && !readOnly ? (
        <button
          type="button"
          onClick={onAdd}
          title="Add"
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            width: 22,
            height: 22,
            borderRadius: 6,
            border: "1px solid #bbb",
            background: "white",
            cursor: "pointer",
            fontWeight: 700,
            lineHeight: "18px",
          }}
        >
          +
        </button>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingRight: onAdd && !readOnly ? 26 : 0 }}>
        {Array.from({ length: slots }).map((_, i) => (
          <div key={i} className="cbmx-slot" data-populated={Boolean(getValue(i)?.trim())}
            style={{ display: "flex", gap: 3, alignItems: "flex-start" }}>
            <div
              style={{
                width: 18,
                flex: "0 0 3px",
                textAlign: "center",
                fontSize: FONT_SIZE,
                lineHeight: `${LINE_PX}px`,
                height: `${LINE_PX}px`,
                paddingTop: 3,
                color: "#111",
                userSelect: "none",
              }}
              aria-hidden="true"
            >
              {prefixLabel ? prefixLabel(i) : "•"}
            </div>

            <div style={{ flex: 1 }}>
              <EditableText
                value={getValue(i) ?? ""}
                label={label ? `${label}, item ${i + 1}` : undefined}
                displayValue={renderValue?.(i)}
                placeholder={placeholder ?? "…"}
                readOnly={readOnly}
                onCommit={(v) => onCommit(i, v)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
