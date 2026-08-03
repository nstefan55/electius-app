"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

type Item = { q: string; a: string };

// Jedno otvoreno pitanje odjednom, kao u prototipu.
export function FaqAccordion() {
  const t = useTranslations("marketing.faq");
  const items = t.raw("items") as Item[];
  const [open, setOpen] = useState(0);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={item.q}
            className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
          >
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                id={`faq-button-${i}`}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="flex min-h-11 w-full items-center justify-between gap-4 px-6 py-5.5 text-left"
              >
                <span className="font-heading text-[1.0625rem] font-semibold text-neutral-800">
                  {item.q}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`size-5.5 flex-none text-brand-700 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </h3>
            {isOpen ? (
              <div
                id={`faq-panel-${i}`}
                role="region"
                aria-labelledby={`faq-button-${i}`}
                className="px-6 pb-6 text-base leading-relaxed text-neutral-600"
              >
                {item.a}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
