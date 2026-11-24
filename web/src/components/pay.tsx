import type { PayMethod } from "@tobe/core";
import { CreditCard, LockKeyhole, Smartphone } from "lucide-react";
import { useSession } from "../lib/session";
import { cx } from "./ui";

const METHODS: { id: PayMethod; label: string; sub: string; color: string }[] = [
  { id: "mixx", label: "Mixx by Yas", sub: "Mobile Money", color: "#ffd400" },
  { id: "moov", label: "Moov Money", sub: "Mobile Money", color: "#0a6fd8" },
  { id: "card", label: "Carte bancaire", sub: "Visa, Mastercard · diaspora", color: "#8b5cf6" },
];

export function PayPicker({ value, onChange }: { value: PayMethod; onChange: (m: PayMethod) => void }) {
  const { paymentsMode } = useSession();
  // Vrai paiement : le client choisit son réseau sur la page sécurisée de l'agrégateur.
  if (paymentsMode === "online")
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
          <LockKeyhole className="size-5" />
        </span>
        <span className="text-sm">
          <span className="block font-semibold">Mobile Money · paiement sécurisé</span>
          <span className="mt-0.5 block text-muted">Moov Money ou Togocel Money : vous choisissez votre réseau et validez sur votre téléphone à l'étape suivante. Les frais de l'opérateur s'ajoutent au montant.</span>
        </span>
      </div>
    );
  return (
    <div className="space-y-2">
      {METHODS.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={cx("flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition", value === m.id ? "border-brand bg-brand/10" : "border-line bg-card")}
        >
          <span className="grid size-10 place-items-center rounded-xl text-[#16141c]" style={{ background: m.color }}>
            {m.id === "card" ? <CreditCard className="size-5 text-white" /> : <Smartphone className="size-5" />}
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-semibold">{m.label}</span>
            <span className="block text-xs text-muted">{m.sub}</span>
          </span>
          <span className={cx("size-5 rounded-full border-2", value === m.id ? "border-brand bg-brand shadow-[inset_0_0_0_3px_var(--bg-2)]" : "border-ink/25")} />
        </button>
      ))}
    </div>
  );
}
