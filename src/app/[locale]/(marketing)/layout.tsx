// (marketing) chrome — TREĆA ljuska (apex host), odvojena od admin ljuske
// (design-system §8.1) i ljuske za glasače (§8.2). Navigacija i podnožje sada
// žive u samoj stranici jer su dio dizajna odredišne stranice, pa ovdje ostaje
// samo podloga. Bez sesije, bez sidebara.
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="bg-white text-neutral-950">{children}</div>;
}
