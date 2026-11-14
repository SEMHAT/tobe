import type { EventCard, Order } from "@tobe/core";
import { CheckCircle2, ChevronRight, MapPin, Ticket as TicketIcon, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button, Empty, ErrorState, PageLoader, Segmented, TopBar } from "../components/ui";
import { Poster, QR } from "../components/visual";
import { api } from "../lib/api";
import { formatFcfa, longDate, PAY_METHOD_LABELS, shortDate, time } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

type MyTicket = Order & { event: EventCard | null; holder?: string };
const CACHE = "tobe-tickets-cache";

export function Tickets() {
  const { me, ready, requireAuth } = useSession();
  const [tab, setTab] = useState<"next" | "past">("next");
  const { data, error, loading } = useLoad(async () => {
    if (!me) return null;
    try {
      const t = await api<MyTicket[]>("GET", "/me/tickets");
      localStorage.setItem(CACHE, JSON.stringify(t));
      return { list: t, offline: false };
    } catch (e) {
      const cached = localStorage.getItem(CACHE);
      if (cached) return { list: JSON.parse(cached) as MyTicket[], offline: true };
      throw e;
    }
  }, [me?.user.id]);

  if (!ready) return <PageLoader />;
  if (!me)
    return (
      <>
        <TopBar title="Mes billets" />
        <Empty icon={<TicketIcon className="size-7" />} title="Vos billets au même endroit" text="Connectez-vous pour retrouver vos billets, même sans connexion le jour J." action={<Button onClick={() => requireAuth()}>Se connecter</Button>} />
      </>
    );
  const now = Date.now();
  const list = (data?.list ?? []).filter((t) => {
    const d = t.event ? new Date(t.event.startsAt).getTime() + 8 * 3600_000 : 0;
    return tab === "next" ? d >= now : d < now;
  });
  return (
    <div>
      <TopBar title="Mes billets" />
      <div className="px-5 pt-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: "next", label: "À venir" }, { value: "past", label: "Passés" }]} />
        {data?.offline && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm text-muted">
            <WifiOff className="size-4" /> Hors connexion : billets enregistrés sur ce téléphone.
          </div>
        )}
      </div>
      {loading && <PageLoader />}
      {error && <ErrorState message={error.message} />}
      {data && list.length === 0 && (
        <Empty icon={<TicketIcon className="size-7" />} title={tab === "next" ? "Aucun billet à venir" : "Aucun billet passé"} text="Vos billets apparaîtront ici après l'achat ou la réservation." action={<Link to="/explorer" className="font-semibold text-gold">Trouver un événement</Link>} />
      )}
      <div className="space-y-3 px-5 py-4">
        {list.map((t) => (
          <Link key={t.id} to={`/billet/${t.id}`} className="flex items-stretch overflow-hidden rounded-[20px] border border-line bg-card">
            <Poster cover={t.event?.cover ?? null} theme={t.event?.theme ?? "or"} category={t.event?.category ?? "autre"} className="w-24 shrink-0" />
            <div className="min-w-0 flex-1 p-3.5">
              <div className="truncate font-display font-bold">{t.event?.title ?? "Événement"}</div>
              <div className="mt-0.5 text-sm text-muted">{t.event ? shortDate(t.event.startsAt) : ""}</div>
              <div className="mt-2 inline-flex rounded-full bg-gold/15 px-2.5 py-1 text-xs font-bold text-gold">
                {t.qty} × {t.ticketTypeName}
              </div>
            </div>
            <div className="grid place-items-center border-l border-dashed border-line px-3">
              <ChevronRight className="size-5 text-faint" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function TicketPage() {
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  const fresh = sp.get("nouveau") === "1";
  const [cached] = useState<MyTicket | null>(() => {
    const raw = localStorage.getItem(CACHE);
    return raw ? ((JSON.parse(raw) as MyTicket[]).find((t) => t.id === id) ?? null) : null;
  });
  const { data, error, loading } = useLoad(() => api<MyTicket>("GET", `/tickets/${id}`), [id]);
  const t = data ?? cached;
  useEffect(() => {
    if (data) {
      const raw = localStorage.getItem(CACHE);
      const list = raw ? (JSON.parse(raw) as MyTicket[]).filter((x) => x.id !== data.id) : [];
      localStorage.setItem(CACHE, JSON.stringify([...list, data]));
    }
  }, [data]);
  if (loading && !t) return <PageLoader />;
  if (!t)
    return (
      <>
        <TopBar title="Billet" />
        <ErrorState message={error?.message ?? "Billet introuvable"} />
      </>
    );
  const e = t.event;
  return (
    <div className="min-h-full pb-10">
      <TopBar title="Mon billet" />
      {fresh && (
        <div className="pop mx-5 mt-4 flex items-center gap-3 rounded-2xl border border-emerald/30 bg-emerald/10 p-4">
          <CheckCircle2 className="size-6 shrink-0 text-emerald" />
          <div className="text-sm">
            <div className="font-semibold">C'est confirmé !</div>
            <div className="text-muted">Présentez ce QR code à l'entrée. Il reste disponible sans connexion.</div>
          </div>
        </div>
      )}
      <div className="mx-5 mt-5 overflow-hidden rounded-[28px] bg-white text-[#16141c] shadow-2xl">
        <Poster cover={e?.cover ?? null} theme={e?.theme ?? "or"} category={e?.category ?? "autre"} title={e?.title} className="h-36">
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute inset-x-5 bottom-4 text-white">
            <div className="font-display text-xl font-bold leading-tight">{e?.title}</div>
            {e && <div className="text-sm text-white/80">{longDate(e.startsAt)} · {time(e.startsAt)}</div>}
          </div>
        </Poster>
        <div className="grid place-items-center px-6 pb-4 pt-6">
          <QR value={`TOBE:${t.code}`} size={220} />
          <div className="mt-3 font-mono text-lg font-bold tracking-[0.25em]">{t.code}</div>
          {t.scannedCount > 0 && <div className="mt-1 text-sm font-semibold text-emerald-600">{t.scannedCount}/{t.qty} entrée(s) validée(s)</div>}
        </div>
        <div className="relative flex items-center">
          <span className="absolute -left-3 size-6 rounded-full bg-[var(--bg)]" />
          <div className="mx-5 w-full border-t-2 border-dashed border-black/10" />
          <span className="absolute -right-3 size-6 rounded-full bg-[var(--bg)]" />
        </div>
        <div className="grid grid-cols-2 gap-4 px-6 py-5 text-sm">
          <Info label="Titulaire" value={t.holder ?? "Vous"} />
          <Info label="Billet" value={`${t.qty} × ${t.ticketTypeName}`} />
          <Info label="Lieu" value={e?.venue ?? ""} />
          <Info label="Payé" value={t.total ? `${formatFcfa(t.total)} · ${PAY_METHOD_LABELS[t.method]}` : "Gratuit"} />
        </div>
      </div>
      {e && (
        <div className="mx-5 mt-4 grid grid-cols-2 gap-3">
          <a className="flex h-12 items-center justify-center gap-2 rounded-full border border-line bg-card text-sm font-semibold" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${e.venue}, ${e.city}`)}`} target="_blank" rel="noreferrer">
            <MapPin className="size-4 text-gold" /> Itinéraire
          </a>
          <Link className="flex h-12 items-center justify-center gap-2 rounded-full border border-line bg-card text-sm font-semibold" to={`/evenement/${e.slug}`}>
            Voir l'événement
          </Link>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-black/45">{label}</div>
      <div className="mt-0.5 font-semibold leading-snug">{value}</div>
    </div>
  );
}
