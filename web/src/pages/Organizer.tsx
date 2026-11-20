import type { EventCard, EventView, PayMethod } from "@tobe/core";
import { PRICING, type BoostPlan } from "@tobe/core";
import {
  BarChart3,
  ChevronRight,
  Pencil,
  Camera,
  CheckCircle2,
  Crown,
  Eye,
  HandCoins,
  ImagePlus,
  Keyboard,
  Lock,
  Plus,
  QrCode,
  Radio,
  Rocket,
  ScanLine,
  Share2,
  Sparkles,
  Ticket,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { eventPath } from "../components/events";
import { EventTeam } from "../components/TeamInvite";
import { PayPicker } from "../components/pay";
import { Button, Card, Empty, ErrorState, Field, PageLoader, Progress, Sheet, Stat, TopBar, cx, inputCls } from "../components/ui";
import { Poster, TierBadge } from "../components/visual";
import { api, uploadImage } from "../lib/api";
import { faceDescriptors, loadFaceApi } from "../lib/face";
import { compact, formatFcfa, shareUrl, shortDate, whatsappLink } from "../lib/format";
import { resizeImage } from "../lib/media";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

interface Row {
  event: EventCard;
  upcoming: boolean;
  views: number;
  sold: number;
  capacity: number;
  ticketRevenue: number;
  scanned: number;
  votes: number;
  voteRevenue: number;
  cagnotte: { collected: number; goal: number; net: number } | null;
  photos: number;
  salesByDay: { day: string; qty: number }[];
  tobeRequest: string | null;
  contestId: string | null;
  cagnotteId: string | null;
  accessCode: string | null;
  myRole: "owner" | "staff" | "co_organisateur" | "controleur" | "photographe" | null;
  access: { edit: boolean; scan: boolean; photos: boolean; stats: boolean; members: boolean; delete: boolean };
}

const ROLE_LABELS: Record<string, string> = { staff: "Équipe ToBe", co_organisateur: "Co-organisateur", controleur: "Contrôleur d'entrée", photographe: "Photographe" };
interface Dashboard {
  events: Row[];
  totals: { sold: number; revenue: number; views: number; votes: number };
  pro: boolean;
}

const TOBE_STATUS: Record<string, string> = { nouveau: "Demande envoyée", contacte: "Conseiller en contact", devis: "Devis envoyé", signe: "Organisation confirmée", perdu: "Demande close" };

export function Organizer() {
  const { me, ready, requireAuth, payments } = useSession();
  const { data, error, loading, reload } = useLoad(async () => (me ? api<Dashboard>("GET", "/organizer") : null), [me?.user.id]);
  if (!ready) return <PageLoader />;
  if (!me)
    return (
      <>
        <TopBar title="Espace organisateur" />
        <Empty icon={<BarChart3 className="size-7" />} title="Gérez vos événements" text="Ventes en direct, scan des billets, votes, cagnotte et galerie photo." action={<Button onClick={() => requireAuth()}>Se connecter</Button>} />
      </>
    );
  return (
    <div className="pb-8">
      <TopBar title="Espace organisateur" right={<Link to="/creer" aria-label="Créer" className="grid size-10 place-items-center rounded-full brand-gradient text-white"><Plus className="size-5" /></Link>} />
      {loading && <PageLoader />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && (
        <>
          {(data.events.length === 0 || data.events.some((r) => r.myRole === "owner")) && <div className="grid grid-cols-2 gap-3 px-5 pt-4 lg:grid-cols-4 lg:px-0">
            <Stat label="Recettes nettes" value={formatFcfa(data.totals.revenue)} />
            <Stat label="Billets" value={compact(data.totals.sold)} />
            <Stat label="Vues" value={compact(data.totals.views)} />
            <Stat label="Votes" value={compact(data.totals.votes)} />
          </div>}
          {data.events.length === 0 ? (
            <Empty icon={<Sparkles className="size-7" />} title="Aucun événement" text="Publiez votre premier événement en 2 minutes." action={<Link to="/creer"><Button>Créer un événement</Button></Link>} />
          ) : (
            <div className="space-y-3 px-5 pt-6 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0 lg:px-0">
              {(["mine", "team"] as const).map((group) => {
                const list = data.events.filter((r) => (group === "mine" ? r.myRole === "owner" : r.myRole !== "owner"));
                if (!list.length) return null;
                return (
                  <div key={group} className="contents">
              <h2 className="pt-2 text-lg font-bold lg:col-span-2">{group === "mine" ? "Mes événements" : "Mes missions d'équipe"}</h2>
              {list.map((r) => (
                <Link key={r.event.id} to={`/organisateur/${r.event.id}`} className="block rounded-[20px] border border-line bg-card p-3">
                  <div className="flex items-center gap-3">
                    <Poster cover={r.event.cover} theme={r.event.theme} category={r.event.category} className="size-16 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <TierBadge tier={r.event.impact.tier} className="h-5 px-2 text-[10px]" />
                        {!r.upcoming && <span className="text-xs text-faint">Terminé</span>}
                        {r.event.visibility === "private" && <Lock className="size-3.5 text-faint" />}
                      </div>
                      <div className="mt-1 truncate font-display font-bold">{r.event.title}</div>
                      <div className="text-xs text-muted">{shortDate(r.event.startsAt)}</div>
                    </div>
                  </div>
                  {r.myRole !== "owner" && (
                    <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand dark:bg-brand/20 dark:text-white">
                      {ROLE_LABELS[r.myRole ?? ""] ?? "Équipe"}
                    </div>
                  )}
                  {r.access.stats && <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-card-2 py-2">
                      <div className="font-display text-base font-bold">{compact(r.sold)}</div>
                      <div className="text-muted">billets</div>
                    </div>
                    <div className="rounded-xl bg-card-2 py-2">
                      <div className="font-display text-base font-bold">{compact(r.ticketRevenue + r.voteRevenue + (r.cagnotte?.net ?? 0))}</div>
                      <div className="text-muted">FCFA</div>
                    </div>
                    <div className="rounded-xl bg-card-2 py-2">
                      <div className="font-display text-base font-bold">{compact(r.views)}</div>
                      <div className="text-muted">vues</div>
                    </div>
                  </div>}
                </Link>
              ))}
                  </div>
                );
              })}
            </div>
          )}
          {!data.pro && payments && <ProCard onDone={reload} />}
        </>
      )}
    </div>
  );
}

function ProCard({ onDone }: { onDone: () => void }) {
  const { toast, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-5 mt-6 rounded-[22px] border border-brand/30 bg-gradient-to-br from-brand/10 to-transparent p-5">
      <div className="flex items-center gap-2 font-display text-lg font-bold">
        <Crown className="size-5 text-brand" /> Organisateur Pro
      </div>
      <p className="mt-1 text-sm text-muted">Badge vérifié, frais billetterie réduits à 4 % pour vos participants, statistiques détaillées.</p>
      <Button
        className="mt-4"
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api("POST", "/me/subscribe", { plan: "pro", method: "mixx" });
            await refresh();
            onDone();
            toast("Abonnement Pro activé");
          } catch (e) {
            toast((e as Error).message, "error");
          }
          setBusy(false);
        }}
      >
        Passer Pro · {formatFcfa(PRICING.proMonthly)}/mois
      </Button>
    </div>
  );
}

