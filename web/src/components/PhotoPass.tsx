import type { EventCard, PhotoTier } from "@tobe/core";
import { PRICING } from "@tobe/core";
import { Baby, Check, CheckCircle2, Crown, Download, Gift, Link2, Lock, Share2, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, HttpError } from "../lib/api";
import { formatFcfa, shareUrl, shortDate } from "../lib/format";
import { useSession } from "../lib/session";
import { CameraSheet } from "../pages/Photos";
import { waLink } from "./TeamInvite";
import { Button, Field, Sheet, cx, inputCls } from "./ui";
import { Img, Poster } from "./visual";

export type GroupPhoto = { id: string; url: string; width: number; height: number; distance: number; unlocked?: boolean; guest?: string };
export type PhotoGroup = {
  event: EventCard;
  photos: GroupPhoto[];
  tier?: PhotoTier;
  paid?: number;
  freeLeft?: number;
  guests?: { id: string; name: string; kind: "adult" | "child"; status: "pending" | "active"; code: string | null }[];
};

const RANK: Record<PhotoTier, number> = { free: 0, plus: 1, clean: 2, hd: 3 };
export const OFFERS: { tier: Exclude<PhotoTier, "free">; title: string; points: string[]; icon: typeof Crown }[] = [
  { tier: "plus", title: "Toutes mes photos", points: ["Toutes vos photos de l'événement", "Petit logo ToBe dans le coin"], icon: Sparkles },
  { tier: "clean", title: "Sans logo", points: ["Toutes vos photos", "Sans filigrane ni logo"], icon: CheckCircle2 },
  { tier: "hd", title: "Full HD + 3 proches", points: ["Toutes vos photos en Full HD, sans logo", "Ajoutez 3 visages : enfants, amis…"], icon: Crown },
];
const TIER_LABEL: Record<PhotoTier, string> = { free: `${PRICING.photoFreeCount} photos offertes`, plus: "Toutes mes photos", clean: "Sans logo", hd: "Full HD + 3 proches" };

