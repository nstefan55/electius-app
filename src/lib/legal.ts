// Inačica uvjeta korištenja. Nije ukras: §Q obećava obavijest prije izmjene i
// pravo na otkaz prije nego što stupi na snagu, a to obećanje je provjerljivo
// samo ako se uz pristanak zapiše NA ŠTO se pristalo. Bez inačice pitanje
// „koji su uvjeti obvezivali ovu organizaciju u ožujku" nema odgovor, koliko
// god dobro klauzula bila napisana.
//
// Piše se u organizations.termsVersion pri /setup. Podigni je kad se promijeni
// BILO KOJA obveza — ne za tipfelere.
//
// Datum je i vidljiv na stranici (legal.terms.updated), ali izvor istine je
// ovdje: katalog je prevodiv, a inačica ne smije ovisiti o jeziku.
// Sufiks `.1` nije tipfeler. Odredbe o povratu dodane su ISTI dan kad su
// uvjeti objavljeni, pa sam datum ne razlikuje dva teksta — a upravo to je
// jedino čemu ova konstanta služi. Bez sufiksa bi „2026-09-12" značilo dvije
// različite verzije i zapis o pristanku ne bi odgovarao ni na jedno pitanje.
// Datiranje sutrašnjim danom bilo bi laž na stranici (legal.terms.updated).
// Sljedeća izmjena pomiče DATUM i sufiks otpada.
export const TERMS_VERSION = "2026-09-12.1";
