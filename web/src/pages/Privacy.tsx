import { Clock, EyeOff, ScanFace, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { TopBar } from "../components/ui";

const ROWS: { icon: typeof Clock; title: string; text: string }[] = [
  { icon: ScanFace, title: "Une empreinte, jamais votre photo", text: "Le Pass ToBe calcule sur votre téléphone une suite de 128 nombres qui décrit votre visage. Seule cette empreinte est envoyée. Elle ne permet pas de reconstituer votre photo." },
  { icon: ShieldCheck, title: "Seulement avec votre accord", text: "Rien n'est activé sans la case cochée. La date et la version du texte accepté sont enregistrées. La recherche ponctuelle par selfie n'enregistre rien." },
  { icon: Clock, title: "Durées de conservation", text: "Votre empreinte est effacée automatiquement après 12 mois sans utilisation. Les empreintes calculées sur les photos d'un événement sont effacées 6 mois après l'événement : les photos restent, la recherche par visage s'arrête." },
  { icon: Trash2, title: "Effacer en un geste", text: "Photos → Réglages → « Supprimer mes données de visage » efface tout de suite votre empreinte. La suppression de votre compte efface aussi vos données." },
  { icon: ShieldCheck, title: "Visages de vos proches (pack Full HD)", text: "Un adulte ajouté reçoit un lien : c'est lui qui donne son accord et fait son selfie, et il peut le retirer avec le même lien. Pour un enfant, seul le parent ou le tuteur légal peut l'ajouter, en l'attestant. Ces visages ne servent qu'à l'événement concerné et sont effacés 6 mois après." },
  { icon: Clock, title: "Photos protégées", text: "La galerie publique ne montre que des aperçus filigranés. Les versions avec logo, sans logo et Full HD ne sont remises qu'aux personnes qui apparaissent sur la photo, selon leur formule." },
  { icon: EyeOff, title: "Retirer une photo de vous", text: "Sur toute photo où ToBe vous reconnaît, « Retirer » la supprime de la galerie. L'option « Ne jamais me montrer » vous cache des galeries publiques." },
];

/** Données personnelles et visages : ce que fait ToBe (loi togolaise n° 2019-014). */
export function Privacy() {
  return (
    <div className="pb-16 lg:mx-auto lg:max-w-2xl">
      <TopBar title="Vos données" />
      <div className="space-y-5 px-5 pt-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold leading-tight">Vos photos, votre visage, vos règles</h1>
          <p className="mt-1 text-sm text-muted">ToBe applique la loi togolaise n° 2019-014 relative à la protection des données à caractère personnel. Voici, simplement, ce que nous faisons de vos données.</p>
        </div>
        <ul className="space-y-3">
          {ROWS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3 rounded-2xl border border-line bg-card p-4">
              <Icon className="mt-0.5 size-5 shrink-0 text-brand" />
              <div className="text-sm">
                <div className="font-semibold">{title}</div>
                <p className="mt-0.5 text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="rounded-2xl bg-card-2 p-4 text-sm text-muted">
          <b className="text-ink">Paiements et pièces d'identité :</b> les documents d'identité des organisateurs sont privés, visibles seulement par l'équipe de vérification. Les paiements passent par SasPay ; ToBe ne voit jamais votre code Mobile Money.
          <br />
          <b className="text-ink">Vos droits :</b> accès, rectification, opposition et effacement. Écrivez-nous depuis votre profil ; vous pouvez aussi saisir l'Instance de protection des données à caractère personnel (IPDCP).
        </div>
        <Link to="/securite" className="block text-center text-sm font-semibold text-brand">
          Payer en toute sécurité sur ToBe →
        </Link>
      </div>
    </div>
  );
}
