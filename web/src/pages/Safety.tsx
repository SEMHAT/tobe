import { AlertTriangle, BadgeCheck, Flag, Lock, ShieldCheck, Smartphone, Ticket } from "lucide-react";
import type { ReactNode } from "react";
import { TopBar } from "../components/ui";
import { usePageMeta } from "../lib/seo";

function Point({ icon, title, children, tone = "brand" }: { icon: ReactNode; title: string; children: ReactNode; tone?: "brand" | "emerald" | "coral" }) {
  const c = { brand: "bg-brand/10 text-brand", emerald: "bg-emerald/10 text-emerald", coral: "bg-coral/10 text-coral" }[tone];
  return (
    <div className="flex gap-3 rounded-2xl border border-line bg-card p-4">
      <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${c} [&>svg]:size-5`}>{icon}</span>
      <div>
        <h2 className="font-display font-bold">{title}</h2>
        <p className="mt-1 text-sm text-muted">{children}</p>
      </div>
    </div>
  );
}

/** Comment acheter en toute sécurité sur ToBe. */
export function Safety() {
  usePageMeta({ title: "Payer en toute sécurité | ToBe Lomé", description: "Comment reconnaître un événement vérifié et payer vos billets sans risque sur ToBe." });
  return (
    <>
      <TopBar title="Payer en toute sécurité" />
      <div className="mx-auto max-w-2xl space-y-3 px-5 pb-16 pt-4 lg:px-0">
        <div className="rounded-[24px] brand-gradient p-5 text-white">
          <ShieldCheck className="size-8" />
          <h1 className="mt-2 font-display text-2xl font-bold">Vos billets, sans arnaque</h1>
          <p className="mt-1 text-sm text-white/85">ToBe contrôle les organisateurs et les événements avant d'ouvrir la billetterie. Voici comment être sûr avant de payer.</p>
        </div>
        <Point icon={<BadgeCheck />} title="Cherchez le badge « Événement vérifié »" tone="emerald">
          Il signifie que l'équipe ToBe a contrôlé l'identité de l'organisateur (pièce d'identité, documents de sa structure) et ses preuves pour cet événement (contrat de salle, autorisation de l'artiste…). Seuls les événements vérifiés peuvent vendre des billets sur ToBe.
        </Point>
        <Point icon={<Lock />} title="Payez uniquement sur ToBe">
          Le paiement se fait sur la page sécurisée de ToBe, par Mobile Money. Votre billet avec QR code arrive tout de suite dans « Mes billets ». Si le paiement n'aboutit pas, rien n'est débité.
        </Point>
        <Point icon={<Smartphone />} title="N'envoyez jamais d'argent directement" tone="coral">
          Personne de ToBe ne vous demandera d'envoyer de l'argent sur un numéro Mobile Money, par WhatsApp ou par SMS. Un vendeur qui vous demande un transfert direct n'est pas protégé par ToBe.
        </Point>
        <Point icon={<Ticket />} title="Un billet ToBe ne se revend pas en photo">
          Chaque QR code n'entre qu'une seule fois. Une capture d'écran achetée à quelqu'un peut déjà avoir été utilisée : achetez votre propre billet.
        </Point>
        <Point icon={<AlertTriangle />} title="Pas encore vérifié ?" tone="coral">
          L'événement peut être affiché pendant que ToBe le contrôle, mais sa billetterie reste fermée. Méfiez-vous de quiconque vous propose de payer « en avance » ailleurs.
        </Point>
        <Point icon={<Flag />} title="Un doute ? Signalez">
          En bas de chaque page d'événement, « Signaler cet événement » prévient immédiatement l'équipe ToBe. Après plusieurs signalements, l'événement est retiré le temps de la vérification et l'organisateur ne reçoit plus d'argent.
        </Point>
      </div>
    </>
  );
}
