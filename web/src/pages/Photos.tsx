import type { EventCard } from "@tobe/core";
import { Camera, CheckCircle2, Crown, Download, EyeOff, Glasses, ImageUp, Loader2, Lock, ScanFace, Settings2, Share2, ShieldCheck, Smartphone, Sun, Trash2, UserX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, Empty, PageLoader, Sheet, Toggle, cx } from "../components/ui";
import { Img, Poster } from "../components/visual";
import { absoluteMedia, api } from "../lib/api";
import { analyzeFrame, captureDescriptor, frameAdvice, loadFaceApi, loadLiveFaceApi, type FrameAnalysis } from "../lib/face";
import { formatFcfa, shortDate } from "../lib/format";
import { loadImage, resolveMedia } from "../lib/media";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";
import { PRICING } from "@tobe/core";

import { PhotoPassGallery, type PhotoGroup } from "../components/PhotoPass";

export function Photos() {
  const { me, ready, requireAuth, refresh, toast, payments } = useSession();
  const [sp, setSp] = useSearchParams();
  const eventFilter = sp.get("event");
  const [scan, setScan] = useState<null | "pass" | "once">(null);
  const [once, setOnce] = useState<PhotoGroup[] | null>(null);
  const [settings, setSettings] = useState(false);
  const { data: groups, loading, reload, setData } = useLoad(async () => (me?.user.passEnabled ? api<PhotoGroup[]>("GET", "/me/photos") : null), [me?.user.id, me?.user.passEnabled]);

  if (!ready) return <PageLoader />;

  const onDescriptors = async (descriptors: number[][]) => {
    if (scan === "once") {
      const r = await api<PhotoGroup[]>("POST", "/photos/match", { descriptors, eventId: eventFilter ?? undefined });
      setOnce(r);
      setTimeout(() => setScan(null), 700);
      return;
    }
    const r = await api<{ groups: PhotoGroup[] }>("POST", "/me/face", { descriptors, consent: true });
    setData(r.groups);
    await refresh();
    setTimeout(() => setScan(null), 900);
    toast(`Pass ToBe activé avec ${descriptors.length} empreinte${descriptors.length > 1 ? "s" : ""} : vos photos vous trouveront toutes seules`);
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
          <button className="font-semibold text-brand" onClick={() => (sp.delete("event"), setSp(sp, { replace: true }))}>
            Tout voir
          </button>
        </div>
      )}

      {!passOn && !once && (
        <div className="px-5 pt-5 lg:mx-auto lg:max-w-xl">
          <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-b from-[#1800ad] to-[#0b0b12] p-6 text-white">
            <div className="absolute -right-16 -top-16 size-56 rounded-full bg-brand/25 blur-3xl" />
            <div className="relative mx-auto grid size-28 place-items-center rounded-[34px] border-2 border-white/70 bg-black/25">
              <ScanFace className="size-14 text-white" strokeWidth={1.4} />
              <div className="scanline absolute inset-x-3 h-0.5 rounded bg-white shadow-[0_0_14px_#fff]" />
            </div>
            <h2 className="relative mt-5 text-center text-[22px] font-extrabold">Le Pass ToBe</h2>
            <p className="relative mt-2 text-center text-sm leading-relaxed text-white/70">Enregistrez votre visage une seule fois. Dès qu'un organisateur publie une galerie où vous apparaissez, vous êtes prévenu et vos photos sont là.</p>
            <ul className="relative mt-5 space-y-2.5 text-sm text-white/80">
              <Li icon={<ShieldCheck className="size-4" />}>Avec votre accord uniquement, désactivable à tout moment.</Li>
              <Li icon={<Lock className="size-4" />}>Le selfie reste sur votre téléphone : seule une empreinte chiffrée est enregistrée.</Li>
              <Li icon={<EyeOff className="size-4" />}>Option « ne jamais me montrer » pour disparaître des galeries.</Li>
            </ul>
            <Button full size="lg" variant="white" className="relative mt-6" onClick={startPass} icon={<ScanFace className="size-5" />}>
              Activer mon Pass ToBe
            </Button>
            <button onClick={async () => (await requireAuth("Connectez-vous pour retrouver et télécharger vos photos.")) && setScan("once")} className="relative mt-3 w-full text-center text-sm font-semibold text-white/70">
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
              <button className="font-semibold text-brand" onClick={() => setOnce(null)}>
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
          {loading && !groups && !once && <PageLoader />}
          {!loading || groups || once ? (
            total === 0 ? (
              <Empty icon={<Camera className="size-7" />} title="Pas encore de photo de vous" text="Dès que les organisateurs publient leurs galeries, vos photos apparaissent ici." action={<Link to="/explorer" className="font-semibold text-brand">Découvrir des événements</Link>} />
            ) : (
              <div className="mt-2 pb-6">
                <div className="mb-1 text-sm text-muted">
                  {total} photo{total > 1 ? "s" : ""} de vous
                </div>
                {shown.map((g) => (
                  <PhotoPassGallery key={g.event.id} g={g} canBuy={!!payments && !!me} onChange={() => (once ? setOnce(once) : reload())} />
                ))}
              </div>
            )
          ) : null}
          {payments && <PhotoOffersInfo />}
        </div>
      )}

      <CameraSheet open={!!scan} onClose={() => setScan(null)} onDescriptors={onDescriptors} mode={scan === "pass" ? "enroll" : "once"} title={scan === "pass" ? "Activer le Pass ToBe" : "Chercher mes photos"} />
      <PassSettings open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

function Li({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 text-[#b3abff]">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

/** Rappel des formules (par événement). */
function PhotoOffersInfo() {
  return (
    <Card className="mb-8 mt-6 p-5">
      <div className="flex items-center gap-2 font-display text-lg font-extrabold">
        <Crown className="size-5 text-brand" /> Vos photos, par événement
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-muted">
        <li>• Gratuit : {PRICING.photoFreeCount} photos avec logo ToBe</li>
        <li>• {formatFcfa(PRICING.photoPrices.plus)} : toutes vos photos avec logo</li>
        <li>• {formatFcfa(PRICING.photoPrices.clean)} : toutes vos photos sans logo</li>
        <li>• {formatFcfa(PRICING.photoPrices.hd)} : toutes en Full HD sans logo, et 3 proches en plus</li>
      </ul>
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

type Step = { key: string; label: string; hint: string };
const ENROLL_STEPS: Step[] = [
  { key: "face", label: "De face", hint: "Regardez droit devant vous" },
  { key: "side1", label: "Profil", hint: "Tournez lentement la tête d'un côté" },
  { key: "side2", label: "Autre profil", hint: "Puis lentement de l'autre côté" },
];
const ONCE_STEPS: Step[] = [ENROLL_STEPS[0]];

/**
 * Caméra frontale guidée : la détection tourne en direct sur le téléphone, vérifie la lumière,
 * la netteté, le cadrage, et capture automatiquement le visage sous plusieurs angles.
 * Le mouvement de tête demandé empêche d'utiliser simplement la photo de quelqu'un d'autre.
 */
export function CameraSheet({ open, onClose, onDescriptors, title, mode }: { open: boolean; onClose: () => void; onDescriptors: (d: number[][]) => Promise<void>; title: string; mode: "enroll" | "once" }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<"consent" | "loading" | "camera" | "working" | "done" | "error">("consent");
  const [msg, setMsg] = useState("");
  const [agree, setAgree] = useState(false);
  const [advice, setAdvice] = useState<string | null>("Placez votre visage dans l'ovale");
  const [good, setGood] = useState(false);
  const [step, setStep] = useState(0);
  const [flash, setFlash] = useState(0);
  const [slow, setSlow] = useState(false);
  const samples = useRef<number[][]>([]);
  const firstSide = useRef(0);
  const running = useRef(false);
  const steps = mode === "enroll" ? ENROLL_STEPS : ONCE_STEPS;

  useEffect(() => {
    if (!open) {
      running.current = false;
      stream?.getTracks().forEach((t) => t.stop());
      setStream(null);
      setState("consent");
      setMsg("");
      setStep(0);
      setSlow(false);
      samples.current = [];
      firstSide.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (video.current && stream) {
      video.current.srcObject = stream;
      video.current.play().catch(() => {});
    }
  }, [stream, state]);

  const finish = async (list: number[][]) => {
    running.current = false;
    setState("working");
    setMsg(mode === "enroll" ? "Enregistrement de votre Pass…" : "Recherche de vos photos…");
    try {
      await onDescriptors(list);
      setState("done");
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
      samples.current = [];
      firstSide.current = 0;
      setStep(0);
    }
  };

  // Boucle d'analyse en direct.
  useEffect(() => {
    if (state !== "camera" || !stream) return;
    running.current = true;
    let stable = 0;
    let current = samples.current.length;
    let stepStarted = performance.now();
    const loop = async () => {
      while (running.current) {
        const v = video.current;
        if (!v || v.readyState < 2) {
          await new Promise((r) => setTimeout(r, 120));
          continue;
        }
        let a: FrameAnalysis;
        try {
          a = await analyzeFrame(v);
        } catch {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        if (!running.current) break;
        const base = frameAdvice(a);
        let tip = base;
        let ok = false;
        const key = steps[current]?.key;
        if (!base) {
          if (key === "face") {
            ok = Math.abs(a.yaw) < 0.12;
            if (!ok) tip = "Regardez droit vers l'écran";
          } else if (key === "side1") {
            ok = Math.abs(a.yaw) > 0.2 && Math.abs(a.yaw) < 0.6;
            if (!ok) tip = Math.abs(a.yaw) >= 0.6 ? "Un peu moins tourné" : "Tournez doucement la tête d'un côté";
          } else if (key === "side2") {
            ok = Math.abs(a.yaw) > 0.2 && Math.abs(a.yaw) < 0.6 && Math.sign(a.yaw) !== firstSide.current;
            if (!ok) tip = Math.abs(a.yaw) >= 0.6 ? "Un peu moins tourné" : "Maintenant, de l'autre côté";
          }
        }
        setGood(ok);
        setAdvice(ok ? "Parfait, ne bougez plus…" : tip);
        stable = ok ? stable + 1 : 0;
        if (performance.now() - stepStarted > 20000 && current > 0) setSlow(true);
        if (stable >= 3) {
          const d = await captureDescriptor(v).catch(() => null);
          if (d && running.current) {
            if (key === "side1") firstSide.current = Math.sign(a.yaw) || 1;
            samples.current = [...samples.current, d];
            current = samples.current.length;
            stable = 0;
            stepStarted = performance.now();
            setSlow(false);
            setFlash((f) => f + 1);
            navigator.vibrate?.(35);
            setStep(current);
            if (current >= steps.length) {
              await finish(samples.current);
              break;
            }
          }
        }
        await new Promise((r) => setTimeout(r, 90));
      }
    };
    loop();
    return () => {
      running.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, stream]);

  const start = async () => {
    setState("loading");
    setMsg("Préparation de la reconnaissance faciale…");
    try {
      const modelP = loadLiveFaceApi();
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
      setStream(s);
      await modelP;
      samples.current = [];
      firstSide.current = 0;
      setStep(0);
      setState("camera");
    } catch (e) {
      setState("error");
      setMsg((e as Error).name === "NotAllowedError" ? "Accès à la caméra refusé. Autorisez la caméra dans le navigateur, ou importez un selfie." : "Caméra indisponible. Importez un selfie à la place.");
    }
  };

  const importSelfie = async (f?: File) => {
    if (!f) return;
    running.current = false;
    setState("working");
    setMsg("Analyse du selfie…");
    try {
      await loadFaceApi();
      const img = await loadImage(URL.createObjectURL(f));
      const d = await captureDescriptor(img);
      if (!d) {
        setState("error");
        setMsg("Aucun visage net sur cette photo. Essayez un selfie bien éclairé, de face.");
        return;
      }
      await finish([d]);
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  };

  const ringColor = state === "done" ? "#22c58b" : good ? "#22c58b" : advice && advice.startsWith("Placez") ? "#ffffff" : "#ffb21e";
  const progress = steps.length ? step / steps.length : 0;
  const C = 2 * Math.PI * 47;

  return (
    <Sheet open={open} onClose={onClose} title={title} tall>
      {state === "consent" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-2xl bg-card-2 p-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl brand-gradient text-white">
              <ScanFace className="size-7" />
            </div>
            <div className="text-sm">
              <div className="font-semibold">{mode === "enroll" ? "3 captures, 15 secondes" : "Une capture de face"}</div>
              <div className="text-muted">{mode === "enroll" ? "De face, puis la tête légèrement tournée de chaque côté : vos photos seront mieux reconnues, même de profil." : "Votre visage n'est pas enregistré."}</div>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted">L'analyse se fait sur ce téléphone. Seule une empreinte (une suite de nombres) est envoyée, jamais la photo. Vous pouvez la supprimer à tout moment.</p>
          <label className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 accent-[#1800ad]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              J'accepte que ToBe utilise l'empreinte de mon visage pour retrouver les photos où j'apparais.{" "}
              <a href="/confidentialite" target="_blank" className="font-semibold text-brand underline">
                Durées et droits
              </a>
            </span>
          </label>
          <Button full size="lg" disabled={!agree} onClick={start} icon={<Camera className="size-5" />}>
            Ouvrir la caméra
          </Button>
          <label className={cx("flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-line text-sm font-semibold", !agree && "pointer-events-none opacity-50")}>
            <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => importSelfie(e.target.files?.[0])} />
            <ImageUp className="size-4" /> Importer un selfie à la place
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-[320px] overflow-hidden rounded-[32px] bg-[#0b0b12]">
            {stream && <video ref={video} playsInline muted className="size-full -scale-x-100 object-cover" />}
            {/* Ovale de cadrage + anneau de progression */}
            <svg viewBox="0 0 100 133" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
              <defs>
                <mask id="oval-cut">
                  <rect width="100" height="133" fill="white" />
                  <ellipse cx="50" cy="60" rx="33" ry="44" fill="black" />
                </mask>
              </defs>
              <rect width="100" height="133" fill="rgba(11,11,18,0.62)" mask="url(#oval-cut)" />
              <ellipse cx="50" cy="60" rx="33" ry="44" fill="none" stroke={ringColor} strokeWidth="1.2" strokeDasharray={good ? "0" : "3 2"} style={{ transition: "stroke 0.25s" }} />
            </svg>
            <svg viewBox="0 0 100 100" className="pointer-events-none absolute left-1/2 top-[45%] w-[78%] -translate-x-1/2 -translate-y-1/2 -rotate-90">
              <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
              <circle cx="50" cy="50" r="47" fill="none" stroke="#22c58b" strokeWidth="2.6" strokeLinecap="round" strokeDasharray={`${C * progress} ${C}`} style={{ transition: "stroke-dasharray 0.5s ease" }} />
            </svg>
            {flash > 0 && <div key={flash} className="fade-out-flash pointer-events-none absolute inset-0 bg-white" />}
            {(state === "loading" || state === "working") && (
              <div className="absolute inset-0 grid place-items-center bg-black/30">
                <Loader2 className="size-10 animate-spin text-white" />
              </div>
            )}
            {state === "done" && (
              <div className="absolute inset-0 grid place-items-center bg-black/40">
                <div className="pop grid size-20 place-items-center rounded-full bg-emerald text-white">
                  <CheckCircle2 className="size-11" />
                </div>
              </div>
            )}
            {state === "camera" && (
              <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/60 px-3 py-2.5 text-center text-sm font-semibold text-white backdrop-blur">
                <div className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                  Étape {Math.min(step + 1, steps.length)}/{steps.length} · {steps[Math.min(step, steps.length - 1)].hint}
                </div>
                <div className={cx("mt-0.5", good ? "text-[#7ef0c0]" : "text-white")}>{advice}</div>
              </div>
            )}
          </div>

          {steps.length > 1 && (
            <div className="flex justify-center gap-6">
              {steps.map((s2, i) => (
                <div key={s2.key} className="flex flex-col items-center gap-1.5">
                  <div className={cx("grid size-9 place-items-center rounded-full border-2 text-xs font-bold transition", i < step ? "border-emerald bg-emerald text-white" : i === step ? "border-brand text-brand" : "border-line text-faint")}>
                    {i < step ? <CheckCircle2 className="size-5" /> : i + 1}
                  </div>
                  <span className={cx("text-xs font-semibold", i <= step ? "text-ink" : "text-faint")}>{s2.label}</span>
                </div>
              ))}
            </div>
          )}

          {msg && state !== "camera" && <p className={cx("text-center text-sm", state === "error" ? "text-coral" : "text-muted")}>{msg}</p>}
          {state === "done" && <p className="text-center text-sm font-semibold text-emerald">{mode === "enroll" ? "Pass ToBe activé !" : "Recherche terminée"}</p>}
          {state === "camera" && slow && samples.current.length > 0 && (
            <Button full variant="outline" onClick={() => finish(samples.current)}>
              Terminer avec {samples.current.length} capture{samples.current.length > 1 ? "s" : ""}
            </Button>
          )}
          {state === "error" && (
            <Button full onClick={start} icon={<Camera className="size-5" />}>
              Réessayer
            </Button>
          )}
          {(state === "error" || state === "camera") && (
            <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-line text-sm font-semibold">
              <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => importSelfie(e.target.files?.[0])} />
              <ImageUp className="size-4" /> Importer un selfie
            </label>
          )}
          <ul className="space-y-1.5 rounded-2xl bg-card-2 p-4 text-xs text-muted">
            <li className="flex items-center gap-2"><Sun className="size-3.5 text-brand" /> Face à la lumière, pas de contre-jour</li>
            <li className="flex items-center gap-2"><Glasses className="size-3.5 text-brand" /> Retirez lunettes de soleil et casquette</li>
            <li className="flex items-center gap-2"><Smartphone className="size-3.5 text-brand" /> Téléphone à hauteur des yeux</li>
          </ul>
        </div>
      )}
    </Sheet>
  );
}
