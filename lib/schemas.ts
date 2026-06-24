import * as v from "valibot";

const HEX_COLOR = v.pipe(
  v.string(),
  v.regex(/^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6,8})|transparent|oklch\(.+\)|rgba?\(.+\)|hsl\(.+\))$/i),
);
const NUM = v.pipe(v.number(), v.finite());
const OPT_NUM = v.optional(NUM);
const OPT_STR = v.optional(v.string());

export const AddTextInputSchema = v.object({
  text: v.string(),
  x: OPT_NUM,
  y: OPT_NUM,
  width: OPT_NUM,
  height: OPT_NUM,
  fontSize: OPT_NUM,
  fontStyle: v.optional(v.picklist(["normal", "bold", "italic", "bold italic"])),
  align: v.optional(v.picklist(["left", "center", "right"])),
  fill: v.optional(HEX_COLOR),
});

export const AddShapeInputSchema = v.object({
  shape: v.picklist(["rect", "ellipse", "triangle", "line", "arrow"]),
  x: OPT_NUM,
  y: OPT_NUM,
  width: OPT_NUM,
  height: OPT_NUM,
  fill: v.optional(HEX_COLOR),
  stroke: v.optional(HEX_COLOR),
  strokeWidth: OPT_NUM,
  cornerRadius: OPT_NUM,
});

export const AddImageInputSchema = v.object({
  src: v.pipe(v.string(), v.minLength(1)),
  x: OPT_NUM,
  y: OPT_NUM,
  width: OPT_NUM,
  height: OPT_NUM,
  alt: OPT_STR,
});

export const UpdateObjectInputSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  patch: v.record(v.string(), v.unknown()),
});

export const DeleteObjectInputSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
});

export const SetBackgroundInputSchema = v.object({
  color: HEX_COLOR,
});

export const AddSlideInputSchema = v.object({
  name: OPT_STR,
});

// ---------- Template payloads ----------

const ColumnBodySchema = v.union([
  v.object({ kind: v.literal("paragraph"), text: v.string() }),
  v.object({ kind: v.literal("list"), items: v.array(v.string()) }),
]);

const ThreeColumnCardsDataSchema = v.object({
  title: v.string(),
  subtitle: OPT_STR,
  accent: v.optional(HEX_COLOR),
  background: v.optional(HEX_COLOR),
  columns: v.pipe(
    v.array(
      v.object({
        icon: OPT_STR,
        header: v.string(),
        body: ColumnBodySchema,
      }),
    ),
    v.minLength(1),
    v.maxLength(3),
  ),
});

const TitleBulletsDataSchema = v.object({
  title: v.string(),
  subtitle: OPT_STR,
  bullets: v.pipe(v.array(v.string()), v.minLength(1)),
  accent: v.optional(HEX_COLOR),
  background: v.optional(HEX_COLOR),
});

const HeroDataSchema = v.object({
  title: v.string(),
  subtitle: OPT_STR,
  cta: OPT_STR,
  accent: v.optional(HEX_COLOR),
  background: v.optional(HEX_COLOR),
  imageUrl: OPT_STR,
});

const ComparisonColumnSchema = v.object({
  header: v.string(),
  items: v.pipe(v.array(v.string()), v.minLength(1)),
  tone: v.optional(v.picklist(["good", "bad", "neutral"])),
});

const ComparisonDataSchema = v.object({
  title: v.string(),
  accent: v.optional(HEX_COLOR),
  background: v.optional(HEX_COLOR),
  left: ComparisonColumnSchema,
  right: ComparisonColumnSchema,
});

const ImageTextSplitDataSchema = v.object({
  title: v.string(),
  body: v.string(),
  imageUrl: v.pipe(v.string(), v.minLength(1)),
  imageSide: v.optional(v.picklist(["left", "right"])),
  accent: v.optional(HEX_COLOR),
  background: v.optional(HEX_COLOR),
  caption: OPT_STR,
});

const StatGridDataSchema = v.object({
  title: v.string(),
  subtitle: OPT_STR,
  accent: v.optional(HEX_COLOR),
  background: v.optional(HEX_COLOR),
  stats: v.pipe(
    v.array(v.object({ value: v.string(), label: v.string() })),
    v.minLength(2),
    v.maxLength(4),
  ),
});

const QuoteDataSchema = v.object({
  quote: v.pipe(v.string(), v.minLength(1)),
  attribution: OPT_STR,
  accent: v.optional(HEX_COLOR),
  background: v.optional(HEX_COLOR),
});

const TimelineDataSchema = v.object({
  title: v.string(),
  accent: v.optional(HEX_COLOR),
  background: v.optional(HEX_COLOR),
  steps: v.pipe(
    v.array(v.object({ label: v.string(), description: OPT_STR })),
    v.minLength(2),
    v.maxLength(5),
  ),
});

export const ApplyTemplateInputSchema = v.union([
  v.object({
    template: v.literal("three-column-cards"),
    data: ThreeColumnCardsDataSchema,
  }),
  v.object({
    template: v.literal("title-bullets"),
    data: TitleBulletsDataSchema,
  }),
  v.object({
    template: v.literal("hero"),
    data: HeroDataSchema,
  }),
  v.object({
    template: v.literal("comparison"),
    data: ComparisonDataSchema,
  }),
  v.object({
    template: v.literal("image-text-split"),
    data: ImageTextSplitDataSchema,
  }),
  v.object({
    template: v.literal("stat-grid"),
    data: StatGridDataSchema,
  }),
  v.object({
    template: v.literal("quote"),
    data: QuoteDataSchema,
  }),
  v.object({
    template: v.literal("timeline"),
    data: TimelineDataSchema,
  }),
]);

export const SearchImageInputSchema = v.object({
  query: v.pipe(v.string(), v.minLength(1)),
});

export type AddTextInput = v.InferOutput<typeof AddTextInputSchema>;
export type AddShapeInput = v.InferOutput<typeof AddShapeInputSchema>;
export type AddImageInput = v.InferOutput<typeof AddImageInputSchema>;
export type UpdateObjectInput = v.InferOutput<typeof UpdateObjectInputSchema>;
export type DeleteObjectInput = v.InferOutput<typeof DeleteObjectInputSchema>;
export type SetBackgroundInput = v.InferOutput<typeof SetBackgroundInputSchema>;
export type AddSlideInput = v.InferOutput<typeof AddSlideInputSchema>;
export type ApplyTemplateInput = v.InferOutput<typeof ApplyTemplateInputSchema>;

export function safeParse<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: TSchema,
  input: unknown,
): v.InferOutput<TSchema> | null {
  const result = v.safeParse(schema, input);
  return result.success ? (result.output as v.InferOutput<TSchema>) : null;
}
