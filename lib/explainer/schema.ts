// Strict JSON-schema voor de explainer-spec (OpenAI structured outputs).
// Zelfde strict-mode regels als de infographic: elk object heeft ALLE props in
// `required` + additionalProperties:false; optioneel = nullable.

export const EXPLAINER_TEMPLATES = [
  "title", "deviceMetrics", "orbitIcons", "boxesCallouts",
  "lineChart", "journeyPath", "donutCallouts", "bigStat", "isoSteps", "isoDonut", "outro",
] as const;
export const EXPLAINER_STYLES = ["flat", "bold", "neon", "glass", "geometric"] as const;
export const EXPLAINER_ILLUSTRATIONS = ["monitor", "boxes", "truck", "plane", "ship", "building", "sensor", "none"] as const;
export const EXPLAINER_ICONS = [
  "people", "user", "truck", "plane", "ship", "building", "factory", "box", "rocket",
  "thermometer", "gauge", "bulb", "shock", "gps", "motion", "compass", "globe", "layers",
  "clock", "calendar", "shield", "lock", "unlock", "key", "eye", "search", "glass",
  "wifi", "signal", "cloud", "battery", "link", "refresh", "money", "euro", "percent",
  "creditcard", "cart", "tag", "chart", "growth", "decline", "target", "star", "award",
  "heart", "thumbsup", "document", "mail", "phone", "chat", "send", "bell", "gear",
  "download", "upload", "video", "camera", "image", "check", "warning", "info", "flag", "leaf",
] as const;

const calloutSchema = {
  type: "object",
  additionalProperties: false,
  required: ["icon", "label"],
  properties: {
    icon: { type: "string", enum: EXPLAINER_ICONS },
    label: { type: "string" },
  },
} as const;

const dataPointSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "value"],
  properties: {
    label: { type: "string" },
    value: { type: "number" },
  },
} as const;

export const EXPLAINER_SCENE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "template", "narration", "title", "subtitle", "center", "callouts", "data", "bg", "durationSec"],
  properties: {
    id: { type: "string" },
    template: { type: "string", enum: EXPLAINER_TEMPLATES },
    narration: { type: "string" },
    title: { type: ["string", "null"] },
    subtitle: { type: ["string", "null"] },
    center: { type: "string", enum: EXPLAINER_ILLUSTRATIONS },
    callouts: { type: "array", items: calloutSchema },
    data: { type: "array", items: dataPointSchema },
    bg: { type: "string" },
    durationSec: { type: "number" },
  },
} as const;

export const EXPLAINER_SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "title", "format", "style", "theme", "scenes"],
  properties: {
    version: { type: "integer", enum: [1] },
    title: { type: "string" },
    format: { type: "string", enum: ["16:9", "9:16"] },
    style: { type: "string", enum: EXPLAINER_STYLES },
    theme: {
      type: "object",
      additionalProperties: false,
      required: ["primary", "accent", "ink", "onColor"],
      properties: {
        primary: { type: "string" },
        accent: { type: "string" },
        ink: { type: "string" },
        onColor: { type: "string" },
      },
    },
    scenes: { type: "array", items: EXPLAINER_SCENE_SCHEMA },
  },
} as const;
