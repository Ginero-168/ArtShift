/**
 * Compact Replicate prompts for Prompt Helper option thumbnails.
 * Used by the runtime ensure API and `scripts/generate-prompt-helper-thumbs.mjs`.
 */

const SQUARE = "square crop, no text, no watermark";

/** Shared visual prompts keyed by option id. */
export const PROMPT_HELPER_THUMB_PROMPTS: Readonly<Record<string, string>> = {
  // Tone / color fields
  vibrant: `Abstract vibrant color field, neon coral yellow teal energy, soft studio lighting, ${SQUARE}`,
  pastel: `Soft pastel color wash pink mint peach lavender, dreamy light, ${SQUARE}`,
  earth: `Warm earth-tone abstract clay sand ochre, natural soft light, ${SQUARE}`,
  dark: `Dark modern charcoal navy gradient with subtle metal sheen, premium mood, ${SQUARE}`,
  neon: `Cyber neon magenta cyan glow on deep purple, futuristic, ${SQUARE}`,
  monochrome: `High-contrast black and white abstract gradient, classic photo look, ${SQUARE}`,
  warm: `Warm orange gold sunset color wash abstract, cozy, ${SQUARE}`,
  cool: `Cool blue teal green abstract color wash, calm, ${SQUARE}`,
  muted: `Muted dusty rose sage taupe color field, premium soft, ${SQUARE}`,
  "high-contrast": `Stark high-contrast black white graphic abstract, ${SQUARE}`,
  "golden-hour": `Golden hour warm sunlight glow abstract haze, ${SQUARE}`,
  blueprint: `Blueprint cyanotype blue technical wash abstract, ${SQUARE}`,
  candy: `Candy-colored pink yellow mint abstract sweet tones, ${SQUARE}`,
  sepia: `Sepia vintage brown photo wash abstract, ${SQUARE}`,
  ice: `Icy white pale blue frost abstract cool tones, ${SQUARE}`,
  orange: `Orange ginger fur color swatch soft fur texture, ${SQUARE}`,
  black: `Deep black glossy fur texture close-up, ${SQUARE}`,
  gray: `Soft gray smoke fur texture, ${SQUARE}`,
  white: `Pure white fluffy fur texture soft light, ${SQUARE}`,
  tabby: `Classic brown tabby stripe fur pattern close-up, ${SQUARE}`,
  calico: `Calico orange black white fur patches close-up, ${SQUARE}`,
  cream: `Cream soft fur color texture, ${SQUARE}`,
  silver: `Silver shimmering fur texture, ${SQUARE}`,
  chocolate: `Chocolate brown fur texture, ${SQUARE}`,
  "blue-gray": `Blue-gray cat fur texture, ${SQUARE}`,
  "ginger-white": `Ginger and white bicolor fur patches, ${SQUARE}`,
  tuxedo: `Black and white tuxedo fur pattern, ${SQUARE}`,
  tortoiseshell: `Tortoiseshell mottled fur pattern, ${SQUARE}`,
  smoke: `Smoke gradient gray fur texture, ${SQUARE}`,
  cinnamon: `Cinnamon warm brown fur texture, ${SQUARE}`,
  "golden-color": `Golden cream dog fur soft light, ${SQUARE}`,
  "black-color": `Glossy black dog fur, ${SQUARE}`,
  "brown-color": `Chocolate brown dog fur, ${SQUARE}`,
  "white-color": `Fluffy white dog fur, ${SQUARE}`,
  "red-brown": `Reddish brown dog fur, ${SQUARE}`,
  brindle: `Brindle striped dog fur pattern, ${SQUARE}`,
  spotted: `Black spots on white fur dalmatian pattern, ${SQUARE}`,
  tricolor: `Tri-color dog fur black tan white, ${SQUARE}`,
  sable: `Sable dog fur gradient, ${SQUARE}`,
  "blue-merle": `Blue merle mottled dog fur, ${SQUARE}`,
  fawn: `Fawn soft beige dog fur, ${SQUARE}`,
  liver: `Liver reddish brown dog fur, ${SQUARE}`,
  apricot: `Apricot pastel dog fur, ${SQUARE}`,

  // Cat breeds — portrait chips
  shorthair: `Cute domestic shorthair cat face portrait, photo, ${SQUARE}`,
  scottish: `Scottish Fold cat face folded ears, photo, ${SQUARE}`,
  british: `British Shorthair cat round cheeks gray, photo, ${SQUARE}`,
  persian: `Persian cat fluffy long fur face, photo, ${SQUARE}`,
  siamese: `Siamese cat blue eyes pointed face, photo, ${SQUARE}`,
  "maine-coon": `Maine Coon large fluffy cat face, photo, ${SQUARE}`,
  ragdoll: `Ragdoll cat blue eyes soft face, photo, ${SQUARE}`,
  bengal: `Bengal cat leopard spots face, photo, ${SQUARE}`,
  sphynx: `Sphynx hairless cat face gentle, photo, ${SQUARE}`,
  "russian-blue": `Russian Blue silver cat green eyes, photo, ${SQUARE}`,
  abyssinian: `Abyssinian cat ticked coat face, photo, ${SQUARE}`,
  norwegian: `Norwegian Forest cat fluffy face, photo, ${SQUARE}`,
  "american-curl": `American Curl cat curled ears face, photo, ${SQUARE}`,
  munchkin: `Munchkin short-legged cat cute face, photo, ${SQUARE}`,
  exotic: `Exotic Shorthair cat flat face cute, photo, ${SQUARE}`,

  // Dog breeds
  golden: `Golden Retriever dog smiling face, photo, ${SQUARE}`,
  corgi: `Welsh Corgi dog cute face, photo, ${SQUARE}`,
  shiba: `Shiba Inu dog smiling face, photo, ${SQUARE}`,
  poodle: `Toy poodle curly fur cute face, photo, ${SQUARE}`,
  husky: `Siberian Husky blue eyes face, photo, ${SQUARE}`,
  labrador: `Labrador Retriever friendly face, photo, ${SQUARE}`,
  beagle: `Beagle dog long ears face, photo, ${SQUARE}`,
  bulldog: `English Bulldog wrinkled cute face, photo, ${SQUARE}`,
  pomeranian: `Pomeranian fluffy tiny dog face, photo, ${SQUARE}`,
  chihuahua: `Chihuahua big eyes tiny face, photo, ${SQUARE}`,
  "german-shepherd": `German Shepherd dog alert face, photo, ${SQUARE}`,
  samoyed: `Samoyed white fluffy smiling dog, photo, ${SQUARE}`,
  dalmatian: `Dalmatian spotted dog face, photo, ${SQUARE}`,
  "french-bulldog": `French Bulldog bat ears face, photo, ${SQUARE}`,
  "border-collie": `Border Collie attentive face, photo, ${SQUARE}`,

  // Backgrounds / scenes
  studio: `Minimal empty white photography studio backdrop soft shadow, ${SQUARE}`,
  nature: `Sunny outdoor nature bokeh green hills blue sky, ${SQUARE}`,
  room: `Modern indoor room corner soft daylight window, ${SQUARE}`,
  abstract: `Creamy abstract bokeh circles pastel lights, ${SQUARE}`,
  "living-room": `Cozy living room sofa warm wood floor, photo, ${SQUARE}`,
  window: `Sunny window sill soft morning light curtains, photo, ${SQUARE}`,
  garden: `Flower garden colorful blooms green grass, photo, ${SQUARE}`,
  bed: `Soft bed pillows cozy bedroom, photo, ${SQUARE}`,
  cafe: `Minimal warm cafe interior wood tones, photo, ${SQUARE}`,
  park: `Sunny public park green lawn trees, photo, ${SQUARE}`,
  beach: `White sand beach turquoise water, photo, ${SQUARE}`,
  home: `Front yard lawn suburban house soft light, photo, ${SQUARE}`,
  bookshelf: `Warm home bookshelf corner, photo, ${SQUARE}`,
  kitchen: `Bright home kitchen natural light, photo, ${SQUARE}`,
  balcony: `City balcony view soft daylight, photo, ${SQUARE}`,
  snow: `Clean white snow field soft light, photo, ${SQUARE}`,
  autumn: `Autumn park orange fallen leaves, photo, ${SQUARE}`,
  "night-city": `Night city bokeh lights street, photo, ${SQUARE}`,
  office: `Modern glass office interior daylight, photo, ${SQUARE}`,
  city: `Modern city street urban photo, ${SQUARE}`,
  library: `Tall library bookshelves warm light, photo, ${SQUARE}`,
  rooftop: `City rooftop sunset view, photo, ${SQUARE}`,
  museum: `Museum gallery hall soft light, photo, ${SQUARE}`,
  subway: `Modern subway station interior, photo, ${SQUARE}`,
  bedroom: `Minimal bedroom morning light, photo, ${SQUARE}`,
  restaurant: `Warm restaurant interior ambient light, photo, ${SQUARE}`,

  // Camera / framing
  front: `Straight-on balanced portrait framing on soft gray, photo, ${SQUARE}`,
  closeup: `Extreme close-up macro texture detail sharp focus, photo, ${SQUARE}`,
  isometric: `Cute isometric 3D clay render of a simple cube room, soft light, ${SQUARE}`,
  cinematic: `Wide cinematic still anamorphic bokeh dramatic light, film look, ${SQUARE}`,
  eyelevel: `Eye-level balanced subject framing diagram soft photo, ${SQUARE}`,
  topdown: `Top-down flat lay camera angle soft lighting, ${SQUARE}`,
  wide: `Wide environmental shot subject small in frame, photo, ${SQUARE}`,
  action: `Motion action photography motion blur energy, ${SQUARE}`,
  "low-angle": `Low angle hero shot looking upward, photo, ${SQUARE}`,
  dutch: `Dutch angle tilted dramatic framing, photo, ${SQUARE}`,
  macro: `Macro extreme detail texture photo, ${SQUARE}`,
  "over-shoulder": `Over-the-shoulder storytelling camera angle, photo, ${SQUARE}`,
  profile: `Side profile portrait silhouette soft light, photo, ${SQUARE}`,
  "three-quarter": `Three-quarter portrait classic angle, photo, ${SQUARE}`,
  birdseye: `Bird's-eye view looking straight down, photo, ${SQUARE}`,
  selfie: `Selfie arm-length camera angle friendly, photo, ${SQUARE}`,
  portrait: `Half-body portrait soft bokeh background, photo, ${SQUARE}`,
  headshot: `Professional headshot face focus dark backdrop, photo, ${SQUARE}`,
  full: `Full-body standing portrait full frame, photo, ${SQUARE}`,
  panoramic: `Ultra-wide panoramic landscape horizon, photo, ${SQUARE}`,
  drone: `Drone aerial landscape bird eye view, photo, ${SQUARE}`,
  environmental: `Environmental portrait subject in rich scene, photo, ${SQUARE}`,
  candid: `Candid natural unposed moment photo, ${SQUARE}`,
  telephoto: `Telephoto compressed mountain layers, photo, ${SQUARE}`,
  ultrawide: `Ultra-wide landscape curved horizon feel, photo, ${SQUARE}`,
  foreground: `Landscape with sharp flower foreground depth, photo, ${SQUARE}`,
  "leading-lines": `Path leading lines into landscape, photo, ${SQUARE}`,
  symmetry: `Symmetric reflection landscape lake, photo, ${SQUARE}`,
  silhouette: `Golden hour silhouette against sky, photo, ${SQUARE}`,
  "long-exposure": `Long exposure silky water waterfall, photo, ${SQUARE}`,

  // Styles
  photorealistic: `Ultra-realistic photo sample of a simple ceramic vase on table, natural light, ${SQUARE}`,
  "3d": `Glossy 3D rendered purple sphere with soft studio reflections, ${SQUARE}`,
  flat: `Flat vector art geometric shapes orange circle on cream, clean graphic, ${SQUARE}`,
  painting: `Expressive oil painting brush strokes warm abstract landscape, ${SQUARE}`,
  anime: `Japanese anime style eye close-up colorful clean lines, ${SQUARE}`,
  watercolor: `Soft watercolor paint blooms pastel paper texture, ${SQUARE}`,
  oil: `Classic oil painting textured brush strokes landscape, ${SQUARE}`,
  ghibli: `Warm Studio Ghibli inspired soft painted meadow sky, ${SQUARE}`,
  illustration: `Modern minimal illustration flat shapes, ${SQUARE}`,
  pixel: `Cute 8-bit pixel art treasure chest icon on sky blue, wholesome game sprite, ${SQUARE}`,
  comic: `Clean pop-art comic panel with bright Ben-Day dots and thick black outlines of a simple coffee cup on a table, wholesome illustration, ${SQUARE}`,
  clay: `Soft clay sculpture of a round yellow smiling blob, stop-motion clay look, wholesome, ${SQUARE}`,
  ink: `Traditional Chinese ink wash painting of distant mountains and mist, brush on rice paper, ${SQUARE}`,
  "pastel-art": `Soft pastel chalk art texture sample, ${SQUARE}`,
  cinematic_style: `Cinematic film still color graded dramatic light, ${SQUARE}`,

  "mountain-peak": `Dramatic mountain peak above clouds, epic sky, photo, ${SQUARE}`,
  volcano: `Distant volcano with soft lava glow at dusk, landscape photo, ${SQUARE}`,
  "storm-sky": `Stormy dramatic sky with lightning far away over plains, photo, ${SQUARE}`,
  cave: `Crystal cave interior glowing blue crystals, fantasy environment, ${SQUARE}`,
  ruins: `Ancient stone ruins covered in vines, soft daylight, photo, ${SQUARE}`,
  clouds: `Aerial view above fluffy clouds at sunrise, photo, ${SQUARE}`,

  light_soft: `Soft diffused studio light on a white ceramic vase, gentle shadows, ${SQUARE}`,
  light_rim: `Subject rim-lit from behind with glowing edge light on dark background, ${SQUARE}`,
  light_godrays: `Forest with volumetric god rays through mist, photo, ${SQUARE}`,
  light_neon: `Abstract neon magenta cyan glow on dark wet street, ${SQUARE}`,
  light_golden: `Golden hour warm backlight haze on a simple landscape, ${SQUARE}`,
  light_moon: `Cool blue moonlight on quiet hills, night photo, ${SQUARE}`,
  light_dramatic: `Dramatic chiaroscuro lighting on a still-life sphere, ${SQUARE}`,
  light_overcast: `Soft overcast daylight on a plain outdoor wall, ${SQUARE}`,
  light_candle: `Warm candlelit glow on a wooden table, intimate, ${SQUARE}`,
  light_biolum: `Soft bioluminescent blue glow in a dark cave abstract, ${SQUARE}`,
  light_studio: `Three-point studio lighting on a matte sphere, clean, ${SQUARE}`,
  light_silhouette: `Backlit silhouette against orange sunset sky, ${SQUARE}`,
  light_spotlight: `Hard spotlight circle on subject dark surroundings, ${SQUARE}`,
  light_under: `Under-lighting eerie glow from below on face-like form, ${SQUARE}`,
  light_magic: `Magical colored light shafts floating particles, ${SQUARE}`,

  atm_epic: `Epic majestic mountain scale tiny figure, dramatic clouds, ${SQUARE}`,
  atm_whimsical: `Whimsical pastel dreamy floating islands cute mood, ${SQUARE}`,
  atm_dark: `Dark ominous fantasy fog crimson rim light mood, ${SQUARE}`,
  atm_serene: `Serene peaceful lake mirror morning calm, ${SQUARE}`,
  atm_chaotic: `Chaotic energetic swirling particles motion blur abstract, ${SQUARE}`,
  atm_mysterious: `Mysterious foggy path vanishing into mist, ${SQUARE}`,
  atm_heroic: `Heroic triumphant low-angle figure against bright sky, ${SQUARE}`,
  atm_melancholy: `Melancholy rainy window soft warm indoor light, ${SQUARE}`,
  atm_playful: `Playful colorful confetti bounce joyful mood, ${SQUARE}`,
  atm_luxurious: `Luxurious dark marble gold accent premium mood, ${SQUARE}`,
  atm_nostalgic: `Nostalgic vintage faded photo warm film look, ${SQUARE}`,
  atm_futuristic: `Futuristic chrome neon corridor sci-fi mood, ${SQUARE}`,
  atm_romantic: `Romantic warm soft bokeh rose gold mood, ${SQUARE}`,
  atm_tense: `Tense cinematic stormy silence before action, ${SQUARE}`,
  atm_sacred: `Sacred glowing temple light ethereal haze, ${SQUARE}`,

  cre_surreal: `Surreal melting clock floating over desert dreamlike, ${SQUARE}`,
  cre_epic_scale: `Giant creature towering over tiny city skyline, epic scale, ${SQUARE}`,
  cre_chibi: `Cute chibi character big head tiny body wholesome, ${SQUARE}`,
  cre_mythic: `Mythic legendary tapestry illustration ornate border feel, ${SQUARE}`,
  cre_cyber: `Cyberpunk neon fusion with traditional temple silhouette, ${SQUARE}`,
  cre_paper: `Paper craft diorama layered cut paper landscape, ${SQUARE}`,
  cre_double: `Double exposure silhouette filled with forest landscape, ${SQUARE}`,
  cre_story: `Storybook scene with clear props and moment in time, ${SQUARE}`,
  cre_minimal: `Minimal symbolic single object on vast empty field, ${SQUARE}`,
  cre_macro_world: `Macro tilt-shift tiny world on a leaf dew drop, ${SQUARE}`,
  cre_ancient_future: `Ancient stone ruins with holographic future overlays, ${SQUARE}`,
  cre_emotion: `Emotional close portrait eyes conveying strong feeling, ${SQUARE}`,
  cre_mirror: `Mirror world reflection parallel dimension scene, ${SQUARE}`,
  cre_constellation: `Constellation star map overlay mythical figure, ${SQUARE}`,
  cre_festival: `Festival lanterns fireworks colorful celebration, ${SQUARE}`,

  det_hyper: `Hyper-detailed crystal surface micro scratches macro, ${SQUARE}`,
  det_painterly: `Painterly loose brush strokes abstract landscape, ${SQUARE}`,
  det_soft: `Soft stylized smooth clay-like forms pastel, ${SQUARE}`,
  det_scales: `Close-up iridescent dragon scale texture pattern, ${SQUARE}`,
  det_metallic: `Polished metallic chrome sphere reflections, ${SQUARE}`,
  det_matte: `Matte ceramic clay surface soft diffuse, ${SQUARE}`,
  det_glass: `Transparent glass crystal refraction caustics, ${SQUARE}`,
  det_fabric: `Flowing silk fabric folds soft light, ${SQUARE}`,
  det_weathered: `Weathered cracked stone age worn texture, ${SQUARE}`,
  det_glow_edge: `Object with soft glowing luminous edge outline, ${SQUARE}`,
  det_ember: `Embers sparks floating over dark ash texture, ${SQUARE}`,
  det_frost: `Frost crystal ice crystals close-up surface, ${SQUARE}`,
  det_floral: `Floral vine pattern ornate botanical detail, ${SQUARE}`,
  det_rune: `Glowing ancient runes carved in stone, ${SQUARE}`,
  det_inksplash: `Dynamic black ink splash calligraphy motion, ${SQUARE}`,

  wx_dawn: `Dawn mist pink cool light over quiet hills, ${SQUARE}`,
  wx_sunset: `Ocean sunset orange pink gold sky, photo, ${SQUARE}`,
  wx_midnight: `Midnight starry sky cool moonlight landscape, ${SQUARE}`,
  wx_rain: `Rainy street wet reflections soft bokeh lights, ${SQUARE}`,
  wx_storm: `Storm clouds lightning far over plains dramatic, ${SQUARE}`,
  wx_snow: `Gentle snowfall soft white quiet forest, ${SQUARE}`,
  wx_fog: `Deep fog path near clear far faded, ${SQUARE}`,
  wx_clear: `Clear bright sunny sky sharp shadows, ${SQUARE}`,
  wx_autumn: `Autumn leaves drifting golden orange breeze, ${SQUARE}`,
  wx_heat: `Desert heat haze shimmering hot sunlight, ${SQUARE}`,
  wx_bluehour: `Blue hour deep blue purple sky after sunset, ${SQUARE}`,
  wx_eclipse: `Solar eclipse eerie copper twilight sky, ${SQUARE}`,
  wx_aurora: `Green purple aurora borealis over snowy hills, ${SQUARE}`,
  wx_sandstorm: `Golden sandstorm low visibility desert, ${SQUARE}`,
  wx_monsoon: `Heavy tropical monsoon dark clouds pouring rain, ${SQUARE}`,

  comp_centered: `Centered symmetrical subject on clean backdrop, ${SQUARE}`,
  comp_thirds: `Subject on rule-of-thirds intersection scenic photo, ${SQUARE}`,
  comp_wide_est: `Wide establishing shot tiny subject vast landscape, ${SQUARE}`,
  comp_close_detail: `Extreme close-up textured detail fill frame, ${SQUARE}`,
  comp_dutch: `Dutch angle tilted dramatic street scene, ${SQUARE}`,
  comp_leading: `Leading lines road converging to distant subject, ${SQUARE}`,
  comp_frame: `Subject framed by stone archway frame within frame, ${SQUARE}`,
  comp_negative: `Tiny subject with vast empty negative space, ${SQUARE}`,
  comp_crowd: `Dense packed colorful festival crowd fill frame, ${SQUARE}`,
  comp_low_hero: `Low angle heroic figure against sky, ${SQUARE}`,
  comp_overhead: `Overhead bird's-eye arranged still life flat lay, ${SQUARE}`,
  comp_profile: `Side profile silhouette against bright sky, ${SQUARE}`,
  comp_diagonal: `Strong diagonal energy composition dynamic, ${SQUARE}`,
  comp_mirror: `Perfect mirror reflection on still lake, ${SQUARE}`,
  comp_depth: `Clear foreground midground background depth layers, ${SQUARE}`,

  // Portrait looks (generic people silhouettes — keep tasteful)
  "young-woman": `Young woman natural smile portrait soft light, photo, ${SQUARE}`,
  "young-man": `Young man confident modern portrait, photo, ${SQUARE}`,
  child: `Wholesome illustration of a cheerful child silhouette playing with a kite at a park, soft daylight, ${SQUARE}`,
  business: `Professional business person portrait suit, photo, ${SQUARE}`,
  elderly: `Warm elderly person kind smile portrait, photo, ${SQUARE}`,
  athlete: `Athletic person sportswear confident portrait, photo, ${SQUARE}`,
  artist: `Creative artist stylish portrait, photo, ${SQUARE}`,
  student: `Friendly student portrait casual, photo, ${SQUARE}`,
  model:
    "Wholesome fashion editorial portrait of an adult model, elegant pose, soft studio light, photo, square crop, no text, no watermark",
  chef: `Chef in white coat kitchen portrait, photo, ${SQUARE}`,
  doctor: `Doctor white coat professional portrait, photo, ${SQUARE}`,
  musician: `Musician warm stage light portrait, photo, ${SQUARE}`,
  traveler: `Traveler backpack outdoor portrait, photo, ${SQUARE}`,
  family: `Warm family together soft portrait, photo, ${SQUARE}`,
  couple: `Wholesome illustration of two people holding hands at sunset as distant silhouettes, romantic soft light, ${SQUARE}`,

  // Landscape scenery
  sunset: `Ocean sunset orange pink gold sky, photo, ${SQUARE}`,
  "mountain-mist": `Misty mountains dawn fog layers, photo, ${SQUARE}`,
  forest: `Lush green forest sunbeams creek, photo, ${SQUARE}`,
  meadow: `Wildflower meadow colorful breeze, photo, ${SQUARE}`,
  waterfall: `Tall waterfall misty rocks green, photo, ${SQUARE}`,
  desert: `Desert sand dunes golden hour, photo, ${SQUARE}`,
  aurora: `Aurora borealis over frozen lake, photo, ${SQUARE}`,
  lake: `Mirror lake mountain reflection, photo, ${SQUARE}`,
  canyon: `Red rock canyon golden light, photo, ${SQUARE}`,
  "rice-field": `Green terraced rice fields mist, photo, ${SQUARE}`,
  "cherry-blossom": `Cherry blossom path pink petals, photo, ${SQUARE}`,
  tropical: `Tropical island beach palm trees, photo, ${SQUARE}`,
  "snowy-peak": `Snowy mountain peak clear blue sky, photo, ${SQUARE}`,
  lavender: `Lavender field purple rows sunset, photo, ${SQUARE}`,
  "stormy-sea": `Stormy dramatic sea waves dark sky, photo, ${SQUARE}`,

  // Brand variant (existing)
  mood_premium: `Quiet luxury brand moodboard dark matte with thin gold accent light, abstract, ${SQUARE} no logo`,
  mood_energy: `High-energy graphic poster mood bold red black contrast abstract shapes, ${SQUARE} no logo`,
  mood_graphic: `Modern bold geometric split composition red and black halves, graphic design sample, ${SQUARE} no logo`,
  mood_drama: `Dramatic high-contrast lighting abstract stage haze dark red rim light, ${SQUARE} no logo`,
  mood_minimal: `Clean airy minimal layout lots of white space soft gray shapes, ${SQUARE} no logo`,
  struct_flat: `Solid flat color background panel single hue matte, design sample, ${SQUARE}`,
  struct_split: `Vertical split background two contrasting solid colors, design sample, ${SQUARE}`,
  struct_gradient: `Smooth vertical gradient from dark to saturated red, design sample, ${SQUARE}`,
  struct_frame: `Simple solid color field with thin inner frame border, design sample, ${SQUARE}`,
  sig_corner: `Abstract signature arc segment tucked in one corner on dark field, gold line, ${SQUARE} no logo`,
  sig_frame: `Thick circular ring framing empty center on dark field, gold accent, ${SQUARE} no logo`,
  sig_stroke: `Single elegant calligraphic stroke curve across dark field, gold line, ${SQUARE} no logo`,
  sig_bold: `Bold heavy circular ring graphic mark centered on dark field, gold, ${SQUARE} no logo`,
  density_centered: `Centered balanced poster composition soft shapes in middle, design sample, ${SQUARE}`,
  density_left: `Left-aligned modern layout with generous right margin empty, design sample, ${SQUARE}`,
  density_dense: `Dense packed graphic blocks filling frame information-rich look, design sample, ${SQUARE}`,
  density_airy: `Very airy sparse layout large empty margins calm, design sample, ${SQUARE}`,
};

