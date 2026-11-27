import { CheckCircle2, ScanFace, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, ErrorState, PageLoader, TopBar } from "../components/ui";
import { api } from "../lib/api";
import { shortDate } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";
import { CameraSheet } from "./Photos";

type Invite = { name: string; status: "pending" | "active" | "revoked"; owner: string; eventTitle: string; eventDate: string | null };

/** Un proche invité (pack Full HD) donne, ou refuse, son accord. Pas besoin de compte. */
export function GuestConsent() {
  const { code = "" } = useParams();
  const { toast } = useSession();
  const { data, error, loading, setData } = useLoad(() => api<Invite>("GET", `/photo-guests/${code}`), [code]);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) return <PageLoader />;
  if (error || !data)
    return (
      <>
        <TopBar title="Accord photo" />
        <ErrorState message={error?.message ?? "Lien introuvable"} />
      </>
    );

  const accept = async (descriptors: number[][]) => {
    await api("POST", `/photo-guests/${code}/accept`, { descriptors, consent: true });
    setData({ ...data, status: "active" });
    setTimeout(() => setCamera(false), 700);
  };
  const decline = async () => {
    setBusy(true);
    try {
      await api("POST", `/photo-guests/${code}/decline`);
      setData({ ...data, status: "revoked" });
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };

  return (
    <div className="pb-16 lg:mx-auto lg:max-w-lg">
      <TopBar title="Accord photo" />
      <div className="space-y-4 px-5 pt-4">
        <div className="rounded-[26px] bg-gradient-to-b from-[#1800ad] to-[#0b0b12] p-6 text-white">
          <ScanFace className="size-10" />
          <h1 className="mt-3 font-display text-xl font-extrabold">Bonjour {data.name}</h1>
          <p className="mt-2 text-sm text-white/80">
            <b className="text-white">{data.owner}</b> aimerait recevoir les photos où vous apparaissez à <b className="text-white">« {data.eventTitle} »</b>
            {data.eventDate ? ` (${shortDate(data.eventDate)})` : ""}.
          </p>
        </div>

        {data.status === "pending" && (
          <>
            <ul className="space-y-2 rounded-2xl border border-line bg-card p-4 text-sm text-muted">
              <li className="flex gap-2">
                <ShieldCheck className="size-4 shrink-0 text-brand" /> Votre selfie reste sur votre téléphone : seule une empreinte du visage est enregistrée.
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="size-4 shrink-0 text-brand" /> Elle sert uniquement à retrouver vos photos de cet événement pour {data.owner}.
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="size-4 shrink-0 text-brand" /> Effacée 6 mois après l'événement, ou tout de suite si vous retirez votre accord avec ce même lien.
              </li>
            </ul>
            <Button full size="lg" icon={<ScanFace className="size-5" />} onClick={() => setCamera(true)}>
              J'accepte et je fais mon selfie
            </Button>
            <Button full variant="ghost" loading={busy} icon={<X className="size-4" />} onClick={decline}>
              Je refuse
            </Button>
          </>
        )}
        {data.status === "active" && (
          <div className="space-y-3">
            <div className="flex gap-3 rounded-2xl border border-emerald/30 bg-emerald/10 p-4 text-sm">
              <CheckCircle2 className="size-5 shrink-0 text-emerald" /> Merci ! {data.owner} recevra les photos où vous apparaissez.
            </div>
            <Button full variant="ghost" loading={busy} onClick={decline}>
              Retirer mon accord et effacer mon visage
            </Button>
          </div>
        )}
        {data.status === "revoked" && <div className="rounded-2xl border border-line bg-card p-4 text-sm">C'est noté : votre visage n'est pas utilisé.</div>}
        <Link to="/confidentialite" className="block text-center text-sm font-semibold text-brand">
          Vos données et votre visage →
        </Link>
      </div>
      <CameraSheet open={camera} onClose={() => setCamera(false)} onDescriptors={accept} mode="enroll" title="Mon selfie" />
    </div>
  );
}
