// OpenAI function-calling schema's voor de AI-buddy + het gedeelde ChatAction-type.
// De buddy STELT alleen wijzigingen voor (tool-calls); de client past ze pas toe
// na goedkeuring. Daarom verwijst het model ALTIJD naar een scène via haar `id`
// (het ziet id + number in de context; number is enkel weergave).
//
// Tool-naam === action.type, zodat route en client-dispatcher één mapping delen.

import type OpenAI from "openai";

// ── Het actietype dat over de lijn gaat (route → client) ────────────────────
// `label` is een Nederlandse, mensvriendelijke kop voor het voorstel-kaartje.
// `id` is uniek per voorstel zodat een kaartje zijn eigen toegepast/verworpen-
// status kan bijhouden.
export type ChatAction =
  | { id: string; label: string; type: "edit_scene_voiceover"; args: { sceneId: string; voiceover_text: string } }
  | { id: string; label: string; type: "edit_image_prompt"; args: { sceneId: string; image_prompt: string } }
  | { id: string; label: string; type: "edit_motion_prompt"; args: { sceneId: string; motion_prompt: string } }
  | { id: string; label: string; type: "set_scene_duration"; args: { sceneId: string; duration: number } }
  | { id: string; label: string; type: "add_scene"; args: { afterSceneId?: string | null; voiceover_text: string; image_prompt: string; motion_prompt?: string; duration?: number } }
  | { id: string; label: string; type: "delete_scene"; args: { sceneId: string } }
  | { id: string; label: string; type: "reorder_scene"; args: { sceneId: string; direction: "up" | "down" } }
  | { id: string; label: string; type: "set_cast_for_scene"; args: { sceneId: string; cast_ids: string[] } }
  | { id: string; label: string; type: "update_brief"; args: { title?: string; goal?: string; target_audience?: string; notes?: string } }
  | { id: string; label: string; type: "rewrite_full_script"; args: { scenes: SceneDraft[] } }
  | { id: string; label: string; type: "regenerate_scene_image"; args: { sceneId: string } };

// Bij een volledige herschrijving dragen scènes ALLEEN tekstvelden — nooit
// image_url/canvas_json/designed — zodat gegenereerde beelden niet verloren gaan.
// Een meegegeven `id` dat matcht met een bestaande scène behoudt diens assets.
export interface SceneDraft {
  id?: string;
  voiceover_text: string;
  image_prompt: string;
  motion_prompt?: string;
  duration?: number;
}

export type ChatActionType = ChatAction["type"];

// Acties die de buddy alleen mág voorstellen, niet automatisch uitvoeren — en die
// (na goedkeuring) via een API-call lopen i.p.v. via de client-state-dispatcher.
export const REGENERATE_ACTIONS: ChatActionType[] = ["regenerate_scene_image"];

const sceneIdParam = {
  type: "string",
  description: "De exacte `id` van de scène uit de context. NOOIT het scènenummer en NOOIT een verzonnen id.",
} as const;

export const CHAT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "edit_scene_voiceover",
      description: "Herschrijf de gesproken voice-over-tekst van één scène (toon, lengte, formulering).",
      parameters: {
        type: "object",
        properties: { sceneId: sceneIdParam, voiceover_text: { type: "string", description: "De volledige nieuwe voice-over-tekst voor deze scène." } },
        required: ["sceneId", "voiceover_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_image_prompt",
      description: "Pas de beeld-prompt (image_prompt) van één scène aan: sfeer, compositie, beeldregels. Behoud {Naam}-tokens die naar personages verwijzen, tenzij de gebruiker iets anders vraagt.",
      parameters: {
        type: "object",
        properties: { sceneId: sceneIdParam, image_prompt: { type: "string", description: "De volledige nieuwe beeld-prompt." } },
        required: ["sceneId", "image_prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_motion_prompt",
      description: "Pas de bewegings-prompt (motion_prompt) van één scène aan: hoe het beeld beweegt.",
      parameters: {
        type: "object",
        properties: { sceneId: sceneIdParam, motion_prompt: { type: "string", description: "De volledige nieuwe bewegings-prompt." } },
        required: ["sceneId", "motion_prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_scene_duration",
      description: "Stel de duur (in seconden, 1–15) van één scène in.",
      parameters: {
        type: "object",
        properties: { sceneId: sceneIdParam, duration: { type: "number", description: "Duur in seconden, tussen 1 en 15." } },
        required: ["sceneId", "duration"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_scene",
      description: "Voeg een nieuwe scène toe. Plaats hem ná de scène met `afterSceneId`, of aan het eind als die ontbreekt.",
      parameters: {
        type: "object",
        properties: {
          afterSceneId: { type: "string", description: "Id van de scène waarná de nieuwe komt; leeg = aan het eind." },
          voiceover_text: { type: "string" },
          image_prompt: { type: "string" },
          motion_prompt: { type: "string" },
          duration: { type: "number", description: "Duur in seconden (1–15), standaard 5." },
        },
        required: ["voiceover_text", "image_prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_scene",
      description: "Verwijder één scène.",
      parameters: { type: "object", properties: { sceneId: sceneIdParam }, required: ["sceneId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "reorder_scene",
      description: "Verplaats één scène één positie omhoog of omlaag.",
      parameters: {
        type: "object",
        properties: { sceneId: sceneIdParam, direction: { type: "string", enum: ["up", "down"] } },
        required: ["sceneId", "direction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_cast_for_scene",
      description: "Stel in welke cast-rollen (personage-id's uit de context) in deze scène voorkomen.",
      parameters: {
        type: "object",
        properties: { sceneId: sceneIdParam, cast_ids: { type: "array", items: { type: "string" }, description: "Lijst cast-rol-id's." } },
        required: ["sceneId", "cast_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_brief",
      description: "Werk de projectbriefing bij: titel, doel, doelgroep en/of de notes (het kernidee). Geef alleen de velden die je wilt wijzigen.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          goal: { type: "string" },
          target_audience: { type: "string" },
          notes: { type: "string", description: "Het kernidee / de briefing van de video." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rewrite_full_script",
      description: "Herschrijf het VOLLEDIGE script (alle scènes) als de gebruiker een grondige herziening wil. Geef per scène de tekstvelden. Neem voor scènes die moeten blijven hun bestaande `id` over, zodat hun gegenereerde beeld behouden blijft.",
      parameters: {
        type: "object",
        properties: {
          scenes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Bestaande scène-id om assets te behouden; leeg = nieuwe scène." },
                voiceover_text: { type: "string" },
                image_prompt: { type: "string" },
                motion_prompt: { type: "string" },
                duration: { type: "number" },
              },
              required: ["voiceover_text", "image_prompt"],
            },
          },
        },
        required: ["scenes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "regenerate_scene_image",
      description: "Genereer het beeld van één scène opnieuw (op basis van de huidige beeld-prompt). Dit kost credits — stel het alleen voor als de gebruiker er expliciet om vraagt of net de prompt heeft gewijzigd.",
      parameters: { type: "object", properties: { sceneId: sceneIdParam }, required: ["sceneId"] },
    },
  },
];
