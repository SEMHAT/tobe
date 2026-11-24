import type { EventView, Order, PayMethod } from "@tobe/core";
import { ticketFee } from "@tobe/core";
import { Minus, Plus, Repeat, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PayPicker } from "../components/pay";
import { Button, ErrorState, PageLoader, TopBar, cx, inputCls } from "../components/ui";
import { Poster } from "../components/visual";
import { api } from "../lib/api";
import { formatFcfa, shortDate } from "../lib/format";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

export function Checkout() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { requireAuth, toast, refresh, payments } = useSession();
  const t = useT();
  const code = sessionStorage.getItem(`code:${id}`) ?? "";
  const { data: e, error, loading } = useLoad(() => api<EventView>("GET", `/events/${id}`, undefined, { code }), [id]);
  const [typeId, setTypeId] = useState("");
  const [qty, setQty] = useState(1);
  const [method, setMethod] = useState<PayMethod>("mixx");
  const [busy, setBusy] = useState(false);
  const [together, setTogether] = useState(false);
  const [groupName, setGroupName] = useState("");
  const { data: resales } = useLoad(() => api<{ id: string; ticketTypeName: string; qty: number; price: number; mine: boolean }[]>("GET", `/events/${id}/resales`).catch(() => []), [id]);

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

  if (e.access === "none" || !e.ticketTypes.length)
    return (
      <>
        <TopBar title="Billets" />
        <ErrorState message="Pas de billetterie ToBe pour cet événement : l'organisateur gère l'entrée autrement. Consultez les infos d'entrée sur la page de l'événement." />
      </>
    );
  const tt = e.ticketTypes.find((t) => t.id === typeId) ?? e.ticketTypes[0];
  const paid = (tt?.price ?? 0) > 0;
  const online = paid && payments;
  const fee = online ? ticketFee(tt.price, e.organizerPro) * qty : 0;
  const subtotal = (tt?.price ?? 0) * qty;
  const left = tt?.quota ? tt.quota - tt.sold : Infinity;

  const buyResale = async (rid: string) => {
    if (!(await requireAuth("Connectez-vous pour recevoir votre billet sur votre téléphone."))) return;
    setBusy(true);
    try {
      const o = await api<Order>("POST", `/resales/${rid}/buy`, { method });
      await refresh();
      nav(`/billet/${o.id}?nouveau=1`, { replace: true });
    } catch (err) {
      toast((err as Error).message, "error");
    }
    setBusy(false);
  };

  const submit = async () => {
    if (!(await requireAuth("Connectez-vous pour recevoir votre billet sur votre téléphone."))) return;
    setBusy(true);
    if (together) {
      try {
        const g = await api<{ code: string }>("POST", `/events/${e.slug}/groups`, { ticketTypeId: tt.id, seats: qty, name: groupName });
        nav(`/groupe/${g.code}?nouveau=1`, { replace: true });
      } catch (err) {
        toast((err as Error).message, "error");
      }
      setBusy(false);
      return;
    }
    try {
      const o = await api<Order>("POST", `/events/${e.slug}/tickets`, { ticketTypeId: tt.id, qty, method: online ? method : "cash", code });
      await refresh();
      toast(online ? "Paiement confirmé" : qty > 1 ? "Places réservées" : "Place réservée");
      nav(`/billet/${o.id}?nouveau=1`, { replace: true });
    } catch (err) {
      toast((err as Error).message, "error");
    }
    setBusy(false);
  };

  return (
    <div className="pb-32 lg:pb-12">
      <TopBar title={online ? "Prendre mes billets" : "Réserver"} />
      <div className="px-5 pt-4">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-2.5">
          <Poster cover={e.cover} theme={e.theme} category={e.category} className="size-16 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <div className="truncate font-display font-bold">{e.title}</div>
            <div className="text-sm text-muted">{shortDate(e.startsAt)}</div>
            <div className="truncate text-sm text-muted">{e.venue}</div>
          </div>
        </div>

        {!!resales?.filter((r) => !r.mine).length && online && (
          <div className="mt-5 rounded-2xl border border-line bg-card p-4">
            <div className="flex items-center gap-2 font-semibold">
              <Repeat className="size-4 text-brand" /> Revente officielle
            </div>
            <p className="mt-0.5 text-xs text-muted">Billets remis en vente par des participants, jamais plus chers que le prix officiel. Vous recevez un QR neuf.</p>
            <div className="mt-3 space-y-2">
              {resales
                .filter((r) => !r.mine)
                .slice(0, 5)
                .map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-card-2 px-3 py-2.5">
                    <span className="text-sm">
                      {r.qty} × {r.ticketTypeName}
                    </span>
                    <Button size="sm" loading={busy} onClick={() => buyResale(r.id)}>
                      {formatFcfa(r.price)}
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        )}

        <h2 className="mb-3 mt-6 text-base font-bold">Type de billet</h2>
        <div className="space-y-2">
          {e.ticketTypes.map((t) => {
            const soldOut = t.quota > 0 && t.sold >= t.quota;
            return (
              <button
                key={t.id}
                disabled={soldOut}
                onClick={() => (setTypeId(t.id), setQty(1))}
                className={cx("flex w-full items-center justify-between rounded-2xl border p-4 text-left transition disabled:opacity-40", tt?.id === t.id ? "border-brand bg-brand/10" : "border-line bg-card")}
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
            <button aria-label="Moins" disabled={qty <= (together ? 2 : 1)} onClick={() => setQty(qty - 1)} className="grid size-10 place-items-center rounded-full border border-line disabled:opacity-30">
              <Minus className="size-4" />
            </button>
            <span className="w-6 text-center font-display text-xl font-bold">{qty}</span>
            <button aria-label="Plus" disabled={qty >= Math.min(10, left)} onClick={() => setQty(qty + 1)} className="grid size-10 place-items-center rounded-full border border-line disabled:opacity-30">
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        {online && (
          <button
            type="button"
            onClick={() => (setTogether(!together), setQty(Math.max(2, qty)))}
            className={cx("mt-3 flex w-full items-start gap-3 rounded-2xl border p-4 text-left", together ? "border-brand bg-brand/10" : "border-line bg-card")}
          >
            <Users className="mt-0.5 size-5 shrink-0 text-brand" />
            <span className="text-sm">
              <b>Payer à plusieurs</b>
              <span className="block text-muted">Réservez {Math.max(2, qty)} places pendant 24 h. Partagez le lien : chacun paie sa place avec son Mobile Money et reçoit son propre billet.</span>
            </span>
          </button>
        )}
        {together && (
          <input className={cx(inputCls, "mt-3")} placeholder="Nom du groupe (ex. : Les cousins)" value={groupName} onChange={(ev) => setGroupName(ev.target.value)} />
        )}

        {paid && !online && (
          <div className="mt-6 space-y-2 rounded-2xl border border-line bg-card p-4 text-sm">
            <Row label={`${qty} × ${tt.name}`} value={formatFcfa(subtotal)} />
            <div className="my-2 border-t border-line" />
            <Row label={<b>À régler à l'entrée</b>} value={<b className="font-display text-lg text-brand">{formatFcfa(subtotal)}</b>} />
            <p className="pt-1 text-xs text-muted">Votre place est réservée à votre nom. Vous payez le jour J, à l'entrée, sur présentation du QR code.</p>
          </div>
        )}
        {online && (
          <>
            <h2 className="mb-3 mt-6 text-base font-bold">Paiement</h2>
            {!together && <PayPicker value={method} onChange={setMethod} />}
            <div className="mt-6 space-y-2 rounded-2xl border border-line bg-card p-4 text-sm">
              <Row label={`${qty} × ${tt.name}`} value={formatFcfa(subtotal)} />
              {fee > 0 && <Row label="Frais de service" value={formatFcfa(fee)} />}
              <div className="my-2 border-t border-line" />
              {together ? (
                <Row label={<b>Chacun paie sa place</b>} value={<b className="font-display text-lg text-brand">{formatFcfa(tt.price)}</b>} />
              ) : (
                <Row label={<b>Total</b>} value={<b className="font-display text-lg text-brand">{formatFcfa(subtotal + fee)}</b>} />
              )}
            </div>
          </>
        )}
        <p className="mt-4 flex items-center gap-2 text-xs text-faint">
          <ShieldCheck className="size-4 text-emerald" /> Billet nominatif avec QR code, disponible hors connexion.
        </p>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-app/95 lg:static lg:mt-8 lg:rounded-3xl lg:border lg:bg-card-2 lg:p-4 px-5 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 backdrop-blur-xl">
        <Button full size="lg" loading={busy} onClick={submit} disabled={!tt}>
          {together ? `Réserver ${qty} places pour le groupe` : online ? t("co.pay", { amount: formatFcfa(subtotal + fee) }) : qty > 1 ? `Réserver ${qty} places` : "Réserver ma place"}
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
