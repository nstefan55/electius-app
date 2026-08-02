import "server-only";

import { imageKey, validateImage, type ImageRejection } from "@/lib/upload-validation";
import { deleteObject, keyFromUrl, objectUrl, putObject } from "./storage.service";

// Zajednički tijek za obje slike (logotip organizacije, avatar računa).
//
// Postoji da redoslijed ne dobije drugu kopiju: prvo baza, pa R2, i neuspjeh
// brisanja glasno u zapisnik. Dvije rute koje same izvode taj redoslijed
// razišle bi se na prvoj izmjeni.
//
// Vlasnika i mapu bira POZIVATELJ iz sesije — nikad iz tijela zahtjeva.

export type StoreResult =
  | { ok: true; url: string }
  | { ok: false; reason: ImageRejection };

export async function storeImage({
  bytes,
  folder,
  ownerId,
  previousUrl,
  save,
}: {
  bytes: Uint8Array<ArrayBuffer>;
  folder: string;
  ownerId: string;
  previousUrl: string | null;
  /** Upis stupca; svaka ruta zna svoju tablicu. */
  save: (url: string | null) => Promise<unknown>;
}): Promise<StoreResult> {
  // Jedina odluka o dopuštenosti: veličina + magični bajtovi.
  const check = validateImage(bytes);
  if (!check.ok) return { ok: false, reason: check.reason };

  const key = imageKey(folder, ownerId, check.extension);
  // Slike idu u JAVNU kantu — <img> ih čita izravno, bez potpisa.
  await putObject("public", key, bytes, check.contentType);

  const url = objectUrl(key);
  await save(url);

  // Stari objekt tek sad, kad novi stoji i stupac pokazuje na njega.
  await dropObject(previousUrl);
  return { ok: true, url };
}

export async function clearImage({
  previousUrl,
  save,
}: {
  previousUrl: string | null;
  save: (url: string | null) => Promise<unknown>;
}): Promise<void> {
  await save(null);
  await dropObject(previousUrl);
}

/**
 * Briše prethodni objekt ako je naš. URL izvan naše kante (Googleov avatar iz
 * OAuth-a) se preskače — nema što brisati na tuđem hostu.
 */
async function dropObject(previous: string | null): Promise<void> {
  if (!previous) return;
  const key = keyFromUrl(previous);
  if (!key) return;
  try {
    await deleteObject("public", key);
  } catch (error) {
    // Glasno (file-image-spec §7), ali ne ruši zahtjev koji je svoj posao —
    // upis u bazu — već obavio. Zaostali objekt je potrošen prostor.
    console.error("[image-upload] R2 delete failed", { key, error });
  }
}