export function OrganizerEvent() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { me, toast, payments } = useSession();
  const { data: dash, reload } = useLoad(async () => (me ? api<Dashboard>("GET", "/organizer") : null), [me?.user.id]);
  const { data: ev, error, setData: setEv } = useLoad(() => api<EventView>("GET", `/events/${id}`), [id, me?.user.id]);
  const [boostOpen, setBoostOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const r = dash?.events.find((x) => x.event.id === id || x.event.slug === id);
  const { data: game, reload: reloadGame } = useLoad(async () => (me ? api<{ me: { boostCredits: number } | null }>("GET", "/game") : null), [me?.user.id]);
  const credits = game?.me?.boostCredits ?? 0;
  const [usingCredit, setUsingCredit] = useState(false);

  if (error) return (<><TopBar title="Gérer" /><ErrorState message={error.message} /></>);
  if (!me) return (<><TopBar title="Gérer" /><ErrorState message="Connectez-vous pour gérer cet événement." /></>);
  if (!ev || !dash) return <PageLoader />;
  if (!r || !r.myRole) return (<><TopBar title="Gérer" /><ErrorState message="Vous ne faites pas partie de l'équipe de cet événement." /></>);
  const acc = r.access;

  const url = shareUrl(eventPath(ev)) + (ev.accessCode ? `?code=${ev.accessCode}` : "");
  const maxDay = Math.max(1, ...r.salesByDay.map((d) => d.qty));
  const fill = r.capacity ? (r.sold / r.capacity) * 100 : 0;

  return (
    <div className="pb-10">
      <TopBar title="Gérer l'événement" />
      <div className="px-5 pt-3">
        <Link to={eventPath(ev)} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-2.5">
          <Poster cover={ev.cover} theme={ev.theme} category={ev.category} className="size-14 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display font-bold">{ev.title}</div>
            <div className="text-sm text-muted">{shortDate(ev.startsAt)}</div>
          </div>
          <TierBadge tier={ev.impact.tier} />
        </Link>
        {acc.edit && (
          <Link to={`/organisateur/${ev.id}/modifier`} className="mt-3 flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand-soft/60 p-3.5 dark:bg-brand/15">
            <span className="grid size-10 place-items-center rounded-xl brand-gradient text-white">
              <Pencil className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Modifier l'événement</span>
              <span className="block text-xs text-muted">Nom, description, prix, date, lieu, affiche…</span>
            </span>
            <ChevronRight className="size-5 text-brand" />
          </Link>
        )}

        {r.myRole !== "owner" && (
          <div className="mt-3 rounded-2xl border border-brand/30 bg-brand-soft/60 p-3.5 text-sm dark:bg-brand/15">
            Vous êtes <b>{(ROLE_LABELS[r.myRole] ?? "membre").toLowerCase()}</b> pour cet événement.
            {r.myRole === "controleur" && " Ouvrez le scanner à l'entrée : chaque billet ne passe qu'une fois."}
            {r.myRole === "photographe" && " Déposez vos photos : les personnes reconnues sont prévenues automatiquement."}
          </div>
        )}

        {acc.stats && <>{ev.access === "none" ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Vues" value={compact(r.views)} sub={`Score d'impact ${ev.impact.score}/100`} />
            <Stat label="Rappels activés" value={compact(ev.followers ?? 0)} sub="personnes intéressées" />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat label="Billets vendus" value={compact(r.sold)} sub={r.capacity ? `sur ${compact(r.capacity)}` : undefined} />
          <Stat label={payments ? "Recettes billets" : "Billets à encaisser"} value={formatFcfa(r.ticketRevenue)} sub={payments ? "versées après l'événement" : "payés à l'entrée"} />
          <Stat label="Entrées scannées" value={`${r.scanned}/${r.sold}`} />
          <Stat label="Vues" value={compact(r.views)} sub={`Score d'impact ${ev.impact.score}/100`} />
        </div>)}
        {r.capacity > 0 && (
          <div className="mt-3">
            <Progress value={fill} />
            <div className="mt-1 text-xs text-muted">{Math.round(fill)} % de remplissage</div>
          </div>
        )}
        {r.salesByDay.length > 0 && (
          <Card className="mt-4 p-4">
            <div className="mb-3 text-sm font-semibold">Ventes par jour</div>
            <div className="flex h-24 items-end gap-1.5">
              {r.salesByDay.slice(-14).map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t-md brand-gradient" style={{ height: `${(d.qty / maxDay) * 80 + 4}px` }} title={`${d.qty} billets`} />
                  <span className="text-[9px] text-faint">{d.day.slice(8)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}</>}

        <h2 className="mb-3 mt-6 text-base font-bold">Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {acc.scan && ev.access !== "none" && <Action icon={<ScanLine />} label="Scanner les billets" sub={r.scanned ? `${r.scanned} entrée(s)` : undefined} onClick={() => nav(`/scanner?event=${ev.id}`)} />}
          {acc.photos && <Action icon={<ImagePlus />} label="Déposer les photos" sub={`${r.photos} en ligne`} onClick={() => setPhotosOpen(true)} />}
          {acc.edit && credits > 0 && (
            <Action
              icon={<Rocket />}
              label={usingCredit ? "Activation…" : "Boost offert"}
              sub={`${credits} crédit${credits > 1 ? "s" : ""} du Club · 3 jours`}
              onClick={async () => {
                if (usingCredit) return;
                setUsingCredit(true);
                try {
                  const b = await api<{ boostedUntil: string }>("POST", `/events/${ev.id}/boost-credit`);
                  setEv({ ...ev, boostedUntil: b.boostedUntil });
                  toast("Boost offert activé : 3 jours en tête des listes");
                  reloadGame();
                } catch (e) {
                  toast((e as Error).message, "error");
                }
                setUsingCredit(false);
              }}
            />
          )}
          {acc.edit && payments && <Action icon={<Rocket />} label="Booster" sub={ev.boostedUntil && new Date(ev.boostedUntil) > new Date() ? "Boost actif" : "Passer en tête"} onClick={() => setBoostOpen(true)} />}
          <Action icon={<Share2 />} label="Partager" sub="WhatsApp" onClick={() => window.open(whatsappLink(`${ev.title} — ${shortDate(ev.startsAt)}, ${ev.venue}. Sur ToBe : ${url}`), "_blank")} />
          {acc.edit && <Action icon={<Radio />} label="Direct vidéo" sub={ev.liveUrl ? "Lien ajouté" : "Ajouter le lien"} onClick={() => setLiveOpen(true)} />}
          <Action icon={<Eye />} label="Voir la page" onClick={() => nav(eventPath(ev))} />
        </div>

        {ev.accessCode && (
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-line bg-card p-4">
            <div>
              <div className="text-xs text-muted">Code d'accès des invités</div>
              <div className="font-mono text-xl font-bold tracking-widest">{ev.accessCode}</div>
            </div>
            <Lock className="size-5 text-brand" />
          </div>
        )}
        {r.contestId && (
          <Link to={`/vote/${r.contestId}`} className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-card p-4">
            <Crown className="size-5 text-brand" />
            <span className="flex-1">
              <span className="block font-semibold">Votes : {compact(r.votes)}</span>
              <span className="text-xs text-muted">Recettes nettes {formatFcfa(r.voteRevenue)}</span>
            </span>
          </Link>
        )}
        {r.contestId && acc.edit && <ContestAdmin contestId={r.contestId} />}
        {r.cagnotte && r.cagnotteId && (
          <Link to={`/cagnotte/${r.cagnotteId}`} className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-card p-4">
            <HandCoins className="size-5 text-brand" />
            <span className="flex-1">
              <span className="block font-semibold">Cagnotte : {formatFcfa(r.cagnotte.collected)}</span>
              <span className="text-xs text-muted">Net reversé {formatFcfa(r.cagnotte.net)}</span>
            </span>
          </Link>
        )}
        {r.tobeRequest && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-brand/40 bg-brand/10 p-4">
            <Sparkles className="size-5 text-brand" />
            <span className="flex-1 text-sm">
              <b>Agence ToBe :</b> {TOBE_STATUS[r.tobeRequest] ?? r.tobeRequest}
            </span>
          </div>
        )}
        <EventTeam eventId={ev.id} />
        {acc.delete && r.sold === 0 && (
          <Button
            full
            variant="danger"
            className="mt-6"
            icon={<Trash2 className="size-4" />}
            onClick={async () => {
              if (!confirm("Supprimer cet événement ?")) return;
              try {
                await api("DELETE", `/events/${ev.id}`);
                toast("Événement supprimé");
                nav("/organisateur", { replace: true });
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
          >
            Supprimer l'événement
          </Button>
        )}
      </div>

      <BoostSheet open={boostOpen} onClose={() => setBoostOpen(false)} eventId={ev.id} onDone={(until) => (setEv({ ...ev, boostedUntil: until }), reload())} />
      <PhotoUploadSheet open={photosOpen} onClose={() => setPhotosOpen(false)} eventId={ev.id} onDone={reload} />
      <LiveSheet open={liveOpen} onClose={() => setLiveOpen(false)} ev={ev} onDone={setEv} />
    </div>
  );
}

function Action({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-start gap-2 rounded-2xl border border-line bg-card p-4 text-left transition active:scale-[0.98]">
      <span className="text-brand [&>svg]:size-6">{icon}</span>
      <span className="text-sm font-semibold leading-tight">{label}</span>
      {sub && <span className="-mt-1 text-xs text-muted">{sub}</span>}
    </button>
  );
}

function ContestAdmin({ contestId }: { contestId: string }) {
  const { toast } = useSession();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("POST", `/contests/${contestId}/candidates`, { name });
          toast("Candidat ajouté");
          setName("");
        } catch (err) {
          toast((err as Error).message, "error");
        }
        setBusy(false);
      }}
    >
      <input className={`${inputCls} flex-1`} placeholder="Ajouter un candidat" value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" variant="dark" loading={busy} disabled={name.trim().length < 2}>
        Ajouter
      </Button>
    </form>
  );
}

