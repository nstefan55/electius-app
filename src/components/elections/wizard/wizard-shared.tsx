"use client";

import { useRef, useState } from "react";
import { Check, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import {
  validateCsvFile,
  type CandidateRow,
  type VoterRow,
} from "@/lib/wizard-csv";

// Shared state shape + small building blocks for the 5-step creation wizard
// (design: Election Wizard.dc.html).

export type WizardData = {
  title: string;
  description: string;
  electionType: "STANDARD" | "SURVEY" | "POLL";
  votingType: "SINGLE_CHOICE" | "MULTI_CHOICE";
  allowAbstain: boolean;
  candidates: CandidateRow[];
  voters: VoterRow[];
  startMode: "manual" | "scheduled";
  startAt: string; // datetime-local value, "" = not set
  closeAt: string;
  sealedResults: boolean;
  quorum: boolean;
  quorumPct: number;
  autoCloseOnDeadline: boolean;
  adminTurnoutReminder: boolean;
  voterReminder24h: boolean;
};

export const INITIAL_WIZARD_DATA: WizardData = {
  title: "",
  description: "",
  electionType: "STANDARD",
  votingType: "SINGLE_CHOICE",
  allowAbstain: false,
  candidates: [],
  voters: [],
  startMode: "manual",
  startAt: "",
  closeAt: "",
  sealedResults: false,
  quorum: false,
  quorumPct: 50,
  autoCloseOnDeadline: true,
  adminTurnoutReminder: false,
  voterReminder24h: false,
};

export type StepProps = {
  data: WizardData;
  patch: (p: Partial<WizardData>) => void;
};

export const INPUT_CLASS =
  "w-full rounded-md border border-border bg-white px-3.5 text-[15px] text-neutral-950 outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-brand-700 focus:shadow-focus";

export const FIELD_LABEL =
  "mb-1.5 block text-[13px] font-semibold text-muted-foreground";

export function StepCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-7 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StepHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h1 className="font-heading text-2xl font-semibold text-neutral-800">
        {title}
      </h1>
      <p className="mt-2 mb-7 text-[15px] leading-normal text-muted-foreground">
        {sub}
      </p>
    </>
  );
}

export function ProBadge() {
  return (
    <span className="inline-flex h-4.5 items-center rounded-full bg-[#F5F3FF] px-1.75 text-[10px] font-bold tracking-wide text-[#6D28D9]">
      PRO
    </span>
  );
}

// Selection card with the top-right check circle (type / method / start mode).
export function SelectCard({
  title,
  desc,
  selected,
  disabled = false,
  badge,
  onClick,
}: {
  title: string;
  desc: string;
  selected: boolean;
  disabled?: boolean;
  badge?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-disabled={disabled}
      className={cn(
        "rounded-lg border-[1.5px] p-4 text-left transition-colors",
        disabled
          ? "cursor-not-allowed border-neutral-200/70 bg-neutral-50 opacity-75"
          : selected
            ? "border-brand-700 bg-brand-50"
            : "border-border bg-white hover:border-brand-500",
      )}
    >
      <div className="flex min-h-5.5 items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.75">
          <span
            className={cn(
              "font-heading text-[15px] font-semibold",
              disabled
                ? "text-neutral-400"
                : selected
                  ? "text-brand-700"
                  : "text-neutral-800",
            )}
          >
            {title}
          </span>
          {badge}
        </span>
        {selected && (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white">
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <div
        className={cn(
          "mt-1.5 text-[13px] leading-snug",
          disabled ? "text-neutral-400/70" : "text-muted-foreground",
        )}
      >
        {desc}
      </div>
    </button>
  );
}

// iOS-style toggle switch.
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "h-7 w-11.5 shrink-0 cursor-pointer rounded-full p-0.75 transition-colors",
        checked ? "bg-brand-700" : "bg-neutral-200",
      )}
    >
      <span
        className={cn(
          "block size-5.5 rounded-full bg-white shadow-sm transition-transform",
          checked && "translate-x-4.5",
        )}
      />
    </button>
  );
}

// "Add manually / Upload CSV" segmented tabs.
export function ModeTabs({
  mode,
  onChange,
  manualLabel,
  csvLabel,
}: {
  mode: "manual" | "csv";
  onChange: (m: "manual" | "csv") => void;
  manualLabel: string;
  csvLabel: string;
}) {
  const tab = (on: boolean) =>
    cn(
      "h-8.5 rounded-[7px] px-4 text-sm font-semibold transition-colors",
      on ? "bg-white text-brand-700 shadow-xs" : "text-muted-foreground",
    );
  return (
    <div className="mb-5.5 inline-flex rounded-[10px] bg-neutral-100 p-1">
      <button
        type="button"
        onClick={() => onChange("manual")}
        className={tab(mode === "manual")}
      >
        {manualLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange("csv")}
        className={tab(mode === "csv")}
      >
        {csvLabel}
      </button>
    </div>
  );
}

// Dashed CSV drop zone — validates the file (extension/type/size) before
// handing its text to the caller. Drag-over highlight + click-to-browse.
export function CsvDropZone({
  title,
  hint,
  errors,
  onText,
}: {
  title: string;
  hint: React.ReactNode;
  errors: { notCsv: string; tooLarge: string };
  onText: (text: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function handleFile(file: File | undefined) {
    if (!file) return;
    const err = validateCsvFile(file);
    if (err) {
      toast.error(errors[err]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onText(String(reader.result));
    reader.readAsText(file);
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed p-8 text-center transition-colors",
        over
          ? "border-brand-700 bg-brand-100"
          : "border-neutral-200 bg-neutral-50 hover:border-brand-700 hover:bg-brand-50",
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        <Upload className="size-5" />
      </span>
      <span className="text-[15px] font-semibold text-neutral-800">
        {title}
      </span>
      <span className="text-[13px] text-neutral-400">{hint}</span>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );
}
