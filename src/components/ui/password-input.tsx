"use client";

import { useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

// Polje za lozinku s gumbom za prikaz/sakrivanje — zamjena za svaki <input type="password">.
// Ne stavljati unutar <label>: aria-label gumba ušao bi u pristupačno ime polja (htmlFor + brat).
export function PasswordInput({
  className,
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  const t = useTranslations("common.password");
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={cn(className, "w-full pr-11")}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("hide") : t("show")}
        className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-md text-neutral-600 outline-none transition-colors hover:text-neutral-800 focus-visible:shadow-focus"
      >
        <Icon className="size-5" aria-hidden />
      </button>
    </div>
  );
}