function BoostSheet({ open, onClose, eventId, onDone }: { open: boolean; onClose: () => void; eventId: string; onDone: (until: string) => void }) {
  const [plan, setPlan] = useState<BoostPlan>("weekend");
  const [method, setMethod] = useState<PayMethod>("mixx");
  const [busy, setBusy] = useState(false);
  const { toast } = useSession();
  return (
    <Sheet open={open} onClose={onClose} title="Booster la visibilité">
      <div className="space-y-4">
        {(Object.entries(PRICING.boosts) as [BoostPlan, (typeof PRICING.boosts)[BoostPlan]][]).map(([k, b]) => (
          <button key={k} onClick={() => setPlan(k)} className={cx("flex w-full items-center justify-between rounded-2xl border p-4 text-left", plan === k ? "border-brand bg-brand/10" : "border-line bg-card")}>
            <span className="font-semibold">{b.label}</span>
            <span className="font-display font-bold text-brand">{formatFcfa(b.price)}</span>
          </button>
        ))}
        <PayPicker value={method} onChange={setMethod} />
        <Button
          full
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api<{ boostedUntil: string }>("POST", `/events/${eventId}/boost`, { plan, method });
              onDone(r.boostedUntil);
              toast("Boost activé : votre événement passe en tête");
              onClose();
            } catch (e) {
              toast((e as Error).message, "error");
            }
            setBusy(false);
          }}
        >
          Payer {formatFcfa(PRICING.boosts[plan].price)}
        </Button>
      </div>
    </Sheet>
  );
}

