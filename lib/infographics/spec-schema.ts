// JSON Schema voor de infographic-spec, gebruikt met OpenAI's structured outputs
// (response_format: json_schema, strict: true). Strict mode dwingt dat het model
// exact deze vorm teruggeeft.
//
// LET OP de strict-mode beperkingen: elk object moet ALLE properties in `required`
// hebben en `additionalProperties: false`; optionele velden zijn daarom nullable
// (type: [..., "null"]). Keywords als minItems/maxItems/minimum worden NIET
// ondersteund in strict mode — array-lengtes en getalgrenzen worden in
// validate-spec.ts afgedwongen.

const chartDataPoint = {
  type: "object",
  additionalProperties: false,
  required: ["label", "value", "color"],
  properties: {
    label: { type: "string" },
    value: { type: "number" },
    color: { type: ["string", "null"] },
  },
} as const;

const statBlock = {
  type: "object",
  additionalProperties: false,
  required: ["type", "id", "items"],
  properties: {
    type: { type: "string", enum: ["stat"] },
    id: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["value", "label", "prefix", "suffix", "icon", "sub"],
        properties: {
          value: { type: "string" },
          label: { type: "string" },
          prefix: { type: ["string", "null"] },
          suffix: { type: ["string", "null"] },
          icon: { type: ["string", "null"] },
          sub: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

const barChartBlock = {
  type: "object",
  additionalProperties: false,
  required: ["type", "id", "title", "orientation", "unit", "data"],
  properties: {
    type: { type: "string", enum: ["barChart"] },
    id: { type: "string" },
    title: { type: ["string", "null"] },
    orientation: { type: ["string", "null"], enum: ["vertical", "horizontal", null] },
    unit: { type: ["string", "null"] },
    data: { type: "array", items: chartDataPoint },
  },
} as const;

const pieChartBlock = {
  type: "object",
  additionalProperties: false,
  required: ["type", "id", "title", "variant", "data"],
  properties: {
    type: { type: "string", enum: ["pieChart"] },
    id: { type: "string" },
    title: { type: ["string", "null"] },
    variant: { type: ["string", "null"], enum: ["pie", "donut", null] },
    data: { type: "array", items: chartDataPoint },
  },
} as const;

const lineChartBlock = {
  type: "object",
  additionalProperties: false,
  required: ["type", "id", "title", "unit", "data"],
  properties: {
    type: { type: "string", enum: ["lineChart"] },
    id: { type: "string" },
    title: { type: ["string", "null"] },
    unit: { type: ["string", "null"] },
    data: { type: "array", items: chartDataPoint },
  },
} as const;

const processBlock = {
  type: "object",
  additionalProperties: false,
  required: ["type", "id", "title", "variant", "steps"],
  properties: {
    type: { type: "string", enum: ["process"] },
    id: { type: "string" },
    title: { type: ["string", "null"] },
    variant: { type: ["string", "null"], enum: ["steps", "timeline", null] },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "description", "date"],
        properties: {
          label: { type: "string" },
          description: { type: ["string", "null"] },
          date: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

const comparisonBlock = {
  type: "object",
  additionalProperties: false,
  required: ["type", "id", "title", "columns", "rows"],
  properties: {
    type: { type: "string", enum: ["comparison"] },
    id: { type: "string" },
    title: { type: ["string", "null"] },
    columns: { type: "array", items: { type: "string" } }, // precies 2 (afgedwongen in validator)
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "left", "right"],
        properties: {
          label: { type: "string" },
          left: { type: "string" },
          right: { type: "string" },
        },
      },
    },
  },
} as const;

const listBlock = {
  type: "object",
  additionalProperties: false,
  required: ["type", "id", "title", "variant", "items"],
  properties: {
    type: { type: "string", enum: ["list"] },
    id: { type: "string" },
    title: { type: ["string", "null"] },
    variant: { type: ["string", "null"], enum: ["bullets", "numbered", "iconGrid", null] },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "icon"],
        properties: {
          text: { type: "string" },
          icon: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export const INFOGRAPHIC_SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "title", "subtitle", "source", "format", "theme", "blocks"],
  properties: {
    version: { type: "integer", enum: [1] },
    title: { type: "string" },
    subtitle: { type: ["string", "null"] },
    source: { type: ["string", "null"] },
    format: { type: "string", enum: ["9:16", "16:9"] },
    theme: {
      type: "object",
      additionalProperties: false,
      required: ["primary", "secondary", "accent", "background", "textColor", "fontFamily"],
      properties: {
        primary: { type: "string" },
        secondary: { type: "string" },
        accent: { type: "string" },
        background: { type: "string" },
        textColor: { type: "string" },
        fontFamily: { type: ["string", "null"] },
      },
    },
    blocks: {
      type: "array",
      items: {
        anyOf: [
          statBlock,
          barChartBlock,
          pieChartBlock,
          lineChartBlock,
          processBlock,
          comparisonBlock,
          listBlock,
        ],
      },
    },
  },
} as const;
