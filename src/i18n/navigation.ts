import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware navigation: Link/useRouter add the right prefix; usePathname
// returns the pathname without the locale prefix (so active-state checks work).
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
