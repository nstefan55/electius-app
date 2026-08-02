// Stranicanje — čiste funkcije. Veličine stranica su odvojene, u
// `lib/constants/pagination.ts`, da se brojevi mijenjaju bez diranja logike.
//
// Podjela poslužitelj/klijent živi u sloju podataka, ne ovdje — komponenta
// dobiva samo `page`/`pageCount` i ne zna odakle su.

// Fiksna širina kontrole — broj mjesta se ne mijenja između stranica, pa
// prev/next ne bježe ispod pokazivača. Nije slobodan parametar: grane u
// pageWindow (±1, pragovi 4 i last-3) pretpostavljaju upravo 7.
const SLOTS = 7;

export type PageSlot = number | "gap";

export const pageCountOf = (total: number, perPage: number) =>
  Math.max(1, Math.ceil(total / perPage));

export const clampPage = (page: number, pageCount: number) =>
  Math.min(Math.max(1, Math.trunc(page) || 1), Math.max(1, pageCount));

// Isječak za klijentski stranicane liste. Sam se stegne na zadnju stranicu, pa
// suženi filtar ne može ostaviti prazan prikaz.
export function pageSlice<T>(items: T[], page: number, perPage: number): T[] {
  const start = (clampPage(page, pageCountOf(items.length, perPage)) - 1) * perPage;
  return items.slice(start, start + perPage);
}

// Prvi, zadnji, trenutni ±1, praznine popunjavaju do SLOTS.
export function pageWindow(page: number, pageCount: number): PageSlot[] {
  const last = Math.max(1, pageCount);
  const current = clampPage(page, last);
  if (last <= SLOTS) return Array.from({ length: last }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "gap", last];
  if (current >= last - 3)
    return [1, "gap", last - 4, last - 3, last - 2, last - 1, last];
  return [1, "gap", current - 1, current, current + 1, "gap", last];
}
