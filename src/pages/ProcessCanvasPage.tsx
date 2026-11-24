import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import "./process-canvas.css";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
const FULL_FIGURE_SRC = `${BASE_URL}images/PC-full.png`;
const SLIM_FIGURE_SRC = `${BASE_URL}images/PC-slim.png`;

type ExampleCard = {
  id: string;
  title: string;
  text: string;
  image: string;
};

const EXAMPLES: ExampleCard[] = [
  {
    id: "travel-journey",
    title: "Traveler Journey Process",
    text: "Example Process Canvas blueprint for a shared e-bike service traveler journey.",
    image: `${BASE_URL}images/TravelJourney.png`,
  },
  {
    id: "loan-processing",
    title: "Loan Processing",
    text: "Example Process Canvas blueprint for a loan processing process.",
    image: `${BASE_URL}images/LoanProcessing.png`,
  },
  {
    id: "order-fulfilment",
    title: "Order Fulfilment",
    text: "Example Process Canvas blueprint for an order fulfilment process.",
    image: `${BASE_URL}images/OrderFullfilment.png`,
  },
];

function sectionLabel(text: string) {
  return (
    <div
      style={{
        fontSize: 13,
        textTransform: "uppercase",
        letterSpacing: 1.2,
        fontWeight: 800,
        color: "#0d4678",
        marginBottom: 8,
      }}
    >
      {text}
    </div>
  );
}

function cardStyle(): CSSProperties {
  return {
    border: "1px solid #dbe3ec",
    borderRadius: 18,
    background: "#ffffff",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
  };
}

