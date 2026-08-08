import { useTranslations } from "next-intl";

// Pilule plana — jedno mjesto za sve površine.
//
// PRO je do sada postojao tri puta, ali samo dvije su bila ista pilula: ista
// violet ispuna zapisana dvojako (doslovni hex u čarobnjaku, violet-50/700 u
// praznom stanju). Spojene su ovdje. Treća, u election-overview.tsx, je drukčiji
// tretman (amber obrub na navy kartici) i namjerno ostaje tamo — preseliti je
// znači prebojiti je, a onda diff prestaje biti pregledan.
//
// Violet nema tokena: ni u globals.css @theme ni u design-system §2. Doslovne
// vrijednosti ostaju, ali sada na jednom mjestu; promovirati u --color-pro-* tek
// ako paleta ikad dobije Pro ton.
//
// Geometrija (18px, 10px teksta, bold) manja je od design-system §7.9 (20px,
// 12px/500). Odstupanje je zabilježeno ovdje jednom, a ne tri puta u tri
// komponente.
const PILL =
  "inline-flex h-4.5 shrink-0 items-center rounded-full px-1.75 text-[0.625rem] font-bold tracking-wide";

// "PRO" ostaje neprevedeno — naziv plana, isto kao na cjeniku.
// Čitač ekrana bi pokraj imena osobe pročitao samo "PRO", pa dopuna nosi
// značenje: boja sama nikad nije informacija.
export function ProBadge() {
  const t = useTranslations("common.badges");
  return (
    <span className={`${PILL} bg-[#F5F3FF] text-[#6D28D9]`}>
      PRO<span className="sr-only"> {t("proNote")}</span>
    </span>
  );
}

// Tekst i boja su isti kao Beta oznaka na /settings — ista tvrdnja na dvije
// površine, pa drugi ključ ili druga boja znače razilaženje po konstrukciji.
export function BetaBadge() {
  const t = useTranslations("common.badges");
  const tb = useTranslations("dashboard.settings.billing");
  return (
    <span className={`${PILL} bg-neutral-100 text-neutral-600`}>
      {tb("chipBeta")}
      <span className="sr-only"> {t("betaNote")}</span>
    </span>
  );
}
