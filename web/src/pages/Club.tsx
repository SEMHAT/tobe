import {
  Award,
  Brain,
  CalendarCheck,
  Check,
  ChevronRight,
  Copy,
  Crown,
  Flame,
  Gem,
  Gift,
  History,
  Lock,
  MessageCircle,
  Music,
  PartyPopper,
  Rocket,
  ScanFace,
  Sparkles,
  Star,
  Ticket,
  Trophy,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, PageLoader, ErrorState, Sheet, cx } from "../components/ui";
import { Avatar } from "../components/visual";
import { api } from "../lib/api";
import { shareUrl, whatsappLink } from "../lib/format";
import { usePageMeta } from "../lib/seo";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

// ---------- Types renvoyés par l'API /game ----------
interface Level {
  index: number;
  name: string;
  icon: string;
  min: number;
  next: { name: string; min: number } | null;
  progress: number;
}
interface Mission {
  id: string;
  title: string;
  hint: string;
  points: number;
  link: string;
  claimed: boolean;
  ready: boolean;
}
interface Reward {
  id: string;
  title: string;
  description: string;
  cost: number;
  kind: "boost" | "premium" | "badge" | "lot";
  stock: number | null;
}
interface Row {
  rank: number;
  userId: string;
  name: string;
  avatar: string | null;
  points: number;
  level: string;
  ambassador: boolean;
}
interface Ledger {
  id: string;
  amount: number;
  label: string;
  createdAt: string;
}
interface Redemption {
  id: string;
  title: string;
  kind: Reward["kind"];
  code: string;
  status: "livre" | "a-remettre" | "remis";
  createdAt: string;
}
export interface GameState {
  levels: { min: number; name: string; icon: string }[];
  wheel: number[];
  daily: number[];
  rewards: Reward[];
  leaderboard: Row[];
  month: string;
  quizPoints: { perAnswer: number; perfect: number };
  referralPoints: number;
  attendPoints: number;
  me: null | {
    points: number;
    earned: number;
    monthPoints: number;
    rank: number | null;
    level: Level;
    streak: number;
    bestStreak: number;
    dailyDone: boolean;
    dailyReward: number;
    spinDone: boolean;
    quizDone: boolean;
    quizResult: { score: number; total: number; points: number } | null;
    missions: Mission[];
    attendReady: number;
    refCode: string;
    referrals: number;
    canBeReferred: boolean;
    boostCredits: number;
    badges: string[];
    history: Ledger[];
    redemptions: Redemption[];
  };
}

const LEVEL_ICONS: Record<string, typeof Star> = { sparkles: Sparkles, ticket: Ticket, music: Music, star: Star, crown: Crown };
const REWARD_ICONS: Record<Reward["kind"], typeof Gift> = { badge: Award, boost: Rocket, premium: Gem, lot: Gift };
const MISSION_ICONS: Record<string, typeof Gift> = { profil: Users, pass: ScanFace, place: Ticket, vote: Trophy, organiser: PartyPopper, parrain: UserPlus, bande: Users, serie7: Flame };
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// ---------- Petits effets ----------
export function Confetti({ fire }: { fire: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        dx: `${(Math.random() - 0.5) * 40}vw`,
        rot: `${Math.random() * 900 - 450}deg`,
        dur: `${1.8 + Math.random() * 1.6}s`,
        delay: `${Math.random() * 0.35}s`,
        color: ["#1800ad", "#4f3dff", "#ffb21e", "#ff5a4e", "#22c58b", "#ffffff", "#8b5cf6"][i % 7],
        round: i % 3 === 0,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fire],
  );
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!fire) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 3800);
    return () => clearTimeout(t);
  }, [fire]);
  if (!on) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{ left: `${p.left}%`, background: p.color, borderRadius: p.round ? "50%" : 2, ["--dx" as string]: p.dx, ["--rot" as string]: p.rot, ["--dur" as string]: p.dur, ["--delay" as string]: p.delay }}
        />
      ))}
    </div>
  );
}

function useCountUp(value: number, ms = 900) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

function Coin({ className }: { className?: string }) {
  return (
    <span className={cx("inline-grid place-items-center rounded-full gold-gradient font-black text-[#5a3500] shadow-[inset_0_-2px_0_rgba(0,0,0,0.15)]", className ?? "size-5 text-[10px]")} aria-hidden>
      P
    </span>
  );
}

// ---------- Roue du jour ----------
const SEG_COLORS = ["#1800ad", "#ffffff", "#4f3dff", "#ffffff", "#0f0078", "#ffb21e", "#2a17ff", "#ffffff"];

