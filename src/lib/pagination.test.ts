import { describe, expect, it } from "vitest";
import {
  clampPage,
  pageCountOf,
  pageSlice,
  pageWindow,
  type PageSlot,
} from "@/lib/pagination";

describe("pageCountOf", () => {
  it("uvijek vraća barem jednu stranicu", () => {
    expect(pageCountOf(0, 10)).toBe(1);
  });

  it("zaokružuje naviše — ostatak je vlastita stranica", () => {
    expect(pageCountOf(10, 10)).toBe(1);
    expect(pageCountOf(11, 10)).toBe(2);
    expect(pageCountOf(285, 10)).toBe(29);
  });
});

describe("clampPage", () => {
  it("steže na oba kraja", () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(-3, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
  });

  it("smeće iz URL-a pada na prvu stranicu", () => {
    expect(clampPage(Number("abc"), 5)).toBe(1);
    expect(clampPage(2.7, 5)).toBe(2);
  });
});

describe("pageSlice", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it("reže traženu stranicu", () => {
    expect(pageSlice(items, 1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(pageSlice(items, 3, 10)).toEqual([21, 22, 23, 24, 25]);
  });

  // Filtar suzi popis dok je korisnik na 4. stranici — bez stezanja bi prikaz
  // ostao prazan umjesto da padne na zadnju punu stranicu.
  it("steže stranicu izvan dosega umjesto da vrati prazno", () => {
    expect(pageSlice([1, 2], 4, 10)).toEqual([1, 2]);
    expect(pageSlice([], 3, 10)).toEqual([]);
  });
});

describe("pageWindow", () => {
  it("do 7 stranica prikazuje sve, bez praznina", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("drži prvu i zadnju stranicu na svakom položaju", () => {
    for (let page = 1; page <= 12; page++) {
      const slots = pageWindow(page, 12);
      expect(slots[0]).toBe(1);
      expect(slots[slots.length - 1]).toBe(12);
    }
  });

  it("uvijek sadrži trenutnu stranicu i njezine susjede", () => {
    for (let page = 1; page <= 12; page++) {
      const slots = pageWindow(page, 12);
      expect(slots).toContain(page);
      if (page > 1) expect(slots).toContain(page - 1);
      if (page < 12) expect(slots).toContain(page + 1);
    }
  });

  // Ovo je razlog odluke: kontrola ne smije mijenjati širinu dok se lista
  // prelistava, inače prev/next skaču ispod pokazivača.
  it("zadržava fiksnih 7 mjesta iznad praga", () => {
    for (const pageCount of [8, 12, 29, 100]) {
      for (let page = 1; page <= pageCount; page++) {
        expect(pageWindow(page, pageCount)).toHaveLength(7);
      }
    }
  });

  it("praznina nikad ne skriva samo jednu stranicu", () => {
    // "1 … 3" bi zauzeo isto mjesta kao "1 2 3" — praznina mora vrijediti.
    for (const pageCount of [8, 12, 29]) {
      for (let page = 1; page <= pageCount; page++) {
        const slots = pageWindow(page, pageCount);
        slots.forEach((slot: PageSlot, i: number) => {
          if (slot !== "gap") return;
          const before = slots[i - 1] as number;
          const after = slots[i + 1] as number;
          expect(after - before).toBeGreaterThan(2);
        });
      }
    }
  });

  it("nikad ne ponavlja ni ne vraća stranicu izvan dosega", () => {
    for (const pageCount of [1, 7, 8, 12, 29]) {
      for (let page = 1; page <= pageCount; page++) {
        const nums = pageWindow(page, pageCount).filter(
          (s): s is number => s !== "gap",
        );
        expect(new Set(nums).size).toBe(nums.length);
        expect(nums.every((n) => n >= 1 && n <= pageCount)).toBe(true);
        expect([...nums].sort((a, b) => a - b)).toEqual(nums);
      }
    }
  });

  it("pinovi konkretan izgled na 12 stranica", () => {
    expect(pageWindow(1, 12)).toEqual([1, 2, 3, 4, 5, "gap", 12]);
    expect(pageWindow(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
    expect(pageWindow(12, 12)).toEqual([1, "gap", 8, 9, 10, 11, 12]);
  });
});