export function promptHelperThumbPrompt(optionId: string): string | undefined {
  return PROMPT_HELPER_THUMB_PROMPTS[optionId];
}

export type PromptHelperThumbOptionHint = {
  id: string;
  label?: string;
  modifier?: string;
};

function clipThumbText(value: string | undefined, max: number): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Prompt for a chip Gemini invented (not in the photography catalog).
 * The option modifier is the visual phrase; label is the fallback.
 * `baseSubject` is the card subject, e.g. "ภาพมังกร".
 */
export function buildInventedPromptHelperThumbPrompt(input: {
  label?: string;
  modifier?: string;
  baseSubject?: string;
}): string | undefined {
  const detail = clipThumbText(input.modifier, 180) || clipThumbText(input.label, 40);
  if (!detail) return undefined;
  const subject = clipThumbText(input.baseSubject, 120);
  const lead = subject ? `${subject}, ${detail}` : detail;
  return `${lead}, simple centered thumbnail, soft studio light, ${SQUARE}`;
}

/** Catalog prompt wins so existing chip files stay on their original wording. */
export function resolvePromptHelperThumbPrompt(
  optionId: string,
  hint?: { label?: string; modifier?: string; baseSubject?: string },
): string | undefined {
  return (
    promptHelperThumbPrompt(optionId) ??
    (hint ? buildInventedPromptHelperThumbPrompt(hint) : undefined)
  );
}

export function promptHelperThumbPath(optionId: string): string {
  return `/prompt-helper/thumbs/${optionId}.jpg`;
}

/** Entries for offline batch script / ensure queue. */
export function listPromptHelperThumbEntries(): Array<{ id: string; prompt: string }> {
  return Object.entries(PROMPT_HELPER_THUMB_PROMPTS).map(([id, prompt]) => ({ id, prompt }));
}
