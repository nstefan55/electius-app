"use client";

import { useState } from "react";
import { clampPage, pageCountOf, pageSlice } from "@/lib/pagination";

// Klijentsko stranicanje za liste koje filtriraju nad cijelim skupom.
// Stanje stranice je lokalno, ne u URL-u: filtri tih lista također su lokalni,
// pa bi dijeljeni `?page=3` vratio stranicu bez filtra koji ju je proizveo.
//
// Dva pravila koja se ovdje ne mogu zaboraviti po listi:
//  1. promjena filtra vraća na prvu stranicu — inače filtriranje na 2 rezultata
//     dok si na 4. stranici pokaže prazno;
//  2. `page` se steže na trenutni `pageCount` — brisanje zadnjeg retka
//     stranice ne smije ostaviti prazan prikaz ni neoznačen broj u kontroli.
//
// `resetKey` je potpis filtara; kad se promijeni, stranica se vraća na 1.
export function usePagination<T>(
  items: T[],
  perPage: number,
  resetKey: string = "",
) {
  const [page, setPage] = useState(1);

  // Namještanje stanja tijekom rendera, ne u efektu — isti obrazac koji liste
  // već koriste za resinkronizaciju redaka; izbjegava dvostruki render.
  const [prevKey, setPrevKey] = useState(resetKey);
  if (resetKey !== prevKey) {
    setPrevKey(resetKey);
    setPage(1);
  }

  const pageCount = pageCountOf(items.length, perPage);
  const current = clampPage(page, pageCount);

  return {
    page: current,
    pageCount,
    setPage,
    pageItems: pageSlice(items, current, perPage),
  };
}
