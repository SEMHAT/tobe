import type { EventView, OrganizerVerification } from "@tobe/core";
import { BadgeCheck, Clock, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";
import { DocInput } from "./DocInput";
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
  const [f, setF] = useState({ fullName: "", phone: "", orgName: "", link: "", about: "", structureNumber: "", role: "" });
  const [kind, setKind] = useState<"person" | "structure">("person");
  const [idFront, setIdFront] = useState<string | null>(null);
  const [idBack, setIdBack] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [structDoc, setStructDoc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data || data.verified) return null;
  const req = data.request;

  const send = async () => {
    setBusy(true);
    try {
      setData(await api<State>("POST", "/me/verification", { ...f, kind, idDocs: [idFront, idBack].filter(Boolean), selfie, structureDocs: [structDoc].filter(Boolean) }));
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
              ? "L'équipe ToBe contrôle vos documents et peut vous appeler sur WhatsApp. Vos ventes ouvriront dès la validation."
              : req?.status === "rejected"
                ? (req.reason ?? "Contactez l'équipe ToBe pour en savoir plus.") + " Vous pouvez corriger et renvoyer votre demande."
                : `Pour protéger le public contre les arnaques, ToBe vérifie l'identité de chaque organisateur avant d'ouvrir les ventes en ligne et les reversements. Vos documents restent privés : seule l'équipe ToBe les voit.${sellsOnline ? " Vos événements payants sont publiés, mais la billetterie reste fermée en attendant." : ""}`}
          </p>
        </div>
      </div>
      {req?.status !== "pending" && !open && (
        <Button
          full
          className="mt-4"
          icon={<BadgeCheck className="size-5" />}
          onClick={() => {
            setF({ fullName: req?.fullName ?? me?.user.name ?? "", phone: req?.phone ?? me?.user.phone ?? "", orgName: req?.orgName ?? "", link: req?.link ?? "", about: req?.about ?? "", structureNumber: req?.structureNumber ?? "", role: req?.role ?? "" });
            setKind(req?.kind ?? "person");
            setOpen(true);
          }}
        >
          {req?.status === "rejected" ? "Renvoyer ma demande" : "Demander la vérification"}
        </Button>
      )}
      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["person", "Je suis un particulier"],
                ["structure", "J'organise pour une structure"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-2xl border p-3 text-sm font-semibold ${kind === k ? "border-brand bg-brand/10 text-brand" : "border-line"}`}>
                {l}
              </button>
            ))}
          </div>
          <Field label="Nom complet (comme sur votre pièce d'identité)">
            <input className={inputCls} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
          </Field>
          <Field label="Numéro WhatsApp">
            <input className={inputCls} inputMode="tel" placeholder="90 12 34 56" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label={kind === "structure" ? "Nom de la structure" : "Nom sous lequel vous organisez"}>
            <input className={inputCls} placeholder="Ex. KM Events, Festival Son & Lumière" value={f.orgName} onChange={(e) => setF({ ...f, orgName: e.target.value })} />
          </Field>
          <DocInput label="Pièce d'identité (recto)" hint="CNI, passeport ou permis, lisible et en cours de validité" value={idFront} onChange={setIdFront} capture="environment" />
          <DocInput label="Pièce d'identité (verso)" hint="Facultatif pour un passeport" value={idBack} onChange={setIdBack} capture="environment" />
          {kind === "person" ? (
            <DocInput label="Selfie avec votre pièce" hint="Votre visage et la pièce d'identité sur la même photo" value={selfie} onChange={setSelfie} capture="user" />
          ) : (
            <>
              <DocInput label="Document officiel de la structure" hint="RCCM, récépissé d'association, statuts" value={structDoc} onChange={setStructDoc} capture="environment" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="N° RCCM / récépissé">
                  <input className={inputCls} value={f.structureNumber} onChange={(e) => setF({ ...f, structureNumber: e.target.value })} />
                </Field>
                <Field label="Votre fonction">
                  <input className={inputCls} placeholder="Gérant, président…" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
                </Field>
              </div>
            </>
          )}
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

const PROOF_KINDS = [
  "Contrat ou réservation de la salle",
  "Autorisation de l'artiste ou de son manager",
  "Autorisation de la mairie / préfecture",
  "Contrat avec le lieu ou le partenaire",
  "Autre preuve",
];

/** Prouver qu'on organise bien cet événement : obligatoire pour ouvrir la billetterie. */
export function EventProofCard({ ev, onDone }: { ev: EventView; onDone: (v: EventView) => void }) {
  const { toast } = useSession();
  const [doc, setDoc] = useState<string | null>(null);
  const [label, setLabel] = useState(PROOF_KINDS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (ev.eventVerified)
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald/40 bg-emerald/5 p-3.5 text-sm">
        <BadgeCheck className="size-5 shrink-0 text-emerald" />
        <span>
          <b>Événement vérifié par ToBe.</b> Le badge est visible par le public{ev.access === "paid" ? " et la billetterie est ouverte" : ""}.
        </span>
      </div>
    );
  const send = async () => {
    if (!doc) return toast("Ajoutez une photo du document", "error");
    setBusy(true);
    try {
      onDone(await api<EventView>("POST", `/events/${ev.id}/proof`, { files: [{ fileId: doc, label }], note }));
      setDoc(null);
      setNote("");
      toast("Preuve envoyée à l'équipe ToBe");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  return (
    <section className="rounded-[24px] border border-brand/30 bg-brand-soft/50 p-4 dark:bg-brand/10">
      <h3 className="flex items-center gap-2 font-display font-bold">
        <ShieldCheck className="size-5 text-brand" /> Faire vérifier cet événement
      </h3>
      <p className="mt-1 text-sm text-muted">
        {ev.proofs.length
          ? `${ev.proofs.length} preuve(s) envoyée(s) : l'équipe ToBe les contrôle, en général sous 24 h.`
          : "Prouvez que vous organisez bien cet événement. Une fois vérifié, il affiche le badge « Événement vérifié » et la billetterie s'ouvre. Les documents restent privés."}
      </p>
      {ev.proofs.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {ev.proofs.map((p, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <Clock className="size-3.5" /> {p.label}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 space-y-2">
        <select className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)}>
          {PROOF_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <DocInput label="Photo du document" value={doc} onChange={setDoc} capture="environment" />
        <textarea className={`${inputCls} min-h-16`} placeholder="Précisions pour l'équipe (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button full loading={busy} onClick={send}>
          Envoyer la preuve
        </Button>
      </div>
    </section>
  );
}
