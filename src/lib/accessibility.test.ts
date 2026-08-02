import { describe, expect, it } from "vitest";
import {
  ACCESSIBILITY_DEFAULTS,
  ACCESSIBILITY_KEYS,
  accessibilityAttributes,
} from "@/lib/accessibility";

describe("accessibilityAttributes", () => {
  // CSS bira preko `html:has([data-reduce-motion])`, a taj selektor hvata
  // atribut bez obzira na vrijednost. Da se isključena preferencija ispiše
  // kao data-x="false", sve četiri bi bile trajno uključene — i to bez
  // ijedne greške u konzoli. Ovo je test koji to hvata.
  it("omits the attribute when a preference is off", () => {
    const attrs = accessibilityAttributes({
      reduceMotion: false,
      highContrast: false,
      largerText: false,
      focusOutlines: false,
    });

    for (const value of Object.values(attrs)) {
      expect(value).toBeUndefined();
    }
    expect(JSON.stringify(attrs)).not.toContain("false");
  });

  it("renders a bare attribute when a preference is on", () => {
    const attrs = accessibilityAttributes({
      reduceMotion: true,
      highContrast: false,
      largerText: true,
      focusOutlines: false,
    });

    expect(attrs).toEqual({
      "data-reduce-motion": "",
      "data-high-contrast": undefined,
      "data-larger-text": "",
      "data-focus-outlines": undefined,
    });
  });

  it("covers every key, so a new preference cannot be silently unwired", () => {
    const attrs = accessibilityAttributes(ACCESSIBILITY_DEFAULTS);
    expect(Object.keys(attrs)).toHaveLength(ACCESSIBILITY_KEYS.length);
  });

  it("defaults match schema.prisma — only the focus ring ships on", () => {
    expect(ACCESSIBILITY_DEFAULTS).toEqual({
      reduceMotion: false,
      highContrast: false,
      largerText: false,
      focusOutlines: true,
    });
  });
});
