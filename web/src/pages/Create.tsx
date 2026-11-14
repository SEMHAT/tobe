import type { Access, Category, Contest, EventView, PayMethod, Reach, Theme, Visibility } from "@tobe/core";
import { computeImpact, PRICING, TOBE_SERVICES, type BoostPlan } from "@tobe/core";
import {
  Check,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Globe2,
  HandCoins,
  ImagePlus,
  Link2,
  Lock,
  LocateFixed,
  Camera,
  Plus,
  Radio,
  Rocket,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PayPicker } from "../components/pay";
import { Button, Field, Segmented, Sheet, Toggle, TopBar, cx, inputCls } from "../components/ui";
import { Avatar, CategoryIcon, Poster, THEMES, TierBadge } from "../components/visual";
import { api, uploadImage } from "../lib/api";
import { CATEGORY_LABELS, formatFcfa, shareUrl, shortDate, toLocalInput, whatsappLink } from "../lib/format";
import { resizeImage } from "../lib/media";
import { useSession } from "../lib/session";

const CATEGORIES: Category[] = ["concert", "soiree", "corporate", "culture", "concours", "mariage", "anniversaire", "sport", "religieux", "funerailles", "autre"];
const STEPS = ["L'événement", "Visibilité", "Accès", "Options", "ToBe"];

function defaultDate(days: number, h: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h, 0, 0, 0);
  return toLocalInput(d);
}

