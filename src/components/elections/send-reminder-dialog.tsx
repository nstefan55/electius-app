"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Dialog } from "@base-ui/react/dialog";
import { CircleCheckBig, Info, Mail, Send } from "lucide-react";
import { reminderPreview, sendElectionReminders } from "@/actions/elections";
import { Spinner } from "@/components/ui/spinner";

// Send-reminder confirm modal (election-overview-phase-3-spec, design:
// Election Overview.dc.html § "Send reminder"). Two panels — review, then sent.
//
// Counts are fetched on open rather than passed as props: the overview page may
// have been sitting open for an hour, and a confirm dialog that quotes a stale
// recipient count is a lie the admin acts on.
interface Preview {
  recipients: number;
  alreadyVoted: number;
  expired: number;
}

export function SendReminderDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("dashboard.election.overview.reminder");
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failedToLoad, setFailedToLoad] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // Every open starts clean — reopening after a send shows the review panel
  // again with the (now smaller) recipient count.
  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setFailedToLoad(false);
    setSent(null);

    let cancelled = false;
    reminderPreview(id).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setFailedToLoad(true);
        return;
      }
      setPreview({
        recipients: result.recipients ?? 0,
        alreadyVoted: result.alreadyVoted ?? 0,
        expired: result.expired ?? 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, id]);

  const send = () => {
    startTransition(async () => {
      const result = await sendElectionReminders(id);
      if (!result.success) {
        toast.error(t("sendFailed"));
        return;
      }
      setSent(result.sent ?? 0);
      if (result.failed) toast.error(t("partial", { count: result.failed }));
      // PENDING voters have flipped to INVITED — the stat row is now stale.
      router.refresh();
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-3rem)] w-[calc(100%-2rem)] max-w-110 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white shadow-lg outline-none">
          {sent !== null ? (
            <SentPanel count={sent} onClose={() => onOpenChange(false)} />
          ) : (
            <ReviewPanel
              preview={preview}
              failedToLoad={failedToLoad}
              pending={pending}
              onCancel={() => onOpenChange(false)}
              onSend={send}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SentPanel({ count, onClose }: { count: number; onClose: () => void }) {
  const t = useTranslations("dashboard.election.overview.reminder");

  return (
    <div className="px-7.5 py-8.5 text-center">
      <div className="mx-auto mb-4.5 flex size-16 items-center justify-center rounded-full bg-success-50 text-success-700">
        <CircleCheckBig className="size-8" aria-hidden />
      </div>
      <Dialog.Title className="font-heading text-[20px] font-bold text-neutral-800">
        {t("sentTitle")}
      </Dialog.Title>
      <Dialog.Description className="mt-2.5 text-[14.5px] leading-relaxed text-neutral-600">
        {t("sentBody", { count })}
      </Dialog.Description>
      <button
        type="button"
        onClick={onClose}
        className="mt-6 h-11.5 w-full cursor-pointer rounded-md bg-brand-700 text-[15px] font-semibold text-white transition-colors hover:bg-brand-600"
      >
        {t("done")}
      </button>
    </div>
  );
}

function ReviewPanel({
  preview,
  failedToLoad,
  pending,
  onCancel,
  onSend,
}: {
  preview: Preview | null;
  failedToLoad: boolean;
  pending: boolean;
  onCancel: () => void;
  onSend: () => void;
}) {
  const t = useTranslations("dashboard.election.overview.reminder");

  return (
    <>
      <div className="flex gap-3.5 px-6.5 pt-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-700">
          <Mail className="size-5.5" aria-hidden />
        </span>
        <div>
          <Dialog.Title className="font-heading text-[19px] font-semibold text-neutral-800">
            {t("title")}
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-neutral-600">
            {t("body")}
          </Dialog.Description>
        </div>
      </div>

      <div className="px-6.5 pt-4.5">
        {failedToLoad ? (
          <p className="rounded-[10px] border border-error-500 bg-error-50 px-4 py-3 text-[13.5px] text-error-700">
            {t("loadFailed")}
          </p>
        ) : preview === null ? (
          <div className="flex justify-center py-8">
            <Spinner label={t("loading")} className="size-9 border-2" />
          </div>
        ) : (
          <>
            <dl className="rounded-[10px] border border-border bg-neutral-50 px-4">
              <SummaryRow
                label={t("recipients")}
                value={t("voterCount", { count: preview.recipients })}
                strong
              />
              <SummaryRow
                label={t("skipVoted")}
                value={t("voterCount", { count: preview.alreadyVoted })}
              />
              <SummaryRow
                label={t("skipExpired")}
                value={t("voterCount", { count: preview.expired })}
                last
              />
            </dl>

            <div className="mt-3.5 flex items-start gap-2.25 rounded-[10px] border border-brand-100 bg-brand-50 px-3.5 py-3">
              <Info className="mt-px size-4 shrink-0 text-brand-700" aria-hidden />
              <span className="text-[12.5px] leading-relaxed text-brand-700">
                {t("note")}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-3 px-6.5 pt-5 pb-6">
        <button
          type="button"
          onClick={onCancel}
          className="h-11.5 cursor-pointer rounded-md border border-border bg-white px-4.5 text-[14.5px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-50"
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={onSend}
          // Nothing to send is not an error state — the button simply can't fire.
          disabled={pending || !preview || preview.recipients === 0}
          className="inline-flex h-11.5 cursor-pointer items-center gap-2 rounded-md bg-brand-700 px-5 text-[14.5px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="size-4.25" aria-hidden />
          {pending
            ? t("sending")
            : t("confirm", { count: preview?.recipients ?? 0 })}
        </button>
      </div>
    </>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
  last = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3 ${last ? "" : "border-b border-neutral-100"}`}
    >
      <dt className="text-[13.5px] text-neutral-600">{label}</dt>
      <dd
        className={`text-sm text-neutral-800 ${strong ? "font-bold" : "font-semibold"}`}
      >
        {value}
      </dd>
    </div>
  );
}
