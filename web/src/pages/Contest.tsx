import type { CandidateView, ContestView, PayMethod } from "@tobe/core";
import { PRICING } from "@tobe/core";
import { BadgeCheck, Crown, Gift, Search, Share2, ShieldCheck, Timer, Trophy } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PayPicker } from "../components/pay";
import { Button, ErrorState, IconButton, PageLoader, Sheet, TopBar, cx, inputCls } from "../components/ui";
import { Avatar, Img, Poster, TrophyMark } from "../components/visual";
import { api } from "../lib/api";
import { compact, countdown, formatFcfa, longDate, shareUrl, time, whatsappLink } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";
import { usePageMeta } from "../lib/seo";

function modeLabel(c: ContestView) {
  return c.mode === "free" ? "1 vote gratuit par jour" : c.mode === "paid" ? `Vote payant · ${formatFcfa(c.votePrice)}` : `1 vote gratuit par jour`;
}

export function ContestPage() {
  const { id = "" } = useParams();
  const { me } = useSession();
  const { data: c, error, loading, reload } = useLoad(() => api<ContestView>("GET", `/contests/${id}`), [id, me?.user.id]);
  usePageMeta(c ? { title: `Vote : ${c.title}`, description: `${c.eventTitle} — ${c.candidates.length} candidats. Votez sur ToBe.` } : null);
  const [q, setQ] = useState("");
  if (loading && !c) return <PageLoader />;
  if (error || !c)
    return (
      <>
        <TopBar title="Vote" />
        <ErrorState message={error?.message ?? "Introuvable"} onRetry={reload} />
      </>
    );
  const list = c.candidates.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()) || String(x.number) === q.trim());
  const podium = c.candidates.filter((x) => x.rank && x.rank <= 3).sort((a, b) => a.rank! - b.rank!);
  return (
    <div className="pb-10">
      <TopBar title="Vote" right={<Link to={`/vote/${c.id}/certificat`} aria-label="Certificat" className="grid size-10 place-items-center rounded-full text-brand"><ShieldCheck className="size-5" /></Link>} />
      <div className="relative mx-5 mt-3 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#07003a] via-[#12007a] to-[#1800ad] p-5 text-white lg:mx-0 lg:p-8">
        <div className="absolute -right-10 -top-10 size-44 rounded-full bg-violet/40 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#cfc9ff]">
            <Crown className="size-4" /> {modeLabel(c)}
          </div>
          <h1 className="mt-2 text-[23px] font-extrabold leading-tight">{c.title}</h1>
          <div className="mt-3 flex items-center gap-4 text-sm text-white/75">
            <span className="flex items-center gap-1.5">
              <Timer className="size-4" /> {c.isOpen ? `Fin dans ${countdown(c.closesAt)}` : "Clôturé"}
            </span>
            {c.totalVotes !== null && <span className="font-semibold text-white">{compact(c.totalVotes)} votes</span>}
          </div>
          {c.juryWeight > 0 && <div className="mt-2 text-xs text-white/60">Résultat final : {100 - c.juryWeight} % public, {c.juryWeight} % jury</div>}
          {c.freeVoteAvailable && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald/20 px-3 py-1.5 text-xs font-semibold text-emerald">
              <Gift className="size-3.5" /> Votre vote gratuit du jour est disponible
            </div>
          )}
        </div>
      </div>

      {podium.length === 3 && (
        <div className="mt-6 flex items-end justify-center gap-3 px-5">
          {[podium[1], podium[0], podium[2]].map((x) => (
            <Link key={x.id} to={`/vote/${c.id}/candidat/${x.id}`} className="flex w-[30%] flex-col items-center">
              <Avatar name={x.name} src={x.photo} size={x.rank === 1 ? 78 : 62} ring={x.rank === 1} />
              <div className="mt-2 line-clamp-1 text-center text-sm font-semibold">{x.name.split(" ")[0]}</div>
              <div className="text-xs font-semibold text-brand">{compact(x.votes ?? 0)}</div>
              <div className={cx("mt-2 grid w-full place-items-center rounded-t-2xl bg-card", x.rank === 1 ? "h-20" : x.rank === 2 ? "h-14" : "h-10")}>
                <TrophyMark rank={x.rank!} />
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="relative mx-5 mt-6 lg:mx-0 lg:max-w-md">
        <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint" />
        <input className={`${inputCls} pl-12`} placeholder="Nom ou numéro du candidat" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 px-5 lg:grid-cols-4 lg:gap-5 lg:px-0">
        {list.map((x) => (
          <CandidateTile key={x.id} contestId={c.id} x={x} />
        ))}
      </div>
    </div>
  );
}

function CandidateTile({ contestId, x }: { contestId: string; x: CandidateView }) {
  return (
    <Link to={`/vote/${contestId}/candidat/${x.id}`} className="overflow-hidden rounded-[20px] border border-line bg-card">
      <div className="relative aspect-[4/5]">
        {x.photo ? (
          <Img src={x.photo} alt={x.name} className="absolute inset-0 size-full object-cover" />
        ) : (
          <Poster cover={null} theme={(["violet", "corail", "or", "nuit"] as const)[x.number % 4]} category="concours" className="absolute inset-0 grid place-items-center">
            <Avatar name={x.name} size={84} />
          </Poster>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
        <span className="absolute left-2.5 top-2.5 grid h-7 min-w-7 place-items-center rounded-full bg-black/55 px-2 font-display text-sm font-bold text-white backdrop-blur">{x.number}</span>
        {x.rank && x.rank <= 3 && (
          <span className="absolute right-2.5 top-2.5 grid size-7 place-items-center rounded-full bg-black/55 backdrop-blur">
            <TrophyMark rank={x.rank} />
          </span>
        )}
        <div className="absolute inset-x-3 bottom-2.5 text-white">
          <div className="line-clamp-1 font-display font-bold">{x.name}</div>
          <div className="text-xs font-semibold text-[#d9d4ff]">{x.votes !== null ? `${compact(x.votes)} votes` : "Votes masqués"}</div>
        </div>
      </div>
      <div className="p-2.5">
        <div className="flex h-9 items-center justify-center gap-1.5 rounded-full brand-gradient text-sm font-bold text-white">
          <Crown className="size-4" /> Voter
        </div>
      </div>
    </Link>
  );
}

export function CandidatePage() {
  const { id = "", cid = "" } = useParams();
  const { me, requireAuth, toast, refresh, payments } = useSession();
  const { data: c, error, loading, setData } = useLoad(() => api<ContestView>("GET", `/contests/${id}`), [id, me?.user.id]);
  const [pack, setPack] = useState<"1" | "10" | "50" | null>(null);
  const [method, setMethod] = useState<PayMethod>("mixx");
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(0);
  if (loading && !c) return <PageLoader />;
  const x = c?.candidates.find((k) => k.id === cid);
  if (error || !c || !x)
    return (
      <>
        <TopBar title="Candidat" />
        <ErrorState message={error?.message ?? "Candidat introuvable"} />
      </>
    );

  const vote = async (p: "free" | "1" | "10" | "50") => {
    if (!(await requireAuth("Connectez-vous pour voter : un compte par numéro garantit un vote honnête."))) return;
    setBusy(true);
    try {
      const r = await api<{ contest: ContestView; vote: { count: number } }>("POST", `/contests/${c.id}/vote`, { candidateId: x.id, pack: p, method: p === "free" ? undefined : method });
      setData(r.contest);
      setPack(null);
      setThanks(r.vote.count);
      refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };

  const url = shareUrl(`/vote/${c.id}/candidat/${x.id}`);
  const share = async () => {
    const text = `Votez pour ${x.name} (n° ${x.number}) — ${c.title} sur ToBe 👑`;
    if (navigator.share) {
      try {
        return await navigator.share({ title: text, text, url });
      } catch {
        /* annulé */
      }
    }
    window.open(whatsappLink(`${text} ${url}`), "_blank");
  };

  return (
    <div className="pb-36 lg:mx-auto lg:max-w-xl">
      <div className="relative">
        <div className="relative aspect-[4/4.6] w-full overflow-hidden">
          {x.photo ? (
            <Img src={x.photo} alt={x.name} className="absolute inset-0 size-full object-cover" />
          ) : (
            <Poster cover={null} theme="violet" category="concours" className="absolute inset-0 grid place-items-center">
              <Avatar name={x.name} size={150} />
            </Poster>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-black/40" />
        </div>
        <div className="absolute inset-x-0 top-0">
          <TopBar transparent right={<IconButton label="Partager" onClick={share}><Share2 className="size-5" /></IconButton>} />
        </div>
      </div>
      <div className="relative -mt-20 px-5">
        <span className="inline-flex h-8 items-center rounded-full bg-brand px-3 font-display text-sm font-bold text-white">N° {x.number}</span>
        <h1 className="mt-2 text-[30px] font-extrabold leading-tight">{x.name}</h1>
        <p className="mt-1 text-muted">{x.bio}</p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <MiniStat label="Rang" value={x.rank ? `${x.rank}${x.rank === 1 ? "er" : "e"}` : "—"} />
          <MiniStat label="Votes" value={x.votes !== null ? compact(x.votes) : "—"} />
          <MiniStat label="Clôture" value={c.isOpen ? countdown(c.closesAt) : "Terminé"} />
        </div>

        {thanks > 0 && (
          <div className="pop mt-5 flex items-center gap-3 rounded-2xl border border-brand/40 bg-brand/10 p-4">
            <Trophy className="size-6 text-brand" />
            <div className="text-sm">
              <b>
                Merci ! {thanks} vote{thanks > 1 ? "s" : ""} pour {x.name.split(" ")[0]}.
              </b>
              <div className="text-muted">Partagez sa page pour l'aider à gagner.</div>
            </div>
          </div>
        )}

        {c.isOpen && c.mode !== "free" && payments && (
          <div className="mt-6">
            <h2 className="mb-3 text-base font-bold">Soutenir avec un pack</h2>
            <div className="grid grid-cols-3 gap-2">
              {PRICING.votePacks.map((p) => (
                <button key={p.id} onClick={() => setPack(p.id as "1" | "10" | "50")} className={cx("rounded-2xl border p-3 text-center transition", p.id === "10" ? "border-brand bg-brand/10" : "border-line bg-card")}>
                  <div className="font-display text-2xl font-extrabold">{p.votes}</div>
                  <div className="text-xs text-muted">vote{p.votes > 1 ? "s" : ""}</div>
                  <div className="mt-1.5 text-sm font-bold text-brand">{formatFcfa(c.votePrice * p.factor)}</div>
                  {p.factor < p.votes && <div className="mt-1 text-[10px] font-bold uppercase text-emerald">-{Math.round((1 - p.factor / p.votes) * 100)} %</div>}
                </button>
              ))}
            </div>
          </div>
        )}
        <Link to={`/vote/${c.id}/certificat`} className="mt-5 flex items-center gap-2 text-sm text-muted">
          <BadgeCheck className="size-4 text-emerald" /> Vote transparent : un compte par numéro, certificat public à la clôture.
        </Link>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 space-y-2 border-t border-line bg-app/95 lg:static lg:mt-8 lg:rounded-3xl lg:border lg:bg-card-2 lg:p-4 px-5 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 backdrop-blur-xl">
        {!c.isOpen ? (
          <Button full size="lg" variant="dark" disabled>
            Vote clôturé
          </Button>
        ) : c.mode === "paid" && !payments ? (
          <Button full size="lg" variant="dark" disabled>
            Votes payants bientôt disponibles
          </Button>
        ) : c.mode === "paid" ? (
          <Button full size="lg" onClick={() => setPack("1")} icon={<Crown className="size-5" />}>
            Voter · {formatFcfa(c.votePrice)}
          </Button>
        ) : (
          <Button full size="lg" loading={busy && !pack} disabled={!!me && !c.freeVoteAvailable} onClick={() => vote("free")} icon={<Gift className="size-5" />}>
            {me && !c.freeVoteAvailable ? "Vote gratuit utilisé, revenez demain" : "Utiliser mon vote gratuit"}
          </Button>
        )}
        <Button full variant="dark" onClick={share} icon={<Share2 className="size-4" />}>
          Partager : « Votez pour moi »
        </Button>
      </div>

      <Sheet open={!!pack} onClose={() => setPack(null)} title="Payer mes votes">
        {pack && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
              <Avatar name={x.name} src={x.photo} size={44} />
              <div className="flex-1">
                <div className="font-semibold">{x.name}</div>
                <div className="text-sm text-muted">
                  {PRICING.votePacks.find((p) => p.id === pack)!.votes} vote(s)
                </div>
              </div>
              <div className="font-display text-lg font-bold text-brand">{formatFcfa(c.votePrice * PRICING.votePacks.find((p) => p.id === pack)!.factor)}</div>
            </div>
            <PayPicker value={method} onChange={setMethod} />
            <Button full loading={busy} onClick={() => vote(pack)}>
              Confirmer le paiement
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3 text-center">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 font-display text-[17px] font-bold">{value}</div>
    </div>
  );
}

interface Certificate {
  title: string;
  eventTitle: string;
  generatedAt: string;
  closesAt: string;
  closed: boolean;
  totalVotes: number;
  recordedVotes: number;
  freeVotes: number;
  paidVotes: number;
  uniqueVoters: number;
  transactions: number;
  fingerprint: string;
  rules: string[];
}

export function CertificatePage() {
  const { id = "" } = useParams();
  const { data, error, loading } = useLoad(() => api<Certificate>("GET", `/contests/${id}/certificate`), [id]);
  if (loading) return <PageLoader />;
  if (error || !data)
    return (
      <>
        <TopBar title="Certificat" />
        <ErrorState message={error?.message ?? "Introuvable"} />
      </>
    );
  return (
    <div className="pb-10">
      <TopBar title="Certificat de transparence" />
      <div className="mx-5 mt-4 rounded-[24px] border border-emerald/30 bg-card p-5">
        <ShieldCheck className="size-9 text-emerald" />
        <h1 className="mt-3 text-xl font-extrabold">{data.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {data.closed ? "Résultats définitifs" : "Certificat provisoire"} · généré le {longDate(data.generatedAt)} à {time(data.generatedAt)}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Cell label="Votes au total" value={data.totalVotes.toLocaleString("fr-FR")} />
          <Cell label="Votants uniques" value={data.uniqueVoters.toLocaleString("fr-FR")} />
          <Cell label="Votes gratuits" value={data.freeVotes.toLocaleString("fr-FR")} />
          <Cell label="Votes payants" value={data.paidVotes.toLocaleString("fr-FR")} />
        </div>
        {data.totalVotes > data.recordedVotes && <p className="mt-3 text-xs text-faint">Dont {(data.totalVotes - data.recordedVotes).toLocaleString("fr-FR")} votes importés au lancement du concours.</p>}
        <div className="mt-5 rounded-2xl bg-card-2 p-4">
          <div className="text-xs text-muted">Empreinte des {data.transactions} transactions enregistrées</div>
          <div className="mt-1 break-all font-mono text-lg font-bold tracking-wider text-brand">{data.fingerprint}</div>
          <p className="mt-1 text-xs text-faint">Cette empreinte change si un seul vote est modifié : elle permet de vérifier que rien n'a été truqué.</p>
        </div>
        <ul className="mt-5 space-y-2 text-sm">
          {data.rules.map((r) => (
            <li key={r} className="flex gap-2">
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald" /> {r}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-faint">Clôture : {longDate(data.closesAt)} à {time(data.closesAt)}</p>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card-2 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 font-display text-xl font-bold">{value}</div>
    </div>
  );
}
