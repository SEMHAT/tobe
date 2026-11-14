import type { Provider } from "@tobe/core";
import { BadgeCheck, Clock, MapPin, Phone, Search, Star, Store, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Chip, Empty, ErrorState, Field, PageLoader, Sheet, TopBar, inputCls } from "../components/ui";
import { Avatar } from "../components/visual";
import { api } from "../lib/api";
import { formatFcfa } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

const CATS: [string, string][] = [
  ["all", "Tous"],
  ["mc", "MC"],
  ["deco", "Décoration"],
  ["son", "Son & lumière"],
  ["photo", "Photo & vidéo"],
  ["traiteur", "Traiteurs"],
  ["securite", "Sécurité"],
  ["costume", "Costumes"],
  ["logistique", "Logistique"],
];
const CAT_LABEL = Object.fromEntries(CATS);

export function Providers() {
  const { me } = useSession();
  const [apply, setApply] = useState(false);
  const { data: mine, reload: reloadMine } = useLoad(async () => (me ? api<Provider | null>("GET", "/me/provider") : null), [me?.user.id]);
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const { data, error, loading } = useLoad(() => api<Provider[]>("GET", "/providers", undefined, { category, q }), [category, q]);
  const [pick, setPick] = useState<Provider | null>(null);
  return (
    <div className="pb-8">
      <TopBar title="Prestataires" right={<button onClick={() => setApply(true)} className="flex h-9 items-center gap-1.5 rounded-full bg-brand px-3.5 text-sm font-bold text-white"><UserPlus className="size-4" /> {mine ? "Ma fiche" : "Rejoindre"}</button>} />
      <div className="px-5 pt-3 lg:px-0">
        <p className="text-sm text-muted">Des professionnels de l'événementiel, vérifiés par l'équipe ToBe avant leur mise en ligne. Le badge « Certifié ToBe » signale ceux qui ont travaillé avec l'agence.</p>
        {mine && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-line bg-card-2 px-4 py-3 text-sm">
            {mine.status === "approved" ? <BadgeCheck className="size-4 text-emerald" /> : <Clock className="size-4 text-brand" />}
            <span>
              Votre fiche « {mine.name} » : <b>{mine.status === "approved" ? "en ligne" : mine.status === "pending" ? "en cours de vérification" : "non retenue"}</b>
            </span>
          </div>
        )}
        <div className="relative mt-4">
          <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint" />
          <input className={`${inputCls} pl-12`} placeholder="Rechercher un prestataire" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5 lg:flex-wrap lg:px-0">
        {CATS.map(([v, l]) => (
          <Chip key={v} active={category === v} onClick={() => setCategory(v)}>
            {l}
          </Chip>
        ))}
      </div>
      {loading && <PageLoader />}
      {error && <ErrorState message={error.message} />}
      {data && data.length === 0 && (
        <Empty
          icon={<Store className="size-7" />}
          title={category === "all" && !q ? "L'annuaire ouvre ses portes" : "Aucun prestataire ici pour l'instant"}
          text="MC, décorateurs, techniciens, photographes, traiteurs : inscrivez votre activité, l'équipe ToBe la vérifie et la met en ligne."
          action={<Button onClick={() => setApply(true)} icon={<UserPlus className="size-4" />}>Inscrire mon activité</Button>}
        />
      )}
      <div className="space-y-3 px-5 pt-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:px-0">
        {data?.map((p) => (
          <button key={p.id} onClick={() => setPick(p)} className="flex w-full gap-3.5 rounded-[20px] border border-line bg-card p-3.5 text-left">
            <Avatar name={p.name} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-display font-bold">
                <span className="truncate">{p.name}</span> {p.certified && <BadgeCheck className="size-4 shrink-0 text-brand" />}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                <span>{CAT_LABEL[p.category]}</span>·
                <span className="flex items-center gap-0.5">
                  <MapPin className="size-3" /> {p.city}
                </span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm text-ink/80">{p.bio}</p>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 font-semibold">
                  {p.reviews > 0 ? (
                    <>
                      <Star className="size-4 fill-brand text-brand" /> {p.rating.toFixed(1)} <span className="font-normal text-muted">({p.reviews})</span>
                    </>
                  ) : (
                    <span className="font-normal text-muted">Nouveau</span>
                  )}
                </span>
                {p.priceFrom > 0 && <span className="text-muted">dès {formatFcfa(p.priceFrom)}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
      <QuoteSheet p={pick} onClose={() => setPick(null)} />
      <ApplySheet open={apply} onClose={() => setApply(false)} mine={mine ?? null} onDone={reloadMine} />
    </div>
  );
}

function QuoteSheet({ p, onClose }: { p: Provider | null; onClose: () => void }) {
  const { requireAuth, toast } = useSession();
  const [message, setMessage] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={!!p} onClose={onClose} title={p?.name}>
      {p && (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!(await requireAuth("Connectez-vous pour demander un devis."))) return;
            setBusy(true);
            try {
              await api("POST", `/providers/${p.id}/quote`, { message, date: date || null });
              toast("Demande de devis envoyée");
              setMessage("");
              onClose();
            } catch (err) {
              toast((err as Error).message, "error");
            }
            setBusy(false);
          }}
        >
          <p className="text-sm text-muted">{p.bio}</p>
          <a href={`tel:${p.phone}`} className="flex items-center gap-2 text-sm font-semibold text-brand">
            <Phone className="size-4" /> Appeler directement
          </a>
          <Field label="Date de l'événement">
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Votre besoin">
            <textarea className={`${inputCls} min-h-28`} placeholder="Type d'événement, nombre d'invités, lieu, budget…" value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <Button full type="submit" loading={busy} disabled={message.trim().length < 5}>
            Demander un devis
          </Button>
        </form>
      )}
    </Sheet>
  );
}

