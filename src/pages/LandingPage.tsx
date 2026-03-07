// src/pages/LandingPage.tsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { supabase } from "../supabaseClient";
import DashboardPage from "./DashboardPage";
import { useLandingScrollHandler } from "../layouts/SiteShell";

type FlipCardData = { title: string; text: string };

const WHY_CARDS: FlipCardData[] = [
  {
    title: "Align stakeholders early",
    text: "Create a shared view of the initiative before implementation starts. Clarify roles, expectations, and dependencies across the network. This is essential for building trust and supporting effective negotiation among actors.",
  },
  {
    title: "Make complexity manageable",
    text: "Bring value propositions, services, processes, and value capture into one structured overview instead of spreading them across disconnected documents and discussions.",
  },
  {
    title: "Design beyond financial value",
    text: "Capture not only economic aspects, but also environmental and social costs and benefits across the actor network. This supports more balanced and sustainable decision-making.",
  },
  {
    title: "Define measurable success",
    text: "Link the business model to KPIs and success criteria so that performance can be monitored, discussed, and improved over time.",
  },
  {
    title: "Bridge design and execution",
    text: "CBMX helps connect business model design to the services, processes, and digital infrastructures needed to make the solution work in practice.",
  },
  {
    title: "Support continual evolution",
    text: "Use the blueprint as a living artifact that can be refined as stakeholder priorities, regulations, technologies, and markets change.",
  },
];

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 90, textAlign: "left" }}>
      <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>{title}</div>
      <div style={{ color: "#374151", lineHeight: 1.55 }}>{children}</div>
    </section>
  );
}