export function Create() {
  const nav = useNavigate();
  const { requireAuth, toast, refresh } = useSession();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<EventView | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<PayMethod>("mixx");

  // Étape 1
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("concert");
  const [startsAt, setStartsAt] = useState(defaultDate(7, 20));
  const [endsAt, setEndsAt] = useState("");
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("Lomé");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("or");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  // Étape 2
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [accessCode, setAccessCode] = useState("");
  const [invitees, setInvitees] = useState("");
  // Étape 3
  const [access, setAccess] = useState<Access>("paid");
  const [tickets, setTickets] = useState([{ name: "Standard", price: 5000, quota: 0 }]);
  const [capacity, setCapacity] = useState(0);
  const [expected, setExpected] = useState(200);
  const [reach, setReach] = useState<Reach>("ville");
  // Étape 4
  const [votes, setVotes] = useState(false);
  const [voteMode, setVoteMode] = useState<Contest["mode"]>("mixed");
  const [votePrice, setVotePrice] = useState(100);
  const [voteResults, setVoteResults] = useState<Contest["results"]>("live");
  const [jury, setJury] = useState(0);
  const [voteClose, setVoteClose] = useState(defaultDate(6, 23));
  const [candidates, setCandidates] = useState<{ name: string; bio: string; photo: string | null }[]>([
    { name: "", bio: "", photo: null },
    { name: "", bio: "", photo: null },
  ]);
  const [cagnotte, setCagnotte] = useState(false);
  const [cagTitle, setCagTitle] = useState("");
  const [cagGoal, setCagGoal] = useState(500000);
  const [gallery, setGallery] = useState(true);
  const [live, setLive] = useState(false);
  const [liveUrl, setLiveUrl] = useState("");
  const [boost, setBoost] = useState<BoostPlan | "">("");
  // Étape 5
  const [tobe, setTobe] = useState<"" | "complete" | "carte" | "devis">("");
  const [services, setServices] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [note, setNote] = useState("");

  const impact = useMemo(() => computeImpact({ expectedAttendance: expected, reach, category, views: 0, ticketTypes: [] }), [expected, reach, category]);

  const valid = [
    title.trim().length >= 3 && venue.trim().length > 1 && !!startsAt,
    true,
    access !== "paid" || tickets.some((t) => t.name.trim() && t.price > 0),
    (!votes || candidates.filter((c) => c.name.trim()).length >= 2) && (!cagnotte || cagGoal >= 0),
    tobe !== "carte" || services.length > 0,
  ];

  const onCover = async (f?: File) => {
    if (!f) return;
    if (!(await requireAuth("Connectez-vous pour ajouter une affiche."))) return;
    setUploading(true);
    try {
      const { blob } = await resizeImage(f, 1400);
      setCover(await uploadImage(blob, "affiche.jpg"));
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setUploading(false);
  };

  const locate = () => {
    if (!navigator.geolocation) return toast("Position indisponible sur cet appareil", "error");
    navigator.geolocation.getCurrentPosition(
      (p) => (setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }), toast("Position enregistrée")),
      () => toast("Autorisez l'accès à la position pour placer l'événement sur la carte", "error"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const publish = async (payMethod?: PayMethod) => {
    if (!(await requireAuth("Connectez-vous pour publier votre événement."))) return;
    if (boost && !payMethod) return setPayOpen(true);
    setBusy(true);
    try {
      const ev = await api<EventView>("POST", "/events", {
        title,
        category,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        venue,
        city,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        description,
        cover,
        theme,
        visibility,
        access,
        accessCode: accessCode || null,
        invitees: invitees.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean),
        ticketTypes: access === "paid" ? tickets : [{ name: "Entrée", price: 0, quota: capacity }],
        expectedAttendance: expected,
        reach,
        options: { votes, cagnotte, gallery, live },
        liveUrl: live && liveUrl ? liveUrl : null,
        contest: votes ? { mode: voteMode, votePrice, closesAt: new Date(voteClose).toISOString(), results: voteResults, juryWeight: jury, candidates: candidates.filter((c) => c.name.trim()) } : null,
        cagnotte: cagnotte ? { title: cagTitle || `Cagnotte — ${title}`, goal: cagGoal } : null,
        tobe: tobe ? { level: tobe, services, budget, note } : null,
        boost: boost && payMethod ? { plan: boost, method: payMethod } : null,
      });
      setPayOpen(false);
      setDone(ev);
      refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };

  if (done) return <Published e={done} tobe={!!tobe} />;

  return (
    <div className="pb-32">
      <TopBar title="Créer un événement" onBack={() => (step > 0 ? setStep(step - 1) : nav(-1))} />
      <div className="px-5 pt-3">
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className={cx("h-1.5 flex-1 rounded-full transition", i <= step ? "bg-gold" : "bg-white/10")} />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs font-semibold text-muted">
          <span>
            Étape {step + 1} sur {STEPS.length}
          </span>
          <span className="text-gold">{STEPS[step]}</span>
        </div>
      </div>

      <div key={step} className="rise space-y-5 px-5 pt-5">
        {step === 0 && (
          <>
            <label className="relative block cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onCover(e.target.files?.[0])} />
              <Poster cover={cover} theme={theme} category={category} title={title || "Votre affiche"} showTitle className="aspect-[16/10] rounded-[22px]">
                <div className="absolute inset-0 grid place-items-center bg-black/25 opacity-100">
                  <span className="flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
                    <ImagePlus className="size-4" /> {uploading ? "Envoi…" : cover ? "Changer l'affiche" : "Ajouter une affiche"}
                  </span>
                </div>
              </Poster>
            </label>
            {!cover && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">Couleur :</span>
                {(Object.keys(THEMES) as Theme[]).map((t) => (
                  <button key={t} aria-label={THEMES[t].label} onClick={() => setTheme(t)} className={cx("size-8 rounded-full border-2", theme === t ? "border-white" : "border-transparent")} style={{ background: THEMES[t].bg }} />
                ))}
              </div>
            )}
            {cover && (
              <button className="text-sm text-coral" onClick={() => setCover(null)}>
                Retirer l'affiche
              </button>
            )}
            <Field label="Titre de l'événement">
              <input className={inputCls} placeholder="Ex. Lomé Afro Night" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Catégorie">
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c} onClick={() => setCategory(c)} className={cx("flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium", category === c ? "border-gold bg-gold text-[#1b1206]" : "border-line bg-card")}>
                    <CategoryIcon category={c} className="size-4" /> {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-1 gap-3">
              <Field label="Début">
                <input type="datetime-local" className={inputCls} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </Field>
              <Field label="Fin (facultatif)">
                <input type="datetime-local" className={inputCls} value={endsAt} min={startsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </Field>
            </div>
            <Field label="Lieu">
              <input className={inputCls} placeholder="Ex. Palais des Congrès" value={venue} onChange={(e) => setVenue(e.target.value)} />
            </Field>
            <div className="flex gap-3">
              <div className="flex-1">
                <Field label="Ville">
                  <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
              </div>
              <button onClick={locate} className={cx("mt-6 flex h-[50px] items-center gap-2 rounded-2xl border px-4 text-sm font-semibold", geo ? "border-emerald/50 text-emerald" : "border-line bg-card")}>
                <LocateFixed className="size-4" /> {geo ? "Placé" : "Ma position"}
              </button>
            </div>
            <Field label="Description">
              <textarea className={`${inputCls} min-h-28`} placeholder="Ce qui attend les participants : artistes, programme, dress code…" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-muted">Qui peut voir votre événement ?</p>
            <BigChoice active={visibility === "public"} onClick={() => setVisibility("public")} icon={<Globe2 />} title="Public" text="Visible par tous dans l'app et classé selon son impact." />
            <BigChoice active={visibility === "unlisted"} onClick={() => setVisibility("unlisted")} icon={<Link2 />} title="Non listé" text="Accessible uniquement avec le lien que vous partagez." />
            <BigChoice active={visibility === "private"} onClick={() => setVisibility("private")} icon={<Lock />} title="Privé" text="Réservé aux invités : code d'accès ou liste de numéros." />
            {visibility === "private" && (
              <div className="space-y-4 rounded-2xl border border-line bg-card p-4">
                <Field label="Code d'accès" hint="Laissez vide pour en générer un automatiquement.">
                  <input className={`${inputCls} uppercase`} placeholder="Ex. AFI2026" value={accessCode} onChange={(e) => setAccessCode(e.target.value.toUpperCase().replace(/\s/g, ""))} />
                </Field>
                <Field label="Numéros des invités (facultatif)" hint="Un par ligne. Ces personnes accèdent sans code une fois connectées.">
                  <textarea className={`${inputCls} min-h-24`} placeholder={"90 12 34 56\n91 23 45 67"} value={invitees} onChange={(e) => setInvitees(e.target.value)} />
                </Field>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <Segmented value={access} onChange={setAccess} options={[{ value: "free", label: "Gratuit" }, { value: "paid", label: "Payant" }, { value: "invite", label: "Invitation" }]} />
            {access === "paid" ? (
              <div className="space-y-3">
                {tickets.map((t, i) => (
                  <div key={i} className="rounded-2xl border border-line bg-card p-3.5">
                    <div className="flex items-center gap-2">
                      <input className={`${inputCls} flex-1`} placeholder="Nom (ex. VIP)" value={t.name} onChange={(e) => setTickets(tickets.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                      {tickets.length > 1 && (
                        <button aria-label="Supprimer" onClick={() => setTickets(tickets.filter((_, k) => k !== i))} className="grid size-11 place-items-center rounded-full text-coral">
                          <Trash2 className="size-5" />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Field label="Prix (FCFA)">
                        <input type="number" inputMode="numeric" min={0} step={500} className={inputCls} value={t.price || ""} onChange={(e) => setTickets(tickets.map((x, k) => (k === i ? { ...x, price: Number(e.target.value) } : x)))} />
                      </Field>
                      <Field label="Places (0 = illimité)">
                        <input type="number" inputMode="numeric" min={0} className={inputCls} value={t.quota || ""} placeholder="0" onChange={(e) => setTickets(tickets.map((x, k) => (k === i ? { ...x, quota: Number(e.target.value) } : x)))} />
                      </Field>
                    </div>
                  </div>
                ))}
                <Button variant="outline" full icon={<Plus className="size-4" />} onClick={() => setTickets([...tickets, { name: "", price: 10000, quota: 0 }])}>
                  Ajouter un type de billet
                </Button>
                <p className="text-xs text-faint">Les participants paient des frais de service de 6 % en plus du prix. Vous recevez 100 % du prix du billet.</p>
              </div>
            ) : (
              <Field label="Nombre de places (0 = illimité)">
                <input type="number" inputMode="numeric" min={0} className={inputCls} value={capacity || ""} placeholder="0" onChange={(e) => setCapacity(Number(e.target.value))} />
              </Field>
            )}
            <div className="rounded-2xl border border-line bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Taille et portée</div>
                <TierBadge tier={impact.tier} />
              </div>
              <p className="mt-1 text-xs text-muted">Sert au classement par impact : les événements « Majeur » et « Phare » sont mis en avant.</p>
              <div className="mt-4">
                <Field label={`Participants attendus : ${expected.toLocaleString("fr-FR")}`}>
                  <input type="range" min={10} max={5000} step={10} value={expected} onChange={(e) => setExpected(Number(e.target.value))} className="w-full accent-[#f2b233]" />
                </Field>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(
                  [
                    ["quartier", "Quartier"],
                    ["ville", "Ville"],
                    ["national", "National"],
                    ["international", "International"],
                  ] as [Reach, string][]
                ).map(([v, l]) => (
                  <button key={v} onClick={() => setReach(v)} className={cx("h-10 rounded-xl border text-sm font-semibold", reach === v ? "border-gold bg-gold/15 text-gold" : "border-line")}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <OptionCard icon={<Crown />} title="Votes" text="Concours, awards, élection du public." on={votes} onChange={setVotes}>
              <div className="space-y-4">
                <Segmented value={voteMode} onChange={setVoteMode} options={[{ value: "free", label: "Gratuit" }, { value: "mixed", label: "Mixte" }, { value: "paid", label: "Payant" }]} />
                <p className="text-xs text-muted">
                  {voteMode === "free" && "1 vote gratuit par personne et par jour."}
                  {voteMode === "mixed" && "1 vote gratuit par jour, plus des packs payants pour soutenir davantage."}
                  {voteMode === "paid" && "Uniquement des votes payants."} {voteMode !== "free" && `Vous recevez ${100 - PRICING.voteCommission * 100} % des votes payants.`}
                </p>
                {voteMode !== "free" && (
                  <Field label="Prix d'un vote (FCFA)" hint={`Packs proposés : 10 votes pour ${formatFcfa(votePrice * 9)}, 50 votes pour ${formatFcfa(votePrice * 40)}.`}>
                    <input type="number" min={25} step={25} className={inputCls} value={votePrice} onChange={(e) => setVotePrice(Number(e.target.value))} />
                  </Field>
                )}
                <Field label="Clôture du vote">
                  <input type="datetime-local" className={inputCls} value={voteClose} onChange={(e) => setVoteClose(e.target.value)} />
                </Field>
                <Field label="Résultats">
                  <Segmented value={voteResults} onChange={setVoteResults} options={[{ value: "live", label: "En direct" }, { value: "top3", label: "Top 3" }, { value: "hidden", label: "À la fin" }]} />
                </Field>
                <Field label={`Part du jury : ${jury} %`} hint={jury ? `Résultat final : ${100 - jury} % public, ${jury} % jury.` : "Résultat 100 % vote du public."}>
                  <input type="range" min={0} max={80} step={10} value={jury} onChange={(e) => setJury(Number(e.target.value))} className="w-full accent-[#f2b233]" />
                </Field>
                <div>
                  <div className="mb-2 text-[13px] font-semibold text-muted">Candidats</div>
                  <div className="space-y-2">
                    {candidates.map((c, i) => (
                      <CandidateRow key={i} n={i + 1} c={c} onChange={(v) => setCandidates(candidates.map((x, k) => (k === i ? v : x)))} onRemove={candidates.length > 2 ? () => setCandidates(candidates.filter((_, k) => k !== i)) : undefined} />
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="mt-2" icon={<Plus className="size-4" />} onClick={() => setCandidates([...candidates, { name: "", bio: "", photo: null }])}>
                    Ajouter un candidat
                  </Button>
                </div>
              </div>
            </OptionCard>
            <OptionCard icon={<HandCoins />} title="Cagnotte" text="Contributions en Mobile Money, ouvertes à la diaspora par carte." on={cagnotte} onChange={setCagnotte}>
              <div className="space-y-3">
                <Field label="Titre">
                  <input className={inputCls} placeholder={`Cagnotte — ${title || "mon événement"}`} value={cagTitle} onChange={(e) => setCagTitle(e.target.value)} />
                </Field>
                <Field label="Objectif (FCFA, 0 = sans objectif)">
                  <input type="number" min={0} step={10000} className={inputCls} value={cagGoal} onChange={(e) => setCagGoal(Number(e.target.value))} />
                </Field>
                <p className="text-xs text-faint">Frais ToBe : {PRICING.cagnotteCommission * 100} % des montants collectés.</p>
              </div>
            </OptionCard>
            <OptionCard icon={<Camera />} title="Galerie photo avec reconnaissance faciale" text="Chaque participant retrouve ses photos grâce à son visage." on={gallery} onChange={setGallery} />
            <OptionCard icon={<Radio />} title="Direct vidéo" text="Pour la famille et la diaspora qui ne peuvent pas venir." on={live} onChange={setLive}>
              <Field label="Lien du direct (facultatif)" hint="YouTube, Facebook… Vous pourrez l'ajouter plus tard.">
                <input className={inputCls} placeholder="https://" value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} />
              </Field>
            </OptionCard>
            <div className="rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 to-transparent p-4">
              <div className="flex items-center gap-2 font-semibold">
                <Rocket className="size-5 text-gold" /> Booster la visibilité
              </div>
              <p className="mt-1 text-xs text-muted">Votre événement passe en tête de l'accueil et d'Explorer.</p>
              <div className="mt-3 space-y-2">
                {(Object.entries(PRICING.boosts) as [BoostPlan, (typeof PRICING.boosts)[BoostPlan]][]).map(([k, b]) => (
                  <button key={k} onClick={() => setBoost(boost === k ? "" : k)} className={cx("flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left text-sm", boost === k ? "border-gold bg-gold/10" : "border-line bg-card")}>
                    <span className="font-semibold">{b.label}</span>
                    <span className="font-display font-bold text-gold">{formatFcfa(b.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="relative overflow-hidden rounded-[24px] border border-gold/40 bg-gradient-to-br from-[#2b1f08] to-[#121014] p-5 text-white">
              <div className="absolute -right-12 -top-12 size-44 rounded-full bg-gold/25 blur-3xl" />
              <Sparkles className="size-8 text-gold" />
              <h2 className="mt-3 text-[22px] font-extrabold leading-tight">Confier l'organisation à ToBe ?</h2>
              <p className="mt-2 text-sm text-white/70">Un seul interlocuteur. Une équipe rodée de MC, décorateurs, techniciens, photographes et communicants. Vous continuez vos activités, on donne vie à votre idée.</p>
              <p className="mt-3 text-sm font-semibold text-gold">Un conseiller vous rappelle sous 24 h.</p>
            </div>
            <BigChoice active={tobe === "complete"} onClick={() => setTobe("complete")} icon={<Crown />} title="Organisation complète" text="ToBe prend tout en charge, de la conception au bilan." />
            <BigChoice active={tobe === "carte"} onClick={() => setTobe("carte")} icon={<Sparkles />} title="Services à la carte" text="Choisissez seulement ce dont vous avez besoin." />
            {tobe === "carte" && (
              <div className="flex flex-wrap gap-2">
                {TOBE_SERVICES.map((s) => (
                  <button key={s} onClick={() => setServices(services.includes(s) ? services.filter((x) => x !== s) : [...services, s])} className={cx("flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium", services.includes(s) ? "border-gold bg-gold text-[#1b1206]" : "border-line bg-card")}>
                    {services.includes(s) && <Check className="size-4" />} {s}
                  </button>
                ))}
              </div>
            )}
            <BigChoice active={tobe === "devis"} onClick={() => setTobe("devis")} icon={<HandCoins />} title="Simple devis" text="Recevez une estimation sans engagement." />
            {tobe && (
              <div className="space-y-3">
                <Field label="Budget envisagé (facultatif)">
                  <input className={inputCls} placeholder="Ex. 1 500 000 FCFA" value={budget} onChange={(e) => setBudget(e.target.value)} />
                </Field>
                <Field label="Un mot pour l'équipe (facultatif)">
                  <textarea className={`${inputCls} min-h-20`} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              </div>
            )}
            <button onClick={() => setTobe("")} className={cx("flex w-full items-center justify-center gap-2 rounded-2xl border p-4 text-sm font-semibold", tobe === "" ? "border-white/40" : "border-line text-muted")}>
              {tobe === "" && <Check className="size-4" />} Non merci, je gère moi-même
            </button>
          </>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-app/95 px-5 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 backdrop-blur-xl">
        {step < STEPS.length - 1 ? (
          <Button full size="lg" disabled={!valid[step]} onClick={() => setStep(step + 1)}>
            Continuer
          </Button>
        ) : (
          <Button full size="lg" loading={busy} disabled={!valid.every(Boolean)} onClick={() => publish()} icon={<Rocket className="size-5" />}>
            {boost ? `Publier et booster (${formatFcfa(PRICING.boosts[boost].price)})` : "Publier mon événement"}
          </Button>
        )}
      </div>

      <Sheet open={payOpen} onClose={() => setPayOpen(false)} title="Payer le boost">
        {boost && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-line bg-card p-4">
              <span className="font-semibold">{PRICING.boosts[boost].label}</span>
              <span className="font-display text-lg font-bold text-gold">{formatFcfa(PRICING.boosts[boost].price)}</span>
            </div>
            <PayPicker value={method} onChange={setMethod} />
            <Button full loading={busy} onClick={() => publish(method)}>
              Payer et publier
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function BigChoice({ active, onClick, icon, title, text }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; text: string }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-4 rounded-[20px] border p-4 text-left transition", active ? "border-gold bg-gold/10" : "border-line bg-card")}>
      <span className={cx("grid size-12 shrink-0 place-items-center rounded-2xl [&>svg]:size-6", active ? "bg-gold text-[#1b1206]" : "bg-card-2 text-gold")}>{icon}</span>
      <span className="flex-1">
        <span className="block font-display text-[16px] font-bold">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{text}</span>
      </span>
      <span className={cx("grid size-6 shrink-0 place-items-center rounded-full border-2", active ? "border-gold bg-gold text-[#1b1206]" : "border-white/20")}>{active && <Check className="size-3.5" strokeWidth={3} />}</span>
    </button>
  );
}

function OptionCard({ icon, title, text, on, onChange, children }: { icon: ReactNode; title: string; text: string; on: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  return (
    <div className={cx("rounded-[20px] border p-4 transition", on ? "border-gold/60 bg-card" : "border-line bg-card")}>
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-card-2 text-gold [&>svg]:size-5">{icon}</span>
        <div className="flex-1">
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-muted">{text}</div>
        </div>
        <Toggle checked={on} onChange={onChange} label={title} />
      </div>
      {on && children && <div className="mt-4 border-t border-line pt-4">{children}</div>}
    </div>
  );
}

function CandidateRow({ n, c, onChange, onRemove }: { n: number; c: { name: string; bio: string; photo: string | null }; onChange: (c: { name: string; bio: string; photo: string | null }) => void; onRemove?: () => void }) {
  const { requireAuth, toast } = useSession();
  const pick = async (f?: File) => {
    if (!f || !(await requireAuth("Connectez-vous pour ajouter des photos."))) return;
    try {
      const { blob } = await resizeImage(f, 600);
      onChange({ ...c, photo: await uploadImage(blob, "candidat.jpg") });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  return (
    <div className="flex items-center gap-2">
      <label className="relative shrink-0 cursor-pointer">
        <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        {c.photo ? <Avatar name={c.name || String(n)} src={c.photo} size={46} /> : <span className="grid size-[46px] place-items-center rounded-full border border-dashed border-white/25 text-faint"><ImagePlus className="size-4" /></span>}
      </label>
      <input className={`${inputCls} flex-1`} placeholder={`Candidat n° ${n}`} value={c.name} onChange={(e) => onChange({ ...c, name: e.target.value })} />
      {onRemove && (
        <button aria-label="Retirer" onClick={onRemove} className="grid size-10 place-items-center text-faint">
          <X className="size-5" />
        </button>
      )}
    </div>
  );
}

function Published({ e, tobe }: { e: EventView; tobe: boolean }) {
  const { toast } = useSession();
  const url = shareUrl(`/evenement/${e.slug}`) + (e.visibility === "private" && e.accessCode ? `?code=${e.accessCode}` : "");
  const text = `${e.title} — ${shortDate(e.startsAt)}, ${e.venue}. ${e.access === "paid" ? "Billets" : "Infos"} sur ToBe : ${url}`;
  return (
    <div className="min-h-full px-5 pb-10 pt-safe">
      <div className="pop mx-auto mt-10 grid size-20 place-items-center rounded-full gold-gradient text-[#1b1206]">
        <Check className="size-10" strokeWidth={3} />
      </div>
      <h1 className="mt-5 text-center text-[26px] font-extrabold">C'est en ligne !</h1>
      <p className="mt-1 text-center text-muted">{e.visibility === "public" ? "Votre événement est visible dans l'app." : e.visibility === "unlisted" ? "Partagez le lien : seules les personnes qui l'ont peuvent le voir." : "Partagez le lien et le code avec vos invités."}</p>

      <div className="mt-6 overflow-hidden rounded-[24px] border border-line bg-card">
        <Poster cover={e.cover} theme={e.theme} category={e.category} title={e.title} className="aspect-[16/10]">
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
          <div className="absolute inset-x-4 bottom-4 text-white">
            <TierBadge tier={e.impact.tier} />
            <div className="mt-2 font-display text-xl font-bold">{e.title}</div>
            <div className="text-sm text-white/75">
              {shortDate(e.startsAt)} · {e.venue}
            </div>
          </div>
        </Poster>
        <div className="flex items-center justify-between p-3 text-xs text-muted">
          <span className="flex items-center gap-1">{e.visibility === "public" ? <Eye className="size-4" /> : <EyeOff className="size-4" />} {e.visibility === "public" ? "Public" : e.visibility === "unlisted" ? "Non listé" : "Privé"}</span>
          <span className="font-semibold text-gold">ToBe</span>
        </div>
      </div>

      {e.accessCode && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-line bg-card p-4">
          <div>
            <div className="text-xs text-muted">Code d'accès des invités</div>
            <div className="font-mono text-xl font-bold tracking-widest">{e.accessCode}</div>
          </div>
          <Lock className="size-5 text-gold" />
        </div>
      )}
      {tobe && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-gold" />
          <span>
            <b>Demande transmise à l'agence ToBe.</b> Un conseiller vous rappelle sous 24 h.
          </span>
        </div>
      )}

      <div className="mt-6 space-y-3">
        <a href={whatsappLink(text)} target="_blank" rel="noreferrer" className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#25D366] font-semibold text-white">
          <WhatsAppIcon /> Partager sur WhatsApp
        </a>
        <Button
          full
          variant="dark"
          icon={<Copy className="size-4" />}
          onClick={() => {
            navigator.clipboard?.writeText(url);
            toast("Lien copié");
          }}
        >
          Copier le lien
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Link to={`/evenement/${e.slug}`}>
            <Button full variant="outline">
              Voir la page
            </Button>
          </Link>
          <Link to={`/organisateur/${e.id}`}>
            <Button full variant="outline">
              Gérer
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3M12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4C2.7 15.6 2.2 13.8 2.2 12 2.2 6.6 6.6 2.2 12 2.2c2.6 0 5.1 1 6.9 2.9 1.8 1.8 2.9 4.3 2.9 6.9 0 5.4-4.4 9.8-9.8 9.8M20.5 3.5C18.2 1.2 15.2 0 12 0 5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.6 6L0 24l6.2-1.6c1.8 1 3.8 1.5 5.8 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4" />
    </svg>
  );
}

