import type { EventCard } from "@tobe/core";
import { CalendarDays, CheckCircle2, MapPin, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, ErrorState, PageLoader, TopBar } from "../components/ui";
import { Logo, Poster } from "../components/visual";
import { api } from "../lib/api";
import { longDate, time } from "../lib/format";
import { usePageMeta } from "../lib/seo";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

interface InviteView {
  kind: "event" | "team";
  role: string;
  label: string;
  expired: boolean;
  used: boolean;
  roleLabel: string;
  roleDescription: string;
  inviter: string;
  event: EventCard | null;
}

/** Page ouverte depuis le lien reçu sur WhatsApp. */
export function Invitation() {
  const { token = "" } = useParams();
  const nav = useNavigate();
  const { me, requireAuth, refresh, toast } = useSession();
  const { data, error, loading } = useLoad(() => api<InviteView>("GET", `/invites/${token}`), [token]);
  const [busy, setBusy] = useState(false);
  usePageMeta({ title: "Invitation ToBe", description: "Rejoignez une équipe sur ToBe.", noindex: true });

  if (loading && !data) return <PageLoader />;
  if (error || !data)
    return (
      <>
        <TopBar title="Invitation" />
        <ErrorState message={error?.message ?? "Invitation introuvable"} />
      </>
    );

  const accept = async () => {
    if (!me && !(await requireAuth(`Connectez-vous pour devenir ${data.roleLabel.toLowerCase()}.`))) return;
    setBusy(true);
    try {
      const r = await api<{ redirect: string }>("POST", `/invites/${token}/accept`);
      await refresh();
      toast(data.kind === "team" ? `Bienvenue dans l'équipe ToBe !` : `Vous êtes maintenant ${data.roleLabel.toLowerCase()}`);
      nav(r.redirect, { replace: true });
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  const blocked = data.expired || data.used;

  return (
    <div className="min-h-full pb-10">
      <TopBar title="Invitation" />
      <div className="mx-auto max-w-md px-5 pt-4">
        <div className="overflow-hidden rounded-[28px] border border-line bg-card">
          {data.event ? (
            <Poster cover={data.event.cover} theme={data.event.theme} category={data.event.category} title={data.event.title} showTitle={!data.event.cover} className="aspect-[16/9] w-full" />
          ) : (
            <div className="grid aspect-[16/9] place-items-center club-gradient">
              <Logo className="text-4xl text-white" />
            </div>
          )}
          <div className="p-5">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand dark:bg-brand/20 dark:text-white">
              {data.kind === "team" ? <Sparkles className="size-3.5" /> : <ShieldCheck className="size-3.5" />} {data.roleLabel}
            </div>
            <h1 className="mt-3 font-display text-2xl font-extrabold leading-tight">
              {data.inviter} vous invite {data.kind === "team" ? "dans l'équipe ToBe" : `pour « ${data.event?.title ?? "un événement"} »`}
            </h1>
            <p className="mt-2 text-sm text-muted">{data.roleDescription}</p>
            {data.event && (
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-brand" /> {longDate(data.event.startsAt)} à {time(data.event.startsAt)}
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-brand" /> {data.event.venue}
                </div>
              </div>
            )}
            <div className="mt-6">
              {blocked ? (
                <div className="flex items-center gap-2 rounded-2xl bg-card-2 p-4 text-sm text-muted">
                  <XCircle className="size-5 text-coral" /> {data.used ? "Cette invitation a déjà été utilisée." : "Cette invitation a expiré."} Demandez un nouveau lien à {data.inviter}.
                </div>
              ) : (
                <Button full size="lg" loading={busy} icon={<CheckCircle2 className="size-5" />} onClick={accept}>
                  {me ? "Accepter l'invitation" : "Se connecter et accepter"}
                </Button>
              )}
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-faint">Vous n'aurez accès qu'à ce dont votre rôle a besoin. L'organisateur peut retirer l'accès à tout moment.</p>
      </div>
    </div>
  );
}