function LiveSheet({ open, onClose, ev, onDone }: { open: boolean; onClose: () => void; ev: EventView; onDone: (e: EventView) => void }) {
  const [url, setUrl] = useState(ev.liveUrl ?? "");
  const { toast } = useSession();
  return (
    <Sheet open={open} onClose={onClose} title="Direct vidéo">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            onDone(await api<EventView>("PATCH", `/events/${ev.id}`, { liveUrl: url || null, options: { ...ev.options, live: !!url || ev.options.live } }));
            toast("Lien du direct enregistré");
            onClose();
          } catch (err) {
            toast((err as Error).message, "error");
          }
        }}
      >
        <Field label="Lien du direct" hint="YouTube Live, Facebook Live… Il s'affiche sur la page de l'événement.">
          <input className={inputCls} placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <Button full type="submit">
          Enregistrer
        </Button>
      </form>
    </Sheet>
  );
}

function PhotoUploadSheet({ open, onClose, eventId, onDone }: { open: boolean; onClose: () => void; eventId: string; onDone: () => void }) {
  const { toast } = useSession();
  const [progress, setProgress] = useState<{ done: number; total: number; faces: number } | null>(null);
  const [result, setResult] = useState<{ added: number; notified: number; faces: number } | null>(null);
  const [stage, setStage] = useState("");

  const run = async (files: FileList | null) => {
    if (!files?.length) return;
    setResult(null);
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    setProgress({ done: 0, total: list.length, faces: 0 });
    setStage("Préparation de la reconnaissance faciale…");
    try {
      await loadFaceApi();
      const batch: { url: string; width: number; height: number; faces: number[][] }[] = [];
      let faces = 0;
      let added = 0;
      let notified = 0;
      for (let i = 0; i < list.length; i++) {
        setStage(`Analyse des visages et envoi (${i + 1}/${list.length})…`);
        const { blob, width, height, canvas } = await resizeImage(list[i], 1600, 0.86);
        const desc = await faceDescriptors(canvas);
        faces += desc.length;
        const url = await uploadImage(blob, list[i].name);
        batch.push({ url, width, height, faces: desc });
        setProgress({ done: i + 1, total: list.length, faces });
        if (batch.length === 10 || i === list.length - 1) {
          const r = await api<{ added: number; notified: number }>("POST", `/events/${eventId}/photos`, { photos: batch.splice(0) });
          added += r.added;
          notified += r.notified;
        }
      }
      setResult({ added, notified, faces });
      onDone();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setProgress(null);
    setStage("");
  };

  return (
    <Sheet open={open} onClose={() => !progress && onClose()} title="Déposer les photos">
      <div className="space-y-4">
        <p className="text-sm text-muted">Les visages sont détectés sur votre appareil. Chaque participant qui a activé son Pass ToBe est prévenu automatiquement.</p>
        {!progress && (
          <label className="flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-brand/40 bg-brand/5 text-center">
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => run(e.target.files)} />
            <Camera className="size-8 text-brand" />
            <span className="font-semibold">Choisir les photos</span>
            <span className="text-xs text-muted">JPEG ou PNG, autant que vous voulez</span>
          </label>
        )}
        {progress && (
          <div className="rounded-2xl border border-line bg-card p-4">
            <div className="text-sm font-semibold">{stage}</div>
            <Progress value={(progress.done / progress.total) * 100} className="mt-3" />
            <div className="mt-2 text-xs text-muted">
              {progress.done}/{progress.total} photos · {progress.faces} visages détectés
            </div>
          </div>
        )}
        {result && (
          <div className="pop rounded-2xl border border-emerald/30 bg-emerald/10 p-4 text-sm">
            <CheckCircle2 className="mb-2 size-6 text-emerald" />
            <b>{result.added} photos publiées</b>, {result.faces} visages détectés.
            <br />
            {result.notified > 0 ? `${result.notified} participant(s) prévenu(s) qu'ils apparaissent dans la galerie.` : "Les participants avec un Pass ToBe seront prévenus dès qu'ils sont reconnus."}
          </div>
        )}
      </div>
    </Sheet>
  );
}

