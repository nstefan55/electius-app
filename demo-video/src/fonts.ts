import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Self-hosted woff2 (copied from @fontsource) so rendering works offline.
// latin-ext carries č ć š ž đ — without it Croatian text falls back to a
// different face mid-word.
const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

const FAMILIES = [
  { family: "Poppins", file: "poppins", weights: [400, 500, 600, 700] },
  { family: "Noto Sans", file: "noto-sans", weights: [400, 500, 600, 700] },
  { family: "Roboto Mono", file: "roboto-mono", weights: [400, 500] },
];

for (const { family, file, weights } of FAMILIES) {
  for (const weight of weights) {
    for (const [subset, unicodeRange] of [
      ["latin", LATIN],
      ["latin-ext", LATIN_EXT],
    ] as const) {
      loadFont({
        family,
        url: staticFile(`fonts/${file}-${subset}-${weight}-normal.woff2`),
        weight: String(weight),
        unicodeRange,
      });
    }
  }
}
