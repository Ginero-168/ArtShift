export type DesignKnowledgeSkill = {
  id:
    | "poster-design"
    | "branding-logo"
    | "instagram-post"
    | "product-image"
    | "character-design"
    | "brochure-design"
    | "ui-design";
  title: string;
  keywords: readonly string[];
  summary: string;
  guidance: readonly string[];
};

export type RetrievedDesignKnowledge = Pick<
  DesignKnowledgeSkill,
  "id" | "title" | "summary" | "guidance"
> & { score: number };

export const DESIGN_KNOWLEDGE_SKILLS: readonly DesignKnowledgeSkill[] = Object.freeze([
  {
    id: "poster-design",
    title: "Poster Design",
    keywords: ["poster", "โปสเตอร์", "infographic", "อินโฟกราฟิก", "key visual", "headline"],
    summary:
      "Build one dominant message with deliberate hierarchy, distance readability and a clear focal point.",
    guidance: [
      "Establish headline, supporting message and call-to-action hierarchy before decoration.",
      "Use one focal subject and enough negative space to keep the poster readable at a glance.",
      "Verify exact text, safe margins and target aspect ratio before final output.",
    ],
  },
  {
    id: "branding-logo",
    title: "Branding and Logo",
    keywords: ["brand", "branding", "logo", "โลโก้", "identity", "อัตลักษณ์", "mark"],
    summary:
      "Translate brand attributes into a distinctive, reproducible and scalable visual system.",
    guidance: [
      "Start from brand character, audience, category cues and required applications.",
      "Prefer simple geometry and a small, controlled color system over incidental detail.",
      "Review recognizability, one-color use, small-size legibility and similarity risk.",
    ],
  },
  {
    id: "instagram-post",
    title: "Instagram Post",
    keywords: ["instagram", "ไอจี", "social", "โซเชียล", "post", "โพสต์", "1:1", "4:5"],
    summary:
      "Design for fast mobile comprehension with a strong hook, safe crops and concise copy.",
    guidance: [
      "Keep the core message readable on a phone without relying on fine detail.",
      "Choose 1:1 or 4:5 intentionally and keep important content away from crop-prone edges.",
      "Use brand-consistent hierarchy and one clear action or takeaway.",
    ],
  },
  {
    id: "product-image",
    title: "Product Image",
    keywords: [
      "product",
      "สินค้า",
      "packshot",
      "ขวด",
      "bottle",
      "serum",
      "เซรั่ม",
      "advertising",
      "โฆษณา",
      "premium",
      "studio",
    ],
    summary:
      "Protect product identity while controlling lighting, material fidelity, scale and commercial focus.",
    guidance: [
      "Treat shape, label, logo, color and material as fidelity constraints when a reference is supplied.",
      "Specify lighting direction, surface, camera angle, background and negative space explicitly.",
      "Review silhouette, reflections, legibility and whether the product remains the unmistakable hero.",
    ],
  },
  {
    id: "character-design",
    title: "Character Design",
    keywords: ["character", "ตัวละคร", "mascot", "มาสคอต", "pose", "expression", "คาแรกเตอร์"],
    summary:
      "Create a recognizable silhouette, coherent personality and repeatable visual language.",
    guidance: [
      "Define role, personality, age cues, silhouette, proportion and signature features.",
      "Keep costume, palette and facial language consistent across poses.",
      "Review anatomy, hands, expression, readability and continuity with any reference.",
    ],
  },
  {
    id: "brochure-design",
    title: "Brochure Design",
    keywords: ["brochure", "โบรชัวร์", "leaflet", "แผ่นพับ", "catalog", "แคตตาล็อก", "print"],
    summary:
      "Organize dense information into a navigable print hierarchy with production-safe layout.",
    guidance: [
      "Map reading order, sections and folds before placing decorative elements.",
      "Use a repeatable grid, typographic scale and consistent image treatment.",
      "Review bleed, safe area, contrast, copy completeness and print dimensions.",
    ],
  },
  {
    id: "ui-design",
    title: "UI Design",
    keywords: ["ui", "ux", "interface", "อินเทอร์เฟซ", "app", "dashboard", "website", "เว็บ"],
    summary: "Turn user goals and system states into a clear, consistent and accessible interface.",
    guidance: [
      "Start from the primary task, information hierarchy and interaction states.",
      "Reuse a compact spacing, typography and component system rather than one-off decoration.",
      "Review keyboard access, contrast, empty/error/loading states and responsive behavior.",
    ],
  },
]);

const EMBEDDING_DIMENSIONS = 256;

/**
 * Local, deterministic feature embedding used for privacy-preserving skill retrieval.
 * It hashes normalized words and Unicode character trigrams, which keeps Thai briefs
 * useful without downloading or invoking a remote embedding model.
 */
export function retrieveDesignKnowledge(query: string, limit = 3): RetrievedDesignKnowledge[] {
  const boundedLimit = Math.max(1, Math.min(4, Math.floor(limit)));
  const queryVector = embed(query);
  const normalizedQuery = normalize(query);

  return DESIGN_KNOWLEDGE_SKILLS.map((skill) => {
    const searchable = [skill.title, ...skill.keywords, skill.summary, ...skill.guidance].join(" ");
    const semanticScore = cosine(queryVector, embed(searchable));
    const keywordMatches = skill.keywords.filter((keyword) =>
      normalizedQuery.includes(normalize(keyword)),
    ).length;
    return {
      id: skill.id,
      title: skill.title,
      summary: skill.summary,
      guidance: skill.guidance,
      score: semanticScore + keywordMatches * 0.75,
    };
  })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, boundedLimit)
    .map((result) => ({ ...result, score: Number(result.score.toFixed(6)) }));
}

function embed(value: string): Float64Array {
  const vector = new Float64Array(EMBEDDING_DIMENSIONS);
  const normalized = normalize(value);
  const words = normalized.split(/\s+/u).filter(Boolean);
  for (const word of words) addFeature(vector, `w:${word}`, 1.5);
  const compact = normalized.replace(/\s+/gu, " ");
  for (let index = 0; index < compact.length - 2; index += 1) {
    addFeature(vector, `g:${compact.slice(index, index + 3)}`, 0.35);
  }
  const magnitude = Math.hypot(...vector);
  if (magnitude > 0) {
    for (let index = 0; index < vector.length; index += 1) vector[index] /= magnitude;
  }
  return vector;
}

function addFeature(vector: Float64Array, feature: string, weight: number): void {
  let hash = 2_166_136_261;
  for (let index = 0; index < feature.length; index += 1) {
    hash ^= feature.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  vector[(hash >>> 0) % vector.length] += weight;
}

function cosine(left: Float64Array, right: Float64Array): number {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