export default function LandingPage() {
  useLandingScrollHandler();

  const { user } = useAuth();
  const nav = useNavigate();

  const [activeCard, setActiveCard] = React.useState<number | null>(null);
  const [recentId, setRecentId] = React.useState<string | null>(null);
  const [recentName, setRecentName] = React.useState<string | null>(null);
  const [exampleOpen, setExampleOpen] = React.useState(false);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setExampleOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    let alive = true;

    async function loadRecent() {
      if (!user) {
        setRecentId(null);
        setRecentName(null);
        return;
      }

      const { data, error } = await supabase
        .from("blueprints")
        .select("id,name,updated_at")
        .eq("owner_user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (!alive) return;

      if (error) {
        setRecentId(null);
        setRecentName(null);
        return;
      }

      const row = (data ?? [])[0] as any;
      setRecentId(row?.id ?? null);
      setRecentName(row?.name ?? null);
    }

    void loadRecent();

    return () => {
      alive = false;
    };
  }, [user?.id]);

  const startNewHref = user ? "/app?new=1" : "/login";

  return (
    <div style={{ display: "grid", gap: 26 }}>
      <style>{`
        .cbmx-card {
          perspective: 1000px;
          border-radius: 16px;
          height: 150px;
        }
        .cbmx-card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform 280ms ease;
          border-radius: 16px;
        }
        @media (hover: hover) and (pointer: fine) {
          .cbmx-card:hover .cbmx-card-inner { transform: rotateY(180deg); }
        }
        .cbmx-card.is-flipped .cbmx-card-inner { transform: rotateY(180deg); }

        .cbmx-card-face {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          border-radius: 16px;
          border: 1px solid #e5e7eb;
          background: white;
          padding: 14px;
          display: grid;
          gap: 8px;
          box-shadow: 0 1px 0 rgba(0,0,0,0.02);
        }
        .cbmx-card-back { transform: rotateY(180deg); }

        @media (max-width: 820px) {
          .cbmx-example-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 20,
          background: "white",
          padding: 18,
        }}
      >
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 1000, fontSize: 28, lineHeight: 1.15 }}>
              Design Collaborative Business Models for Digital and Sustainable Solutions
            </div>
            <div style={{ color: "#374151", lineHeight: 1.55, maxWidth: 980, textAlign: "left" }}>
              We developed the <b>Collaborative Business Model Matrix (CBMX)</b> to help structure complex multi-actor initiatives by mapping the shared value proposition, actor roles, costs, benefits, KPIs, services, and co-creation processes in one clear blueprint. It is built for network-centric business model design, where value is co-created and captured across multiple stakeholders rather than within a single firm.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "left" }}>
            <Link to={startNewHref} style={primaryCta}>
              Start a New Blueprint
            </Link>

            <button type="button" onClick={() => scrollToId("example")} style={secondaryCta}>
              Explore an Example
            </button>
          </div>

          <div
            style={{
              marginTop: 8,
              borderTop: "1px solid #f3f4f6",
              paddingTop: 14,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={callout}>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>One blueprint. Multiple actors. Shared value.</div>
              <div style={{ color: "#374151" }}>
                CBMX is developed to support the design and evolution of collaborative business models for digitally enabled, sustainable
                solutions.
              </div>
            </div>

            <div style={{ color: "#374151", textAlign: "left" }}>
              Use a single visual structure to align stakeholders around:
              <ul style={{ margin: "8px 0 0 0", paddingLeft: 18, lineHeight: 1.55 }}>
                <li>a network value proposition</li>
                <li>actor-specific value propositions</li>
                <li>financial and non-financial costs and benefits</li>
                <li>KPIs and success criteria</li>
                <li>actor services and co-creation processes</li>
              </ul>
            </div>

            <div style={{ color: "#374151", textAlign: "left" }}>
              CBMX is especially useful for initiatives where success depends on coordination and collaboration among
              organizations, public actors, platform providers, customers, and other ecosystem actors.
            </div>
          </div>

        </div>
      </section>

      <Section id="what-is" title="What is CBMX?">
        <div style={cardPanel}>
          <p style={{ marginTop: 0 }}>
            CBMX is a structured blueprinting approach for designing collaborative business models. It helps teams represent
            how a network of actors co-creates value for customers and captures benefits for participating actors. Instead of a
            firm-centric view, CBMX takes a network-centric perspective that is better suited to digital platforms, sustainable
            solutions, and multi-stakeholder ecosystems.
          </p>

          <div style={callout}>
            <div style={{ fontWeight: 900, marginBottom: 4 }}>From isolated business models to shared business logic</div>
            <div style={{ color: "#374151" }}>
              CBMX makes it easier to articulate who participates, what each actor contributes, what each actor gains, and how the collaboration works in practice.
            </div>
          </div>
        </div>
      </Section>

      <Section id="why-teams" title="Why teams use CBMX">
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {WHY_CARDS.map((c, idx) => {
              const flipped = activeCard === idx;
              return (
                <div
                  key={c.title}
                  className={`cbmx-card ${flipped ? "is-flipped" : ""}`}
                  onClick={() => setActiveCard((prev) => (prev === idx ? null : idx))}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setActiveCard((prev) => (prev === idx ? null : idx));
                  }}
                  style={{ cursor: "pointer" }}
                  aria-label={`Card: ${c.title}`}
                >
                  <div className="cbmx-card-inner">
                    <div className="cbmx-card-face">
                      <div style={{ fontWeight: 900 }}>{c.title}</div>
                      <div style={{ color: "#6b7280", fontSize: 13 }}>
                        Tap/hover to read
                      </div>
                    </div>

                    <div className="cbmx-card-face cbmx-card-back">
                      <div style={{ fontWeight: 900 }}>{c.title}</div>
                      <div style={{ color: "#374151", fontSize: 13, lineHeight: 1.5 }}>{c.text}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      <Section id="inside" title="What are the elements of a CBMX Blueprint?">
        <div style={cardPanel}>
          <div style={calloutElement}>
            <div style={{ marginBottom: 1 }}><b>Network value proposition</b> - the shared value the network offers to the customer</div>
          </div>
          <div style={{ marginBottom: 5 }} />

          <div style={calloutElement}>
            <div style={{ marginBottom: 1 }}><b>Actors</b> — the actors in the collaborative network: the customer, orchestrator, and other public/private actors</div>
          </div>
          <div style={{ marginBottom: 5 }} />

          <div style={calloutElement}>
            <div style={{ marginBottom: 1 }}><b>Actor value propositions</b> — what each actor contributes to the network</div>
          </div>
          <div style={{ marginBottom: 5 }} />

          <div style={calloutElement}>
            <div style={{ marginBottom: 1 }}><b>Costs and benefits</b> — financial, environmental, social, and other non-financial cost and benefit items</div>
          </div>
          <div style={{ marginBottom: 5 }} />

          <div style={calloutElement}>
            <div style={{ marginBottom: 1 }}><b>KPIs</b> — indicators to evaluate viability and monitor performance</div>
          </div>
          <div style={{ marginBottom: 5 }} />

          <div style={calloutElement}>
            <div style={{ marginBottom: 1 }}><b>Actor services</b> — capabilities each actor need to deploy</div>
          </div>
          <div style={{ marginBottom: 5 }} />

          <div style={calloutElement}>
            <div style={{ marginBottom: 1 }}><b>Co-creation processes</b> — how actors work together to realize the value proposition</div>
          </div>
        </div>
      </Section>

      <Section id="how-it-works" title="How CBMX works">
        <div style={cardPanel}>
          <div style={{ display: "grid", gap: 10 }}>
            <Step
              title="1. Define the network value proposition"
              text="Start with the value proposition that the collaborative network jointly delivers to the target customer."
            />
            <Step
              title="2. Map actors and contributions"
              text="Identify the actors involved, their roles, and the actor-specific value propositions they bring to the collaboration."
            />
            <Step
              title="3. Clarify value capture and performance"
              text="Specify costs, benefits, and KPIs so the business model can be evaluated and monitored."
            />
            <Step
              title="4. Define pointers for operationalization"
              text="Define the capabilities that each actor needs to possess, and the co-creation processes where these capabilities are applied."
            />
            <Step
              title="5. Refine and evolve"
              text="Use the blueprint as a basis for stakeholder dialogue, implementation planning, and ongoing adaptation as the initiative develops."
            />

            <div style={{ marginTop: 6 }}>
              <Link to={startNewHref} style={primaryCta}>
                Start Building a Blueprint
              </Link>
            </div>
          </div>
        </div>
      </Section>

      <Section id="use-cases" title="Where CBMX is useful">
        <div style={cardPanel}>
          <div style={{ marginBottom: 10 }}>
            CBMX is suited to initiatives where multiple actors must collaborate to deliver a digitally enabled and sustainable
            solution.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {[
              "Shared micromobility services",
              "Digital mobility platforms (e.g., Mobility-as-a-Service)",
              "Circular business models in manufacturing ecosystems",
              "Energy community platforms",
              "Drone-enabled services",
              "Mixed-Crop Farming Solutions",
              "Last-mile Logistics Solutions",
              "...",
            ].map((x) => (
              <div key={x} style={miniCard}>
                <div style={{ fontWeight: 900 }}>{x}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10 }}>
            These types of solutions are socio-technical and network-based by nature, making collaborative business model design
            especially important for them.
          </div>
        </div>
      </Section>

      <Section id="example" title="See CBMX in action">
        <div style={cardPanel}>
          <div
            className="cbmx-example-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Shared Micromobility Service</div>
              <div style={{ marginBottom: 12 }}>
                Explore how a collaborative network can deliver flexible shared transport through e-bikes and e-scooters by aligning
                municipalities, service operators, maintenance providers, vehicle producers, and travelers around a shared value
                proposition.
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>

                <button type="button" onClick={() => scrollToId("inside")} style={secondaryCta}>
                  What’s inside a blueprint?
                </button>
              </div>
            </div>

            <div style={{ textAlign: "left" }}>
              <div
                style={{
                  border: "1px dashed #d1d5db",
                  borderRadius: 14,
                  padding: 12,
                  background: "#fafafa",
                }}
              >
                <button
                  type="button"
                  onClick={() => setExampleOpen(true)}
                  style={{
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left",
                  }}
                  aria-label="Open example blueprint image"
                >
                  <img
                    src={`${import.meta.env.BASE_URL}images/CBMX-Example.png`}
                    alt="CBMX Example"
                    style={{
                      width: "100%",
                      display: "block",
                      borderRadius: 10,
                      maxHeight: 260,
                      objectFit: "contain",
                    }}
                  />
                </button>

                <div style={{ marginTop: 10, color: "#6b7280", fontSize: 13}}>
                  Click to enlarge
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section id="for-whom" title="Built for practitioners working across organizational boundaries">
        <div style={cardPanel}>
          <div style={{ marginBottom: 10 }}>CBMX is designed for:</div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>business designers/engineers/architects</li>
            <li>innovation managers</li>
            <li>ecosystem and platform leads</li>
            <li>digital transformation professionals</li>
            <li>sustainability leads</li>
            <li>consultants and workshop facilitators</li>
            <li>public-private collaboration teams</li>
          </ul>
          <div style={{ marginTop: 10 }}>
            The method is particularly relevant for decision-makers involved in designing and implementing collaborative
            business models across organizations.
          </div>
        </div>
      </Section>

      <Section id="credibility" title="A structured approach for real-world collaborative design">
        <div style={cardPanel}>
          <div style={{ marginBottom: 10 }}>
            CBMX is grounded in research on collaborative business model design, KPI definition, value negotiation,
            implementation alignment, and continual evolution. It supports teams in moving from promising ideas to business
            models that can be discussed, evaluated, and operationalized with greater rigor.
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Supports workshop-based design</li>
            <li>Useful for both early-stage ideation and later-stage refinement, implementation, and operation</li>
            <li>Helps connect business logic to implementation</li>
          </ul>
        </div>
      </Section>

      {user ? (
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 20, background: "white", padding: 18 }}>
          <div style={{ fontWeight: 1000, fontSize: 18, marginBottom: 6 }}>Welcome back</div>
          <div style={{ color: "#6b7280", marginBottom: 12 }}>
            Continue working on your collaborative business models.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to="/app" style={secondaryCtaLink}>
              My Blueprints
            </Link>

            <Link to="/app?new=1" style={primaryCta}>
              Create New Blueprint
            </Link>

            <button
              type="button"
              disabled={!recentId}
              onClick={() => {
                if (!recentId) return;
                nav(`/app/b/${recentId}`);
              }}
              style={{
                ...secondaryCta,
                opacity: recentId ? 1 : 0.55,
                cursor: recentId ? "pointer" : "not-allowed",
              }}
              title={recentName ?? ""}
            >
              Open Recent Blueprint
            </button>

            <Link to="/account" style={secondaryCtaLink}>
              Account Settings
            </Link>
          </div>

          <div style={{ height: 14 }} />

          <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 14 }}>
            <DashboardPage />
          </div>
        </section>
      ) : null}

      {exampleOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setExampleOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17,24,39,0.72)",
            display: "grid",
            placeItems: "center",
            padding: 24,
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: 16,
              padding: 14,
              maxWidth: "96vw",
              maxHeight: "92vh",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 900 }}>CBMX Example Blueprint</div>
              <button
                type="button"
                onClick={() => setExampleOpen(false)}
                style={{
                  border: "1px solid #d1d5db",
                  background: "white",
                  borderRadius: 10,
                  height: 36,
                  padding: "0 12px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <img
              src={`${import.meta.env.BASE_URL}images/CBMX-Example.png`}
              alt="CBMX Example large view"
              style={{
                display: "block",
                maxWidth: "92vw",
                maxHeight: "78vh",
                width: "auto",
                height: "auto",
                borderRadius: 10,
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Step({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ fontWeight: 900 }}>{title}</div>
      <div style={{ color: "#374151" }}>{text}</div>
    </div>
  );
}

const cardPanel: React.CSSProperties = {
  textAlign: "left",
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  background: "white",
  padding: 18,
};

const callout: React.CSSProperties = {
  textAlign: "left",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#f0fdf4",
  padding: 14,
};

const calloutElement: React.CSSProperties = {
  textAlign: "left",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "#f0f9ff",
  padding: 8,
  width: 800,
};

const miniCard: React.CSSProperties = {
  textAlign: "left",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "white",
  padding: 14,
};

const primaryCta: React.CSSProperties = {
  height: 40,
  borderRadius: 12,
  padding: "0 14px",
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  fontWeight: 800,
  fontSize: 13,
};

const secondaryCta: React.CSSProperties = {
  height: 40,
  borderRadius: 12,
  padding: "0 14px",
  border: "1px solid #d1d5db",
  background: "white",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

const secondaryCtaLink: React.CSSProperties = {
  ...secondaryCta,
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
  color: "inherit",
};
