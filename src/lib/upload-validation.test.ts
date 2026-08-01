import { describe, expect, it } from "vitest";
import {
  detectImageFormat,
  imageKey,
  MAX_IMAGE_BYTES,
  validateImage,
} from "./upload-validation";

// Bajtovi koji stvarno stoje na početku svakog formata — ne izmišljeni nizovi.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x24, 0x00, 0x00, 0x00, // duljina
  0x57, 0x45, 0x42, 0x50, // "WEBP"
  0x56, 0x50, 0x38, 0x20,
]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
const GIF = new TextEncoder().encode("GIF89a");

function sized(head: Uint8Array, total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  bytes.set(head.subarray(0, Math.min(head.length, total)));
  return bytes;
}

describe("detectImageFormat", () => {
  it("prepoznaje dopuštene formate po sadržaju", () => {
    expect(detectImageFormat(PNG)).toBe("png");
    expect(detectImageFormat(JPEG)).toBe("jpeg");
    expect(detectImageFormat(WEBP)).toBe("webp");
  });

  it("ne prihvaća RIFF spremnik koji nije WEBP", () => {
    // RIFF je i WAV i AVI — bez provjere na pomaku 8 oboje bi prošlo kao slika.
    const wav = new Uint8Array(WEBP);
    wav.set(new TextEncoder().encode("WAVE"), 8);
    expect(detectImageFormat(wav)).toBeNull();
  });

  it("odbija SVG, PDF i sve ostalo", () => {
    expect(detectImageFormat(SVG)).toBeNull();
    expect(detectImageFormat(PDF)).toBeNull();
    expect(detectImageFormat(GIF)).toBeNull();
  });

  it("ne puca na sadržaju kraćem od potpisa", () => {
    expect(detectImageFormat(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(detectImageFormat(new Uint8Array())).toBeNull();
  });
});

describe("validateImage", () => {
  it("propušta dopuštenu sliku i izvodi tip iz bajtova, ne iz nastavka", () => {
    const result = validateImage(PNG);
    expect(result).toEqual({
      ok: true,
      format: "png",
      contentType: "image/png",
      extension: "png",
    });
  });

  it("JPEG dobiva nastavak jpg", () => {
    expect(validateImage(JPEG)).toMatchObject({ extension: "jpg", contentType: "image/jpeg" });
  });

  // Napad koji provjera nastavka propušta: dokument preimenovan u .png.
  it("odbija PDF preimenovan u .png", () => {
    expect(validateImage(PDF)).toEqual({ ok: false, reason: "badType" });
  });

  it("odbija SVG — izostavljen odlukom, ne previdom", () => {
    expect(validateImage(SVG)).toEqual({ ok: false, reason: "badType" });
  });

  it("odbija prazan sadržaj", () => {
    expect(validateImage(new Uint8Array())).toEqual({ ok: false, reason: "empty" });
  });

  // Granica: točno 2 MB prolazi, jedan bajt više ne.
  it("prihvaća točno 2 MB", () => {
    expect(validateImage(sized(PNG, MAX_IMAGE_BYTES))).toMatchObject({ ok: true });
  });

  it("odbija 2 MB + 1 bajt", () => {
    expect(validateImage(sized(PNG, MAX_IMAGE_BYTES + 1))).toEqual({
      ok: false,
      reason: "tooLarge",
    });
  });

  // Prevelika datoteka pada na veličini i prije nego se pogledaju bajtovi —
  // poruka o veličini je točnija od "krivi tip".
  it("veličina se provjerava prije tipa", () => {
    expect(validateImage(sized(PDF, MAX_IMAGE_BYTES + 1))).toEqual({
      ok: false,
      reason: "tooLarge",
    });
  });
});

describe("imageKey", () => {
  it("gradi ključ pod mapom, vlasnikom i traženim nastavkom", () => {
    expect(imageKey("logos", "org_123", "png")).toMatch(
      /^logos\/org_123\/[0-9a-f-]{36}\.png$/,
    );
    expect(imageKey("avatars", "usr_9", "webp")).toMatch(
      /^avatars\/usr_9\/[0-9a-f-]{36}\.webp$/,
    );
  });

  // Logotip i avatar dijele graditelja, ali ne smiju dijeliti prostor ključeva.
  it("mapa razdvaja logotipe od avatara", () => {
    expect(imageKey("logos", "x", "png").startsWith("logos/")).toBe(true);
    expect(imageKey("avatars", "x", "png").startsWith("avatars/")).toBe(true);
  });

  it("dva poziva nikad ne daju isti ključ", () => {
    expect(imageKey("logos", "org_123", "png")).not.toBe(
      imageKey("logos", "org_123", "png"),
    );
  });

  // Ime datoteke nije parametar, pa se ni slučajno ne može naći u ključu.
  it("ne postoji način da ime datoteke uđe u ključ", () => {
    const key = imageKey("avatars", "usr_9", "webp");
    expect(key).not.toContain("ivan-horvat");
    expect(key).not.toContain("..");
  });
});
