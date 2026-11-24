import type { PayoutNetwork } from "@tobe/core";
import { CheckCircle2, Clock, Pencil, Wallet } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { formatFcfa, shortDate } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";
import { Button, Field, cx, inputCls } from "./ui";

interface Earnings {
  phone: string | null;
  network: PayoutNetwork | null;
  pending: number;
  sent: number;
  min: number;
  commission: { ticket: number; vote: number; cagnotte: number };
  payouts: { id: string; amount: number; status: "queued" | "sending" | "sent" | "failed" | "manual"; createdAt: string; eventTitle: string | null }[];
}

const NETWORKS: { id: PayoutNetwork; label: string; color: string }[] = [
  { id: "moov", label: "Moov Money", color: "#0a6fd8" },
  { id: "togocel", label: "Togocel Money", color: "#e30613" },
  { id: "mixx", label: "Mixx by Yas", color: "#ffd400" },
];

const STATUS: Record<Earnings["payouts"][number]["status"], string> = {
  queued: "En attente",
  sending: "Envoi en cours",
  sent: "Reçu",
  failed: "Nouvel essai bientôt",
  manual: "Traitement par ToBe",
};

const pct = (r: number) => `${Math.round(r * 100)} %`;

/** Gains de l'organisateur : où il les reçoit et ce qui a été versé. */
export function EarningsCard() {
  const { toast, paymentsMode } = useSession();
  const { data, setData } = useLoad(() => api<Earnings>("GET", "/me/earnings"), []);
  const [edit, setEdit] = useState(false);
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState<PayoutNetwork>("moov");
  const [busy, setBusy] = useState(false);
  if (!data || paymentsMode !== "online") return null;
  const editing = edit || !data.phone;

  const save = async () => {
    setBusy(true);
    try {
      setData(await api<Earnings>("POST", "/me/payout-account", { phone, network }));
      setEdit(false);
      toast("Numéro de reversement enregistré");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };

  return (
    <section className="rounded-[24px] border border-line bg-card p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl brand-gradient text-white">
          <Wallet className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold">Mes gains</h2>
          <p className="text-xs text-muted">
            Envoyés automatiquement sur votre Mobile Money après chaque vente · commission ToBe : billets {pct(data.commission.ticket)}, votes {pct(data.commission.vote)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card-2 p-3">
          <div className="text-xs text-muted">Déjà reçu</div>
          <div className="font-display text-xl font-bold">{formatFcfa(data.sent)}</div>
        </div>
        <div className="rounded-2xl bg-card-2 p-3">
          <div className="text-xs text-muted">En cours de versement</div>
          <div className="font-display text-xl font-bold">{formatFcfa(data.pending)}</div>
        </div>
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          {!data.phone && <p className="rounded-2xl bg-[#fff4dc] p-3 text-sm text-[#7a4a00] dark:bg-[#3a2a08] dark:text-[#ffd98a]">Indiquez où recevoir votre argent : sans numéro, vos gains restent en attente.</p>}
          <div className="grid grid-cols-3 gap-2">
            {NETWORKS.map((n) => (
              <button key={n.id} type="button" onClick={() => setNetwork(n.id)} className={cx("flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-xs font-semibold", network === n.id ? "border-brand bg-brand/10" : "border-line")}>
                <span className="size-6 rounded-full" style={{ background: n.color }} />
                {n.label}
              </button>
            ))}
          </div>
          <Field label="Numéro Mobile Money">
            <input className={inputCls} inputMode="tel" placeholder="90 12 34 56" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            {data.phone && (
              <Button variant="outline" onClick={() => setEdit(false)}>
                Annuler
              </Button>
            )}
            <Button full loading={busy} onClick={save}>
              Enregistrer
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setPhone(data.phone ?? "");
            setNetwork(data.network ?? "moov");
            setEdit(true);
          }}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-left"
        >
          <span className="size-6 rounded-full" style={{ background: NETWORKS.find((n) => n.id === data.network)?.color }} />
          <span className="flex-1 text-sm">
            <span className="block font-semibold">{NETWORKS.find((n) => n.id === data.network)?.label}</span>
            <span className="text-muted">+228 {data.phone}</span>
          </span>
          <Pencil className="size-4 text-muted" />
        </button>
      )}

      {data.payouts.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {data.payouts.slice(0, 8).map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
              {p.status === "sent" ? <CheckCircle2 className="size-4 text-emerald" /> : <Clock className="size-4 text-muted" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.eventTitle ?? "Plusieurs événements"}</span>
                <span className="text-xs text-muted">
                  {shortDate(p.createdAt)} · {STATUS[p.status]}
                </span>
              </span>
              <span className="font-display font-bold">{formatFcfa(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-faint">Les versements partent dès {formatFcfa(data.min)} cumulés ; en dessous, ils s'additionnent jusqu'au prochain.</p>
    </section>
  );
}
