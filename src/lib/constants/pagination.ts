// Veličine stranica — jedino mjesto za promjenu. Bez logike i bez
// `server-only`: dijele ih poslužiteljski upiti i klijentske liste, pa jedna
// lista ne može tiho odlutati na drugu vrijednost.
//
// Mehanizam se NE mijenja s brojem: /elections, /results i /archive filtriraju
// na klijentu i zato dohvaćaju cijeli skup, dok /voters i popis birača idu
// preko `skip`/`take` (pagination-spec).

/** /elections — sve izbore organizacije, filtrira se na klijentu. */
export const ELECTIONS_PER_PAGE = 10;

/** /results — kartice/retci rezultata, filtrira se na klijentu. */
export const RESULTS_PER_PAGE = 12;

/** /archive — kartice arhive, pretraga na klijentu. */
export const ARCHIVE_PER_PAGE = 6;

/** /voters — popis izbora, poslužiteljsko stranicanje. */
export const VOTERS_PER_PAGE = 10;

/** /elections/[id]/voters — popis birača, poslužiteljsko stranicanje. */
export const ROSTER_PAGE_SIZE = 10;

/**
 * /home — koliko izbora se vidi prije "Učitaj još".
 * Prikazna granica, NE granica upita: getDashboardData hrani i statistike i
 * oba grafikona, pa bi `take` iskrivio brojke.
 */
export const DASHBOARD_RECENT_ELECTIONS_LIMIT = 5;

/** /home — koliko redaka otkriva svaki klik na "Učitaj još". */
export const DASHBOARD_RECENT_STEP = 10;
