/**
 * Style + palette presets and the prompt builder.
 *
 * Prompt wording note: image models latch onto words rather than negations ("no wall"
 * makes them paint a wall) and render a photographed wall whenever they see
 * "mural"/"street"/"spray". Every fragment below therefore describes the *artwork itself*
 * positively ("flat vector poster artwork, edge-to-edge") and avoids those trigger words.
 * Providers that support negative prompts add their own on top.
 */

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  fragment: string;
  /** CSS gradient used as the style's thumbnail. */
  swatch: string;
}

export const STYLES: StylePreset[] = [
  {
    id: "graffiti",
    name: "Graffiti piece",
    description: "Bold outlines, punchy colour, spray-can energy",
    fragment:
      "bold graffiti-style illustration, thick black outlines, vibrant saturated colors, dynamic shapes",
    swatch: "linear-gradient(135deg,#ff3d81,#ffb400 55%,#14d0c4)",
  },
  {
    id: "wildstyle",
    name: "Wildstyle lettering",
    description: "Interlocking letters, arrows and 3D shading",
    fragment:
      "wildstyle graffiti lettering artwork, interlocking letterforms, arrows, 3d drop shadows, highlights, vivid gradients",
    swatch: "linear-gradient(135deg,#5b3df5,#ff3d81 60%,#ffd23f)",
  },
  {
    id: "portrait",
    name: "Realistic portrait",
    description: "Painterly, dramatic lighting, hyper-detailed",
    fragment:
      "hyper-realistic painted portrait artwork, dramatic lighting, rich detail, airbrushed gradients",
    swatch: "linear-gradient(135deg,#2b2118,#c0793a 55%,#f3d9b1)",
  },
  {
    id: "stencil",
    name: "Stencil",
    description: "High-contrast black & white with one accent",
    fragment:
      "high contrast black and white stencil artwork, sharp cut-out shapes, a single bright accent color, satirical poster style",
    swatch: "linear-gradient(135deg,#111,#f5f5f5 55%,#ff2e2e)",
  },
  {
    id: "geometric",
    name: "Geometric abstract",
    description: "Flat colour blocking and clean shapes",
    fragment:
      "abstract geometric artwork, flat color blocking, bold shapes, circles triangles and stripes, modernist composition",
    swatch: "linear-gradient(135deg,#ff6b35,#f7c59f 40%,#2ec4b6)",
  },
  {
    id: "popart",
    name: "Pop art",
    description: "Halftone dots, comic outlines, primary colours",
    fragment:
      "pop art illustration, halftone dots, comic book outlines, bold primary colors, retro print look",
    swatch: "linear-gradient(135deg,#ffd23f,#ee4266 50%,#3bceac)",
  },
  {
    id: "botanical",
    name: "Botanical & wildlife",
    description: "Lush leaves, flowers and animals",
    fragment:
      "lush botanical illustration, oversized tropical leaves, flowers and birds, painterly texture, rich greens",
    swatch: "linear-gradient(135deg,#0b6e4f,#7bd389 55%,#f7b32b)",
  },
  {
    id: "cyberpunk",
    name: "Neon cyberpunk",
    description: "Glowing lines, futuristic city, magenta & cyan",
    fragment:
      "cyberpunk neon artwork, glowing neon lines, futuristic city skyline, magenta and cyan glow, dark background",
    swatch: "linear-gradient(135deg,#0d0221,#ff00a8 55%,#00e5ff)",
  },
  {
    id: "retro",
    name: "Retro 80s",
    description: "Sunset grids, chrome and vaporwave gradients",
    fragment:
      "retro 1980s vaporwave artwork, striped sunset, chrome shapes, grid horizon, pink and purple gradients",
    swatch: "linear-gradient(135deg,#ff6ec7,#7873f5 55%,#4adede)",
  },
  {
    id: "lineart",
    name: "Minimal line art",
    description: "Single continuous line, lots of air",
    fragment:
      "minimal continuous line art illustration, thin elegant strokes, generous negative space, two flat colors",
    swatch: "linear-gradient(135deg,#f4efe6,#d9cbb3 55%,#1b1b1b)",
  },
  {
    id: "character",
    name: "Character & cartoon",
    description: "Playful characters with thick ink lines",
    fragment:
      "playful cartoon character illustration, thick ink outlines, expressive faces, cel shading, bright colors",
    swatch: "linear-gradient(135deg,#ff9f1c,#ffbf69 45%,#2ec4b6)",
  },
  {
    id: "surreal",
    name: "Surreal & dreamy",
    description: "Floating shapes, soft light, impossible scenes",
    fragment:
      "surreal dreamlike illustration, floating objects, impossible architecture, soft glowing light, pastel clouds",
    swatch: "linear-gradient(135deg,#a18cd1,#fbc2eb 55%,#84fab0)",
  },
];