type ScanResult = { ok: true; holder: string; remaining: number; eventTitle: string; amountDue: number; order: { ticketTypeName: string; qty: number } } | { ok: false; reason: string };

export function Scanner() {
  const [sp] = useSearchParams();
  const eventId = sp.get("event") ?? undefined;
  const video = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [camError, setCamError] = useState("");
  const [count, setCount] = useState(0);
  const lock = useRef(false);
  const { me, ready, requireAuth } = useSession();

  const check = async (raw: string) => {
    if (lock.current) return;
    lock.current = true;
    try {
      const r = await api<ScanResult>("POST", "/tickets/scan", { code: raw, eventId });
      setResult(r);
      if (r.ok) setCount((c) => c + 1);
      navigator.vibrate?.(r.ok ? 80 : [60, 60, 60]);
    } catch (e) {
      setResult({ ok: false, reason: (e as Error).message });
    }
    setTimeout(() => (lock.current = false), 1800);
  };

  useEffect(() => {
    if (!ready) return;
    if (!me) {
      requireAuth("Connectez-vous avec le compte organisateur.");
      return;
    }
    if (mode !== "camera") return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    const Detector = (window as unknown as { BarcodeDetector?: new (o: object) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    (async () => {
      if (!Detector) {
        setCamError("Le scan par caméra n'est pas pris en charge par ce navigateur : saisissez le code du billet.");
        setMode("manual");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        const det = new Detector({ formats: ["qr_code"] });
        timer = window.setInterval(async () => {
          if (!video.current || lock.current) return;
          const codes = await det.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) check(codes[0].rawValue);
        }, 350);
      } catch {
        setCamError("Caméra indisponible : saisissez le code du billet.");
        setMode("manual");
      }
    })();
    return () => {
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, me?.user.id, ready]);

  return (
    <div className="min-h-full pb-10">
      <TopBar title="Scanner les billets" right={<span className="rounded-full bg-emerald/15 px-3 py-1 text-sm font-bold text-emerald">{count} entrée{count > 1 ? "s" : ""}</span>} />
      <div className="px-5 pt-4">
        {mode === "camera" ? (
          <div className="relative aspect-square overflow-hidden rounded-[28px] bg-black">
            <video ref={video} playsInline muted className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-[16%] rounded-3xl border-[3px] border-brand shadow-[0_0_0_999px_rgba(0,0,0,0.5)]" />
            <div className="scanline pointer-events-none absolute inset-x-[18%] h-0.5 bg-brand shadow-[0_0_14px_#1800ad]" />
            <QrCode className="absolute bottom-4 left-1/2 size-6 -translate-x-1/2 text-white/60" />
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              check(code);
              setCode("");
            }}
          >
            {camError && <p className="text-sm text-muted">{camError}</p>}
            <input autoFocus className={`${inputCls} text-center font-mono text-xl uppercase tracking-[0.25em]`} placeholder="CODE DU BILLET" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <Button full type="submit" disabled={code.trim().length < 6} icon={<Ticket className="size-5" />}>
              Valider l'entrée
            </Button>
          </form>
        )}
        <button onClick={() => setMode(mode === "camera" ? "manual" : "camera")} className="mt-3 flex w-full items-center justify-center gap-2 text-sm font-semibold text-muted">
          {mode === "camera" ? <Keyboard className="size-4" /> : <ScanLine className="size-4" />}
          {mode === "camera" ? "Saisir le code à la main" : "Utiliser la caméra"}
        </button>

        {result && (
          <div className={cx("pop mt-5 rounded-[24px] p-5", result.ok ? "bg-emerald text-white" : "bg-coral text-white")}>
            {result.ok ? <CheckCircle2 className="size-10" /> : <XCircle className="size-10" />}
            <div className="mt-2 font-display text-2xl font-extrabold">{result.ok ? "Entrée validée" : "Refusé"}</div>
            {result.ok ? (
              <div className="mt-1 text-white/90">
                {result.holder} · {result.order.qty} × {result.order.ticketTypeName}
                {result.amountDue > 0 && <div className="mt-2 rounded-xl bg-white/20 px-3 py-2 text-lg font-bold">À encaisser : {formatFcfa(result.amountDue)}</div>}
                {result.remaining > 0 && <div className="font-semibold">Encore {result.remaining} entrée(s) sur ce billet</div>}
              </div>
            ) : (
              <div className="mt-1 text-white/90">{result.reason}</div>
            )}
          </div>
        )}
        <div className="mt-6 flex items-center gap-2 rounded-2xl bg-card p-4 text-xs text-muted">
          <Wallet className="size-4 shrink-0 text-brand" /> Chaque billet ne peut être validé qu'autant de fois qu'il compte de places.
        </div>
      </div>
    </div>
  );
}
