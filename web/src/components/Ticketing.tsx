import { DoorOpen, Ticket } from "lucide-react";
import { Field, cx, inputCls } from "./ui";

/** Choix : billetterie sur ToBe, ou l'organisateur gère l'entrée autrement. */
export function TicketingChoice({ on, onChange, locked }: { on: boolean; onChange: (on: boolean) => void; locked?: boolean }) {
  const opts: [boolean, string, string, typeof Ticket][] = [
    [true, "Billetterie ToBe", "Billets, réservations ou invitations avec QR code", Ticket],
    [false, "Sans billetterie", "Vous gérez l'entrée autrement", DoorOpen],
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {opts.map(([v, title, text, Icon]) => (
        <button
          key={title}
          type="button"
          disabled={locked && v !== on}
          onClick={() => onChange(v)}
          className={cx(
            "rounded-2xl border p-3.5 text-left transition disabled:opacity-40",
            on === v ? "border-brand bg-brand-soft text-ink ring-1 ring-brand dark:bg-brand/15" : "border-line bg-card",
          )}
        >
          <Icon className={cx("size-5", on === v ? "text-brand" : "text-muted")} />
          <div className="mt-2 text-sm font-bold">{title}</div>
          <div className="mt-0.5 text-xs text-muted">{text}</div>
        </button>
      ))}
    </div>
  );
}

/** Infos d'entrée quand il n'y a pas de billetterie ToBe. */
export function EntryFields({ info, setInfo, url, setUrl }: { info: string; setInfo: (v: string) => void; url: string; setUrl: (v: string) => void }) {
  return (
    <div className="space-y-4 rounded-2xl border border-line bg-card p-4">
      <p className="text-sm text-muted">Pas de billets ni de réservations sur ToBe. Le public voit l'événement, les infos ci-dessous et peut activer les rappels.</p>
      <Field label="Comment entrer ? (facultatif)" hint="Ex. « Entrée libre », « Sur carton d'invitation », « Billets en vente à la boutique X, 5 000 FCFA ».">
        <textarea className={`${inputCls} min-h-24`} maxLength={300} value={info} onChange={(e) => setInfo(e.target.value)} />
      </Field>
      <Field label="Lien vers votre billetterie ou vos infos (facultatif)" hint="Site, page Facebook, lien WhatsApp…">
        <input type="url" inputMode="url" className={inputCls} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
    </div>
  );
}
