import type { PayMethod } from "@tobe/core";
import { Globe2, HandCoins, Heart, Share2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PayPicker } from "../components/pay";
import { Button, Card, ErrorState, IconButton, PageLoader, Progress, Sheet, Toggle, TopBar, cx, inputCls, Field } from "../components/ui";
import { Avatar, Poster } from "../components/visual";
import { api, HttpError } from "../lib/api";
import { ago, formatFcfa, shareUrl, whatsappLink } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";
import { usePageMeta } from "../lib/seo";

interface CagnotteData {
  id: string;
  title: string;
  description: string;
  goal: number;
  collected: number;
  contributors: number;
  eventTitle: string;
  eventSlug: string | null;
  theme: "or" | "corail" | "nuit" | "vert" | "violet" | "sobre";
  category: any;
  contributions: { id: string; name: string; amount: number | null; message: string; createdAt: string; anonymous: boolean }[];
  isOrganizer: boolean;
}

const AMOUNTS = [5000, 10000, 25000, 50000];

export function CagnottePage() {
  const { id = "" } = useParams();
  const { me, requireAuth, toast, payments } = useSession();
  const [code, setCode] = useState<string | undefined>(undefined);
  const { data: c, error, loading, setData, reload } = useLoad(async () => {
    try {
      return await api<CagnotteData>("GET", `/cagnottes/${id}`, undefined, { code });
    } catch (e) {
      // Événement privé : on réessaie avec le code saisi sur la page de l'événement.
      const evId = (e as HttpError).data?.eventId as string | undefined;
      const saved = evId ? sessionStorage.getItem(`code:${evId}`) : null;
      if (saved && saved !== code) {
        setCode(saved);
        return await api<CagnotteData>("GET", `/cagnottes/${id}`, undefined, { code: saved });
      }
      throw e;
    }
  }, [id, me?.user.id]);
  usePageMeta(c ? { title: `Cagnotte : ${c.title}`, description: c.description } : null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(10000);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [method, setMethod] = useState<PayMethod>("mixx");
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);

  if (loading && !c) return <PageLoader />;
  if (error || !c)
    return (
      <>
        <TopBar title="Cagnotte" />
        <ErrorState message={error?.data?.needCode ? "Cette cagnotte est réservée aux invités : ouvrez d'abord l'événement avec votre code." : (error?.message ?? "Introuvable")} onRetry={reload} />
        {!!error?.data?.eventId && (
          <div className="text-center">
            <Link className="font-semibold text-brand" to={`/evenement/${String(error.data.eventId)}`}>
              Ouvrir l'événement
            </Link>
          </div>
        )}
      </>
    );

  const pct = c.goal ? Math.min(100, (c.collected / c.goal) * 100) : 0;
  const value = custom ? Number(custom) : amount;

  const contribute = async () => {
    if (!(await requireAuth("Connectez-vous pour contribuer."))) return;
    setBusy(true);
    try {
      setData(await api<CagnotteData>("POST", `/cagnottes/${c.id}/contribute`, { amount: value, message, anonymous, method, code }));
      setOpen(false);
      setThanks(true);
      setMessage("");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };

  const share = () => {
    const url = shareUrl(`/cagnotte/${c.id}`);
    window.open(whatsappLink(`${c.title} — participez sur ToBe, en Mobile Money ou par carte depuis l'étranger : ${url}`), "_blank");
  };

  return (
    <div className="pb-32">
      <div className="relative">
        <Poster cover={null} theme={c.theme} category={c.category} title={c.eventTitle} showTitle className="h-56">
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] to-transparent" />
        </Poster>
        <div className="absolute inset-x-0 top-0">
          <TopBar transparent right={<IconButton label="Partager" onClick={share}><Share2 className="size-5" /></IconButton>} />
        </div>
      </div>
      <div className="relative -mt-14 px-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand">
          <HandCoins className="size-4" /> Cagnotte
        </div>
        <h1 className="mt-1 text-[25px] font-extrabold leading-tight">{c.title}</h1>
        {c.description && <p className="mt-2 text-[15px] leading-relaxed text-muted">{c.description}</p>}

        <Card className="mt-5 p-5">
          <div className="font-display text-[32px] font-extrabold leading-none">{formatFcfa(c.collected)}</div>
          {c.goal > 0 && (
            <>
              <div className="mt-1 text-sm text-muted">collectés sur {formatFcfa(c.goal)}</div>
              <Progress value={pct} className="mt-4" />
            </>
          )}
          <div className="mt-3 flex justify-between text-sm">
            <span className="font-semibold text-brand">{c.goal ? `${Math.round(pct)} %` : ""}</span>
            <span className="text-muted">{c.contributors} contributeur{c.contributors > 1 ? "s" : ""}</span>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-card-2 px-3 py-2.5 text-xs text-muted">
            <Globe2 className="size-4 shrink-0 text-brand" /> La famille à l'étranger peut contribuer par carte bancaire.
          </div>
        </Card>

        {thanks && (
          <div className="pop mt-4 flex items-center gap-3 rounded-2xl border border-coral/30 bg-coral/10 p-4 text-sm">
            <Heart className="size-6 shrink-0 fill-coral text-coral" />
            <span>
              <b>Merci pour votre générosité !</b> Votre message a été ajouté au livre d'or.
            </span>
          </div>
        )}

        <h2 className="mb-3 mt-7 text-lg font-bold">Livre d'or</h2>
        <div className="space-y-3">
          {c.contributions.length === 0 && <p className="text-sm text-muted">Soyez le premier à laisser un mot.</p>}
          {c.contributions.map((x) => (
            <div key={x.id} className="flex gap-3">
              <Avatar name={x.name} size={40} />
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{x.name}</span>
                  {x.amount !== null && <span className="shrink-0 text-xs font-bold text-brand">{formatFcfa(x.amount)}</span>}
                </div>
                {x.message && <p className="mt-1 text-sm text-ink/85">{x.message}</p>}
                <div className="mt-1 text-[11px] text-faint">{ago(x.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-app/95 lg:static lg:mt-8 lg:rounded-3xl lg:border lg:bg-card-2 lg:p-4 px-5 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 backdrop-blur-xl">
        {payments ? (
          <Button full size="lg" icon={<HandCoins className="size-5" />} onClick={() => setOpen(true)}>
            Contribuer
          </Button>
        ) : (
          <Button full size="lg" variant="dark" disabled>
            Contributions en ligne bientôt disponibles
          </Button>
        )}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Ma contribution">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {AMOUNTS.map((a) => (
              <button key={a} onClick={() => (setAmount(a), setCustom(""))} className={cx("h-14 rounded-2xl border font-display text-lg font-bold", !custom && amount === a ? "border-brand bg-brand/10 text-brand" : "border-line bg-card")}>
                {formatFcfa(a)}
              </button>
            ))}
          </div>
          <Field label="Autre montant (FCFA)">
            <input type="number" inputMode="numeric" min={500} className={inputCls} placeholder="Ex. 15 000" value={custom} onChange={(e) => setCustom(e.target.value)} />
          </Field>
          <Field label="Un mot pour le livre d'or (facultatif)">
            <textarea className={`${inputCls} min-h-20`} maxLength={280} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tous nos vœux de bonheur !" />
          </Field>
          <div className="flex items-center justify-between rounded-2xl border border-line bg-card p-3.5">
            <span className="text-sm font-semibold">Masquer mon nom et le montant</span>
            <Toggle checked={anonymous} onChange={setAnonymous} label="Anonyme" />
          </div>
          <PayPicker value={method} onChange={setMethod} />
          <Button full loading={busy} disabled={!(value >= 500)} onClick={contribute}>
            Contribuer {value >= 500 ? formatFcfa(value) : ""}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
