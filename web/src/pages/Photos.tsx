import type { EventCard } from "@tobe/core";
import { Camera, CheckCircle2, Crown, Download, EyeOff, ImageUp, Loader2, Lock, ScanFace, Settings2, Share2, ShieldCheck, Trash2, UserX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, Empty, PageLoader, Sheet, Toggle, cx } from "../components/ui";
import { Img, Poster } from "../components/visual";
import { absoluteMedia, api } from "../lib/api";
import { selfieDescriptor, loadFaceApi } from "../lib/face";
import { formatFcfa, shortDate } from "../lib/format";
import { loadImage, resolveMedia } from "../lib/media";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";
import { PRICING } from "@tobe/core";

interface PhotoGroup {
  event: EventCard;
  photos: { id: string; url: string; width: number; height: number; distance: number }[];
}

export function Photos() {
  const { me, ready, requireAuth, refresh, toast } = useSession();
  const [sp, setSp] = useSearchParams();
  const eventFilter = sp.get("event");
  const [scan, setScan] = useState<null | "pass" | "once">(null);
  const [once, setOnce] = useState<PhotoGroup[] | null>(null);
  const [settings, setSettings] = useState(false);
  const { data: groups, loading, reload, setData } = useLoad(async () => (me?.user.passEnabled ? api<PhotoGroup[]>("GET", "/me/photos") : null), [me?.user.id, me?.user.passEnabled]);

  if (!ready) return <PageLoader />;

  const onDescriptor = async (descriptor: number[]) => {
    if (scan === "once") {
      const r = await api<PhotoGroup[]>("POST", "/photos/match", { descriptor, eventId: eventFilter ?? undefined });
      setOnce(r);
      setScan(null);
      return;
    }
    const r = await api<{ groups: PhotoGroup[] }>("POST", "/me/face", { descriptor });
    setData(r.groups);
    setScan(null);
    await refresh();
    toast("Pass ToBe activé : vos photos vous trouveront toutes seules");
  };

  const startPass = async () => {
    if (!(await requireAuth("Connectez-vous pour activer votre Pass ToBe."))) return;
    setScan("pass");
  };

  const shown = (once ?? groups ?? []).filter((g) => !eventFilter || g.event.id === eventFilter);
  const total = shown.reduce((s, g) => s + g.photos.length, 0);
  const passOn = !!me?.user.passEnabled;

  return (
    <div className="pt-safe">
      <header className="flex items-center justify-between px-5 pt-4">
        <h1 className="text-[26px] font-extrabold">Mes photos</h1>
        {passOn && (
          <button aria-label="Réglages du Pass" onClick={() => setSettings(true)} className="grid size-10 place-items-center rounded-full border border-line bg-card">
            <Settings2 className="size-5" />
          </button>
        )}
      </header>

      {eventFilter && (
        <div className="mx-5 mt-3 flex items-center justify-between rounded-2xl bg-card px-4 py-2.5 text-sm">
          <span className="text-muted">Filtré sur un événement</span>
          <button className="font-semibold text-gold" onClick={() => (sp.delete("event"), setSp(sp, { replace: true }))}>
            Tout voir
          </button>
        </div>
      )}

      {!passOn && !once && (
        <div className="px-5 pt-5">
          <div className="relative overflow-hidden rounded-[26px] border border-gold/30 bg-gradient-to-b from-[#2b1f08] to-[#121014] p-6 text-white">
            <div className="absolute -right-16 -top-16 size-56 rounded-full bg-gold/25 blur-3xl" />
            <div className="relative mx-auto grid size-28 place-items-center rounded-[34px] border-2 border-gold/70 bg-black/30">
              <ScanFace className="size-14 text-gold" strokeWidth={1.4} />
              <div className="scanline absolute inset-x-3 h-0.5 rounded bg-gold shadow-[0_0_14px_#f2b233]" />
            </div>
            <h2 className="relative mt-5 text-center text-[22px] font-extrabold">Le Pass ToBe</h2>
            <p className="relative mt-2 text-center text-sm leading-relaxed text-white/70">Enregistrez votre visage une seule fois. Dès qu'un organisateur publie une galerie où vous apparaissez, vous êtes prévenu et vos photos sont là.</p>
            <ul className="relative mt-5 space-y-2.5 text-sm text-white/80">
              <Li icon={<ShieldCheck className="size-4" />}>Avec votre accord uniquement, désactivable à tout moment.</Li>
              <Li icon={<Lock className="size-4" />}>Le selfie reste sur votre téléphone : seule une empreinte chiffrée est enregistrée.</Li>
              <Li icon={<EyeOff className="size-4" />}>Option « ne jamais me montrer » pour disparaître des galeries.</Li>
            </ul>
            <Button full size="lg" className="relative mt-6" onClick={startPass} icon={<ScanFace className="size-5" />}>
              Activer mon Pass ToBe
            </Button>
            <button onClick={() => setScan("once")} className="relative mt-3 w-full text-center text-sm font-semibold text-white/70">
              Juste chercher, sans enregistrer mon visage
            </button>
          </div>
        </div>
      )}

      {(passOn || once) && (
        <div className="px-5 pt-4">
          {once && (
            <div className="mb-3 flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3 text-sm">
              <span className="text-muted">Recherche ponctuelle (visage non enregistré)</span>
              <button className="font-semibold text-gold" onClick={() => setOnce(null)}>
                Fermer
              </button>
            </div>
          )}
          {passOn && !once && (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm">
              <CheckCircle2 className="size-5 shrink-0 text-emerald" />
              <span className="flex-1">Pass ToBe actif : vous serez prévenu à chaque nouvelle galerie.</span>
            </div>
          )}
          {loading && !once && <PageLoader />}
          {!loading || once ? (
            total === 0 ? (
              <Empty icon={<Camera className="size-7" />} title="Pas encore de photo de vous" text="Dès que les organisateurs publient leurs galeries, vos photos apparaissent ici." action={<Link to="/explorer" className="font-semibold text-gold">Découvrir des événements</Link>} />
            ) : (
              <div className="mt-2 pb-6">
                <div className="mb-1 text-sm text-muted">
                  {total} photo{total > 1 ? "s" : ""} de vous
                </div>
                {shown.map((g) => (
                  <Gallery key={g.event.id} g={g} premium={!!me?.premium} onRemoved={() => reload()} />
                ))}
              </div>
            )
          ) : null}
          {passOn && !me?.premium && <PremiumCard />}
        </div>
      )}

      <CameraSheet open={!!scan} onClose={() => setScan(null)} onDescriptor={onDescriptor} title={scan === "pass" ? "Activer le Pass ToBe" : "Chercher mes photos"} />
      <PassSettings open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

function Li({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 text-gold">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

function Gallery({ g, premium, onRemoved }: { g: PhotoGroup; premium: boolean; onRemoved: () => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const [view, setView] = useState<PhotoGroup["photos"][number] | null>(null);
  const { toast } = useSession();
  const picked = g.photos.filter((p) => sel.includes(p.id));

  const download = async (list: PhotoGroup["photos"]) => {
    for (const p of list) {
      const blob = await renderPhoto(p.url, premium);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ToBe-${g.event.slug}-${p.id}.jpg`;
      a.click();
    }
    toast(`${list.length} photo${list.length > 1 ? "s" : ""} téléchargée${list.length > 1 ? "s" : ""}`);
  };
  const share = async (list: PhotoGroup["photos"]) => {
    const files = await Promise.all(list.map(async (p) => new File([await renderPhoto(p.url, premium)], `ToBe-${p.id}.jpg`, { type: "image/jpeg" })));
    if (navigator.canShare?.({ files })) await navigator.share({ files, title: g.event.title }).catch(() => {});
    else download(list);
  };
  const remove = async (id: string) => {
    try {
      await api("DELETE", `/photos/${id}`);
      toast("Photo retirée de la galerie");
      setView(null);
      onRemoved();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <section className="mt-5">
      <Link to={`/evenement/${g.event.slug}`} className="mb-3 flex items-center gap-3">
        <Poster cover={g.event.cover} theme={g.event.theme} category={g.event.category} className="size-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display font-bold">{g.event.title}</div>
          <div className="text-xs text-muted">
            {shortDate(g.event.startsAt)} · {g.photos.length} photo{g.photos.length > 1 ? "s" : ""}
          </div>
        </div>
      </Link>
      <div className="grid grid-cols-3 gap-1.5">
        {g.photos.map((p) => (
          <button
            key={p.id}
            onClick={() => (sel.length ? setSel(sel.includes(p.id) ? sel.filter((x) => x !== p.id) : [...sel, p.id]) : setView(p))}
            onContextMenu={(e) => (e.preventDefault(), setSel([...sel, p.id]))}
            className="relative aspect-square overflow-hidden rounded-xl"
          >
            <Img src={p.url} className="size-full object-cover" />
            {sel.length > 0 && <span className={cx("absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full border-2 border-white", sel.includes(p.id) ? "bg-gold" : "bg-black/30")}>{sel.includes(p.id) && <CheckCircle2 className="size-4 text-[#1b1206]" />}</span>}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="dark" onClick={() => setSel(sel.length ? [] : g.photos.map((p) => p.id))}>
          {sel.length ? "Annuler" : "Sélectionner"}
        </Button>
        <Button size="sm" variant="dark" icon={<Download className="size-4" />} onClick={() => download(picked.length ? picked : g.photos)}>
          {picked.length ? `Télécharger (${picked.length})` : "Tout télécharger"}
        </Button>
        <Button size="sm" variant="dark" icon={<Share2 className="size-4" />} onClick={() => share(picked.length ? picked : g.photos.slice(0, 10))}>
          Partager
        </Button>
      </div>
      <Sheet open={!!view} onClose={() => setView(null)} title={g.event.title}>
        {view && (
          <div className="space-y-3">
            <Img src={view.url} className="w-full rounded-2xl" />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="dark" icon={<Download className="size-4" />} onClick={() => download([view])}>
                Télécharger {premium ? "HD" : ""}
              </Button>
              <Button variant="dark" icon={<Share2 className="size-4" />} onClick={() => share([view])}>
                Partager
              </Button>
            </div>
            <Button full variant="danger" icon={<Trash2 className="size-4" />} onClick={() => remove(view.id)}>
              Retirer cette photo de la galerie
            </Button>
            {!premium && <p className="text-center text-xs text-faint">Téléchargement avec un petit filigrane ToBe. Sans filigrane avec le Pass Premium.</p>}
          </div>
        )}
      </Sheet>
    </section>
  );
}

async function renderPhoto(url: string, premium: boolean): Promise<Blob> {
  const src = url.startsWith("idb:") ? await resolveMedia(url) : absoluteMedia(url);
  const img = await loadImage(src);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  if (!premium) {
    const s = Math.max(14, Math.round(c.width / 38));
    ctx.font = `700 ${s}px Sora, Inter, sans-serif`;
    const text = "ToBe · tobe.eledji.com";
    const w = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(c.width - w - s * 1.6, c.height - s * 2.2, w + s * 1.2, s * 1.6);
    ctx.fillStyle = "#f2b233";
    ctx.fillText(text, c.width - w - s, c.height - s * 0.95);
  }
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.92));
}

function PremiumCard() {
  const { requireAuth, toast, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <Card className="mb-8 mt-6 overflow-hidden">
      <div className="gold-gradient px-5 py-4 text-[#1b1206]">
        <div className="flex items-center gap-2 font-display text-lg font-extrabold">
          <Crown className="size-5" /> Pass ToBe Premium
        </div>
        <div className="text-sm font-medium">{formatFcfa(PRICING.premiumMonthly)} / mois</div>
      </div>
      <ul className="space-y-1.5 px-5 py-4 text-sm text-muted">
        <li>• Photos en HD, sans filigrane</li>
        <li>• Album annuel de vos événements</li>
        <li>• Accès prioritaire aux billets</li>
      </ul>
      <div className="px-5 pb-5">
        <Button
          full
          loading={busy}
          onClick={async () => {
            if (!(await requireAuth())) return;
            setBusy(true);
            try {
              await api("POST", "/me/subscribe", { plan: "premium", method: "mixx" });
              await refresh();
              toast("Pass Premium activé pour 30 jours");
            } catch (e) {
              toast((e as Error).message, "error");
            }
            setBusy(false);
          }}
        >
          Passer Premium
        </Button>
      </div>
    </Card>
  );
}

function PassSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, refresh, toast } = useSession();
  if (!me) return null;
  const patch = async (body: object, msg: string) => {
    await api("PATCH", "/me/pass", body);
    await refresh();
    toast(msg);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Confidentialité du Pass">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4">
          <div>
            <div className="font-semibold">Me prévenir des nouvelles photos</div>
            <div className="text-xs text-muted">Notifications quand vous apparaissez dans une galerie.</div>
          </div>
          <Toggle checked={me.user.passEnabled} onChange={(v) => patch({ passEnabled: v }, v ? "Pass réactivé" : "Pass en pause")} label="Pass actif" />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4">
          <div>
            <div className="font-semibold">Ne jamais me montrer</div>
            <div className="text-xs text-muted">Les photos où vous apparaissez sont masquées dans toutes les galeries publiques.</div>
          </div>
          <Toggle checked={me.user.neverShow} onChange={(v) => patch({ neverShow: v }, v ? "Vous êtes masqué des galeries" : "Option désactivée")} label="Ne jamais me montrer" />
        </div>
        <Button
          full
          variant="danger"
          icon={<UserX className="size-4" />}
          onClick={async () => {
            if (!confirm("Supprimer définitivement l'empreinte de votre visage ?")) return;
            await api("DELETE", "/me/face");
            await refresh();
            toast("Empreinte du visage supprimée");
            onClose();
          }}
        >
          Supprimer mes données de visage
        </Button>
      </div>
    </Sheet>
  );
}

/** Caméra frontale + détection du visage, ou import d'un selfie. */
export function CameraSheet({ open, onClose, onDescriptor, title }: { open: boolean; onClose: () => void; onDescriptor: (d: number[]) => Promise<void>; title: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<"consent" | "loading" | "camera" | "working" | "error">("consent");
  const [msg, setMsg] = useState("");
  const [agree, setAgree] = useState(false);

  useEffect(() => {
    if (!open) {
      stream?.getTracks().forEach((t) => t.stop());
      setStream(null);
      setState("consent");
      setMsg("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (video.current && stream) {
      video.current.srcObject = stream;
      video.current.play().catch(() => {});
    }
  }, [stream, state]);

  const start = async () => {
    setState("loading");
    setMsg("Préparation de la reconnaissance faciale…");
    try {
      const modelP = loadFaceApi();
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 } }, audio: false });
      setStream(s);
      await modelP;
      setState("camera");
      setMsg("Placez votre visage dans le cadre, bien éclairé.");
    } catch (e) {
      setState("error");
      setMsg((e as Error).name === "NotAllowedError" ? "Accès à la caméra refusé. Vous pouvez importer un selfie à la place." : "Caméra indisponible. Importez un selfie à la place.");
    }
  };

  const process = async (input: HTMLVideoElement | HTMLImageElement) => {
    setState("working");
    setMsg("Analyse du visage…");
    try {
      const d = await selfieDescriptor(input);
      if (!d) {
        setState(stream ? "camera" : "error");
        setMsg("Aucun visage détecté. Rapprochez-vous et cherchez la lumière.");
        return;
      }
      await onDescriptor(d);
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  };

  const importSelfie = async (f?: File) => {
    if (!f) return;
    setState("working");
    setMsg("Préparation de la reconnaissance faciale…");
    await loadFaceApi();
    const img = await loadImage(URL.createObjectURL(f));
    await process(img);
  };

  return (
    <Sheet open={open} onClose={onClose} title={title} tall>
      {state === "consent" ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">ToBe va analyser votre visage sur ce téléphone pour en tirer une empreinte (une suite de nombres). La photo elle-même n'est pas envoyée. Vous pouvez supprimer cette empreinte à tout moment.</p>
          <label className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 accent-[#f2b233]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>J'accepte que ToBe utilise l'empreinte de mon visage pour retrouver les photos où j'apparais.</span>
          </label>
          <Button full disabled={!agree} onClick={start} icon={<Camera className="size-5" />}>
            Ouvrir la caméra
          </Button>
          <label className={cx("flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-line text-sm font-semibold", !agree && "pointer-events-none opacity-50")}>
            <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => importSelfie(e.target.files?.[0])} />
            <ImageUp className="size-4" /> Importer un selfie
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-[300px] overflow-hidden rounded-[32px] bg-black">
            {stream && <video ref={video} playsInline muted className="size-full -scale-x-100 object-cover" />}
            <div className="pointer-events-none absolute inset-[12%] rounded-[45%] border-[3px] border-gold/80 shadow-[0_0_0_999px_rgba(0,0,0,0.45)]" />
            {(state === "camera" || state === "working") && <div className="scanline pointer-events-none absolute inset-x-[14%] h-0.5 rounded bg-gold shadow-[0_0_14px_#f2b233]" />}
            {(state === "loading" || state === "working") && (
              <div className="absolute inset-0 grid place-items-center">
                <Loader2 className="size-10 animate-spin text-gold" />
              </div>
            )}
          </div>
          <p className={cx("text-center text-sm", state === "error" ? "text-coral" : "text-muted")}>{msg}</p>
          {state === "camera" && (
            <Button full size="lg" onClick={() => video.current && process(video.current)} icon={<ScanFace className="size-5" />}>
              Scanner mon visage
            </Button>
          )}
          {(state === "error" || state === "camera") && (
            <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-line text-sm font-semibold">
              <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => importSelfie(e.target.files?.[0])} />
              <ImageUp className="size-4" /> Importer un selfie
            </label>
          )}
        </div>
      )}
    </Sheet>
  );
}