export interface PalettePreset {
  id: string;
  name: string;
  colors: string[];
  /** Words for the prompt. Empty for "free". */
  words: string;
}

export const PALETTES: PalettePreset[] = [
  { id: "free", name: "Surprise me", colors: [], words: "" },
  {
    id: "sunset",
    name: "Sunset",
    colors: ["#ff6b35", "#ff3d81", "#7b2cbf", "#ffd23f"],
    words: "burnt orange, hot pink, deep purple and golden yellow palette",
  },
  {
    id: "neon",
    name: "Neon",
    colors: ["#ff00a8", "#00e5ff", "#b6ff00", "#0d0221"],
    words: "neon magenta, electric cyan and acid lime on deep navy palette",
  },
  {
    id: "earth",
    name: "Earth",
    colors: ["#c8553d", "#f28f3b", "#588157", "#3a2e24"],
    words: "terracotta, ochre, olive green and dark brown earthy palette",
  },
  {
    id: "ocean",
    name: "Ocean",
    colors: ["#03045e", "#0077b6", "#00b4d8", "#caf0f8"],
    words: "deep navy, ocean blue, turquoise and foam white palette",
  },
  {
    id: "pastel",
    name: "Pastel",
    colors: ["#ffc8dd", "#bde0fe", "#cdb4db", "#fff1a8"],
    words: "soft pastel pink, baby blue, lavender and butter yellow palette",
  },
  {
    id: "mono",
    name: "Monochrome",
    colors: ["#111111", "#555555", "#aaaaaa", "#f5f5f5"],
    words: "black, white and grayscale palette",
  },
  {
    id: "primary",
    name: "Primary",
    colors: ["#e63946", "#1d3557", "#ffd60a", "#f1faee"],
    words: "bold primary red, blue and yellow palette with white",
  },
];

export const getStyle = (id: string) =>
  STYLES.find((s) => s.id === id) ?? STYLES[0];
export const getPalette = (id: string) =>
  PALETTES.find((p) => p.id === id) ?? PALETTES[0];

export interface AspectOption {
  id: string;
  label: string;
  ratio: number | null; // null => match the selected wall
}

export const ASPECTS: AspectOption[] = [
  { id: "wall", label: "Match wall", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "21:9", label: "21:9", ratio: 21 / 9 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];

export function buildPrompt(opts: {
  subject: string;
  styleId: string;
  paletteId: string;
}): string {
  const style = getStyle(opts.styleId);
  const palette = getPalette(opts.paletteId);
  return [
    opts.subject.trim(),
    style.fragment,
    palette.words,
    "flat vector poster artwork, edge-to-edge composition, highly detailed",
  ]
    .filter(Boolean)
    .join(", ");
}

export const PROMPT_IDEAS = [
  "a giant fox made of geometric shapes",
  "a whale swimming through a night sky of stars",
  "a futuristic samurai with a glowing visor",
  "an octopus holding a city in its tentacles",
  "a phoenix rising out of a burst of color",
  "two hands reaching toward each other, flowers growing between them",
  "a lion with a crown of flowers",
  "a retro robot playing a guitar",
];