async function saveFrom(url: string, name: string) {
  const blob = await fetch(url).then((r) => {
    if (!r.ok) throw new Error("Téléchargement impossible");
    return r.blob();
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return blob;
}

/** Galerie d'un événement : formule, photos (aperçu filigrané), téléchargement selon la formule. */
export function PhotoPassGallery({ g, canBuy, onChange }: { g: PhotoGroup; canBuy: boolean; onChange: () => void }) {
  const { toast, requireAuth } = useSession();
  const [view, setView] = useState<GroupPhoto | null>(null);
  const [offers, setOffers] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const tier = g.tier ?? "free";
  const freeLeft = g.freeLeft ?? 0;

  const download = async (list: GroupPhoto[]) => {
    if (!(await requireAuth("Connectez-vous pour télécharger vos photos."))) return;
    let n = 0;
    for (const p of list) {
      setBusy(p.id);
      try {
        const r = await api<{ url: string; freeLeft?: number }>("POST", `/photos/${p.id}/download`);
        await saveFrom(r.url, `ToBe-${g.event.slug}-${p.id}.jpg`);
        n++;
      } catch (e) {
        setBusy(null);
        if (e instanceof HttpError && e.status === 402) {
          toast((e as Error).message, "error");
          setOffers(true);
        } else toast((e as Error).message, "error");
        break;
      }
    }
    setBusy(null);
    if (n) toast(`${n} photo${n > 1 ? "s" : ""} téléchargée${n > 1 ? "s" : ""}`);
    if (tier === "free") onChange();
  };
  const share = async (p: GroupPhoto) => {
    try {
      const r = await api<{ url: string }>("POST", `/photos/${p.id}/download`);
      const blob = await fetch(r.url).then((x) => x.blob());
      const file = new File([blob], `ToBe-${p.id}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: g.event.title }).catch(() => {});
      else await saveFrom(r.url, file.name);
      if (tier === "free") onChange();
    } catch (e) {
      if (e instanceof HttpError && e.status === 402) setOffers(true);
      toast((e as Error).message, "error");
    }
  };
  const remove = async (id: string) => {
    try {
      await api("DELETE", `/photos/${id}`);
      toast("Photo retirée de la galerie");
      setView(null);
      onChange();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const available = g.photos.filter((p) => p.unlocked !== false);

  return (
    <section className="mt-6">
      <Link to={`/evenement/${g.event.slug}`} className="mb-3 flex items-center gap-3">
        <Poster cover={g.event.cover} theme={g.event.theme} category={g.event.category} className="size-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display font-bold">{g.event.title}</div>
          <div className="text-xs text-muted">
            {shortDate(g.event.startsAt)} · {g.photos.length} photo{g.photos.length > 1 ? "s" : ""}
          </div>
        </div>
      </Link>

      {canBuy && (
        <button onClick={() => setOffers(true)} className={cx("mb-3 flex w-full items-center gap-3 rounded-2xl border p-3 text-left text-sm", tier === "free" ? "border-brand/40 bg-brand/10" : "border-line bg-card")}>
          {tier === "free" ? <Gift className="size-5 shrink-0 text-brand" /> : <Crown className="size-5 shrink-0 text-brand" />}
          <span className="flex-1">
            <b>{TIER_LABEL[tier]}</b>
            <span className="block text-muted">
              {tier === "free"
                ? freeLeft > 0
                  ? `Encore ${freeLeft} photo${freeLeft > 1 ? "s" : ""} à télécharger gratuitement (avec logo). Toutes dès ${formatFcfa(PRICING.photoPrices.plus)}.`
                  : `Photos offertes utilisées. Toutes vos photos dès ${formatFcfa(PRICING.photoPrices.plus)}.`
                : tier === "hd"
                  ? "Full HD sans logo · ajoutez jusqu'à 3 proches"
                  : "Passer à la formule supérieure"}
            </span>
          </span>
          {tier !== "hd" && <span className="rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white">{tier === "free" ? "Débloquer" : "Améliorer"}</span>}
        </button>
      )}

      <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-6 lg:gap-2">
        {g.photos.map((p) => (
          <button key={p.id} onClick={() => setView(p)} className="relative aspect-square overflow-hidden rounded-xl">
            <Img src={p.url} className="size-full object-cover" />
            {p.unlocked === false && (
              <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/55">
                <Lock className="size-3.5 text-white" />
              </span>
            )}
            {p.guest && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">{p.guest}</span>}
          </button>
        ))}
      </div>
      {tier !== "free" && available.length > 1 && (
        <Button size="sm" variant="dark" className="mt-2" loading={!!busy} icon={<Download className="size-4" />} onClick={() => download(available)}>
          Tout télécharger ({available.length})
        </Button>
      )}

      {tier === "hd" && <GuestFaces g={g} onChange={onChange} />}

      <Sheet open={!!view} onClose={() => setView(null)} title={g.event.title}>
        {view && (
          <div className="space-y-3">
            <Img src={view.url} className="w-full rounded-2xl" />
            <p className="text-center text-xs text-muted">
              {tier === "free" && view.unlocked === false
                ? freeLeft > 0
                  ? `Aperçu. Télécharger utilise 1 de vos ${freeLeft} photo(s) offerte(s), avec un petit logo ToBe.`
                  : `Aperçu. Débloquez toutes vos photos dès ${formatFcfa(PRICING.photoPrices.plus)}.`
                : tier === "hd"
                  ? "Téléchargement en Full HD, sans logo."
                  : tier === "clean"
                    ? "Téléchargement sans logo."
                    : "Téléchargement avec un petit logo ToBe."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="dark" loading={busy === view.id} icon={<Download className="size-4" />} onClick={() => download([view])}>
                Télécharger
              </Button>
              <Button variant="dark" icon={<Share2 className="size-4" />} onClick={() => share(view)}>
                Partager
              </Button>
            </div>
            {!view.guest && (
              <Button full variant="danger" icon={<Trash2 className="size-4" />} onClick={() => remove(view.id)}>
                Retirer cette photo de la galerie
              </Button>
            )}
          </div>
        )}
      </Sheet>
      <OffersSheet open={offers} onClose={() => setOffers(false)} g={g} />
    </section>
  );
}

/** Les 3 formules payantes : on ne paie que la différence avec ce qu'on a déjà. */
export function OffersSheet({ open, onClose, g }: { open: boolean; onClose: () => void; g: PhotoGroup }) {
  const { toast, requireAuth } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const tier = g.tier ?? "free";
  const paid = g.paid ?? 0;
  const buy = async (t: PhotoTier) => {
    if (!(await requireAuth("Connectez-vous pour débloquer vos photos."))) return;
    setBusy(t);
    try {
      // Paiement en ligne : redirection vers la page de paiement Mobile Money.
      await api("POST", `/events/${g.event.id}/photo-pass`, { tier: t, method: "mixx" });
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Mes photos de l'événement">
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {g.photos.length} photo{g.photos.length > 1 ? "s" : ""} de vous sur « {g.event.title} ». {PRICING.photoFreeCount} offertes avec logo, ou débloquez tout pour cet événement :
        </p>
        {OFFERS.map((o) => {
          const owned = RANK[tier] >= RANK[o.tier];
          const price = Math.max(0, PRICING.photoPrices[o.tier] - paid);
          return (
            <div key={o.tier} className={cx("rounded-2xl border p-4", o.tier === "hd" ? "border-brand bg-brand/5" : "border-line bg-card")}>
              <div className="flex items-start gap-3">
                <o.icon className="mt-0.5 size-5 shrink-0 text-brand" />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <b>{o.title}</b>
                    <b className="font-display">{formatFcfa(PRICING.photoPrices[o.tier])}</b>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-sm text-muted">
                    {o.points.map((p) => (
                      <li key={p} className="flex gap-1.5">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-emerald" /> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <Button full size="sm" className="mt-3" variant={owned ? "ghost" : o.tier === "hd" ? "gold" : "dark"} disabled={owned} loading={busy === o.tier} onClick={() => buy(o.tier)}>
                {owned ? "Déjà inclus" : paid > 0 ? `Passer à cette formule · ${formatFcfa(price)}` : `Payer ${formatFcfa(price)} avec Mobile Money`}
              </Button>
            </div>
          );
        })}
        <p className="text-center text-xs text-faint">Valable pour toutes vos photos de cet événement, même celles publiées plus tard. Une partie revient à l'organisateur.</p>
      </div>
    </Sheet>
  );
}

/** Pack Full HD : jusqu'à 3 proches, chacun donne son accord (ou le parent pour un enfant). */
function GuestFaces({ g, onChange }: { g: PhotoGroup; onChange: () => void }) {
  const { toast } = useSession();
  const [adding, setAdding] = useState<null | "adult" | "child">(null);
  const [name, setName] = useState("");
  const [attest, setAttest] = useState(false);
  const [camera, setCamera] = useState(false);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const guests = g.guests ?? [];
  const left = PRICING.photoGuestsMax - guests.length;
  const inviteUrl = (code: string) => shareUrl(`/visage/${code}`);
  const shareText = (who: string, url: string) => `Salut ${who} ! J'ai pris le pack photos ToBe pour « ${g.event.title} ». Si tu es d'accord, ouvre ce lien et fais un selfie : je recevrai les photos où tu apparais. Tu peux refuser ou retirer ton accord quand tu veux. ${url}`;

  const addAdult = async () => {
    try {
      const r = await api<{ code: string }>("POST", `/events/${g.event.id}/photo-guests`, { name, kind: "adult" });
      setLink({ name, url: inviteUrl(r.code) });
      setAdding(null);
      setName("");
      onChange();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const addChild = async (descriptors: number[][]) => {
    await api("POST", `/events/${g.event.id}/photo-guests`, { name, kind: "child", descriptors, attest: true });
    toast(`Visage de ${name} ajouté`);
    setAdding(null);
    setName("");
    setAttest(false);
    setTimeout(() => setCamera(false), 700);
    onChange();
  };
  const remove = async (id: string) => {
    try {
      await api("DELETE", `/events/${g.event.id}/photo-guests/${id}`);
      onChange();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-2 font-semibold">
        <UserPlus className="size-4 text-brand" /> Proches ({guests.length}/{PRICING.photoGuestsMax})
      </div>
      <p className="mt-0.5 text-xs text-muted">Leurs photos de cet événement apparaissent ici, avec leur accord. Leur visage est effacé 6 mois après l'événement.</p>
      <div className="mt-3 space-y-2">
        {guests.map((x) => (
          <div key={x.id} className="flex items-center gap-2 rounded-xl bg-card-2 px-3 py-2 text-sm">
            {x.kind === "child" ? <Baby className="size-4 text-brand" /> : <UserPlus className="size-4 text-brand" />}
            <span className="flex-1">
              <b>{x.name}</b> <span className="text-muted">· {x.status === "active" ? "actif" : "attend son accord"}</span>
            </span>
            {x.status === "pending" && x.code && (
              <a className="text-xs font-semibold text-brand" href={waLink(shareText(x.name, inviteUrl(x.code)))} target="_blank" rel="noreferrer">
                Renvoyer
              </a>
            )}
            <button aria-label={`Retirer ${x.name}`} onClick={() => remove(x.id)}>
              <X className="size-4 text-muted" />
            </button>
          </div>
        ))}
      </div>
      {left > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" variant="dark" icon={<Link2 className="size-4" />} onClick={() => setAdding("adult")}>
            Inviter un ami
          </Button>
          <Button size="sm" variant="dark" icon={<Baby className="size-4" />} onClick={() => setAdding("child")}>
            Mon enfant
          </Button>
        </div>
      )}
      <Sheet open={!!adding} onClose={() => setAdding(null)} title={adding === "child" ? "Ajouter mon enfant" : "Inviter un proche"}>
        <div className="space-y-4 text-sm">
          <Field label="Prénom">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={adding === "child" ? "Ex. : Ama" : "Ex. : Kofi"} />
          </Field>
          {adding === "adult" ? (
            <>
              <p className="text-muted">Vous recevez un lien à lui envoyer. Il ouvre le lien, donne son accord et fait un selfie. Sans son accord, rien n'est enregistré.</p>
              <Button full disabled={name.trim().length < 2} onClick={addAdult}>
                Créer le lien d'accord
              </Button>
            </>
          ) : (
            <>
              <label className="flex items-start gap-2 rounded-2xl bg-card-2 p-3">
                <input type="checkbox" className="mt-1" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
                <span>Je suis le parent ou le tuteur légal de cet enfant, et j'accepte que son visage serve uniquement à retrouver ses photos de cet événement.</span>
              </label>
              <Button full disabled={name.trim().length < 2 || !attest} onClick={() => setCamera(true)}>
                Prendre le visage de l'enfant
              </Button>
            </>
          )}
        </div>
      </Sheet>
      <Sheet open={!!link} onClose={() => setLink(null)} title="Lien d'accord prêt">
        {link && (
          <div className="space-y-3 text-sm">
            <p>Envoyez ce lien à {link.name}. Ses photos apparaîtront dès qu'il aura accepté.</p>
            <div className="break-all rounded-xl bg-card-2 p-3 font-mono text-xs">{link.url}</div>
            <a href={waLink(shareText(link.name, link.url))} target="_blank" rel="noreferrer">
              <Button full icon={<Share2 className="size-4" />}>
                Envoyer sur WhatsApp
              </Button>
            </a>
          </div>
        )}
      </Sheet>
      <CameraSheet open={camera} onClose={() => setCamera(false)} onDescriptors={addChild} mode="enroll" title={`Visage de ${name || "l'enfant"}`} />
    </div>
  );
}
