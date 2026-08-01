// Pravila za učitavanje logotipa (file-image-spec §4 i §5). Čista logika —
// bez mreže, bez server-only, pa je cijela testabilna.
//
// Provjera ide na MAGIČNE BAJTOVE, ne na nastavak i ne na Content-Type koji
// pošalje preglednik — oboje kontrolira pošiljatelj. Tip koji se spremi i
// posluži izvodi se iz bajtova.
//
// SVG je izostavljen namjerno, ne odgođeno: SVG je dokument koji nosi <script>,
// pa posluživanje s vlastite domene znači pohranjeni XSS.

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

export type ImageFormat = "png" | "jpeg" | "webp";

export const IMAGE_CONTENT_TYPE: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const IMAGE_EXTENSION: Record<ImageFormat, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
};

// Za atribut accept na <input type="file"> — samo UX, ne zaštita.
export const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP" na pomaku 8

/** Tip slike iz sadržaja, ili null ako bajtovi nisu dopuštena slika. */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, PNG)) return "png";
  if (startsWith(bytes, JPEG)) return "jpeg";
  // WebP je RIFF spremnik: "RIFF" + 4 bajta duljine + "WEBP".
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "webp";
  return null;
}

export type ImageRejection = "tooLarge" | "empty" | "badType";

export type ImageValidation =
  | { ok: true; format: ImageFormat; contentType: string; extension: string }
  | { ok: false; reason: ImageRejection };

/** Jedina odluka o tome smije li nešto u kantu. Točno 2 MB još prolazi. */
export function validateImage(bytes: Uint8Array): ImageValidation {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: "tooLarge" };

  const format = detectImageFormat(bytes);
  if (!format) return { ok: false, reason: "badType" };

  return {
    ok: true,
    format,
    contentType: IMAGE_CONTENT_TYPE[format],
    extension: IMAGE_EXTENSION[format],
  };
}

/**
 * Ključ objekta: {folder}/{ownerId}/{id}.{ext} — `logos/{orgId}/…` za logotip,
 * `avatars/{userId}/…` za avatar.
 *
 * Ime datoteke koje je poslao korisnik nije parametar — zato ga ključ ne može
 * ponoviti. Time otpadaju obilazak putanje, sudari imena i ime osobe u ključu
 * (netko učita `ivan-horvat.png`). Isti potez kao VoterExportRow: ograničenje
 * je u tipu, ne u pregledu koda.
 *
 * Vlasnika bira poslužitelj iz sesije; kao argument stoji zato što ga rute
 * čitaju s različitih mjesta (organizationId, odnosno userId).
 *
 * ponytail: randomUUID umjesto cuid-a — u standardnoj biblioteci, a ključu
 * treba samo neponovljivost.
 */
export function imageKey(folder: string, ownerId: string, extension: string): string {
  return `${folder}/${ownerId}/${crypto.randomUUID()}.${extension}`;
}
