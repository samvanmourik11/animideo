import FlatExplainerPrototype from "@/components/infographics/prototype/FlatExplainerPrototype";

// PROTOTYPE-pagina (publiek, los van de productie-flow): toont de nieuwe flat
// explainer-stijl op de Bloomwear-testdata. Open op /infographic-prototype.
export const dynamic = "force-static";

export default function InfographicPrototypePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0B1220",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "min(540px, 100%)", boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
        <FlatExplainerPrototype />
      </div>
    </div>
  );
}
