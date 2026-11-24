import type { OrganizerVerification } from "@tobe/core";
import { BadgeCheck, Clock, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";
import { Button, Field, inputCls } from "./ui";

interface State {
  verified: boolean;
  request: OrganizerVerification | null;
}

/** Devenir organisateur vérifié : obligatoire pour vendre en ligne et recevoir ses gains. */
export function VerificationCard({ sellsOnline }: { sellsOnline: boolean }) {
  const { me, toast } = useSession();
  const { data, setData } = useLoad(() => api<State>("GET", "/me/verification"), [me?.user.id]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ fullName: "", phone: "", orgName: "", link: "", about: "" });
  const [busy, setBusy] = useState(false);
  if (!data || data.verified) return null;
  const req = data.request;

  const send = async () => {
    setBusy(true);
    try {
      setData(await api<State>("POST", "/me/verification", f));
      setOpen(false);
      toast("Demande envoyée : l'équipe ToBe vous contacte sur WhatsApp");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };

  return (
    <section className="rounded-[24px] border border-brand/30 bg-brand-soft/50 p-4 dark:bg-brand/10 lg:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand text-white">
          {req?.status === "pending" ? <Clock className="size-5" /> : req?.status === "rejected" ? <XCircle className="size-5" /> : <ShieldCheck className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold">
            {req?.status === "pending" ? "Vérification en cours" : req?.status === "rejected" ? "Vérification refusée" : "Devenez organisateur vérifié"}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {req?.status === "pending"
              ? "L'équipe ToBe vous contacte sur WhatsApp pour confirmer votre identité (pièce d'identité en appel vidéo). Vos ventes ouvriront dès la validation."
              : req?.status === "rejected"
                ? (req.reason ?? "Contactez l'équipe ToBe pour en savoir plus.") + " Vous pouvez corriger et renvoyer votre demande."
                : `Pour protéger le public contre les faux événements, ToBe vérifie chaque organisateur avant d'ouvrir les ventes en ligne et les reversements.${sellsOnline ? " Vos événements payants sont publiés, mais les ventes restent fermées en attendant." : ""}`}
          </p>
        </div>
      </div>
      {req?.status !== "pending" && !open && (
        <Button
          full
          className="mt-4"
          icon={<BadgeCheck className="size-5" />}
          onClick={() => {
            setF({ fullName: req?.fullName ?? me?.user.name ?? "", phone: req?.phone ?? me?.user.phone ?? "", orgName: req?.orgName ?? "", link: req?.link ?? "", about: req?.about ?? "" });
            setOpen(true);
          }}
        >
          {req?.status === "rejected" ? "Renvoyer ma demande" : "Demander la vérification"}
        </Button>
      )}
      {open && (
        <div className="mt-4 space-y-3">
          <Field label="Nom complet (comme sur votre pièce d'identité)">
            <input className={inputCls} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
          </Field>
          <Field label="Numéro WhatsApp">
            <input className={inputCls} inputMode="tel" placeholder="90 12 34 56" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label="Structure ou nom de l'événement">
            <input className={inputCls} placeholder="Ex. KM Events, Festival Son & Lumière" value={f.orgName} onChange={(e) => setF({ ...f, orgName: e.target.value })} />
          </Field>
          <Field label="Page officielle (Facebook, Instagram, site)" hint="Là où le public vous connaît déjà : c'est ce qui permet de vérifier que c'est bien vous.">
            <input className={inputCls} placeholder="https://facebook.com/…" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />
          </Field>
          <Field label="Événements déjà organisés (facultatif)">
            <textarea className={`${inputCls} min-h-20`} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button full loading={busy} onClick={send}>
              Envoyer
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
