import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, TopBar } from "../components/ui";
import { api } from "../lib/api";
import { formatFcfa } from "../lib/format";
import { useSession } from "../lib/session";

interface Status {
  id: string;
  status: "created" | "pending" | "paid" | "failed" | "expired";
  amount: number;
  description: string;
  link: string | null;
  error: string | null;
}

/** Retour de la page de paiement : on vérifie auprès de l'agrégateur jusqu'à confirmation. */
export function PaymentReturn() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { refresh } = useSession();
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [waited, setWaited] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    let stop = false;
    let n = 0;
    const tick = async () => {
      try {
        const r = await api<Status>("POST", `/payments/${id}/verify`);
        if (stop) return;
        setS(r);
        if (r.status === "paid") {
          if (!done.current) {
            done.current = true;
            refresh();
            if (r.link && !r.error) setTimeout(() => nav(r.link!, { replace: true }), 1800);
          }
          return;
        }
        if (r.status === "failed" || r.status === "expired") return;
      } catch (e) {
        if (!stop) setErr((e as Error).message);
      }
      n++;
      setWaited(n);
      // Toutes les 3 s pendant 2 minutes, puis toutes les 10 s.
      if (!stop && n < 60) setTimeout(tick, n < 40 ? 3000 : 10000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [id, nav, refresh]);

  const st = s?.status;
  return (
    <>
      <TopBar title="Paiement" />
      <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-6 text-center">
        <div>
          {st === "paid" ? (
            <>
              <CheckCircle2 className="mx-auto size-16 text-emerald" />
              <h1 className="mt-4 font-display text-2xl font-bold">Paiement confirmé</h1>
              <p className="mt-2 text-muted">{s!.description}</p>
              <p className="mt-1 font-display text-xl font-bold text-brand">{formatFcfa(s!.amount)}</p>
              {s!.error ? (
                <p className="mt-4 rounded-2xl bg-[#fff4dc] p-3 text-sm text-[#7a4a00]">Votre paiement est bien reçu, mais un souci est survenu ({s!.error}). L'équipe ToBe a été prévenue et vous recontacte rapidement.</p>
              ) : (
                s!.link && (
                  <Link to={s!.link} replace>
                    <Button full size="lg" className="mt-6">
                      Continuer
                    </Button>
                  </Link>
                )
              )}
            </>
          ) : st === "failed" || st === "expired" ? (
            <>
              <XCircle className="mx-auto size-16 text-coral" />
              <h1 className="mt-4 font-display text-2xl font-bold">{st === "expired" ? "Paiement expiré" : "Paiement non abouti"}</h1>
              <p className="mt-2 text-muted">Aucun montant n'a été débité. Vous pouvez réessayer.</p>
              <Button full size="lg" className="mt-6" onClick={() => history.length > 2 ? history.go(-2) : nav("/")}>
                Réessayer
              </Button>
            </>
          ) : err && !s ? (
            <>
              <XCircle className="mx-auto size-16 text-coral" />
              <h1 className="mt-4 font-display text-2xl font-bold">Paiement introuvable</h1>
              <p className="mt-2 text-muted">{err}</p>
            </>
          ) : (
            <>
              {waited < 40 ? <Loader2 className="mx-auto size-14 animate-spin text-brand" /> : <Clock className="mx-auto size-14 text-brand" />}
              <h1 className="mt-4 font-display text-2xl font-bold">Confirmation du paiement…</h1>
              <p className="mt-2 text-muted">
                {waited < 40
                  ? "Si ce n'est pas encore fait, validez le paiement sur votre téléphone (code secret Mobile Money)."
                  : "La confirmation prend plus de temps que prévu. Vous recevrez une notification dès que c'est bon : vous pouvez fermer cette page."}
              </p>
              {s && <p className="mt-3 text-sm text-faint">{s.description} · {formatFcfa(s.amount)}</p>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
