import { memo, useState, useMemo } from 'react';

const CATEGORIES = [
  { id: 'all', label: 'Tout' },
  { id: 'overview', label: 'Vue generale' },
  { id: 'activity', label: 'Activite' },
  { id: 'admin', label: 'Administration' },
  { id: 'support', label: 'Support' },
];

const SECTIONS = [
  {
    id: 'debut', cat: 'overview', short: 'Prise en main', title: '1. Prise en main',
    steps: [
      <>Ouvrez l'application. En bas ou dans le menu principal, choisissez <b>Admin</b> (Espace administrateur).</>,
      <>Connectez-vous avec votre <b>email admin</b> et votre <b>code PIN</b> (voir section suivante).</>,
      <>Utilisez le <b>menu de gauche</b> pour naviguer entre les vues : Tableau de bord, Effectif, Annuaire, Rapport, Paie, Departements, Assiduite, Alertes, Gestion, QR, Annonces et Aide.</>,
      <>Choisissez la <b>periode</b> en haut, puis consultez ou exportez les donnees.</>,
      <>Pour fermer votre session, appuyez sur <b>Se deconnecter</b> en bas du menu.</>,
    ],
    bullets: [
      <b key="a">Navigation :</b>,
      <>Le menu se plie/deroule avec le bouton <b>hamburger</b> (en haut a gauche) si la fenetre est droite.</>,
      <>Chaque vue se recharge avec le bouton <b>Actualiser</b> en bas de page.</>,
      <>La vue « Aujourd'hui » se rafraichit seule toutes les 30 s quand <b>En direct</b> est active.</>,
    ],
    tip: <>La console admin vous permet de superviser les pointages, gerer l'effectif et consulter des syntheses (paie, departements, assiduite). Tout se fait depuis le menu de gauche.</>,
    view: 'dashboard',
    mock: 'MOCK_HOME',
  },
  {
    id: 'login', cat: 'support', short: 'Connexion', title: '2. Connexion admin',
    paragraphs: [
      <>L'acces admin est protege par email + code PIN. Vos droits admin sont accordes sur une adresse email donnee.</>,
      <><b>Comment obtenir un acces admin ?</b> Un premier admin est configure lors de la mise en place (email + PIN). Pour ajouter d'autres admins : connectez-vous, ouvrez <b>Gestion</b> &rarr; section <b>Admins</b>, saisissez l'email puis <b>Ajouter un admin</b>.</>,
    ],
    steps: [
      <>Sur l'ecran d'accueil, appuyez sur <b>Admin</b>.</>,
      <>Saisissez votre <b>email</b> (ex. vous@entreprise.com) dans le champ « vous@entreprise.com ».</>,
      <>Saisissez votre <b>code PIN</b>. Utilisez l'icone œil pour afficher/masquer le PIN.</>,
      <>Appuyez sur <b>Se connecter</b> (ou la touche <b>Entree</b>).</>,
    ],
    tip: <>Le bouton <b>Retour</b> (en haut a droite) revient a l'ecran des employes sans fermer la session. <b>Se deconnecter</b> efface la session admin de cet appareil.</>,
    mock: 'MOCK_LOGIN',
  },
  {
    id: 'periode', cat: 'overview', short: 'Periode', title: '3. La periode affichee',
    paragraphs: [
      <>En haut de chaque page, vous choisissez la plage de temps analysee. Elle filtre toutes les stats, tableaux et exports.</>,
    ],
    steps: [
      <>Repérez la barre « Periode : ... → ... » en haut de page.</>,
      <>Choisissez un raccourci : <b>Aujourd'hui</b>, <b>7 jours</b>, <b>30 jours</b> ou <b>Ce mois</b>.</>,
      <>Pour une periode personnalisee, renseignez <b>Du</b> et <b>Au</b> (dates) puis appuyez sur <b>Charger</b>.</>,
      <>Les KPIs, tableaux et graphiques se mettent a jour avec la periode choisie.</>,
    ],
    tip: <>Pour comparer deux quotients, changez les dates et rechargez. Associez la periode « Ce mois » pour la paie mensuelle.</>,
    view: 'dashboard',
    mock: 'MOCK_PERIOD',
  },
  {
    id: 'dashboard', cat: 'overview', short: 'Tableau de bord', title: '4. Tableau de bord',
    paragraphs: [
      <>Vue d'accueil : l'activite du jour et de la periode en un coup d'œil.</>,
    ],
    steps: [
      <>Lisez les 4 <b>KPIs</b> du haut : Effectif (nombre de personnes), Sur place (presentes), Entrees aujourd'hui, Sorties aujourd'hui.</>,
      <>Consultez <b>Heures par jour</b> (histogramme des heures pointees) et <b>Presence aujourd'hui</b> (donut : sur place / pause / conge / sorti / absent).</>,
      <>La rubrique <b>Periode selectionnee</b> resume : total heures, jours presents, retards, sorties manquantes.</>,
      <>Dans <b>Present maintenant</b>, voyez qui est sur place (le suffixe « pause » indique une pause en cours) et dans <b>Pas encore pointe</b> qui n'a pas encore pointé (vide le week-end ou jour ferie).</>,
      <>Activez <b>En direct</b> pour un rafraichissement automatique pendant les heures d'affluence.</>,
    ],
    tip: <>Les donnees du jour sont recalees automatiquement : week-end et jours feries affichent un message plutot qu'une liste d'absents.</>,
    view: 'dashboard',
    mock: 'MOCK_DASH',
  },
  {
    id: 'effectif', cat: 'overview', short: 'Effectif', title: '5. Effectif',
    paragraphs: [
      <>Liste complete du personnel avec leurs indicateurs sur la periode.</>,
    ],
    steps: [
      <>Ouvrez <b>Effectif</b> dans le menu.</>,
      <>Utilisez le champ <b>Rechercher nom, email, departement...</b> pour trouver une personne.</>,
      <>Cliquez sur les en-tetes de colonnes pour <b>trier</b> (photo, nom, jours, heures, moyenne, retards, statut du jour).</>,
      <>Cliquez sur une ligne pour ouvrir la <b>fiche detaillee</b> de l'employe (historique et coordonnees).</>,
      <>Exporter la liste avec <b>Exporter l'effectif (CSV)</b> en bas.</>,
    ],
    tip: <>Le statut du jour (par ex. en poste, en pause, en conge) se lit directement dans la colonne Statut.</>,
    view: 'effectif',
    mock: 'MOCK_TABLE',
  },
  {
    id: 'annuaire', cat: 'overview', short: 'Annuaire', title: '6. Annuaire (bios)',
    paragraphs: [
      <>Vue enrichie de l'effectif, ideal pour un trombinoscope ou consulter les fiches.</>,
    ],
    steps: [
      <>Ouvrez <b>Annuaire (bios)</b> dans le menu.</>,
      <>Recherchez une fiche avec le champ <b>Rechercher fiche...</b>.</>,
      <>Pour une fiche vide, ajoutez des employes via <b>Gestion</b>.</>,
      <>Cliquez <b>Modifier</b> sur une fiche pour mettre a jour les informations, puis <b>Enregistrer</b>.</>,
    ],
    tip: <>Les photos ajoutees dans une fiche apparaissent aussi dans l'Effectif et les ecrans de pointage.</>,
    view: 'annuaire',
    mock: 'MOCK_CARDS',
  },
  {
    id: 'rapport', cat: 'activity', short: 'Rapport', title: '7. Rapport de presence',
    paragraphs: [
      <>Journal chronologique des pointages : date, nom, entree, sortie, heures et statut.</>,
      <><b>Comprendre les statuts :</b> <b>OK</b> - entree et sortie normales. <b>Retard</b> - arrivee apres l'heure attendue (ou la marge autorisee). <b>Pas de sortie</b> - l'entree est enregistree mais pas de sortie ce jour-la.</>,
    ],
    steps: [
      <>Ouvrez <b>Rapport</b>.</>,
      <>Ajustez la periode en haut (ex. Aujourd'hui ou 7 jours).</>,
      <>Recherchez un nom avec <b>Rechercher un nom...</b>.</>,
      <>Triez en cliquant sur Date, Nom, Entree, Sortie, Heures ou Statut.</>,
      <>Le compteur en haut affiche « X entree(s) » ou « X / Y » (= lignes filtrees sur le total).</>,
      <>Exportez avec les boutons <b>CSV</b>, <b>PDF</b>, ou ouvrez la <b>Feuille</b> source.</>,
    ],
    tip: <>Chaque ligne est un pointage (paire entree / sortie) d'un salarie sur un jour donne.</>,
    view: 'rapport',
    mock: 'MOCK_REPORT',
  },
  {
    id: 'paie', cat: 'activity', short: 'Paie', title: '8. Synthese paie',
    paragraphs: [
      <>Agregation par employe pour la paie : jours, heures, pauses, retards, sorties manquantes.</>,
    ],
    steps: [
      <>Ouvrez <b>Paie</b>.</>,
      <>Reglez la periode (souvent <b>Ce mois</b>).</>,
      <>Les KPIs du haut donnent le total salaries, heures et pauses de la periode.</>,
      <>Recherchez un salarie avec <b>Rechercher un salarie...</b> et triez par colonne.</>,
      <>Exportez avec <b>Exporter (CSV)</b> ou <b>PDF</b>.</>,
    ],
    tip: <>Les heures affichees sont <b>netes</b> : entree − sortie − pause. C'est la reference pour calculer la paie.</>,
    view: 'paie',
    mock: 'MOCK_KPI',
  },
  {
    id: 'dept', cat: 'activity', short: 'Departements', title: '9. Departements',
    paragraphs: [
      <>Pointages regroupes par departement.</>,
    ],
    steps: [
      <>Ouvrez <b>Departements</b>.</>,
      <>Choisissez la periode.</>,
      <>Cherchez un departement avec <b>Rechercher un departement...</b>.</>,
      <>Lisez : effectif pointe, heures totales, moyenne/jour, pauses, retards, sorties manquantes.</>,
      <>Les employes sans departement apparaissent sous « Sans departement ».</>,
      <>Exportez avec <b>Exporter (CSV)</b> ou <b>PDF</b>.</>,
    ],
    tip: <>Attribuez un departement a chaque employe dans <b>Gestion</b> pour enrichir ces stats.</>,
    view: 'departements',
    mock: 'MOCK_TABLE',
  },
  {
    id: 'assiduite', cat: 'activity', short: 'Assiduite', title: '10. Assiduite & series',
    paragraphs: [
      <>Regularite de chaque employe : assiduite, serie actuelle et meilleure serie.</>,
    ],
    steps: [
      <>Ouvrez <b>Assiduite</b>.</>,
      <>Reglez la periode.</>,
      <>Lisez pour chaque salarie : <b>Assiduite (%)</b> (jours presents / jours ouvres), <b>Serie actuelle</b> (jours consecutifs jusqu'a maintenant), <b>Meilleure serie</b> (record sur la periode).</>,
      <>La <b>barre de couleur</b> sous le pourcentage visualise le niveau (vert = haut, rouge = faible).</>,
      <>Recherchez un salarie et triez par colonne.</>,
      <>Exportez avec <b>Exporter (CSV)</b> ou <b>PDF</b>.</>,
    ],
    tip: <>Cette vue aide a reperer les absences recurrentes ou a feuil possible l'employe le plus assidu.</>,
    view: 'assiduite',
    mock: 'MOCK_GAUGE',
  },
  {
    id: 'alertes', cat: 'activity', short: 'Alertes', title: '11. Alertes & anomalies',
    paragraphs: [
      <>Deux listes automatiques pour surveiller ce qui sort de l'ordinaire.</>,
    ],
    steps: [
      <>Ouvrez <b>Alertes & anomalies</b>.</>,
      <><b>Alertes</b> : personnes pas encore pointees aujourd'hui, sorties manquantes ou retards sur la periode.</>,
      <><b>Anomalies</b> : journees anormalement courtes (&lt; 2 h) ou longues (&gt; 16 h), pauses excessives (&gt; 120 min), retards repetes (&gt;= 5).</>,
      <>Si tout va bien, un message « Aucune anomalie » s'affiche.</>,
      <>Pour corriger un pointage, passez a <b>Gestion → Corrections de pointage</b>.</>,
    ],
    tip: <>Les seuils sont automatiques. Une journee sous 2 h ou au-dessus de 16 h de travail net est signalee.</>,
    view: 'alertes',
    mock: 'MOCK_ALERT',
  },
  {
    id: 'gestion', cat: 'admin', short: 'Gestion', title: '12. Gestion',
    paragraphs: [
      <>Le centre d'administration du personnel. Cinq sections y sont reunies.</>,
      <><b>Employes (ajout / modification / suppression)</b> : remplissez Nom et Email (obligatoires), puis Departement, Poste, Telephone, Photo et horaires (facultatifs) et appuyez sur <b>Ajouter</b>. Cliquez <b>Modifier</b> dans la liste pour changer les champs, puis <b>Enregistrer</b>. Cliquez <b>Supprimer</b> sur la ligne pour retirer un employe.</>,
      <><b>Import en masse (CSV)</b> : collez un tableau ou uploadez un fichier CSV au format <b>Nom,Email,Departement,Debut(Fin)</b> (l'en-tete est facultatif) puis appuyez sur <b>Importer en masse</b>.</>,
      <><b>Admins</b> : saisissez l'email puis <b>Ajouter un admin</b> pour donner le droit admin. Retirez-le avec <b>Supprimer</b>.</>,
      <><b>Conges</b> : renseignez Email, date Debut et Fin, et un Motif (facultatif), puis <b>Ajouter</b>. L'employe apparait alors « En conge » ces jours-la.</>,
      <><b>Jours feries</b> : renseignez le Nom (ex. Fete du travail) et la Date, puis <b>Ajouter</b>. Personne n'est alors considere absent ce jour.</>,
    ],
    tip: <>Les sections Employes, Admins, Conges, Jours feries et Corrections se deplient/plient pour faire de la place.</>,
    view: 'gestion',
    mock: 'MOCK_FORM',
  },
  {
    id: 'corrections', cat: 'admin', short: 'Corrections', title: '13. Corrections de pointage',
    paragraphs: [
      <>Pour corriger un pointage oublie ou errone. Chaque action est enregistree.</>,
    ],
    steps: [
      <>Ouvrez <b>Gestion</b>, section <b>Corrections de pointage</b>.</>,
      <>Renseignez l'<b>Email</b> et la <b>Date</b> concernee.</>,
      <>Choisissez le type de <b>Correction</b> :</>,
      <><b>Sortie oubliee</b> — saisissez la sortie pour une journee ouverte.</>,
      <><b>Paire complete</b> — saisissez l'entree (HH:MM) et la sortie.</>,
      <><b>Supprimer le dernier pointage</b> — efface le dernier pointage de l'employe (aucune sortie a saisir).</>,
      <>Appuyez sur <b>Appliquer</b>. Un message « Correction appliquee » confirme l'operation.</>,
    ],
    tip: <>La <b>Date</b> et le choix de correction sont obligatoires pour appliquer. Verifiez toujours l'email avant d'appliquer.</>,
    view: 'gestion',
    mock: 'MOCK_FORM',
  },
  {
    id: 'qr', cat: 'admin', short: 'QR & acces', title: '14. QR & acces',
    paragraphs: [
      <>Genere le QR permanent a afficher a l'entree, et donne acces a l'ecran d'accueil du bureau.</>,
      <><b>QR Code permanent</b> : dans <b>Token secret</b>, collez exactement le <b>qrSecret</b> de la feuille Config ; dans <b>Code tenant</b>, saisissez le code de l'organisation (ex. addredance) — facultatif ; appuyez sur <b>Generer le QR</b>. Imprimez-le avec <b>Imprimer</b> ou sauvegardez-le avec <b>Telecharger PNG</b>, puis affichez-le a l'entree.</>,
      <><b>Ecran d'entree (QR rotatif)</b> : appuyez sur <b>Ouvrir l'ecran d'entree</b>, puis ouvrez cette page sur la tablette ou l'ecran a l'entree du bureau.</>,
    ],
    tip: <>Le QR permanent ne change jamais : imprimez-le une fois et il reste valable, tant que le token correspond a la Config.</>,
    view: 'qr',
    mock: 'MOCK_QR',
  },
  {
    id: 'annonces', cat: 'admin', short: 'Annonces', title: '15. Annonces',
    paragraphs: [
      <>Publiez des messages que vos employes voient sur leur ecran d'accueil.</>,
    ],
    steps: [
      <>Ouvrez <b>Annonces</b>.</>,
      <>Dans <b>Publier une annonce</b>, saisissez un <b>Titre</b> (facultatif) et un <b>Message</b>.</>,
      <>Cochez <b>Epingler en haut</b> pour une annonce importante affichee en haut de la liste.</>,
      <>Appuyez sur <b>Publier</b>. L'annonce apparait dans la liste <b>Annonces publiees</b> et sur l'ecran d'accueil des employes.</>,
      <>Supprimez une annonce avec <b>Supprimer</b> sur sa ligne.</>,
    ],
    tip: <>Parfait pour : jours feries, changements d'horaire, reunions ou consignes du jour.</>,
    view: 'annonces',
    mock: 'MOCK_FORM',
  },
  {
    id: 'exports', cat: 'support', short: 'Exports', title: '16. Exports (CSV & PDF)',
    paragraphs: [
      <>La plupart des vues proposent des boutons d'export en bas de page :</>,
    ],
    bullets: [
      <b key="a">CSV</b>, <>- fichier tableur. Nom predefini : presence-, effectif-, paie-, departements-, assiduite-, suivi des dates de la periode.</>,
      <b key="b">PDF</b>, <>- ouvre la fenetre d'impression : choisissez « Enregistrer en PDF » comme destination.</>,
      <b key="c">Feuille</b>, <>- lien direct vers la Google Sheet source (sur le Rapport).</>,
    ],
    steps: [
      <>Choisissez d'abord la <b>periode</b> desiree (elle apparait dans le nom du fichier).</>,
      <>En bas de la vue, appuyez sur <b>CSV</b>, <b>PDF</b> ou <b>Feuille</b>.</>,
      <>Les CSV sont telecharges dans votre dossier de telechargements ; les PDF s'exportent via l'impression.</>,
    ],
    tip: <>Les CSV contiennent une marque BOM et sont compatibles accents : ils s'ouvrent correctement avec Excel/Sheets en francais.</>,
    view: 'rapport',
    mock: 'MOCK_EXPORT',
  },
  {
    id: 'faq', cat: 'support', short: 'FAQ', title: '17. Questions frequentes',
    paragraphs: [
      <><b>Q : Comment ajouter plusieurs employes rapidement ?</b><br/>A : Dans <b>Gestion → Import en masse</b>, uploadez un CSV ou collez le tableau au format Nom,Email,Departement,Debut(Fin).</>,
      <><b>Q : Un employe a oublie de pointer en sortant. Comment corriger ?</b><br/>A : Dans <b>Gestion → Corrections de pointage</b>, choisissez « Sortie oubliee » pour sa journee ouverte.</>,
      <><b>Q : Comment marquer un jour ou l'entreprise est fermee ?</b><br/>A : Enregistrez-le comme <b>Jour ferie</b> dans <b>Gestion</b>. Personne n'est alors considere absent ce jour.</>,
      <><b>Q : Comment ajouter un autre admin ?</b><br/>A : Dans <b>Gestion → Admins</b>, saisissez l'email puis <b>Ajouter un admin</b>.</>,
      <><b>Q : Comment changer le QR de l'entree ?</b><br/>A : Dans <b>QR & acces</b>, collez le bon qrSecret de la Feuille Config puis <b>Generer le QR</b>.</>,
      <><b>Q : Ou partent les exports ?</b><br/>A : Les CSV partent dans votre dossier de telechargements ; les PDF s'exportent via la fenetre d'impression du navigateur.</>,
      <><b>Q : Comment attribuer un departement ?</b><br/>A : Dans <b>Gestion → Employes</b>, modifiez la fiche et renseignez le champ Departement, puis <b>Enregistrer</b>. Les stats de la vue Departements s'enrichissent alors.</>,
      <><b>Q : Que faire si le QR ne se genere pas ?</b><br/>A : Verifiez que le <b>qrSecret</b> colle dans <b>QR & acces</b> est identique a celui de la feuille Config, et que le Code tenant est exact.</>,
      <><b>Q : Les donnees sont-elles privees ?</b><br/>A : Oui. Les pointages sont stockes dans la Google Sheet de votre organisation et vos sessions admin restent sur votre appareil.</>,
    ],
    tip: <>Vous ne trouvez pas votre reponse ? La visite guidee (« Lancer une visite ») passe en revue chaque ecran en direct.</>,
    mock: 'MOCK_FAQ',
  },
];

/* ---------- Small stylized screen mockups (inline SVG) ---------- */
const MOCKUPS = {
  MOCK_HOME: (
    <svg viewBox="0 0 200 120" className="help-mock" role="img" aria-label="Console admin">
      <rect x="6" y="6" width="34" height="108" rx="6" fill="rgba(127,141,166,0.25)" />
      <rect x="10" y="12" width="26" height="5" rx="2.5" fill="rgba(127,141,166,0.6)" />
      <rect x="10" y="24" width="22" height="4" rx="2" fill="var(--accent)" opacity="0.8" />
      <rect x="10" y="34" width="24" height="4" rx="2" fill="rgba(127,141,166,0.4)" />
      <rect x="10" y="44" width="20" height="4" rx="2" fill="rgba(127,141,166,0.4)" />
      <rect x="10" y="100" width="24" height="4" rx="2" fill="rgba(127,141,166,0.5)" />
      <rect x="46" y="10" width="140" height="10" rx="3" fill="rgba(127,141,166,0.3)" />
      <rect x="50" y="28" width="30" height="20" rx="3" fill="rgba(16,185,129,0.4)" />
      <rect x="84" y="28" width="30" height="20" rx="3" fill="rgba(129,140,248,0.4)" />
      <rect x="118" y="28" width="30" height="20" rx="3" fill="rgba(56,189,248,0.4)" />
      <rect x="152" y="28" width="30" height="20" rx="3" fill="rgba(251,191,36,0.4)" />
      <rect x="50" y="58" width="66" height="34" rx="4" fill="rgba(16,185,129,0.15)" />
      <circle cx="118" cy="75" r="14" fill="none" stroke="rgba(129,140,248,0.7)" strokeWidth="4" strokeDasharray="40 20" />
      <circle cx="118" cy="75" r="3" fill="rgba(129,140,248,0.8)" />
      <rect x="140" y="58" width="42" height="34" rx="4" fill="rgba(251,191,36,0.15)" />
      <rect x="50" y="100" width="180" height="4" rx="2" fill="rgba(127,141,166,0.25)" />
    </svg>
  ),
  MOCK_LOGIN: (
    <svg viewBox="0 0 200 120" className="help-mock" role="img" aria-label="Ecran de connexion">
      <rect x="10" y="26" width="72" height="20" rx="4" fill="rgba(129,140,248,0.25)" />
      <rect x="92" y="26" width="100" height="20" rx="4" fill="rgba(127,141,166,0.15)" />
      <rect x="10" y="58" width="72" height="20" rx="4" fill="rgba(251,191,36,0.25)" />
      <rect x="92" y="58" width="100" height="20" rx="4" fill="rgba(127,141,166,0.15)" />
      <rect x="10" y="92" width="182" height="16" rx="4" fill="var(--accent)" opacity="0.85" />
      <circle cx="30" cy="10" r="8" fill="rgba(16,185,129,0.4)" />
      <text x="10" y="14" className="help-mock-label" textAnchor="middle">Admin</text>
    </svg>
  ),
  MOCK_PERIOD: (
    <svg viewBox="0 0 200 120" className="help-mock" role="img" aria-label="Barre de periode">
      <rect x="10" y="14" width="180" height="24" rx="5" fill="rgba(127,141,166,0.15)" />
      <rect x="16" y="20" width="34" height="12" rx="3" fill="var(--accent)" opacity="0.9" />
      <rect x="56" y="20" width="34" height="12" rx="3" fill="rgba(127,141,166,0.3)" />
      <rect x="96" y="20" width="34" height="12" rx="3" fill="rgba(127,141,166,0.3)" />
      <rect x="136" y="20" width="34" height="12" rx="3" fill="rgba(127,141,166,0.3)" />
      <rect x="16" y="54" width="80" height="18" rx="4" fill="rgba(56,189,248,0.2)" />
      <rect x="104" y="54" width="80" height="18" rx="4" fill="rgba(251,191,36,0.2)" />
      <rect x="16" y="84" width="60" height="18" rx="4" fill="rgba(16,185,129,0.5)" />
      <rect x="84" y="84" width="110" height="18" rx="4" fill="rgba(127,141,166,0.2)" />
    </svg>
  ),
  MOCK_DASH: (
    <svg viewBox="0 0 200 120" className="help-mock" role="img" aria-label="Tableau de bord">
      <rect x="8" y="10" width="40" height="20" rx="4" fill="rgba(16,185,129,0.4)" />
      <rect x="52" y="10" width="40" height="20" rx="4" fill="rgba(129,140,248,0.4)" />
      <rect x="96" y="10" width="40" height="20" rx="4" fill="rgba(56,189,248,0.4)" />
      <rect x="140" y="10" width="40" height="20" rx="4" fill="rgba(251,191,36,0.4)" />
      <rect x="8" y="38" width="120" height="50" rx="5" fill="rgba(56,189,248,0.12)" />
      <rect x="14" y="48" width="12" height="26" rx="2" fill="rgba(56,189,248,0.6)" />
      <rect x="30" y="56" width="12" height="18" rx="2" fill="rgba(56,189,248,0.45)" />
      <rect x="46" y="44" width="12" height="30" rx="2" fill="rgba(56,189,248,0.7)" />
      <rect x="62" y="60" width="12" height="14" rx="2" fill="rgba(56,189,248,0.4)" />
      <rect x="78" y="50" width="12" height="24" rx="2" fill="rgba(56,189,248,0.55)" />
      <rect x="94" y="42" width="12" height="32" rx="2" fill="rgba(56,189,248,0.75)" />
      <circle cx="160" cy="63" r="18" fill="none" stroke="rgba(129,140,248,0.6)" strokeWidth="6" strokeDasharray="45 30" />
      <rect x="8" y="98" width="60" height="12" rx="4" fill="rgba(16,185,129,0.2)" />
      <rect x="76" y="98" width="116" height="12" rx="4" fill="rgba(127,141,166,0.12)" />
    </svg>
  ),
  MOCK_TABLE: (
    <svg viewBox="0 0 200 120" className="help-mock" role="img" aria-label="Tableau">
      <rect x="10" y="10" width="180" height="14" rx="4" fill="rgba(127,141,166,0.25)" />
      <rect x="10" y="30" width="180" height="14" rx="3" fill="rgba(127,141,166,0.12)" />
      <rect x="10" y="48" width="180" height="14" rx="3" fill="rgba(16,185,129,0.12)" />
      <rect x="10" y="66" width="180" height="14" rx="3" fill="rgba(127,141,166,0.12)" />
      <rect x="10" y="84" width="180" height="14" rx="3" fill="rgba(251,191,36,0.12)" />
      <rect x="10" y="102" width="60" height="12" rx="4" fill="var(--accent)" opacity="0.8" />
    </svg>
  ),
  MOCK_CARDS: (
    <svg viewBox="0 0 200 120" className="help-mock" role="img" aria-label="Trombinoscope">
      <rect x="8" y="8" width="58" height="46" rx="5" fill="rgba(129,140,248,0.18)" />
      <circle cx="37" cy="24" r="8" fill="rgba(129,140,248,0.5)" />
      <rect x="16" y="38" width="42" height="4" rx="2" fill="rgba(129,140,248,0.6)" />
      <rect x="72" y="8" width="58" height="46" rx="5" fill="rgba(16,185,129,0.18)" />
      <circle cx="101" cy="24" r="8" fill="rgba(16,185,129,0.5)" />
      <rect x="80" y="38" width="42" height="4" rx="2" fill="rgba(16,185,129,0.6)" />
      <rect x="136" y="8" width="58" height="46" rx="5" fill="rgba(251,191,36,0.18)" />
      <circle cx="165" cy="24" r="8" fill="rgba(251,191,36,0.5)" />
      <rect x="144" y="38" width="42" height="4" rx="2" fill="rgba(251,191,36,0.6)" />
      <rect x="8" y="62" width="58" height="46" rx="5" fill="rgba(56,189,248,0.18)" />
      <circle cx="37" cy="78" r="8" fill="rgba(56,189,248,0.5)" />
      <rect x="16" y="92" width="42" height="4" rx="2" fill="rgba(56,189,248,0.6)" />
    </svg>
  ),
  MOCK_REPORT: (
    <svg viewBox="0 0 200 120" className="help-mock" role="img" aria-label="Rapport chronologique">
      <rect x="10" y="10" width="60" height="12" rx="4" fill="rgba(127,141,166,0.25)" />
      <rect x="76" y="10" width="50" height="12" rx="4" fill="rgba(127,141,166,0.15)" />
      <rect x="132" y="10" width="40" height="12" rx="4" fill="rgba(127,141,166,0.15)" />
      <rect x="10" y="28" width="180" height="12" rx="3" fill="rgba(16,185,129,0.25)" />
      <rect x="10" y="46" width="180" height="12" rx="3" fill="rgba(127,141,166,0.12)" />
      <rect x="10" y="64" width="180" height="12" rx="3" fill="rgba(251,191,36,0.25)" />
      <rect x="10" y="82" width="180" height="12" rx="3" fill="rgba(127,141,166,0.12)" />
      <rect x="10" y="100" width="26" height="12" rx="3" fill="rgba(56,189,248,0.6)" />
      <rect x="42" y="100" width="26" height="12" rx="3" fill="rgba(129,140,248,0.6)" />
      <rect x="74" y="100" width="26" height="12" rx="3" fill="rgba(16,185,129,0.6)" />
    </svg>
  ),
  MOCK_KPI: (
    <svg viewBox="0 0 200 120" className="help-mock" role="img" aria-label="Synthese paie">
      <rect x="8" y="10" width="88" height="40" rx="5" fill="rgba(56,189,248,0.18)" />
      <rect x="16" y="18" width="24" height="6" rx="3" fill="rgba(56,189,248,0.5)" />
      <rect x="16" y="30" width="60" height="12" rx="3" fill="rgba(56,189,248,0.6)" />
      <rect x="104" y="10" width="88" height="40" rx="5" fill="rgba(16,185,129,0.18)" />
      <rect x="112" y="18" width="24" height="6" rx="3" fill="rgba(16,185,129,0.5)" />
      <rect x="112" y="30" width="60" height="12" rx="3" fill="rgba(16,185,129,0.6)" />
      <rect x="8" y="60" width="180" height="14" rx="3" fill="rgba(127,141,166,0.14)" />
      <rect x="8" y="78" width="180" height="14" rx="3" fill="rgba(16,185,129,0.14)" />
      <rect x="8" y="96" width="180" height="14" rx="3" fill="rgba(127,141,166,0.14)" />
    </svg>
  ),
  MOCK_GAUGE: (
    <svg viewBox="0 0 200 120" className="help-mock" role="img" aria-label="Assiduite">
      <circle cx="60" cy="60" r="34" fill="none" stroke="rgba(127,141,166,0.2)" strokeWidth="8" />
      <circle cx="60" cy="60" r="34" fill="none" stroke="rgba(16,185,129,0.8)" strokeWidth="8" strokeDasharray="160 214" strokeLinecap="round" transform="rotate(-90 60 60)" />
      <text x="60" y="66" textAnchor="middle" className="help-mock-label">94%</text>
      <rect x="110" y="30" width="80" height="12" rx="6" fill="rgba(16,185,129,0.35)" />
      <rect x="110" y="30" width="74" height="12" rx="6" fill="rgba(16,185,129,0.85)" />
      <rect x="110" y="56" width="80" height="12" rx="6" fill="rgba(251,191,36,0.35)" />
      <rect x="110" y="56" width="40" height="12" rx="6" fill="rgba(251,191,36,0.8)" />
      <rect x="110" y="82" width="80" height="12" rx="6" fill="rgba(239,68,68,0.35)" />
      <rect x="110" y="82" width="24" height="12" rx="6" fill="rgba(239,68,68,0.8)" />
    </svg>
  ),
  MOCK_ALERT: (
    <svg viewBox="0 0 200 120" className="help-mock" role="img" aria-label="Alertes">
      <path d="M30 40 L67 96 H-7 Z" fill="rgba(251,191,36,0.5)" />
      <rect x="11" y="108" width="58" height="4" rx="2" fill="rgba(127,141,166,0.3)" />
      <rect x="26" y="58" width="16" height="4" rx="2" fill="rgba(127,141,166,0.7)" />
      <rect x="26" y="72" width="16" height="12" rx="2" fill="rgba(251,191,36,0.9)" />
      <rect x="80" y="16" width="112" height="12" rx="4" fill="rgba(251,191,36,0.3)" />
      <rect x="80" y="36" width="112" height="30" rx="4" fill="rgba(251,191,36,0.12)" />
      <rect x="88" y="44" width="40" height="4" rx="2" fill="rgba(127,141,166,0.5)" />
      <rect x="88" y="52" width="56" height="4" rx="2" fill="rgba(127,141,166,0.4)" />
      <rect x="80" y="78" width="112" height="12" rx="4" fill="rgba(239,68,68,0.3)" />
      <rect x="80" y="98" width="112" height="12" rx="4" fill="rgba(239,68,68,0.12)" />
    </svg>
  ),
  MOCK_FORM: (
    <svg viewBox="0 0 200 120" className="help-mock" role="img" aria-label="Formulaire">
      <rect x="12" y="12" width="60" height="8" rx="4" fill="rgba(127,141,166,0.5)" />
      <rect x="12" y="26" width="176" height="14" rx="4" fill="rgba(127,141,166,0.15)" />
      <rect x="12" y="46" width="176" height="14" rx="4" fill="rgba(127,141,166,0.15)" />
      <rect x="12" y="66" width="84" height="14" rx="4" fill="rgba(127,141,166,0.15)" />
      <rect x="104" y="66" width="84" height="14" rx="4" fill="rgba(127,141,166,0.15)" />
      <rect x="12" y="90" width="90" height="16" rx="5" fill="var(--accent)" opacity="0.85" />
      <rect x="110" y="90" width="80" height="16" rx="5" fill="rgba(127,141,166,0.25)" />
    </svg>
  ),
  MOCK_QR: (
    <svg viewBox="0 0 200 120" className="help-mock" role="img" aria-label="QR code">
      <g className="help-mock-qr">
        <rect x="30" y="20" width="16" height="16" rx="2" fill="var(--text)" />
        <rect x="52" y="20" width="5" height="5" fill="var(--text)" />
        <rect x="62" y="20" width="5" height="5" fill="var(--text)" />
        <rect x="72" y="20" width="16" height="16" rx="2" fill="var(--text)" />
        <rect x="30" y="42" width="5" height="5" fill="var(--text)" />
        <rect x="40" y="42" width="5" height="5" fill="var(--text)" />
        <rect x="50" y="42" width="5" height="5" fill="var(--text)" />
        <rect x="60" y="42" width="5" height="5" fill="var(--text)" />
        <rect x="72" y="42" width="5" height="5" fill="var(--text)" />
        <rect x="82" y="42" width="5" height="5" fill="var(--text)" />
        <rect x="30" y="52" width="5" height="5" fill="var(--text)" />
        <rect x="44" y="52" width="5" height="5" fill="var(--text)" />
        <rect x="54" y="52" width="5" height="5" fill="var(--text)" />
        <rect x="68" y="52" width="5" height="5" fill="var(--text)" />
        <rect x="78" y="52" width="5" height="5" fill="var(--text)" />
        <rect x="30" y="62" width="16" height="16" rx="2" fill="var(--text)" />
        <rect x="52" y="62" width="5" height="5" fill="var(--text)" />
        <rect x="62" y="62" width="5" height="5" fill="var(--text)" />
        <rect x="72" y="62" width="16" height="16" rx="2" fill="var(--text)" />
      </g>
      <rect x="104" y="20" width="88" height="14" rx="4" fill="rgba(127,141,166,0.15)" />
      <rect x="104" y="40" width="88" height="14" rx="4" fill="rgba(127,141,166,0.15)" />
      <rect x="104" y="60" width="88" height="30" rx="5" fill="rgba(127,141,166,0.12)" />
      <rect x="104" y="98" width="60" height="12" rx="4" fill="var(--accent)" opacity="0.8" />
    </svg>
  ),
  MOCK_EXPORT: (
    <svg viewBox="0 0 200 120" className="help-mock" role="img" aria-label="Exports">
      <rect x="20" y="24" width="60" height="70" rx="6" fill="rgba(16,185,129,0.2)" />
      <rect x="30" y="34" width="10" height="40" rx="2" fill="rgba(16,185,129,0.5)" />
      <rect x="44" y="28" width="10" height="46" rx="2" fill="rgba(16,185,129,0.7)" />
      <rect x="58" y="42" width="10" height="32" rx="2" fill="rgba(16,185,129,0.45)" />
      <rect x="100" y="24" width="60" height="70" rx="6" fill="rgba(56,189,248,0.2)" />
      <path d="M115 44 v14 h-7 l12 14 12-14 h-7 V44 Z" fill="rgba(56,189,248,0.7)" />
      <rect x="120" y="78" width="40" height="5" rx="2.5" fill="rgba(56,189,248,0.4)" />
      <rect x="30" y="104" width="36" height="9" rx="4" fill="rgba(16,185,129,0.6)" />
      <rect x="108" y="104" width="36" height="9" rx="4" fill="rgba(56,189,248,0.6)" />
    </svg>
  ),
  MOCK_FAQ: (
    <svg viewBox="0 0 200 120" className="help-mock" role="img" aria-label="FAQ">
      <rect x="10" y="10" width="180" height="18" rx="5" fill="rgba(129,140,248,0.18)" />
      <rect x="18" y="16" width="60" height="6" rx="3" fill="rgba(129,140,248,0.5)" />
      <rect x="10" y="36" width="180" height="18" rx="5" fill="rgba(16,185,129,0.18)" />
      <rect x="18" y="42" width="70" height="6" rx="3" fill="rgba(16,185,129,0.5)" />
      <rect x="10" y="62" width="180" height="18" rx="5" fill="rgba(251,191,36,0.18)" />
      <rect x="18" y="68" width="66" height="6" rx="3" fill="rgba(251,191,36,0.5)" />
      <rect x="10" y="88" width="180" height="18" rx="5" fill="rgba(56,189,248,0.18)" />
      <rect x="18" y="94" width="74" height="6" rx="3" fill="rgba(56,189,248,0.5)" />
    </svg>
  ),
};

function P({ children }) { return <p className="help-p">{children}</p>; }

function Ul({ items }) {
  return (
    <ul className="help-ul">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

function Steps({ items }) {
  return (
    <ol className="help-steps">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ol>
  );
}

function Tip({ children }) {
  return <div className="help-tip"><b>Astuce :</b> {children}</div>;
}

function highlight(text, query) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="help-hl">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function matchNode(node, query) {
  if (typeof node !== 'string' || !query) return node;
  if (node.toLowerCase().includes(query)) return highlight(node, query);
  return node;
}

function Section({ id, title, children, onOpen, view, query }) {
  const titleEl = <h3 id={'help-' + id}>{query ? highlight(title, query) : title}</h3>;
  return (
    <div className="card block help-card">
      <div className="block-head">
        {titleEl}
        {view && (
          <button type="button" className="ghost-btn sm help-open" onClick={onOpen}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            Ouvrir cette vue
          </button>
        )}
      </div>
      <div className="block-body">{children}</div>
    </div>
  );
}

export default memo(function AdminHelp({ onOpenView, onStartTour }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return SECTIONS.filter((s) => {
      if (category !== 'all' && s.cat !== category) return false;
      if (!q) return true;
      const hay = [s.title, s.short, ...(s.paragraphs || []), ...(s.steps || []), ...(s.bullets || [])]
        .map((x) => (typeof x === 'string' ? x : x.props?.children || ''))
        .join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [category, q]);

  const openView = (v) => { if (onOpenView) { onOpenView(v); try { sessionStorage.setItem('adminView', v); } catch (e) {} if (window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' }); } };

  return (
    <div className="help-layout">
      <div className="help-toc card block">
        <div className="block-head"><h3>Sommaire</h3></div>
        <div className="block-body">
          <div className="help-search">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" placeholder="Rechercher..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="help-cats">
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" className={'chip help-cat' + (category === c.id ? ' active' : '')} onClick={() => setCategory(c.id)}>{c.label}</button>
            ))}
          </div>
          {onStartTour && (
            <button type="button" className="primary-btn sm help-tour-btn" onClick={onStartTour}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
              Lancer une visite guidee
            </button>
          )}
          <nav className="help-toc-links">
            {filtered.map((s) => (
              <a key={s.id} href={'#help-' + s.id} className="help-toc-link" onClick={() => { if (window.history) try { history.replaceState(null, '', '#'); } catch (e) {} }}>{s.short}</a>
            ))}
            {filtered.length === 0 && <span className="help-empty">Aucun article ne correspond.</span>}
          </nav>
        </div>
      </div>

      <div className="help-body">
        {filtered.map((s) => (
          <Section key={s.id} id={s.id} title={s.title} view={s.view} query={q} onOpen={() => openView(s.view)}>
            {MOCKUPS[s.mock]}
            {s.paragraphs && s.paragraphs.map((p, i) => <P key={i}>{matchNode(p, q)}</P>)}
            {s.steps && <Steps items={s.steps.map((it) => matchNode(it, q))} />}
            {s.bullets && <Ul items={s.bullets.map((it) => matchNode(it, q))} />}
            {s.tip && <Tip>{matchNode(s.tip, q)}</Tip>}
          </Section>
        ))}
        {filtered.length === 0 && (
          <div className="card block help-card">
            <div className="block-body"><p className="empty">Aucune section ne correspond a votre recherche « {query} ». Essayez un autre mot-cle ou changez de categorie.</p></div>
          </div>
        )}
      </div>
    </div>
  );
});
