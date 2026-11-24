import type { Order, PayMethod } from "@tobe/core";
import { CheckCircle2, Clock, Share2, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PayPicker } from "../components/pay";
import { Button, ErrorState, PageLoader, Progress, TopBar } from "../components/ui";
import { Poster } from "../components/visual";
import { api } from "../lib/api";
import { formatFcfa, shareUrl, shortDate, whatsappLink } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

type GroupView = {
  code: string;
  name: string;
  event: { id: string; slug: string; title: string; startsAt: string; venue: string; cover: string | null; theme: never; category: never } | null;
  ticketTypeName: string;
  unitPrice: number;
  seats: number;
  paid: number;
  members: string[];
  owner: string;
  expiresAt: string;
  expired: boolean;
  full: boolean;
  mine: boolean;
  isOwner: boolean;
};

/** Cotisation : chacun paie sa place depuis le lien partagé. */
export function GroupPage() {
  const { code = "" } = useParams();
  const [sp] = useSearchParams();
  const fresh = sp.get("nouveau") === "1";
  const nav = useNavigate();
  const { me, requireAuth, toast, refresh } = useSession();
  const { data: g, error, loading } = useLoad(() => api<GroupView>("GET", `/groups/${code}`), [code, me?.user.id]);
  const [method, setMethod] = useState<PayMethod>("mixx");
  const [busy, setBusy] = useState(false);

  if (loading) return <PageLoader />;
  if (error || !g)
    return (
      <>
        <TopBar title="Groupe" />
        <ErrorState message={error?.message ?? "Groupe introuvable"} />
      </>
    );

  const url = shareUrl(`/groupe/${g.code}`);
  const share = async () => {
    const text = `On va à ${g.event?.title ?? "l'événement"} ensemble ! Paie ta place (${formatFcfa(g.unitPrice)}) avec ton Mobile Money ici, tu reçois ton billet direct :`;
    if (navigator.share) {
      try {
        await navigator.share({ title: g.name, text, url });
        return;
      } catch {
        /* annulé */
      }
    }
    window.open(whatsappLink(`${text} ${url}`), "_blank");
  };
  const pay = async () => {
    if (!(await requireAuth("Connectez-vous pour recevoir votre billet."))) return;
    setBusy(true);
    try {
      const o = await api<Order>("POST", `/groups/${g.code}/pay`, { method });
      await refresh();
      nav(`/billet/${o.id}?nouveau=1`, { replace: true });
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  const hoursLeft = Math.max(0, Math.round((new Date(g.expiresAt).getTime() - Date.now()) / 3600_000));

  return (
    <div className="pb-32 lg:mx-auto lg:max-w-lg">
      <TopBar title="Payer à plusieurs" />
      <div className="space-y-4 px-5 pt-4">
        {fresh && (
          <div className="pop flex gap-3 rounded-2xl border border-emerald/30 bg-emerald/10 p-4 text-sm">
            <CheckCircle2 className="size-6 shrink-0 text-emerald" />
            <div>
              <b>{g.seats} places mises de côté.</b> Partagez le lien sur WhatsApp : chacun paie sa place et reçoit son billet. Payez aussi la vôtre ci-dessous.
            </div>
          </div>
        )}
        {g.event && (
          <Link to={`/evenement/${g.event.slug}`} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-2.5">
            <Poster cover={g.event.cover} theme={g.event.theme} category={g.event.category} className="size-16 shrink-0 rounded-xl" />
            <div className="min-w-0">
              <div className="truncate font-display font-bold">{g.event.title}</div>
              <div className="text-sm text-muted">{shortDate(g.event.startsAt)}</div>
              <div className="truncate text-sm text-muted">{g.event.venue}</div>
            </div>
          </Link>
        )}
        <div className="rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center gap-2 font-display text-lg font-bold">
            <Users className="size-5 text-brand" /> {g.name}
          </div>
          <div className="text-sm text-muted">
            Créé par {g.owner} · {g.ticketTypeName} · {formatFcfa(g.unitPrice)} par personne
          </div>
          <Progress value={(g.paid / g.seats) * 100} className="mt-4" />
          <div className="mt-2 flex justify-between text-sm">
            <b>
              {g.paid}/{g.seats} places payées
            </b>
            <span className="flex items-center gap-1 text-muted">
              <Clock className="size-4" /> {g.expired ? "Expiré" : g.full ? "Complet" : `${hoursLeft} h restantes`}
            </span>
          </div>
          {g.members.length > 0 && <div className="mt-3 text-sm text-muted">Déjà payé : {g.members.join(", ")}</div>}
          {!g.expired && !g.full && <p className="mt-3 text-xs text-muted">Les places non payées à temps sont libérées pour les autres. Personne ne paie pour un autre.</p>}
        </div>
        {!g.expired && !g.full && (
          <Button full variant="dark" icon={<Share2 className="size-5 text-brand" />} onClick={share}>
            Partager le lien du groupe
          </Button>
        )}
        {g.mine ? (
          <Button full variant="ghost" onClick={() => nav("/billets")}>
            Votre place est payée · voir mon billet
          </Button>
        ) : (
          !g.expired &&
          !g.full && (
            <>
              <h2 className="pt-2 text-base font-bold">Payer ma place</h2>
              <PayPicker value={method} onChange={setMethod} />
            </>
          )
        )}
      </div>
      {!g.mine && !g.expired && !g.full && (
        <div className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-app/95 px-5 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 backdrop-blur-xl lg:static lg:mx-5 lg:mt-6 lg:rounded-3xl lg:border lg:p-4">
          <Button full size="lg" loading={busy} onClick={pay}>
            Payer ma place · {formatFcfa(g.unitPrice)}
          </Button>
        </div>
      )}
    </div>
  );
}