export function Wheel({ values, rotation, spinning, idle }: { values: number[]; rotation: number; spinning: boolean; idle?: boolean }) {
  const n = values.length;
  const seg = 360 / n;
  const r = 150;
  const arc = (i: number) => {
    const a0 = ((i * seg - 90 - seg / 2) * Math.PI) / 180;
    const a1 = (((i + 1) * seg - 90 - seg / 2) * Math.PI) / 180;
    return `M ${r} ${r} L ${r + r * Math.cos(a0)} ${r + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${r + r * Math.cos(a1)} ${r + r * Math.sin(a1)} Z`;
  };
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[340px]">
      {/* Pointeur */}
      <div className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2">
        <div className="h-0 w-0 border-x-[14px] border-t-[26px] border-x-transparent border-t-coral drop-shadow-[0_3px_4px_rgba(0,0,0,0.35)]" />
      </div>
      <div className="absolute inset-0 rounded-full bg-gradient-to-b from-[#ffd66b] to-[#f08a00] p-[10px] shadow-[0_20px_60px_-15px_rgba(24,0,173,0.6)]">
        <svg
          viewBox="0 0 300 300"
          className={cx("size-full rounded-full", idle && "animate-[spin_40s_linear_infinite]")}
          style={idle ? undefined : { transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4.6s cubic-bezier(0.15, 0.7, 0.12, 1)" : "none" }}
        >
          {values.map((v, i) => {
            const fill = SEG_COLORS[i % SEG_COLORS.length];
            const light = fill === "#ffffff" || fill === "#ffb21e";
            const angle = i * seg;
            return (
              <g key={i}>
                <path d={arc(i)} fill={fill} stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
                <g transform={`rotate(${angle} 150 150)`}>
                  <text x="150" y="58" textAnchor="middle" fontFamily="Rubik, sans-serif" fontWeight="800" fontSize={v >= 100 ? 26 : 28} fill={light ? "#1800ad" : "#ffffff"}>
                    {v}
                  </text>
                  <text x="150" y="78" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="10" letterSpacing="1.5" fill={light ? "#1800ad" : "rgba(255,255,255,0.75)"}>
                    PTS
                  </text>
                </g>
              </g>
            );
          })}
          {/* Clous */}
          {values.map((_, i) => {
            const a = ((i * seg - 90 - seg / 2) * Math.PI) / 180;
            return <circle key={i} cx={150 + 141 * Math.cos(a)} cy={150 + 141 * Math.sin(a)} r="3.5" fill="#ffe08a" />;
          })}
        </svg>
        <div className="absolute left-1/2 top-1/2 grid size-[68px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-[#ffd66b] bg-white shadow-lg">
          <img src="/logo.png" alt="" className="w-11" />
        </div>
      </div>
    </div>
  );
}

function SpinSheet({ open, onClose, game, onDone }: { open: boolean; onClose: () => void; game: GameState; onDone: (points: number, state: GameState) => void }) {
  const { toast } = useSession();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<number | null>(null);
  const done = game.me?.spinDone;
  useEffect(() => {
    if (open) setWon(null);
  }, [open]);
  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    try {
      const r = await api<{ index: number; points: number; state: GameState }>("POST", "/game/spin");
      const seg = 360 / game.wheel.length;
      const jitter = (Math.random() - 0.5) * seg * 0.6;
      const target = 360 * 6 + (360 - r.index * seg) - jitter;
      setRotation((cur) => cur - (cur % 360) + target);
      setTimeout(() => {
        setSpinning(false);
        setWon(r.points);
        onDone(r.points, r.state);
      }, 4700);
    } catch (e) {
      setSpinning(false);
      toast((e as Error).message, "error");
    }
  };
  return (
    <Sheet open={open} onClose={() => !spinning && onClose()} title="Roue du jour">
      <p className="mb-5 text-sm text-muted">Un tour gratuit chaque jour. Jusqu'à 100 points à gagner !</p>
      <Wheel values={game.wheel} rotation={rotation} spinning={spinning} />
      <div className="mt-6">
        {won !== null ? (
          <div className="pop rounded-3xl brand-gradient p-5 text-center text-white">
            <div className="text-sm font-semibold text-white/80">Bravo, vous gagnez</div>
            <div className="mt-1 flex items-center justify-center gap-2 font-display text-5xl font-black">
              +{won} <Coin className="size-9 text-base" />
            </div>
            <Button variant="white" full className="mt-4" onClick={onClose}>
              Super !
            </Button>
          </div>
        ) : done ? (
          <div className="rounded-2xl bg-card-2 p-4 text-center text-sm text-muted">Déjà joué aujourd'hui. La roue se recharge à minuit.</div>
        ) : (
          <Button full size="lg" loading={spinning} onClick={spin} className="glow-pulse">
            {spinning ? "Ça tourne…" : "Lancer la roue"}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

// ---------- Quiz du jour ----------
interface QuizQ {
  id: string;
  theme: string;
  q: string;
  choices: string[];
}
interface QuizDetail {
  id: string;
  correct: number;
  given: number;
  ok: boolean;
  explain: string;
}

function QuizSheet({ open, onClose, game, onDone }: { open: boolean; onClose: () => void; game: GameState; onDone: (points: number, state: GameState) => void }) {
  const { toast } = useSession();
  const [qs, setQs] = useState<QuizQ[] | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<{ score: number; total: number; points: number; details: QuizDetail[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setI(0);
    setAnswers([]);
    setPicked(null);
    setResult(null);
    api<{ questions: QuizQ[] }>("GET", "/game/quiz").then((r) => setQs(r.questions), () => setQs([]));
  }, [open]);

  const next = async () => {
    if (picked === null || !qs) return;
    const all = [...answers, picked];
    setAnswers(all);
    setPicked(null);
    if (all.length < qs.length) return setI(all.length);
    setBusy(true);
    try {
      const r = await api<{ score: number; total: number; points: number; details: QuizDetail[]; state: GameState }>("POST", "/game/quiz", { answers: all });
      setResult(r);
      onDone(r.points, r.state);
    } catch (e) {
      toast((e as Error).message, "error");
      onClose();
    }
    setBusy(false);
  };

  const already = game.me?.quizDone && !result;
  return (
    <Sheet open={open} onClose={onClose} title="Quiz du jour" tall>
      {already ? (
        <div className="py-6 text-center">
          <Brain className="mx-auto size-12 text-brand" />
          <p className="mt-3 font-display text-xl font-bold">
            Quiz terminé : {game.me?.quizResult?.score}/{game.me?.quizResult?.total}
          </p>
          <p className="mt-1 text-sm text-muted">Trois nouvelles questions demain sur Lomé, le Togo et la fête.</p>
        </div>
      ) : !qs ? (
        <div className="space-y-3 py-4">
          <div className="skeleton h-6 w-1/3 rounded-lg" />
          <div className="skeleton h-16 rounded-2xl" />
          <div className="skeleton h-12 rounded-2xl" />
          <div className="skeleton h-12 rounded-2xl" />
        </div>
      ) : result ? (
        <div>
          <div className="pop rounded-3xl brand-gradient p-5 text-center text-white">
            <div className="text-sm font-semibold text-white/80">{result.score === result.total ? "Sans faute, chapeau !" : result.score ? "Bien joué !" : "Pas de chance cette fois"}</div>
            <div className="mt-1 font-display text-5xl font-black">
              {result.score}/{result.total}
            </div>
            {result.points > 0 && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-bold">
                +{result.points} <Coin className="size-4 text-[8px]" />
              </div>
            )}
          </div>
          <div className="mt-5 space-y-3">
            {qs.map((q, k) => {
              const d = result.details[k];
              return (
                <div key={q.id} className="rounded-2xl border border-line p-4">
                  <div className="flex items-start gap-2.5">
                    <span className={cx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-white", d.ok ? "bg-emerald" : "bg-coral")}>{d.ok ? <Check className="size-4" /> : <X className="size-4" />}</span>
                    <div>
                      <div className="text-sm font-semibold">{q.q}</div>
                      <div className="mt-1 text-sm text-brand">Réponse : {q.choices[d.correct]}</div>
                      <div className="mt-1 text-xs leading-relaxed text-muted">{d.explain}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Button full className="mt-5" onClick={onClose}>
            Terminer
          </Button>
        </div>
      ) : qs.length ? (
        <div>
          <div className="mb-4 flex items-center gap-2">
            {qs.map((_, k) => (
              <span key={k} className={cx("h-1.5 flex-1 rounded-full transition", k < i ? "bg-brand" : k === i ? "bg-brand/60" : "bg-ink/10")} />
            ))}
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-brand">
            {qs[i].theme} · Question {i + 1}/{qs.length}
          </div>
          <h3 className="mt-2 font-display text-[22px] font-bold leading-snug">{qs[i].q}</h3>
          <div className="mt-5 space-y-2.5">
            {qs[i].choices.map((c, k) => (
              <button
                key={k}
                onClick={() => setPicked(k)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left text-[15px] font-semibold transition active:scale-[0.99]",
                  picked === k ? "border-brand bg-brand-soft text-brand dark:bg-brand/20 dark:text-white" : "border-line bg-card hover:border-ink/25",
                )}
              >
                <span className={cx("grid size-7 shrink-0 place-items-center rounded-full text-xs font-black", picked === k ? "bg-brand text-white" : "bg-card-2 text-muted")}>{"ABCD"[k]}</span>
                {c}
              </button>
            ))}
          </div>
          <Button full size="lg" className="mt-6" disabled={picked === null} loading={busy} onClick={next}>
            {i + 1 < qs.length ? "Question suivante" : "Voir mon score"}
          </Button>
          <p className="mt-3 text-center text-xs text-faint">
            {game.quizPoints.perAnswer} points par bonne réponse, +{game.quizPoints.perfect} pour un sans-faute
          </p>
        </div>
      ) : (
        <ErrorState message="Quiz indisponible pour le moment." />
      )}
    </Sheet>
  );
}

// ---------- Page ----------
export function Club() {
  const { me, requireAuth, toast, refresh } = useSession();
  usePageMeta({ title: "ToBe Club : jouez et gagnez", description: "Roue du jour, quiz sur Lomé, missions et récompenses : chaque jour sur ToBe rapporte des points." });
  const { data, error, loading, reload, setData } = useLoad(() => api<GameState>("GET", "/game"), [me?.user.id]);
  const [sheet, setSheet] = useState<null | "spin" | "quiz">(null);
  const [fire, setFire] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState<Redemption | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState message={error?.message ?? "Impossible de charger le Club"} onRetry={reload} />;
  const g = data;
  const p = g.me;

  const win = (points: number, state: GameState) => {
    setData(state);
    if (points > 0) setFire((f) => f + 1);
  };
  const guard = async (fn: () => Promise<void>, key: string) => {
    if (!(await requireAuth("Rejoignez le ToBe Club pour gagner des points."))) return;
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
  };
  const checkin = () =>
    guard(async () => {
      const r = await api<{ points: number; streak: number; state: GameState }>("POST", "/game/checkin");
      win(r.points, r.state);
      toast(`+${r.points} points · série de ${r.streak} jour${r.streak > 1 ? "s" : ""}`);
    }, "checkin");
  const claim = (id: string) =>
    guard(async () => {
      const r = await api<{ points: number; state: GameState }>("POST", `/game/missions/${id}/claim`);
      win(r.points, r.state);
      toast(`Mission validée : +${r.points} points`);
    }, `m-${id}`);
  const redeem = (rw: Reward) =>
    guard(async () => {
      const r = await api<{ redemption: Redemption; state: GameState }>("POST", `/game/rewards/${rw.id}/redeem`);
      setData(r.state);
      setRedeemed(r.redemption);
      setFire((f) => f + 1);
      refresh();
    }, `r-${rw.id}`);
  const open = (s: "spin" | "quiz") => guard(async () => setSheet(s), s);

  const inviteUrl = p ? shareUrl(`/?ref=${p.refCode}`) : shareUrl("/");
  const inviteText = `Rejoins-moi sur ToBe, l'app des événements de Lomé : on gagne ${g.referralPoints} points chacun à ton inscription ! ${inviteUrl}`;
  const monthLabel = MONTHS[Number(g.month.slice(5, 7)) - 1];

  return (
    <div className="pb-10 lg:pb-0">
      <Confetti fire={fire} />
      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <Hero g={g} onJoin={() => requireAuth("Rejoignez le ToBe Club pour gagner des points.")} />

          {/* Jeux du jour */}
          <section className="mt-6 px-4 lg:px-0">
            <h2 className="font-display text-xl font-bold lg:text-2xl">Aujourd'hui</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <DailyCard g={g} busy={busy === "checkin"} onClick={checkin} />
              <GameTile
                title="Roue du jour"
                text={p?.spinDone ? "Revenez demain" : "Jusqu'à 100 points"}
                done={!!p?.spinDone}
                icon={<WheelMini />}
                onClick={() => open("spin")}
                accent="from-[#ffb21e] to-[#f08a00]"
              />
              <GameTile
                title="Quiz du jour"
                text={p?.quizDone ? `${p.quizResult?.score}/${p.quizResult?.total} aujourd'hui` : "3 questions · 50 points"}
                done={!!p?.quizDone}
                icon={<Brain className="size-8 text-white" />}
                onClick={() => open("quiz")}
                accent="from-[#4f3dff] to-[#1800ad]"
              />
            </div>
          </section>

          {/* Missions */}
          <section className="mt-8 px-4 lg:px-0">
            <div className="flex items-end justify-between">
              <h2 className="font-display text-xl font-bold lg:text-2xl">Missions</h2>
              {p && <span className="text-sm text-muted">{p.missions.filter((m) => m.claimed).length}/{p.missions.length} validées</span>}
            </div>
            <div className="mt-3 grid gap-2.5 lg:grid-cols-2">
              {(p?.missions ?? defaultMissions(g)).map((m) => {
                const Icon = MISSION_ICONS[m.id] ?? Star;
                return (
                  <div key={m.id} className={cx("flex items-center gap-3 rounded-2xl border p-3.5 transition", m.ready ? "border-brand/40 bg-brand-soft/60 dark:bg-brand/15" : "border-line bg-card")}>
                    <div className={cx("grid size-11 shrink-0 place-items-center rounded-2xl", m.claimed ? "bg-emerald/15 text-emerald" : "bg-card-2 text-brand")}>
                      {m.claimed ? <Check className="size-5" strokeWidth={3} /> : <Icon className="size-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={cx("text-[15px] font-semibold", m.claimed && "text-muted line-through decoration-1")}>{m.title}</div>
                      <div className="truncate text-xs text-muted">{m.hint}</div>
                    </div>
                    {m.ready ? (
                      <Button size="sm" loading={busy === `m-${m.id}`} onClick={() => claim(m.id)} className="shrink-0">
                        +{m.points}
                      </Button>
                    ) : m.claimed ? (
                      <span className="shrink-0 text-xs font-bold text-emerald">+{m.points}</span>
                    ) : (
                      <Link to={m.link} className="flex shrink-0 items-center gap-1 rounded-full bg-card-2 px-3 py-1.5 text-xs font-bold text-muted">
                        {m.points} <Coin className="size-3.5 text-[7px]" />
                      </Link>
                    )}
                  </div>
                );
              })}
              <div className={cx("flex items-center gap-3 rounded-2xl border p-3.5", p?.attendReady ? "border-brand/40 bg-brand-soft/60 dark:bg-brand/15" : "border-dashed border-line")}>
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-card-2 text-brand">
                  <CalendarCheck className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">Être présent</div>
                  <div className="text-xs text-muted">{g.attendPoints} points par événement où votre billet est scanné</div>
                </div>
                {p?.attendReady ? (
                  <Button size="sm" loading={busy === "m-presence"} onClick={() => claim("presence")}>
                    +{p.attendReady * g.attendPoints}
                  </Button>
                ) : (
                  <span className="shrink-0 text-xs font-bold text-faint">À chaque sortie</span>
                )}
              </div>
            </div>
          </section>

          {/* Parrainage */}
          <section id="inviter" className="mt-8 px-4 lg:px-0">
            <div className="relative overflow-hidden rounded-[28px] bg-[#0b0b12] p-6 text-white lg:p-8">
              <div className="absolute -right-10 -top-16 size-56 rounded-full bg-brand-2/40 blur-3xl" />
              <div className="relative lg:flex lg:items-center lg:gap-8">
                <div className="flex-1">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
                    <UserPlus className="size-3.5" /> Parrainage
                  </div>
                  <h3 className="mt-3 font-display text-2xl font-bold leading-tight">
                    +{g.referralPoints} points pour vous, +{g.referralPoints} pour chaque ami
                  </h3>
                  <p className="mt-2 text-sm text-white/70">Votre ami s'inscrit avec votre lien : vous gagnez tous les deux. {p ? `${p.referrals} ami${p.referrals > 1 ? "s" : ""} déjà invité${p.referrals > 1 ? "s" : ""}.` : ""}</p>
                </div>
                <div className="mt-5 lg:mt-0 lg:w-[300px]">
                  {p ? (
                    <>
                      <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Votre code</div>
                          <div className="font-display text-2xl font-black tracking-[0.2em]">{p.refCode}</div>
                        </div>
                        <button
                          aria-label="Copier le lien"
                          onClick={() => navigator.clipboard?.writeText(inviteUrl).then(() => toast("Lien copié"), () => toast(inviteUrl))}
                          className="grid size-11 place-items-center rounded-full bg-white text-[#0b0b12]"
                        >
                          <Copy className="size-5" />
                        </button>
                      </div>
                      <a href={whatsappLink(inviteText)} target="_blank" rel="noreferrer" className="mt-3 flex h-12 items-center justify-center gap-2 rounded-full bg-[#25d366] font-semibold text-[#06260f]">
                        <MessageCircle className="size-5" /> Inviter sur WhatsApp
                      </a>
                    </>
                  ) : (
                    <Button variant="white" full onClick={() => requireAuth("Connectez-vous pour obtenir votre lien de parrainage.")}>
                      Obtenir mon lien
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Récompenses */}
          <section className="mt-8 px-4 lg:px-0">
            <div className="flex items-end justify-between">
              <h2 className="font-display text-xl font-bold lg:text-2xl">Récompenses</h2>
              {p && (
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  {p.points} <Coin className="size-4 text-[8px]" />
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.rewards.map((rw) => {
                const Icon = REWARD_ICONS[rw.kind];
                const owned = rw.kind === "badge" && p?.badges.includes("ambassadeur");
                const missing = p ? Math.max(0, rw.cost - p.points) : rw.cost;
                const soldOut = rw.stock !== null && rw.stock <= 0;
                return (
                  <div key={rw.id} className="flex flex-col rounded-3xl border border-line bg-card p-4">
                    <div className="flex items-start justify-between">
                      <div className={cx("grid size-12 place-items-center rounded-2xl text-white", rw.kind === "lot" ? "bg-coral" : rw.kind === "premium" ? "bg-violet" : rw.kind === "badge" ? "gold-gradient" : "brand-gradient")}>
                        <Icon className="size-6" />
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full bg-card-2 px-3 py-1 font-display text-sm font-bold">
                        {rw.cost} <Coin className="size-4 text-[8px]" />
                      </div>
                    </div>
                    <div className="mt-3 font-display text-[17px] font-bold leading-tight">{rw.title}</div>
                    <p className="mt-1 flex-1 text-sm text-muted">{rw.description}</p>
                    {rw.stock !== null && <div className="mt-2 text-xs font-semibold text-coral">{soldOut ? "Épuisé" : `Plus que ${rw.stock}`}</div>}
                    <div className="mt-3">
                      {owned ? (
                        <div className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-emerald/10 text-sm font-semibold text-emerald">
                          <Check className="size-4" /> Obtenu
                        </div>
                      ) : p && missing === 0 && !soldOut ? (
                        <Button size="sm" full loading={busy === `r-${rw.id}`} onClick={() => redeem(rw)}>
                          Échanger
                        </Button>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                            <div className="h-full rounded-full brand-gradient" style={{ width: `${p ? Math.min(100, (p.points / rw.cost) * 100) : 0}%` }} />
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted">
                            <Lock className="size-3" /> {p ? `Encore ${missing} points` : "Connectez-vous pour gagner des points"}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {!!p?.boostCredits && (
              <Link to="/organisateur" className="mt-3 flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand-soft p-4 text-sm text-brand dark:bg-brand/15 dark:text-white">
                <Rocket className="size-5" />
                <span className="flex-1">
                  Vous avez <b>{p.boostCredits} boost{p.boostCredits > 1 ? "s" : ""} offert{p.boostCredits > 1 ? "s" : ""}</b> à utiliser sur vos événements.
                </span>
                <ChevronRight className="size-4" />
              </Link>
            )}
          </section>

          {/* Historique (mobile) */}
          {p && (
            <section className="mt-8 px-4 lg:hidden">
              <Button variant="outline" full icon={<History className="size-4" />} onClick={() => setHistoryOpen(true)}>
                Historique de mes points
              </Button>
            </section>
          )}
        </div>

        {/* Colonne de droite : classement */}
        <aside className="mt-8 px-4 lg:sticky lg:top-24 lg:mt-0 lg:px-0">
          <Leaderboard rows={g.leaderboard} monthLabel={monthLabel} me={me?.user.id} myRank={p?.rank ?? null} myPoints={p?.monthPoints ?? 0} />
          {p && (
            <div className="mt-4 hidden rounded-3xl border border-line bg-card p-5 lg:block">
              <div className="flex items-center justify-between">
                <div className="font-display font-bold">Derniers points</div>
                <button className="text-sm font-semibold text-brand" onClick={() => setHistoryOpen(true)}>
                  Tout voir
                </button>
              </div>
              <HistoryList items={p.history.slice(0, 5)} />
            </div>
          )}
          <HowItWorks />
        </aside>
      </div>

      <SpinSheet open={sheet === "spin"} onClose={() => setSheet(null)} game={g} onDone={win} />
      <QuizSheet open={sheet === "quiz"} onClose={() => setSheet(null)} game={g} onDone={win} />
      <Sheet open={!!redeemed} onClose={() => setRedeemed(null)} title="Récompense obtenue">
        {redeemed && (
          <div className="text-center">
            <div className="pop mx-auto grid size-20 place-items-center rounded-3xl gold-gradient text-[#5a3500]">
              <Gift className="size-10" />
            </div>
            <div className="mt-4 font-display text-2xl font-bold">{redeemed.title}</div>
            <p className="mt-2 text-sm text-muted">
              {redeemed.kind === "lot"
                ? "L'équipe ToBe vous contacte pour vous remettre votre lot. Présentez ce code :"
                : redeemed.kind === "boost"
                  ? "Votre boost vous attend : utilisez-le depuis votre espace organisateur."
                  : redeemed.kind === "premium"
                    ? "Premium activé pour 30 jours : vos photos en HD, sans filigrane."
                    : "Votre badge Ambassadeur brille désormais sur votre profil."}
            </p>
            {redeemed.kind === "lot" && <div className="mx-auto mt-3 w-fit rounded-2xl bg-card-2 px-6 py-3 font-display text-3xl font-black tracking-[0.3em]">{redeemed.code}</div>}
            <Button full className="mt-6" onClick={() => setRedeemed(null)}>
              Génial
            </Button>
          </div>
        )}
      </Sheet>
      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Historique des points">
        {p && (p.history.length ? <HistoryList items={p.history} /> : <p className="py-6 text-center text-sm text-muted">Aucun point pour l'instant. Lancez la roue !</p>)}
      </Sheet>
    </div>
  );
}

function defaultMissions(g: GameState): Mission[] {
  void g;
  return [
    { id: "pass", title: "Activer son Pass ToBe", hint: "Vos photos vous trouvent toutes seules", points: 50, link: "/photos", claimed: false, ready: false },
    { id: "place", title: "Réserver sa première place", hint: "N'importe quel événement", points: 30, link: "/explorer", claimed: false, ready: false },
    { id: "organiser", title: "Publier un événement", hint: "Public, et c'est parti", points: 100, link: "/creer", claimed: false, ready: false },
    { id: "parrain", title: "Inviter un ami", hint: "Il s'inscrit avec votre lien", points: 50, link: "/club#inviter", claimed: false, ready: false },
  ];
}

function Hero({ g, onJoin }: { g: GameState; onJoin: () => void }) {
  const p = g.me;
  const points = useCountUp(p?.points ?? 0);
  const LevelIcon = LEVEL_ICONS[p?.level.icon ?? "sparkles"] ?? Sparkles;
  return (
    <section className="relative overflow-hidden club-gradient px-5 pb-7 pt-[max(env(safe-area-inset-top),20px)] text-white lg:rounded-[32px] lg:px-10 lg:py-10">
      <div className="pointer-events-none absolute -right-8 top-10 size-40 rounded-full border-[18px] border-white/5" />
      <div className="pointer-events-none absolute right-24 top-[-30px] size-24 rounded-full bg-[#ffb21e]/30 blur-2xl" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-bold uppercase tracking-wider backdrop-blur">
            <Trophy className="size-3.5 text-[#ffd66b]" /> ToBe Club
          </div>
          {p && (
            <div className="flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-sm font-bold">
              <Flame className={cx("size-4", p.streak ? "text-[#ffb21e]" : "text-white/50")} /> {p.streak} jour{p.streak > 1 ? "s" : ""}
            </div>
          )}
        </div>

        {p ? (
          <div className="mt-6 lg:flex lg:items-end lg:justify-between lg:gap-10">
            <div>
              <div className="text-sm font-medium text-white/70">Mes points</div>
              <div className="mt-1 flex items-center gap-3 font-display text-[56px] font-black leading-none lg:text-[72px]">
                {points}
                <Coin className="float size-11 text-lg lg:size-14 lg:text-xl" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-bold text-brand">
                  <LevelIcon className="size-4" /> {p.level.name}
                </span>
                {p.rank && <span className="rounded-full bg-white/12 px-3 py-1 font-semibold">#{p.rank} ce mois-ci</span>}
                {p.badges.includes("ambassadeur") && (
                  <span className="inline-flex items-center gap-1 rounded-full gold-gradient px-3 py-1 font-bold text-[#5a3500]">
                    <Award className="size-4" /> Ambassadeur
                  </span>
                )}
              </div>
            </div>
            <div className="mt-6 lg:mt-0 lg:w-[340px]">
              <div className="flex justify-between text-xs font-semibold text-white/75">
                <span>{p.level.name}</span>
                <span>{p.level.next ? `${p.level.next.name} à ${p.level.next.min} pts` : "Niveau maximum"}</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full gold-gradient transition-all duration-1000" style={{ width: `${Math.max(4, p.level.progress * 100)}%` }} />
              </div>
              <div className="mt-2 text-xs text-white/60">{p.earned} points gagnés depuis le début</div>
            </div>
          </div>
        ) : (
          <div className="mt-6 lg:flex lg:items-end lg:justify-between lg:gap-10">
            <div>
              <h1 className="font-display text-[38px] font-black leading-[1.02] lg:text-6xl">
                Jouez.
                <br />
                Gagnez.
                <br />
                <span className="text-[#ffd66b]">Sortez.</span>
              </h1>
              <p className="mt-4 max-w-md text-[15px] text-white/75">Chaque jour : une roue, un quiz sur Lomé et des missions. Vos points se transforment en boosts, Premium et lots offerts par ToBe.</p>
            </div>
            <div className="mt-6 lg:mt-0">
              <Button variant="white" size="lg" onClick={onJoin} className="w-full lg:w-auto">
                Rejoindre le Club, c'est gratuit
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function DailyCard({ g, busy, onClick }: { g: GameState; busy: boolean; onClick: () => void }) {
  const p = g.me;
  const streak = p?.streak ?? 0;
  const done = !!p?.dailyDone;
  // Cases cochées de la semaine en cours (la série recommence tous les 7 jours sur la frise).
  const filled = done ? ((streak - 1) % 7) + 1 : streak % 7;
  return (
    <button onClick={onClick} disabled={done || busy} className={cx("group relative overflow-hidden rounded-3xl border p-4 text-left transition active:scale-[0.99]", done ? "border-line bg-card" : "border-brand/30 bg-card shadow-[0_10px_30px_-18px_rgba(24,0,173,0.6)] hover:border-brand/60")}>
      <div className="flex items-center justify-between">
        <div className="grid size-12 place-items-center rounded-2xl gold-gradient text-[#5a3500]">
          <Gift className={cx("size-6", !done && "wiggle")} />
        </div>
        {done ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald/10 px-2.5 py-1 text-xs font-bold text-emerald">
            <Check className="size-3.5" /> Récupéré
          </span>
        ) : (
          <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-bold text-white">+{p?.dailyReward ?? g.daily[0]}</span>
        )}
      </div>
      <div className="mt-3 font-display text-[17px] font-bold">Bonus du jour</div>
      <div className="mt-2 flex gap-1">
        {g.daily.map((v, i) => (
          <div key={i} className={cx("flex h-8 flex-1 flex-col items-center justify-center rounded-lg text-[10px] font-bold", i < filled ? "brand-gradient text-white" : "bg-card-2 text-faint")}>
            {i === 6 ? <Star className="size-3.5" /> : v}
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-muted">{busy ? "…" : done ? "Revenez demain pour garder la série" : "7 jours d'affilée = 50 points"}</div>
    </button>
  );
}

function GameTile({ title, text, done, icon, onClick, accent }: { title: string; text: string; done: boolean; icon: ReactNode; onClick: () => void; accent: string }) {
  return (
    <button onClick={onClick} className={cx("relative overflow-hidden rounded-3xl border p-4 text-left transition active:scale-[0.99]", done ? "border-line bg-card" : "border-transparent bg-card shadow-[0_10px_30px_-18px_rgba(24,0,173,0.6)] ring-1 ring-brand/20 hover:ring-brand/50")}>
      <div className="flex items-center justify-between">
        <div className={cx("grid size-12 place-items-center rounded-2xl bg-gradient-to-br", accent)}>{icon}</div>
        {done ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald/10 px-2.5 py-1 text-xs font-bold text-emerald">
            <Check className="size-3.5" /> Joué
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-coral px-2.5 py-1 text-xs font-bold text-white">Jouer</span>
        )}
      </div>
      <div className="mt-3 font-display text-[17px] font-bold">{title}</div>
      <div className="mt-1 text-sm text-muted">{text}</div>
    </button>
  );
}

function WheelMini() {
  return (
    <svg viewBox="0 0 40 40" className="size-9 animate-[spin_8s_linear_infinite]">
      {Array.from({ length: 8 }, (_, i) => {
        const a0 = (i * 45 * Math.PI) / 180;
        const a1 = ((i + 1) * 45 * Math.PI) / 180;
        return <path key={i} d={`M20 20 L${20 + 18 * Math.cos(a0)} ${20 + 18 * Math.sin(a0)} A18 18 0 0 1 ${20 + 18 * Math.cos(a1)} ${20 + 18 * Math.sin(a1)} Z`} fill={i % 2 ? "#ffffff" : "#1800ad"} />;
      })}
      <circle cx="20" cy="20" r="5" fill="#ffd66b" />
    </svg>
  );
}

function Leaderboard({ rows, monthLabel, me, myRank, myPoints }: { rows: Row[]; monthLabel: string; me?: string; myRank: number | null; myPoints: number }) {
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3, 10);
  return (
    <div className="rounded-3xl border border-line bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display text-lg font-bold">Classement de {monthLabel}</div>
          <div className="text-xs text-muted">Points gagnés ce mois-ci</div>
        </div>
        <Trophy className="size-6 text-[#ffb21e]" />
      </div>
      {rows.length === 0 ? (
        <div className="mt-5 rounded-2xl bg-card-2 p-5 text-center">
          <Crown className="mx-auto size-8 text-[#ffb21e]" />
          <div className="mt-2 font-semibold">La première place est libre</div>
          <div className="mt-1 text-sm text-muted">Lancez la roue et prenez la tête du classement.</div>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-3 items-end gap-2">
            {[podium[1], podium[0], podium[2]].map((r, k) =>
              r ? (
                <div key={r.userId} className="flex flex-col items-center text-center">
                  <div className="relative">
                    {r.rank === 1 && <Crown className="absolute -top-5 left-1/2 size-5 -translate-x-1/2 text-[#ffb21e]" />}
                    <Avatar name={r.name} src={r.avatar} size={r.rank === 1 ? 60 : 48} ring={r.userId === me} />
                  </div>
                  <div className="mt-1.5 max-w-full truncate text-xs font-semibold">{r.name}</div>
                  <div className={cx("mt-1.5 w-full rounded-t-xl pt-2 text-center font-display font-black text-white", r.rank === 1 ? "h-20 gold-gradient text-[#5a3500]" : r.rank === 2 ? "h-14 bg-[#9aa0b8]" : "h-10 bg-[#c98b5a]")}>
                    {r.rank}
                    <div className="text-[10px] font-bold opacity-80">{r.points} pts</div>
                  </div>
                </div>
              ) : (
                <div key={`v${k}`} />
              ),
            )}
          </div>
          {rest.length > 0 && (
            <div className="mt-3 divide-y divide-line">
              {rest.map((r) => (
                <div key={r.userId} className={cx("flex items-center gap-3 py-2.5", r.userId === me && "font-bold")}>
                  <span className="w-6 text-center text-sm font-bold text-faint">{r.rank}</span>
                  <Avatar name={r.name} src={r.avatar} size={32} />
                  <span className="flex-1 truncate text-sm">{r.name}</span>
                  <span className="text-sm font-bold">{r.points}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {me && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-brand-soft px-4 py-3 text-sm text-brand dark:bg-brand/15 dark:text-white">
          <span className="font-semibold">Ma position</span>
          <span className="font-bold">{myRank ? `#${myRank} · ${myPoints} pts` : "Pas encore classé"}</span>
        </div>
      )}
    </div>
  );
}

function HistoryList({ items }: { items: Ledger[] }) {
  return (
    <div className="mt-2 divide-y divide-line">
      {items.map((l) => (
        <div key={l.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{l.label}</div>
            <div className="text-xs text-faint">{new Date(l.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
          </div>
          <span className={cx("shrink-0 font-display font-bold", l.amount >= 0 ? "text-emerald" : "text-coral")}>
            {l.amount >= 0 ? "+" : ""}
            {l.amount}
          </span>
        </div>
      ))}
    </div>
  );
}

function HowItWorks() {
  const rows: [typeof Gift, string][] = [
    [Gift, "Bonus du jour : de 5 à 50 points selon votre série"],
    [Sparkles, "Roue du jour : jusqu'à 100 points"],
    [Brain, "Quiz : 3 questions sur Lomé et le Togo"],
    [CalendarCheck, "Présence : 40 points par événement scanné"],
    [UserPlus, "Parrainage : 50 points pour vous et votre ami"],
  ];
  return (
    <div className="mt-4 rounded-3xl border border-line bg-card p-5">
      <div className="font-display font-bold">Comment gagner des points</div>
      <ul className="mt-3 space-y-2.5">
        {rows.map(([Icon, t]) => (
          <li key={t} className="flex items-center gap-3 text-sm text-muted">
            <Icon className="size-4 shrink-0 text-brand" /> {t}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-faint">Les points n'ont pas de valeur monétaire. Ils s'échangent uniquement contre les récompenses du Club.</p>
    </div>
  );
}
