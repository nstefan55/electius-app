import Image from "next/image";

// (voter) chrome — mobile-first, apex host (design-system §8.2). White 56px logo-only header
// with a neutral-200 bottom border; neutral-50 page background; a 390px (var(--max-width-voter))
// centered content container. ZERO admin chrome, no auth, no session read. The per-screen
// progress dots (§7.16) belong to the ballot flow content, not this layout.
export default function VoterLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex h-14 items-center justify-center border-b border-neutral-200 bg-white">
        <Image
          src="/logo/logo-mark.png"
          alt="Electious"
          width={28}
          height={28}
          className="object-contain"
          priority
        />
      </header>
      <main className="mx-auto w-full max-w-voter px-6 py-8">{children}</main>
    </div>
  );
}
