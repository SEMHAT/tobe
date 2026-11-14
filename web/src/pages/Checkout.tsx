import type { EventView, Order, PayMethod } from "@tobe/core";
import { ticketFee } from "@tobe/core";
import { Minus, Plus, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PayPicker } from "../components/pay";
import { Button, ErrorState, PageLoader, TopBar, cx } from "../components/ui";
import { Poster } from "../components/visual";
import { api } from "../lib/api";
import { formatFcfa, shortDate } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

export function Checkout() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { requireAuth, toast, refresh } = useSession();
  const code = sessionStorage.getItem(`code:${id}`) ?? "";
  const { data: e, error, loading } = useLoad(() => api<EventView>("GET", `/events/${id}`, undefined, { code }), [id]);
  const [typeId, setTypeId] = useState("");
  const [qty, setQty] = useState(1);
  const [method, setMethod] = useState<PayMethod>("mixx");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (e && !typeId) setTypeId(e.ticketTypes[0]?.id ?? "");
  }, [e, typeId]);

  if (loading) return <PageLoader />;
  if (error || !e)
    return (
      <>
        <TopBar title="Billets" />
        <ErrorState message={error?.message ?? "Introuvable"} />
      </>
    );

  const tt = e.ticketTypes.find((t) => t.id === typeId) ?? e.ticketTypes[0];
  const paid = (tt?.price ?? 0) > 0;
  const fee = paid ? ticketFee(tt.price, e.organizerPro) * qty : 0;
  const subtotal = (tt?.price ?? 0) * qty;
  const left = tt?.quota ? tt.quota - tt.sold : Infinity;

  const submit = async () => {
    if (!(await requireAuth("Connectez-vous pour recevoir votre billet sur votre téléphone."))) return;
    setBusy(true);
    try {
      const o = await api<Order>("POST", `/events/${e.slug}/tickets`, { ticketTypeId: tt.id, qty, method: paid ? method : "cash", code });
      await refresh();
      toast(paid ? "Paiement confirmé" : "Place réservée");
      nav(`/billet/${o.id}?nouveau=1`, { replace: true });
    } catch (err) {
      toast((err as Error).message, "error");
    }
    setBusy(false);
  };

  return (
    <div className="pb-32">
      <TopBar title={paid ? "Prendre mes billets" : "Réserver"} />
      <div className="px-5 pt-4">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-2.5">
          <Poster cover={e.cover} theme={e.theme} category={e.category} className="size-16 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <div className="truncate font-display font-bold">{e.title}</div>
            <div className="text-sm text-muted">{shortDate(e.startsAt)}</div>
            <div className="truncate text-sm text-muted">{e.venue}</div>
          </div>
        </div>

        <h2 className="mb-3 mt-6 text-base font-bold">Type de billet</h2>
        <div className="space-y-2">
          {e.ticketTypes.map((t) => {
            const soldOut = t.quota > 0 && t.sold >= t.quota;
            return (
              <button
                key={t.id}
                disabled={soldOut}
                onClick={() => (setTypeId(t.id), setQty(1))}
                className={cx("flex w-full items-center justify-between rounded-2xl border p-4 text-left transition disabled:opacity-40", tt?.id === t.id ? "border-gold bg-gold/10" : "border-line bg-card")}
              >
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-muted">{soldOut ? "Complet" : t.quota ? `${t.quota - t.sold} places restantes` : "Places disponibles"}</div>
                </div>
                <div className="font-display text-lg font-bold">{t.price ? formatFcfa(t.price) : "Gratuit"}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between rounded-2xl border border-line bg-card p-4">
          <span className="font-semibold">Nombre de places</span>
          <div className="flex items-center gap-4">
            <button aria-label="Moins" disabled={qty <= 1} onClick={() => setQty(qty - 1)} className="grid size-10 place-items-center rounded-full border border-line disabled:opacity-30">
              <Minus className="size-4" />
            </button>
            <span className="w-6 text-center font-display text-xl font-bold">{qty}</span>
            <button aria-label="Plus" disabled={qty >= Math.min(10, left)} onClick={() => setQty(qty + 1)} className="grid size-10 place-items-center rounded-full border border-line disabled:opacity-30">
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        {paid && (
          <>
            <h2 className="mb-3 mt-6 text-base font-bold">Paiement</h2>
            <PayPicker value={method} onChange={setMethod} />
            <div className="mt-6 space-y-2 rounded-2xl border border-line bg-card p-4 text-sm">
              <Row label={`${qty} × ${tt.name}`} value={formatFcfa(subtotal)} />
              <Row label="Frais de service" value={formatFcfa(fee)} />
              <div className="my-2 border-t border-line" />
              <Row label={<b>Total</b>} value={<b className="font-display text-lg text-gold">{formatFcfa(subtotal + fee)}</b>} />
            </div>
          </>
        )}
        <p className="mt-4 flex items-center gap-2 text-xs text-faint">
          <ShieldCheck className="size-4 text-emerald" /> Billet nominatif avec QR code, disponible hors connexion.
        </p>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-app/95 px-5 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 backdrop-blur-xl">
        <Button full size="lg" loading={busy} onClick={submit} disabled={!tt}>
          {paid ? `Payer ${formatFcfa(subtotal + fee)}` : qty > 1 ? `Réserver ${qty} places` : "Réserver ma place"}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
