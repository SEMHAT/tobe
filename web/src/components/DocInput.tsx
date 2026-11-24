import { Check, FileImage, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { uploadPrivate, usePrivateImage } from "../lib/privateFiles";
import { useSession } from "../lib/session";
import { cx } from "./ui";

/** Champ d'envoi d'un document privé (photo). */
export function DocInput({ label, hint, value, onChange, capture }: { label: string; hint?: string; value: string | null; onChange: (id: string | null) => void; capture?: "user" | "environment" }) {
  const { toast } = useSession();
  const [busy, setBusy] = useState(false);
  const preview = usePrivateImage(value);
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      onChange(await uploadPrivate(f));
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  return (
    <label className={cx("flex cursor-pointer items-center gap-3 rounded-2xl border p-3", value ? "border-emerald/50 bg-emerald/5" : "border-dashed border-line")}>
      <input type="file" accept="image/*" capture={capture} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-card-2">
        {busy ? <Loader2 className="size-5 animate-spin text-brand" /> : preview ? <img src={preview} alt="" className="size-full object-cover" /> : <FileImage className="size-5 text-muted" />}
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          {label} {value && <Check className="size-4 text-emerald" />}
        </span>
        <span className="block text-xs text-muted">{hint ?? (value ? "Envoyé · touchez pour remplacer" : "Touchez pour prendre ou choisir une photo")}</span>
      </span>
      <Lock className="size-4 shrink-0 text-faint" aria-label="Document privé" />
    </label>
  );
}

/** Miniature d'un document privé (Espace ToBe). */
export function PrivateThumb({ id, label }: { id: string; label: string }) {
  const url = usePrivateImage(id);
  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer" className="block w-24 shrink-0">
      <span className="grid aspect-[4/3] place-items-center overflow-hidden rounded-xl bg-card-2">{url ? <img src={url} alt={label} className="size-full object-cover" /> : <Loader2 className="size-4 animate-spin text-muted" />}</span>
      <span className="mt-1 block truncate text-[10px] text-muted">{label}</span>
    </a>
  );
}
