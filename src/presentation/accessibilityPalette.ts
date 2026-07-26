export const ACCESSIBILITY_PALETTES = [
  "standard",
  "high-contrast",
  "cvd-safe",
  "monochrome",
] as const;

export type AccessibilityPalette = typeof ACCESSIBILITY_PALETTES[number];

export interface AccessibilityPaletteDefinition {
  id: AccessibilityPalette;
  label: string;
  description: string;
  semantic: {
    info: number;
    caution: number;
    critical: number;
    arrival: number;
    departure: number;
    runwayLine: number;
  };
}

const DEFINITIONS: Record<AccessibilityPalette, AccessibilityPaletteDefinition> = {
  standard: {
    id: "standard",
    label: "Original",
    description: "The muted ivory, blue, amber, and rose Airport Auto palette.",
    semantic: {
      info: 0x89cee6,
      caution: 0xefc775,
      critical: 0xf0a29b,
      arrival: 0xf4f4ea,
      departure: 0x79c8e8,
      runwayLine: 0xe8e8dc,
    },
  },
  "high-contrast": {
    id: "high-contrast",
    label: "High contrast",
    description: "Brighter text, stronger borders, and high-luminance map cues.",
    semantic: {
      info: 0x00e5ff,
      caution: 0xffe45c,
      critical: 0xff4fd8,
      arrival: 0xffffff,
      departure: 0x00d5ff,
      runwayLine: 0xffffff,
    },
  },
  "cvd-safe": {
    id: "cvd-safe",
    label: "Blue / amber safe",
    description: "A blue, amber, violet system that avoids red-versus-green meaning.",
    semantic: {
      info: 0x48b5ff,
      caution: 0xffc857,
      critical: 0xa97cff,
      arrival: 0xfff4d6,
      departure: 0x48b5ff,
      runwayLine: 0xfff4d6,
    },
  },
  monochrome: {
    id: "monochrome",
    label: "Monochrome",
    description: "Shape, text, and luminance carry state with minimal hue dependence.",
    semantic: {
      info: 0xf4f4f0,
      caution: 0xd8d8d2,
      critical: 0xffffff,
      arrival: 0xffffff,
      departure: 0xbcbcb8,
      runwayLine: 0xffffff,
    },
  },
};

export function isAccessibilityPalette(
  value: unknown,
): value is AccessibilityPalette {
  return typeof value === "string"
    && (ACCESSIBILITY_PALETTES as readonly string[]).includes(value);
}

export function accessibilityPaletteDefinition(
  palette: AccessibilityPalette,
): AccessibilityPaletteDefinition {
  return DEFINITIONS[palette];
}

export function accessibilityPaletteCatalog(): AccessibilityPaletteDefinition[] {
  return ACCESSIBILITY_PALETTES.map((id) => ({
    ...DEFINITIONS[id],
    semantic: { ...DEFINITIONS[id].semantic },
  }));
}
