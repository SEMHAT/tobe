import { Camera, Check, Copy, Crown, MessageCircle, ScanLine, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { ago, shareUrl } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";
import { Button, Field, Sheet, cx, inputCls } from "./ui";
import { Avatar } from "./visual";

// =====================================================================
// Invitations par WhatsApp : équipe d'un événement ou équipe ToBe.
// =====================================================================

export interface InviteResult {
  invite: { id: string; role: string; label: string; expiresAt: string };
  path: string;
  message: string;
  roleLabel: string;
}

/** Lien WhatsApp : directement vers le numéro s'il est connu, sinon choix du contact. */
export function waLink(text: string, phone?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const num = digits.length === 8 ? `228${digits}` : digits.length >= 10 ? digits.replace(/^00/, "") : "";
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

/** Fenêtre commune : choisir un rôle, nommer la personne, puis envoyer le lien sur WhatsApp. */
export function InviteSheet({
  open,
  onClose,
  title,
  roles,
  create,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  roles: { id: string; label: string; description: string; icon?: ReactNode; disabled?: boolean }[];
  create: (role: string, label: string) => Promise<InviteResult>;
  onCreated?: () => void;
}) {
  const { toast } = useSession();
  const [role, setRole] = useState(roles.find((r) => !r.disabled)?.id ?? "");
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);
  const reset = () => {
    setResult(null);
    setLabel("");
    setPhone("");
    onClose();
  };
  const link = result ? shareUrl(result.path) : "";
  return (
    <Sheet open={open} onClose={reset} title={result ? "Invitation prête" : title}>
      {result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-emerald/10 p-4 text-sm">
            <Check className="size-5 shrink-0 text-emerald" />
            <span>
              Envoyez ce lien à {result.invite.label || "la personne"} : en l'ouvrant, elle devient <b>{result.roleLabel.toLowerCase()}</b>. Lien valable 14 jours, utilisable une fois.
            </span>
          </div>
          <div className="rounded-2xl border border-line bg-card-2 p-3 text-sm text-muted">
            {result.message}
            <span className="break-all text-brand">{link}</span>
          </div>
          <a href={waLink(result.message + link, phone)} target="_blank" rel="noreferrer" className="flex h-13 items-center justify-center gap-2 rounded-full bg-[#25d366] py-3.5 font-semibold text-[#06260f]">
            <MessageCircle className="size-5" /> Envoyer sur WhatsApp
          </a>
          <Button full variant="outline" icon={<Copy className="size-4" />} onClick={() => navigator.clipboard?.writeText(result.message + link).then(() => toast("Invitation copiée"), () => toast(link))}>
            Copier le message
          </Button>
          <button onClick={() => setResult(null)} className="h-10 w-full text-sm font-semibold text-muted">
            Inviter quelqu'un d'autre
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {roles.map((r) => (
              <button
                key={r.id}
                disabled={r.disabled}
                onClick={() => setRole(r.id)}
                className={cx(
                  "flex w-full items-start gap-3 rounded-2xl border-2 p-3.5 text-left transition disabled:opacity-40",
                  role === r.id ? "border-brand bg-brand-soft dark:bg-brand/15" : "border-line bg-card",
                )}
              >
                <span className={cx("mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl", role === r.id ? "bg-brand text-white" : "bg-card-2 text-brand")}>{r.icon ?? <ShieldCheck className="size-5" />}</span>
                <span>
                  <span className="block font-semibold">{r.label}</span>
                  <span className="block text-sm text-muted">{r.disabled ? "Réservé au super administrateur" : r.description}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom (facultatif)">
              <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Kossi" />
            </Field>
            <Field label="WhatsApp (facultatif)">
              <input className={inputCls} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="90 12 34 56" />
            </Field>
          </div>
          <Button
            full
            size="lg"
            loading={busy}
            disabled={!role}
            icon={<UserPlus className="size-5" />}
            onClick={async () => {
              setBusy(true);
              try {
                setResult(await create(role, label.trim()));
                onCreated?.();
              } catch (e) {
                toast((e as Error).message, "error");
              }
              setBusy(false);
            }}
          >
            Créer l'invitation
          </Button>
        </div>
      )}
    </Sheet>
  );
}

// ---------- Équipe d'un événement ----------
interface EventTeamData {
  roles: { id: string; label: string; description: string }[];
  canManage: boolean;
  owner: { id: string; name: string } | null;
  members: { id: string; userId: string; role: string; roleLabel: string; name: string; avatar: string | null; createdAt: string }[];
  invites: { id: string; role: string; label: string; createdAt: string }[];
}

const EVENT_ROLE_ICONS: Record<string, ReactNode> = {
  co_organisateur: <Crown className="size-5" />,
  controleur: <ScanLine className="size-5" />,
  photographe: <Camera className="size-5" />,
};

export function EventTeam({ eventId }: { eventId: string }) {
  const { me, toast } = useSession();
  const { data, reload, setData } = useLoad(() => api<EventTeamData>("GET", `/events/${eventId}/team`), [eventId]);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const remove = async (memberId: string, self: boolean) => {
    if (!confirm(self ? "Quitter l'équipe de cet événement ?" : "Retirer cette personne de l'équipe ?")) return;
    try {
      await api("DELETE", `/team-members/${memberId}`);
      setData({ ...data, members: data.members.filter((m) => m.id !== memberId) });
      toast(self ? "Vous avez quitté l'équipe" : "Accès retiré");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const revoke = async (token: string) => {
    try {
      await api("DELETE", `/invites/${token}`);
      setData({ ...data, invites: data.invites.filter((i) => i.id !== token) });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const roleLabel = (id: string) => data.roles.find((r) => r.id === id)?.label ?? id;
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Users className="size-5 text-brand" /> Équipe de l'événement
        </h2>
        {data.canManage && (
          <Button size="sm" icon={<UserPlus className="size-4" />} onClick={() => setOpen(true)}>
            Inviter
          </Button>
        )}
      </div>
      {data.canManage && data.members.length === 0 && data.invites.length === 0 && (
        <p className="mb-3 rounded-2xl bg-card-2 p-4 text-sm text-muted">Invitez par WhatsApp les personnes qui scannent les billets à l'entrée, vos photographes ou un co-organisateur. Chacun n'a accès qu'à ce dont il a besoin.</p>
      )}
      <div className="overflow-hidden rounded-2xl border border-line bg-card">
        {data.owner && (
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar name={data.owner.name} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{data.owner.name}</span>
              <span className="block text-xs text-muted">Organisateur</span>
            </span>
          </div>
        )}
        {data.members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 border-t border-line px-4 py-3">
            <Avatar name={m.name} src={m.avatar} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{m.name}</span>
              <span className="flex items-center gap-1 text-xs text-muted">
                <span className="text-brand [&>svg]:size-3.5">{EVENT_ROLE_ICONS[m.role]}</span> {m.roleLabel}
              </span>
            </span>
            {(data.canManage || m.userId === me?.user.id) && (
              <button aria-label="Retirer" onClick={() => remove(m.id, m.userId === me?.user.id)} className="grid size-9 place-items-center rounded-full text-faint hover:text-coral">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
        {data.invites.map((i) => (
          <div key={i.id} className="flex items-center gap-3 border-t border-dashed border-line px-4 py-3">
            <span className="grid size-9 place-items-center rounded-full bg-card-2 text-faint">
              <MessageCircle className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{i.label || "Invitation envoyée"}</span>
              <span className="block text-xs text-muted">
                {roleLabel(i.role)} · en attente · {ago(i.createdAt)}
              </span>
            </span>
            <button onClick={() => revoke(i.id)} className="h-8 rounded-full border border-line px-3 text-xs font-semibold">
              Annuler
            </button>
          </div>
        ))}
      </div>
      <InviteSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Inviter dans l'équipe"
        roles={data.roles.map((r) => ({ ...r, icon: EVENT_ROLE_ICONS[r.id] }))}
        create={(role, label) => api<InviteResult>("POST", `/events/${eventId}/team/invites`, { role, label })}
        onCreated={reload}
      />
    </section>
  );
}