function ApplySheet({ open, onClose, mine, onDone }: { open: boolean; onClose: () => void; mine: Provider | null; onDone: () => void }) {
  const { requireAuth, toast, me } = useSession();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Provider["category"]>("mc");
  const [city, setCity] = useState("Lomé");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && mine) {
      setName(mine.name);
      setCategory(mine.category);
      setCity(mine.city);
      setBio(mine.bio);
      setPhone(mine.phone);
      setPrice(mine.priceFrom ? String(mine.priceFrom) : "");
    } else if (open && me?.user.phone) setPhone(me.user.phone);
  }, [open, mine, me]);
  return (
    <Sheet open={open} onClose={onClose} title={mine ? "Ma fiche prestataire" : "Inscrire mon activité"}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!(await requireAuth("Connectez-vous pour inscrire votre activité."))) return;
          setBusy(true);
          try {
            await api("POST", "/providers", { name, category, city, bio, phone, priceFrom: Number(price) || 0 });
            toast(mine ? "Fiche mise à jour" : "Demande envoyée : l'équipe ToBe vérifie votre fiche");
            onDone();
            onClose();
          } catch (err) {
            toast((err as Error).message, "error");
          }
          setBusy(false);
        }}
      >
        <Field label="Nom de l'activité">
          <input className={inputCls} placeholder="Ex. Studio Lumière" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Métier">
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as Provider["category"])}>
            {CATS.filter(([v]) => v !== "all").map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ville">
            <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Prix de départ (FCFA)">
            <input type="number" inputMode="numeric" min={0} className={inputCls} placeholder="Facultatif" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        </div>
        <Field label="Téléphone professionnel">
          <input type="tel" inputMode="tel" className={inputCls} placeholder="90 12 34 56" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Présentation" hint="Vos spécialités, votre expérience, vos références.">
          <textarea className={`${inputCls} min-h-28`} value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <Button full type="submit" loading={busy} disabled={name.trim().length < 2 || bio.trim().length < 20 || phone.replace(/\D/g, "").length < 8}>
          {mine ? "Mettre à jour" : "Envoyer ma demande"}
        </Button>
        <p className="text-center text-xs text-faint">Votre fiche apparaît dans l'annuaire après vérification par l'équipe ToBe.</p>
      </form>
    </Sheet>
  );
}
