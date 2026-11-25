import type { PayoutNetwork } from "@tobe/core";
import { Ban, CheckCircle2, Clock, RefreshCcw, Repeat, Undo2 } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { formatFcfa } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";
import { Button, Field, Sheet, cx, inputCls } from "./ui";

export const NETWORKS: { id: PayoutNetwork; label: string; color: string }[] = [
  { id: "moov", label: "Moov Money", color: "#0a6fd8" },
  { id: "togocel", label: "Togocel / Mixx", color: "#e30613" },
];

/** Numéro + réseau Mobile Money (le réseau est deviné d'après le numéro). */
export function MobileMoneyFields({ phone, setPhone, network, setNetwork }: { phone: string; setPhone: (v: string) => void; network: PayoutNetwork; setNetwork: (n: PayoutNetwork) => void }) {
  const onPhone = (v: string) => {
    setPhone(v);
    const p = Number(v.replace(/\D/g, "").replace(/^228/, "").slice(0, 2));
    if ([70, 71, 72, 73, 90, 91, 92, 93].includes(p)) setNetwork("togocel");
    else if ([78, 79, 96, 97, 98, 99].includes(p)) setNetwork("moov");
  };
  return (
    <div className="space-y-3">
      <Field label="Numéro Mobile Money">
        <input className={inputCls} inputMode="tel" placeholder="90 12 34 56" value={phone} onChange={(e) => onPhone(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {NETWORKS.map((n) => (
          <button key={n.id} type="button" onClick={() => setNetwork(n.id)} className={cx("flex items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-semibold", network === n.id ? "border-brand bg-brand/10" : "border-line")}>
            <span className="size-4 rounded-full" style={{ background: n.color }} />
            {n.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type Refund = { id: string; amount: number; status: string; phone: string | null; network: PayoutNetwork | null; needsNumber: boolean; eventTitle: string; reason: string | null };

/** Remboursements des événements annulés (liste « Mes billets »). */
export function RefundsCard() {
  const { me, toast } = useSession();
  const { data, setData } = useLoad(() => (me ? api<Refund[]>("GET", "/me/refunds") : Promise.resolve([])), [me?.user.id]);
  const [edit, setEdit] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState<PayoutNetwork>("moov");
  const [busy, setBusy] = useState(false);
  if (!data?.length) return null;
  const save = async () => {
    setBusy(true);
    try {
      setData(await api<Refund[]>("POST", `/me/refunds/${edit}/account`, { phone, network }));
      setEdit(null);
      toast("C'est noté : votre remboursement part dans quelques minutes");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  return (
    <div className="mx-5 mb-4 space-y-2 lg:mx-0">
      {data.map((r) => (
        <div key={r.id} className="rounded-2xl border border-line bg-card p-4">
          <div className="flex items-start gap-3">
            {r.status === "sent" ? <CheckCircle2 className="size-5 shrink-0 text-emerald" /> : <Undo2 className="size-5 shrink-0 text-brand" />}
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold">
                {r.eventTitle} est annulé · {formatFcfa(r.amount)}
              </div>
              {r.reason && <div className="text-muted">« {r.reason} »</div>}
              <div className="mt-1 text-muted">
                {r.status === "sent"
                  ? `Remboursé sur +228 ${r.phone}`
                  : r.needsNumber
                    ? "Indiquez votre numéro Mobile Money pour être remboursé."
                    : r.status === "manual" || r.status === "failed"
                      ? "Petit retard : l'équipe ToBe s'occupe de votre remboursement et vous prévient dès l'envoi."
                      : `Remboursement en route vers +228 ${r.phone}.`}
              </div>
            </div>
          </div>
          {(r.needsNumber || r.status === "queued" || r.status === "failed") && edit !== r.id && (
            <Button size="sm" variant={r.needsNumber ? "gold" : "ghost"} className="mt-3" onClick={() => (setEdit(r.id), setPhone(r.phone ?? ""), setNetwork(r.network ?? "moov"))}>
              {r.needsNumber ? "Recevoir mon remboursement" : "Changer de numéro"}
            </Button>
          )}
          {edit === r.id && (
            <div className="mt-3 space-y-3">
              <MobileMoneyFields phone={phone} setPhone={setPhone} network={network} setNetwork={setNetwork} />
              <Button full loading={busy} onClick={save}>
                Être remboursé de {formatFcfa(r.amount)}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Revendre son billet au prix officiel (ou moins) : l'ancien QR est invalidé à la vente. */
export function ResaleCard({ ticket, onChange }: { ticket: { id: string; status: string; total: number; unitPrice: number; qty: number; scannedCount: number; resale?: { id: string; price: number } | null }; onChange: () => void }) {
  const { toast, me } = useSession();
  const [open, setOpen] = useState(false);
  const cap = ticket.unitPrice * ticket.qty;
  const [price, setPrice] = useState(String(cap));
  const [phone, setPhone] = useState(me?.user.phone?.replace(/\D/g, "").replace(/^228/, "") ?? "");
  const [network, setNetwork] = useState<PayoutNetwork>("moov");
  const [busy, setBusy] = useState(false);
  if (ticket.status !== "paid" || ticket.unitPrice <= 0 || ticket.scannedCount > 0) return null;
  const fee = Math.round(Number(price || 0) * 0.05);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      setOpen(false);
      onChange();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  return (
    <div className="mx-5 mt-4 rounded-2xl border border-line bg-card p-4 text-sm lg:mx-auto lg:max-w-md">
      <div className="flex items-center gap-2 font-semibold">
        <Repeat className="size-4 text-brand" /> {ticket.resale ? `En revente à ${formatFcfa(ticket.resale.price)}` : "Vous ne pouvez plus y aller ?"}
      </div>
      <p className="mt-1 text-muted">
        {ticket.resale
          ? "Dès qu'un acheteur paie, votre QR est désactivé et l'argent part sur votre Mobile Money."
          : "Revendez votre billet sur ToBe, jamais plus cher que le prix officiel. Pas d'arnaque possible : l'acheteur reçoit un QR neuf."}
      </p>
      {ticket.resale ? (
        <Button size="sm" variant="ghost" className="mt-3" loading={busy} icon={<Ban className="size-4" />} onClick={() => run(() => api("POST", `/resales/${ticket.resale!.id}/cancel`), "Revente annulée")}>
          Retirer de la revente
        </Button>
      ) : (
        <Button size="sm" variant="ghost" className="mt-3" icon={<RefreshCcw className="size-4" />} onClick={() => setOpen(true)}>
          Revendre mon billet
        </Button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Revendre mon billet">
        <div className="space-y-4">
          <Field label="Prix de revente (FCFA)" hint={`Au maximum ${formatFcfa(cap)}, le prix officiel. Vous recevez ${formatFcfa(Math.max(0, Number(price || 0) - fee))} (ToBe garde 5 %).`}>
            <input className={inputCls} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <MobileMoneyFields phone={phone} setPhone={setPhone} network={network} setNetwork={setNetwork} />
          <Button full loading={busy} disabled={!price || Number(price) > cap} onClick={() => run(() => api("POST", `/tickets/${ticket.id}/resale`, { price: Number(price), phone, network }), "Billet mis en revente")}>
            Mettre en revente
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** L'organisateur annule : les acheteurs sont remboursés automatiquement. */
export function CancelEventButton({ eventId, sold, onDone }: { eventId: string; sold: number; onDone: () => void }) {
  const { toast } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api<{ refunds: number; refundTotal: number }>("POST", `/events/${eventId}/cancel`, { reason });
      toast(r.refunds ? `Événement annulé : ${r.refunds} acheteur(s) remboursé(s), ${formatFcfa(r.refundTotal)}` : "Événement annulé");
      setOpen(false);
      onDone();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  return (
    <>
      <Button full variant="danger" className="mt-6" icon={<Ban className="size-4" />} onClick={() => setOpen(true)}>
        Annuler l'événement
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Annuler l'événement">
        <div className="space-y-4 text-sm">
          <div className="flex gap-3 rounded-2xl bg-card-2 p-4">
            <Clock className="size-5 shrink-0 text-brand" />
            <p>
              {sold > 0 ? (
                <>
                  Les <b>{sold} billet(s)</b> vendus seront désactivés et <b>chaque acheteur remboursé en entier</b> sur son Mobile Money, automatiquement. Votre part sur ces billets est annulée.
                </>
              ) : (
                "L'événement n'apparaîtra plus sur ToBe. Les personnes intéressées sont prévenues."
              )}
            </p>
          </div>
          <Field label="Pourquoi ? (montré aux participants)">
            <textarea className={inputCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : l'artiste est malade, nouvelle date à venir" />
          </Field>
          <Button full variant="danger" loading={busy} disabled={reason.trim().length < 5} onClick={go}>
            Confirmer l'annulation
          </Button>
        </div>
      </Sheet>
    </>
  );
}
