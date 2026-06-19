import OpenAI from "openai";
import { buildExplainerPrompt, type BuildExplainerArgs } from "./build-prompt";
import { EXPLAINER_SPEC_SCHEMA } from "./schema";
import { validateExplainerSpec } from "./validate";
import type { ExplainerSpec } from "./spec";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Genereert een explainer-spec uit broninfo of een script. Gedeeld door de
// echte route en testbaar los van auth.
export async function generateExplainerSpec(args: BuildExplainerArgs): Promise<ExplainerSpec> {
  const { system, user } = buildExplainerPrompt(args);
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.5,
    max_tokens: 4000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "explainer_spec",
        strict: true,
        schema: EXPLAINER_SPEC_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  return validateExplainerSpec(parsed, { fallbackTitle: "Explainer", fallbackFormat: args.format });
}