export default function ProcessCanvasPage() {
  const [modalImage, setModalImage] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (modalImage) dialogRef.current?.showModal();
  }, [modalImage]);

  return (
    <div className="process-canvas-page">
      <section
        className="process-canvas-hero"
        style={{
          display: "grid",
          gap: 28,
          alignItems: "start",
          marginBottom: 56,
        }}
      >
        <div>
          {sectionLabel("Strategic process design")}
          <h1
            style={{
              fontSize: 28,
              lineHeight: 1.08,
              margin: "0 0 18px 0",
              maxWidth: 760,
              textAlign: "left",
            }}
          >
            Explore business processes through feasibility, viability,
            desirability, and responsibility.
          </h1>
          <p
            style={{
              fontSize: 18,
              lineHeight: 1.7,
              color: "#475569",
              margin: "0 0 24px 0",
              maxWidth: 760,
              textAlign: "left",
            }}
          >
            The Process Canvas helps represent the strategic layer of a
            process: why the process exists, what value it creates, and how it
            aligns with organizational goals across four complementary
            dimensions.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link
              to="/app/pcb/new"
              style={{
                padding: "12px 18px",
                background: "#0d4678",
                color: "#fff",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 800,
                border: "none",
                cursor: "pointer",
              }}
            >
              Create a Process Canvas
            </Link>

            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("how");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              style={{
                padding: "12px 18px",
                border: "1px solid #cbd5e1",
                color: "#0f172a",
                borderRadius: 10,
                fontWeight: 800,
                background: "#fff",
                cursor: "pointer",
              }}
            >
              See how it works
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setModalImage(SLIM_FIGURE_SRC)}
          style={{
            ...cardStyle(),
            padding: 16,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <img
            src={SLIM_FIGURE_SRC}
            alt="Process Canvas overview"
            style={{
              width: "100%",
              height: 290,
              objectFit: "contain",
              display: "block",
              borderRadius: 12,
              background: "#f8fafc",
            }}
          />
          <div
            style={{
              paddingTop: 12,
              color: "#475569",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Click to view the full Process Canvas figure.
          </div>
        </button>
      </section>

      <section id="what" style={{ marginTop: 30, scrollMarginTop: 110, textAlign: "left" }}>
        {sectionLabel("What is it")}
        <div style={{ ...cardStyle(), padding: 20, textAlign: "left" }}>
          <p style={{ lineHeight: 1.8, color: "#334155", marginTop: 0 }}>
            Process Science claims to be a multi-dimensional discipline aiming
            far beyond the established aim of a friction-free business
            process. However, established BPM tools—such as process lifecycle
            models, modelling standards, and process mining techniques—do not
            fully support this broader perspective on comprehensive process
            management. This disconnect between the ambitions of Process
            Science and the current BPM approaches motivated the development of
            the Process Canvas.
          </p>
          <p style={{ lineHeight: 1.8, color: "#334155" }}>
            The Process Canvas enables the exploration of a business process
            from four key perspectives: feasibility, viability, desirability,
            and responsibility.
          </p>
          <p style={{ lineHeight: 1.8, color: "#334155" }}>
            By integrating these dimensions into a unified framework, it
            extends the existing suite of BPM tools.
          </p>
          <p
            style={{
              lineHeight: 1.8,
              color: "#334155",
              marginBottom: 0,
            }}
          >
            The Process Canvas focuses on the strategic layer of a process—why
            the process exists, what value it creates, and how it aligns with
            organizational goals along these four dimensions. Such a
            representation can help establish a shared understanding among the
            diverse stakeholders involved in the process. It can complement
            formal process models and automation practices, and integrate with
            existing BPM activities such as process analysis and (re)design.
          </p>
        </div>
      </section>

      <section id="how" style={{ marginTop: 50, scrollMarginTop: 110, textAlign: "left" }}>
        {sectionLabel("How it works")}
        <div
          className="process-canvas-how"
          style={{
            display: "grid",
            gap: 24,
            alignItems: "start",
          }}
        >
          <div style={{ ...cardStyle(), padding: 24 }}>
            <p style={{ lineHeight: 1.8, color: "#334155", marginTop: 0 }}>
              The Process Canvas offers a single integrated representation in
              which the central purpose and goal of a process are connected to
              feasibility, desirability, viability, and responsibility
              concerns.
            </p>
            <p style={{ lineHeight: 1.8, color: "#334155" }}>
              In the editor, users can define and refine the core process
              elements, document strategic assumptions, and export the
              blueprint as JSON, PNG, or PDF for further use in workshops and
              design sessions. Exported JSON files can also be imported again
              for reuse or update.
            </p>
            <p
              style={{
                lineHeight: 1.8,
                color: "#334155",
                marginBottom: 0,
              }}
            >
              The figure on the right shows the full Process Canvas structure
              and can be enlarged for closer inspection.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setModalImage(FULL_FIGURE_SRC)}
            style={{
              ...cardStyle(),
              padding: 14,
              background: "#f8fafc",
              cursor: "pointer",
            }}
          >
            <img
              src={FULL_FIGURE_SRC}
              alt="Full Process Canvas figure"
              style={{
                width: "100%",
                height: 260,
                objectFit: "contain",
                display: "block",
                borderRadius: 12,
                background: "#ffffff",
              }}
            />
            <div
              style={{
                marginTop: 10,
                color: "#475569",
                fontSize: 14,
                textAlign: "left",
              }}
            >
              Click to enlarge
            </div>
          </button>
        </div>
      </section>

      <section id="use-cases" style={{ marginTop: 44, scrollMarginTop: 110 }}>
        {sectionLabel("Use Cases")}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
            gap: 18,
          }}
        >
          {[
            {
              title: "Workshops",
              text: "Create a shared language among stakeholders when framing process redesign and innovation initiatives.",
            },
            {
              title: "Research",
              text: "Represent and compare process blueprints across cases, sectors, and analytical dimensions.",
            },
            {
              title: "Education",
              text: "Support classroom discussion and assignments on strategic process design and multi-dimensional process analysis.",
            },
          ].map((item) => (
            <div key={item.title} style={{ ...cardStyle(), padding: 22 }}>
              <h3 style={{ marginTop: 0, marginBottom: 10 }}>{item.title}</h3>
              <p style={{ lineHeight: 1.7, color: "#475569", margin: 0 }}>
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="examples" style={{ marginTop: 44, scrollMarginTop: 110 }}>
        {sectionLabel("Examples")}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
            gap: 18,
          }}
        >
          {EXAMPLES.map((example) => (
            <button
              key={example.id}
              type="button"
              onClick={() => setModalImage(example.image)}
              style={{
                ...cardStyle(),
                padding: 16,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  height: 190,
                  borderRadius: 12,
                  background: "#f8fafc",
                  border: "1px solid #dbe3ec",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  marginBottom: 14,
                }}
              >
                <img
                  src={example.image}
                  alt={example.title}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "block",
                    background: "#ffffff",
                  }}
                />
              </div>
              <h3 style={{ margin: "0 0 8px 0" }}>{example.title}</h3>
              <p style={{ lineHeight: 1.7, color: "#475569", margin: 0 }}>
                {example.text}
              </p>
            </button>
          ))}
        </div>
      </section>

      <dialog
        ref={dialogRef}
        aria-label="Expanded Process Canvas illustration"
        className="process-canvas-image-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        onClose={() => setModalImage(null)}
      >
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button type="button" onClick={() => dialogRef.current?.close()} autoFocus>
              Close
            </button>
          </div>
          {modalImage ? (
            <img src={modalImage} alt="Expanded Process Canvas illustration"
              style={{ maxWidth: "100%", maxHeight: "calc(90vh - 88px)", display: "block", objectFit: "contain" }} />
          ) : null}
        </div>
      </dialog>
    </div>
  );
}
