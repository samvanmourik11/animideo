import ClaudeKoppeling from "@/components/mcp/ClaudeKoppeling";
import { mag } from "@/lib/plan-rechten";
import { mijnPlan } from "@/lib/plan-rechten-pagina";

export const metadata = { title: "Animideo in Claude · Animideo" };

export default async function ClaudePagina() {
  const plan = await mijnPlan();
  return <ClaudeKoppeling magClaude={mag(plan, "claude")} magSleutels={mag(plan, "apiSleutels")} />;
}
