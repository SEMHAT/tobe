/** Questions du quiz quotidien ToBe : Lomé, le Togo, la fête et l'application. */
export interface QuizQuestion {
  id: string;
  theme: "Togo" | "Lomé" | "Culture" | "Saveurs" | "Sport" | "Événementiel" | "ToBe";
  q: string;
  choices: string[];
  answer: number; // index de la bonne réponse
  explain: string;
}

export const QUIZ: QuizQuestion[] = [
  { id: "t1", theme: "Togo", q: "À quelle date le Togo a-t-il proclamé son indépendance ?", choices: ["1er août 1960", "27 avril 1960", "13 janvier 1963", "4 avril 1960"], answer: 1, explain: "Le Togo est indépendant depuis le 27 avril 1960, jour de la fête nationale." },
  { id: "t2", theme: "Togo", q: "Quel est le point culminant du Togo ?", choices: ["Le mont Kloto", "Le pic d'Adélé", "Le mont Agou", "Le mont Djeto"], answer: 2, explain: "Le mont Agou, près de Kpalimé, culmine à 986 mètres." },
  { id: "t3", theme: "Togo", q: "Combien le Togo compte-t-il de régions administratives ?", choices: ["3", "5", "7", "9"], answer: 1, explain: "Maritime, Plateaux, Centrale, Kara et Savanes." },
  { id: "t4", theme: "Togo", q: "Dans quelle région se trouve Lomé ?", choices: ["Plateaux", "Centrale", "Maritime", "Savanes"], answer: 2, explain: "Lomé est dans la région Maritime, au bord du golfe de Guinée." },
  { id: "t5", theme: "Togo", q: "Quel pays borde le Togo à l'est ?", choices: ["Le Ghana", "Le Bénin", "Le Burkina Faso", "Le Niger"], answer: 1, explain: "Le Bénin à l'est, le Ghana à l'ouest et le Burkina Faso au nord." },
  { id: "t6", theme: "Togo", q: "Quel pays se trouve au nord du Togo ?", choices: ["Le Mali", "Le Niger", "Le Burkina Faso", "Le Nigeria"], answer: 2, explain: "Le Burkina Faso borde le Togo au nord, du côté de la région des Savanes." },
  { id: "t7", theme: "Togo", q: "Quelle est la langue officielle du Togo ?", choices: ["L'éwé", "Le kabiyè", "L'anglais", "Le français"], answer: 3, explain: "Le français est la langue officielle ; l'éwé et le kabiyè sont des langues nationales." },
  { id: "t8", theme: "Togo", q: "Combien de bandes horizontales compte le drapeau togolais ?", choices: ["3", "4", "5", "6"], answer: 2, explain: "Cinq bandes vertes et jaunes, avec un carré rouge portant une étoile blanche." },
  { id: "t9", theme: "Togo", q: "Comment s'intitule l'hymne national du Togo ?", choices: ["L'Abidjanaise", "Salut à toi, pays de nos aïeux", "L'Aube nouvelle", "Debout, Togolais"], answer: 1, explain: "« Salut à toi, pays de nos aïeux » est l'hymne national." },
  { id: "t10", theme: "Togo", q: "Quelle monnaie utilise-t-on au Togo ?", choices: ["Le cedi", "Le naira", "Le franc CFA", "Le dalasi"], answer: 2, explain: "Le Togo utilise le franc CFA de l'Afrique de l'Ouest, comme ses voisins de l'UEMOA." },
  { id: "t11", theme: "Togo", q: "Que signifie le mot éwé « ablodé » ?", choices: ["Bienvenue", "Liberté", "Fête", "Merci"], answer: 1, explain: "« Ablodé » veut dire liberté : c'était le cri de ralliement de l'indépendance." },
  { id: "t12", theme: "Togo", q: "Le site du Koutammakou, inscrit à l'UNESCO, est le pays de quel peuple ?", choices: ["Les Batammariba", "Les Mina", "Les Ewé", "Les Kotokoli"], answer: 0, explain: "Le Koutammakou, au nord-est, est célèbre pour les takienta, maisons-tours des Batammariba." },
  { id: "t13", theme: "Togo", q: "Quelle convention entre l'Europe et les pays ACP a été signée à Lomé en 1975 ?", choices: ["La convention de Lomé", "L'accord de Cotonou", "Le traité de Lagos", "La charte d'Accra"], answer: 0, explain: "La première convention de Lomé a été signée en 1975 entre la CEE et les pays d'Afrique, des Caraïbes et du Pacifique." },
  { id: "l1", theme: "Lomé", q: "Comment surnomme-t-on les célèbres commerçantes de pagnes du Grand Marché de Lomé ?", choices: ["Les Mama Wax", "Les Nana Benz", "Les Reines du pagne", "Les Dadas"], answer: 1, explain: "Les Nana Benz, en référence aux Mercedes-Benz qu'elles s'offraient grâce au commerce du wax." },
  { id: "l2", theme: "Lomé", q: "Quel marché de Lomé est connu pour ses objets liés au vodou ?", choices: ["Le marché d'Adawlato", "Le marché d'Akodésséwa", "Le marché de Hédzranawoé", "Le marché de Bè"], answer: 1, explain: "Le marché des fétiches d'Akodésséwa est l'un des plus connus d'Afrique de l'Ouest." },
  { id: "l3", theme: "Lomé", q: "Quel monument se dresse sur la place de l'Indépendance, au cœur de Lomé ?", choices: ["La Porte du Non-Retour", "Le monument de l'Indépendance", "L'Arc de la Paix", "La Colonne de la Liberté"], answer: 1, explain: "Le monument de l'Indépendance est l'un des symboles de la capitale." },
  { id: "l4", theme: "Lomé", q: "Près de Lomé, sur quel lac se trouve Togoville ?", choices: ["Le lac Volta", "Le lac Togo", "Le lac Nokoué", "Le lac Ahémé"], answer: 1, explain: "Togoville est au bord du lac Togo, qu'on traverse en pirogue depuis Agbodrafo." },
  { id: "l5", theme: "Lomé", q: "Au Togo, comment appelle-t-on couramment les taxis-motos ?", choices: ["Les okada", "Les zémidjans", "Les boda-boda", "Les jakarta"], answer: 1, explain: "Les zémidjans, ou « zem », sont partout dans les rues de Lomé." },
  { id: "c1", theme: "Culture", q: "L'Evala, grande lutte traditionnelle, est organisée par quel peuple ?", choices: ["Les Kabyè", "Les Ewé", "Les Moba", "Les Mina"], answer: 0, explain: "L'Evala est un rite d'initiation kabyè qui se déroule dans la région de la Kara." },
  { id: "c2", theme: "Culture", q: "Où se déroule l'Epé Ekpé, la fête du Nouvel An des Guin ?", choices: ["À Glidji, près d'Aného", "À Notsé", "À Kpalimé", "À Dapaong"], answer: 0, explain: "À Glidji, la prise de la pierre sacrée annonce les présages de l'année." },
  { id: "c3", theme: "Culture", q: "Quelle ville est au cœur de la fête Agbogbo-za, qui célèbre l'histoire du peuple éwé ?", choices: ["Atakpamé", "Notsé", "Tsévié", "Vogan"], answer: 1, explain: "Notsé commémore l'exode des Ewé fuyant le roi Agokoli." },
  { id: "c4", theme: "Culture", q: "Quelle ville, au pied du mont Agou, est réputée pour ses cascades et ses plantations de café-cacao ?", choices: ["Sokodé", "Kpalimé", "Bassar", "Mango"], answer: 1, explain: "Kpalimé, dans les Plateaux, est la porte d'entrée des randonnées et des cascades." },
  { id: "s1", theme: "Saveurs", q: "L'akoumé, servi avec une sauce, est une pâte à base de…", choices: ["Manioc", "Maïs", "Igname", "Riz"], answer: 1, explain: "L'akoumé est une pâte de maïs, souvent servie avec la sauce gombo ou la sauce tomate." },
  { id: "s2", theme: "Saveurs", q: "L'ayimolou, plat très populaire à Lomé, associe…", choices: ["Riz et haricots", "Igname et arachide", "Banane et poisson", "Maïs et épinards"], answer: 0, explain: "L'ayimolou, c'est le riz cuit avec des haricots, servi avec piment et friture." },
  { id: "s3", theme: "Saveurs", q: "Le sodabi est une boisson obtenue en distillant…", choices: ["Le jus de canne", "Le vin de palme", "Le mil", "Le baobab"], answer: 1, explain: "Le sodabi est une eau-de-vie de vin de palme. À consommer avec modération !" },
  { id: "s4", theme: "Saveurs", q: "Le tchoukoutou, boisson du nord du Togo, est une bière de…", choices: ["Mil ou sorgho", "Banane", "Ananas", "Gingembre"], answer: 0, explain: "Le tchoukoutou est une bière traditionnelle de mil ou de sorgho." },
  { id: "s5", theme: "Saveurs", q: "Le foufou se prépare surtout en pilant…", choices: ["Du riz", "De l'igname", "Du maïs", "Du mil"], answer: 1, explain: "Le foufou s'obtient en pilant de l'igname cuite, parfois avec du manioc ou de la banane." },
  { id: "sp1", theme: "Sport", q: "Quel est le surnom de l'équipe nationale de football du Togo ?", choices: ["Les Lions", "Les Écureuils", "Les Éperviers", "Les Étalons"], answer: 2, explain: "Les Éperviers ! Les Écureuils, c'était l'ancien nom des Guépards du Bénin." },
  { id: "sp2", theme: "Sport", q: "En quelle année le Togo a-t-il participé à sa première Coupe du monde de football ?", choices: ["1998", "2002", "2006", "2010"], answer: 2, explain: "En 2006, en Allemagne : la seule participation des Éperviers à ce jour." },
  { id: "sp3", theme: "Sport", q: "Quel Togolais a été élu Ballon d'or africain en 2008 ?", choices: ["Emmanuel Adebayor", "Sheyi Adebayor", "Moustapha Salifou", "Kossi Agassa"], answer: 0, explain: "Emmanuel Adebayor, l'attaquant passé par Arsenal et le Real Madrid." },
  { id: "e1", theme: "Événementiel", q: "Dans un festival, que désigne le « line-up » ?", choices: ["La file d'attente", "La liste des artistes", "Le plan de la scène", "Le service de sécurité"], answer: 1, explain: "Le line-up, c'est la programmation : qui joue et dans quel ordre." },
  { id: "e2", theme: "Événementiel", q: "Qu'est-ce qu'un billet « early bird » ?", choices: ["Un billet pour arriver tôt", "Un billet moins cher vendu en premier", "Un billet VIP", "Un billet gratuit"], answer: 1, explain: "Les premiers acheteurs paient moins cher : ça lance les ventes." },
  { id: "e3", theme: "Événementiel", q: "Sur une invitation, que signifie « RSVP » ?", choices: ["Réservé sans paiement", "Répondez s'il vous plaît", "Rendez-vous sur place", "Retour sous vingt-quatre heures"], answer: 1, explain: "C'est l'abréviation de « Répondez s'il vous plaît » : on confirme sa présence." },
  { id: "e4", theme: "Événementiel", q: "Que désigne le « backstage » ?", choices: ["Les coulisses", "Le fond de la salle", "La billetterie", "Le parking VIP"], answer: 0, explain: "Le backstage, ce sont les coulisses, réservées aux artistes et à l'équipe." },
  { id: "e5", theme: "Événementiel", q: "Lors d'un concert, que fait l'ingénieur du son à la console de façade ?", choices: ["Il vend les boissons", "Il mixe le son entendu par le public", "Il filme le concert", "Il contrôle les billets"], answer: 1, explain: "Il règle le son que le public entend dans la salle." },
  { id: "e6", theme: "Événementiel", q: "Quel est le rôle d'un MC lors d'une soirée ?", choices: ["Il sert les cocktails", "Il anime et fait le lien entre les moments", "Il installe la lumière", "Il gère la caisse"], answer: 1, explain: "Le MC, ou maître de cérémonie, anime et rythme l'événement." },
  { id: "b1", theme: "ToBe", q: "Sur ToBe, à quoi sert le Pass ToBe ?", choices: ["Entrer gratuitement partout", "Retrouver ses photos grâce à son visage", "Payer sans frais", "Voter deux fois"], answer: 1, explain: "Avec le Pass ToBe, vos photos d'événement vous trouvent toutes seules." },
  { id: "b2", theme: "ToBe", q: "Que se passe-t-il quand un organisateur coche « Confier l'organisation à ToBe » ?", choices: ["L'événement devient gratuit", "L'agence ToBe le recontacte pour organiser avec lui", "L'événement est annulé", "Rien du tout"], answer: 1, explain: "L'équipe ToBe le recontacte pour prendre en charge tout ou partie de l'organisation." },
  { id: "b3", theme: "ToBe", q: "Qu'est-ce qui classe les événements sur ToBe ?", choices: ["Le prix du billet", "Le score d'impact", "L'ordre alphabétique", "Le nombre de photos"], answer: 1, explain: "Le score d'impact tient compte de la taille, de la portée et de l'engagement réel." },
  { id: "b4", theme: "ToBe", q: "Que fait le selfie quand vous activez le Pass ToBe ?", choices: ["Il est publié sur votre profil", "Il est analysé sur votre téléphone, seule une empreinte est envoyée", "Il est envoyé aux organisateurs", "Il sert de photo de billet"], answer: 1, explain: "L'analyse se fait sur l'appareil : seule une empreinte chiffrée du visage est enregistrée." },
  { id: "b5", theme: "ToBe", q: "Quelle est la devise de ToBe ?", choices: ["Vis l'instant", "Sois-y. Retrouve-toi.", "Lomé en fête", "Ensemble, toujours"], answer: 1, explain: "Sois-y. Retrouve-toi. : vivez l'événement, ToBe vous retrouve sur les photos." },
];

export const QUIZ_PER_DAY = 3;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Les questions du jour : identiques pour tout le monde, différentes chaque jour. */
export function quizOfDay(day: string): QuizQuestion[] {
  return [...QUIZ].sort((a, b) => hash(day + a.id) - hash(day + b.id)).slice(0, QUIZ_PER_DAY);
}
