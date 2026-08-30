import { memo } from 'react';
import { useApp } from '../../contexts/AppContext';

const SECTIONS = [
  { id: 'debut', title: '1. Prise en main', short: 'Prise en main' },
  { id: 'login', title: '2. Connexion admin', short: 'Connexion' },
  { id: 'periode', title: '3. La periode affichee', short: 'Periode' },
  { id: 'dashboard', title: '4. Tableau de bord', short: 'Tableau de bord' },
  { id: 'effectif', title: '5. Effectif', short: 'Effectif' },
  { id: 'annuaire', title: '6. Annuaire (bios)', short: 'Annuaire' },
  { id: 'rapport', title: '7. Rapport de presence', short: 'Rapport' },
  { id: 'paie', title: '8. Synthese paie', short: 'Paie' },
  { id: 'dept', title: '9. Departements', short: 'Departements' },
  { id: 'assiduite', title: '10. Assiduite', short: 'Assiduite' },
  { id: 'alertes', title: '11. Alertes & anomalies', short: 'Alertes' },
  { id: 'gestion', title: '12. Gestion', short: 'Gestion' },
  { id: 'corrections', title: '13. Corrections de pointage', short: 'Corrections' },
  { id: 'qr', title: '14. QR & acces', short: 'QR & acces' },
  { id: 'annonces', title: '15. Annonces', short: 'Annonces' },
  { id: 'exports', title: '16. Exports (CSV & PDF)', short: 'Exports' },
  { id: 'faq', title: '17. Questions frequentes', short: 'FAQ' },
];

function Section({ children, id, title }) {
  return (
    <div className="card block help-card">
      <div className="block-head"><h3 id={'help-' + id}>{title}</h3></div>
      <div className="block-body">{children}</div>
    </div>
  );
}

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

export default memo(function AdminHelp() {
  const { config } = useApp();

  return (
    <div className="help-layout">
      <div className="help-toc card block">
        <div className="block-head"><h3>Sommaire</h3></div>
        <nav className="block-body">
          {SECTIONS.map((s) => (
            <a key={s.id} href={'#help-' + s.id} className="help-toc-link">{s.short}</a>
          ))}
        </nav>
      </div>

      <div className="help-body">
        <Section id="debut" title="1. Prise en main">
          <P>La console admin vous permet de superviser les pointages, gerer l'effectif et consulter
          des syntheses (paie, departements, assiduite). Tout se fait depuis le menu de gauche.</P>
          <Steps items={[
            <>Ouvrez l'application. En bas ou dans le menu principal, choisissez <b>Admin</b> (Espace administrateur).</>,
            <>Connectez-vous avec votre <b>email admin</b> et votre <b>code PIN</b> (voir section suivante).</>,
            <>Utilisez le <b>menu de gauche</b> pour naviguer entre les vues : Tableau de bord, Effectif, Annuaire, Rapport, Paie, Departements, Assiduite, Alertes, Gestion, QR, Annonces et Aide.</>,
            <>Choisissez la <b>periode</b> en haut, puis consultez ou exportez les donnees.</>,
            <>Pour fermer votre session, appuyez sur <b>Se deconnecter</b> en bas du menu.</>,
          ]} />
          <Ul items={[
            <b key="a">Navigation :</b>,
            <>Le menu se plie/deroule avec le bouton <b>hamburger</b> (en haut a gauche) si la fenetre est droite.</>,
            <>Chaque vue se recharge avec le bouton <b>Actualiser</b> en bas de page.</>,
            <>La vue « Aujourd'hui » se rafraichit seule toutes les 30 s quand <b>En direct</b> est active.</>,
          ]} />
        </Section>

        <Section id="login" title="2. Connexion admin">
          <P>L'acces admin est protege par email + code PIN. Vos droits admin sont accordes sur une adresse email donnee.</P>
          <Steps items={[
            <>Sur l'ecran d'accueil, appuyez sur <b>Admin</b>.</>,
            <>Saisissez votre <b>email</b> (ex. vous@entreprise.com) dans le champ « vous@entreprise.com ».</>,
            <>Saisissez votre <b>code PIN</b>. Utilisez l'icone œil pour afficher/masquer le PIN.</>,
            <>Appuyez sur <b>Se connecter</b> (ou la touche <b>Entree</b>).</>,
          ]} />
          <P><b>Comment obtenir un acces admin ?</b></P>
          <Steps items={[
            <>Un premier admin est configure lors de la mise en place (email + PIN).</>,
            <>Pour ajouter d'autres admins : connectez-vous, ouvrez <b>Gestion</b> &rarr; section <b>Admins</b>, saisissez l'email puis <b>Ajouter un admin</b>.</>,
          ]} />
          <Tip>Le bouton <b>Retour</b> (en haut a droite) revient a l'ecran des employes sans fermer la session. <b>Se deconnecter</b> efface la session admin de cet appareil.</Tip>
        </Section>

        <Section id="periode" title="3. La periode affichee">
          <P>En haut de chaque page, vous choisissez la plage de temps analysee. Elle filtre toutes les stats, tableaux et exports.</P>
          <Steps items={[
            <>Repérez la barre « Periode : ... → ... » en haut de page.</>,
            <>Choisissez un raccourci : <b>Aujourd'hui</b>, <b>7 jours</b>, <b>30 jours</b> ou <b>Ce mois</b>.</>,
            <>Pour une periode personnalisee, renseignez <b>Du</b> et <b>Au</b> (dates) puis appuyez sur <b>Charger</b>.</>,
            <>Les KPIs, tableaux et graphiques se mettent a jour avec la periode choisie.</>,
          ]} />
          <Tip>Pour comparer deux quotients, changez les dates et rechargez. Associez la periode « Ce mois » pour la paie mensuelle.</Tip>
        </Section>

        <Section id="dashboard" title="4. Tableau de bord">
          <P>Vue d'accueil : l'activite du jour et de la periode en un coup d'œil.</P>
          <Steps items={[
            <>Lisez les 4 <b>KPIs</b> du haut : Effectif (nombre de personnes), Sur place (presentes), Entrees aujourd'hui, Sorties aujourd'hui.</>,
            <>Consultez <b>Heures par jour</b> (histogramme des heures pointees) et <b>Presence aujourd'hui</b> (donut : sur place / pause / conge / sorti / absent).</>,
            <>La rubrique <b>Periode selectionnee</b> resume : total heures, jours presents, retards, sorties manquantes.</>,
            <>Dans <b>Present maintenant</b>, voyez qui est sur place (le suffixe « pause » indique une pause en cours) et dans <b>Pas encore pointe</b> qui n'a pas encore pointé (vide le week-end ou jour ferie).</>,
            <>Activez <b>En direct</b> pour un rafraichissement automatique pendant les heures d'affluence.</>,
          ]} />
          <Tip>Les donnees du jour sont recalees automatiquement : week-end et jours feries affichent un message plutot qu'une liste d'absents.</Tip>
        </Section>

        <Section id="effectif" title="5. Effectif">
          <P>Liste complete du personnel avec leurs indicateurs sur la periode.</P>
          <Steps items={[
            <>Ouvrez <b>Effectif</b> dans le menu.</>,
            <>Utilisez le champ <b>Rechercher nom, email, departement...</b> pour trouver une personne.</>,
            <>Cliquez sur les en-tetes de colonnes pour <b>trier</b> (photo, nom, jours, heures, moyenne, retards, statut du jour).</>,
            <>Cliquez sur une ligne pour ouvrir la <b>fiche detaillee</b> de l'employe (historique et coordonnees).</>,
            <>Exporter la liste avec <b>Exporter l'effectif (CSV)</b> en bas.</>,
          ]} />
          <Tip>Le statut du jour (par ex. en poste, en pause, en conge) se lit directement dans la colonne Statut.</Tip>
        </Section>

        <Section id="annuaire" title="6. Annuaire (bios)">
          <P>Vue enrichie de l'effectif, ideal pour un trombinoscope ou consulter les fiches.</P>
          <Steps items={[
            <>Ouvrez <b>Annuaire (bios)</b> dans le menu.</>,
            <>Recherchez une fiche avec le champ <b>Rechercher fiche...</b>.</>,
            <>Pour une fiche vide, ajoutez des employes via <b>Gestion</b>.</>,
            <>Cliquez <b>Modifier</b> sur une fiche pour mettre a jour les informations, puis <b>Enregistrer</b>.</>,
          ]} />
          <Tip>Les photos ajoutees dans une fiche apparaissent aussi dans l'Effectif et les ecrans de pointage.</Tip>
        </Section>

        <Section id="rapport" title="7. Rapport de presence">
          <P>Journal chronologique des pointages : date, nom, entree, sortie, heures et statut.</P>
          <Steps items={[
            <>Ouvrez <b>Rapport</b>.</>,
            <>Ajustez la periode en haut (ex. Aujourd'hui ou 7 jours).</>,
            <>Recherchez un nom avec <b>Rechercher un nom...</b>.</>,
            <>Triez en cliquant sur Date, Nom, Entree, Sortie, Heures ou Statut.</>,
            <>Le compteur en haut affiche « X entree(s) » ou « X / Y » (= lignes filtrees sur le total).</>,
            <>Exportez avec les boutons <b>CSV</b>, <b>PDF</b>, ou ouvrez la <b>Feuille</b> source.</>,
          ]} />
          <P><b>Comprendre les statuts :</b></P>
          <Ul items={[
            <b key="a">OK</b>, <>- entree et sortie normales.</>,
            <b key="b">Retard</b>, <>- arrivee apres l'heure attendue (ou la marge autorisee).</>,
            <b key="c">Pas de sortie</b>, <>- l'entree est enregistree mais pas de sortie ce jour-la.</>,
          ]} />
        </Section>

        <Section id="paie" title="8. Synthese paie">
          <P>Agregation par employe pour la paie : jours, heures, pauses, retards, sorties manquantes.</P>
          <Steps items={[
            <>Ouvrez <b>Paie</b>.</>,
            <>Reglez la periode (souvent <b>Ce mois</b>).</>,
            <>Les KPIs du haut donnent le total salaires, heures totales et pauses de la periode.</>,
            <>Recherchez un salarie avec <b>Rechercher un salarie...</b> et triez par colonne.</>,
            <>Exportez avec <b>Exporter (CSV)</b> ou <b>PDF</b>.</>,
          ]} />
          <Tip>Les heures affichees sont <b>netes</b> : entree − sortie − pause. C'est la reference pour calculer la paie.</Tip>
        </Section>

        <Section id="dept" title="9. Departements">
          <P>Pointages regroupes par departement.</P>
          <Steps items={[
            <>Ouvrez <b>Departements</b>.</>,
            <>Choisissez la periode.</>,
            <>Cherchez un departement avec <b>Rechercher un departement...</b>.</>,
            <>Lisez : effectif pointe, heures totales, moyenne/jour, pauses, retards, sorties manquantes.</>,
            <>Les employes sans departement apparaissent sous « Sans departement ».</>,
            <>Exportez avec <b>Exporter (CSV)</b> ou <b>PDF</b>.</>,
          ]} />
          <Tip>Attribuez un departement a chaque employe dans <b>Gestion</b> pour enrichir ces stats.</Tip>
        </Section>

        <Section id="assiduite" title="10. Assiduite & series">
          <P>Regularite de chaque employe : assiduite, serie actuelle et meilleure serie.</P>
          <Steps items={[
            <>Ouvrez <b>Assiduite</b>.</>,
            <>Reglez la periode.</>,
            <>Lisez pour chaque salarie : <b>Assiduite (%)</b> (jours presents / jours ouvres), <b>Serie actuelle</b> (jours consecutifs jusqu'a maintenant), <b>Meilleure serie</b> (record sur la periode).</>,
            <>La <b>barre de couleur</b> sous le pourcentage visualise le niveau (vert = haut, rouge = faible).</>,
            <>Recherchez un salarie et triez par colonne.</>,
            <>Exportez avec <b>Exporter (CSV)</b> ou <b>PDF</b>.</>,
          ]} />
          <Tip>Cette vue aide a reperer les absences recurrentes ou a feuil possible l'employe le plus assidu.</Tip>
        </Section>

        <Section id="alertes" title="11. Alertes & anomalies">
          <P>Deux listes automatiques pour surveiller ce qui sort de l'ordinaire.</P>
          <Steps items={[
            <>Ouvrez <b>Alertes & anomalies</b>.</>,
            <><b>Alertes</b> : personnes pas encore pointees aujourd'hui, sorties manquantes ou retards sur la periode.</>,
            <><b>Anomalies</b> : journees anormalement courtes (&lt; 2 h) ou longues (&gt; 16 h), pauses excessives (&gt; 120 min), retards repetes (&gt;= 5).</>,
            <>Si tout va bien, un message « Aucune anomalie » s'affiche.</>,
            <>Pour corriger un pointage, passez a <b>Gestion → Corrections de pointage</b>.</>,
          ]} />
        </Section>

        <Section id="gestion" title="12. Gestion">
          <P>Le centre d'administration du personnel. Cinq sections y sont reunies.</P>

          <P><b>Employes (ajout / modification / suppression)</b></P>
          <Steps items={[
            <>Ouvrez <b>Gestion</b>.</>,
            <>Pour ajouter un employe : remplissez <b>Nom</b> et <b>Email</b> (obligatoires), puis Departement, Poste, Telephone, Photo et horaires (facultatifs), et appuyez sur <b>Ajouter</b>.</>,
            <>Pour modifier : cliquez <b>Modifier</b> dans la liste, changez les champs, puis <b>Enregistrer</b>.</>,
            <>Pour supprimer : cliquez <b>Supprimer</b> sur la ligne de l'employe.</>,
          ]} />

          <P><b>Import en masse (CSV)</b></P>
          <Steps items={[
            <>Dans <b>Gestion</b>, descendez a <b>Import en masse</b>.</>,
            <>Collez un tableau ou <b>uploadez un fichier CSV</b> au format <b>Nom,Email,Departement,Debut(Fin)</b> (l'en-tete est facultatif).</>,
            <>Appuyez sur <b>Importer en masse</b>.</>,
          ]} />

          <P><b>Admins</b></P>
          <Steps items={[
            <>Dans <b>Gestion</b>, section <b>Admins</b>.</>,
            <>Saisissez l'email puis appuyez sur <b>Ajouter un admin</b> pour donner le droit admin.</>,
            <>Retirez le droit avec <b>Supprimer</b> sur la ligne correspondante.</>,
          ]} />

          <P><b>Conges</b></P>
          <Steps items={[
            <>Dans <b>Gestion</b>, section <b>Conges</b>.</>,
            <>Renseignez <b>Email</b>, la date de <b>Debut</b> et de <b>Fin</b>, et un <b>Motif</b> (facultatif).</>,
            <>Appuyez sur <b>Ajouter</b>. L'employe apparait alors « En conge » ces jours-la.</>,
            <>Supprimez un conge avec <b>Supprimer</b>.</>,
          ]} />

          <P><b>Jours feries</b></P>
          <Steps items={[
            <>Dans <b>Gestion</b>, section <b>Jours feries</b>.</>,
            <>Renseignez le <b>Nom</b> (ex. Fete du travail) et la <b>Date</b>.</>,
            <>Appuyez sur <b>Ajouter</b>. Personne n'est alors considere absent ce jour.</>,
          ]} />
          <Tip>Les sections Employes, Admins, Conges, Jours feries et Corrections se deplient/plient pour faire de la place.</Tip>
        </Section>

        <Section id="corrections" title="13. Corrections de pointage">
          <P>Pour corriger un pointage oublie ou errone. Chaque action est enregistree.</P>
          <Steps items={[
            <>Ouvrez <b>Gestion</b>, section <b>Corrections de pointage</b>.</>,
            <>Renseignez l'<b>Email</b> et la <b>Date</b> concernee.</>,
            <>Choisissez le type de <b>Correction</b> :</>,
            <><b>Sortie oubliee</b> — saisissez la sortie pour une journee ouverte.</>,
            <><b>Paire complete</b> — saisissez l'entree (HH:MM) et la sortie.</>,
            <><b>Supprimer le dernier pointage</b> — efface le dernier pointage de l'employe (aucune sortie a saisir).</>,
            <>Appuyez sur <b>Appliquer</b>. Un message « Correction appliquee » confirme l'operation.</>,
          ]} />
          <Tip>La <b>Date</b> et le choix de correction sont obligatoires pour appliquer. Verifiez toujours l'email avant d'appliquer.</Tip>
        </Section>

        <Section id="qr" title="14. QR & acces">
          <P>Genere le QR permanent a afficher a l'entree, et donne acces a l'ecran d'accueil du bureau.</P>

          <P><b>QR Code permanent</b></P>
          <Steps items={[
            <>Ouvrez <b>QR & acces</b>.</>,
            <>Dans <b>Token secret</b>, collez exactement le <b>qrSecret</b> de la feuille Config.</>,
            <>Dans <b>Code tenant</b>, saisissez le code de l'organisation (ex. addredance) — facultatif.</>,
            <>Appuyez sur <b>Generer le QR</b>.</>,
            <>Imprimez le QR avec <b>Imprimer</b> ou sauvegardez-le avec <b>Telecharger PNG</b>, puis affichez-le a l'entree.</>,
          ]} />

          <P><b>Ecran d'entree (QR rotatif)</b></P>
          <Steps items={[
            <>Dans <b>QR & acces</b>, section <b>Ecran d'entree (QR rotatif)</b>.</>,
            <>Appuyez sur <b>Ouvrir l'ecran d'entree</b>.</>,
            <>Ouvrez cette page sur la tablette ou l'ecran a l'entree du bureau.</>,
          ]} />
          <Tip>Le QR permanent ne change jamais : imprimez-le une fois et il reste valable, tant que le token correspond a la Config.</Tip>
        </Section>

        <Section id="annonces" title="15. Annonces">
          <P>Publiez des messages que vos employes voient sur leur ecran d'accueil.</P>
          <Steps items={[
            <>Ouvrez <b>Annonces</b>.</>,
            <>Dans <b>Publier une annonce</b>, saisissez un <b>Titre</b> (facultatif) et un <b>Message</b>.</>,
            <>Cochez <b>Epingler en haut</b> pour une annonce importante affichee en haut de la liste.</>,
            <>Appuyez sur <b>Publier</b>. L'annonce apparait dans la liste <b>Annonces publiees</b> et sur l'ecran d'accueil des employes.</>,
            <>Supprimez une annonce avec <b>Supprimer</b> sur sa ligne.</>,
          ]} />
          <Tip>Parfait pour : jours feries, changements d'horaire, reunions ou consignes du jour.</Tip>
        </Section>

        <Section id="exports" title="16. Exports (CSV & PDF)">
          <P>La plupart des vues proposent des boutons d'export en bas de page :</P>
          <Ul items={[
            <b key="a">CSV</b>, <>- fichier tableur. Nom predefini : presence-, effectif-, paie-, departements-, assiduite-, suivi des dates de la periode.</>,
            <b key="b">PDF</b>, <>- ouvre la fenetre d'impression : choisissez « Enregistrer en PDF » comme destination.</>,
            <b key="c">Feuille</b>, <>- lien direct vers la Google Sheet source (sur le Rapport).</>,
          ]} />
          <Steps items={[
            <>Choisissez d'abord la <b>periode</b> desiree (elle apparait dans le nom du fichier).</>,
            <>En bas de la vue, appuyez sur <b>CSV</b>, <b>PDF</b> ou <b>Feuille</b>.</>,
            <>Les CSV sont telecharges dans votre dossier de telechargements ; les PDF s'exportent via l'impression.</>,
          ]} />
          <Tip>Les CSV contiennent une marque BOM et sont compatibles accents : ils s'ouvrent correctement avec Excel/Sheets en francais.</Tip>
        </Section>

        <Section id="faq" title="17. Questions frequentes">
          <P><b>Q : Comment ajouter plusieurs employes rapidement ?</b><br/>A : Dans <b>Gestion → Import en masse</b>, uploadez un CSV ou collez le tableau au format Nom,Email,Departement,Debut(Fin).</P>
          <P><b>Q : Un employe a oublie de pointer en sortant. Comment corriger ?</b><br/>A : Dans <b>Gestion → Corrections de pointage</b>, choisissez « Sortie oubliee » pour sa journee ouverte.</P>
          <P><b>Q : Comment marquer un jour ou l'entreprise est fermee ?</b><br/>A : Enregistrez-le comme <b>Jour ferie</b> dans <b>Gestion</b>. Personne n'est alors considere absent ce jour.</P>
          <P><b>Q : Comment ajouter un autre admin ?</b><br/>A : Dans <b>Gestion → Admins</b>, saisissez l'email puis <b>Ajouter un admin</b>.</P>
          <P><b>Q : Comment changer le QR de l'entree ?</b><br/>A : Dans <b>QR & acces</b>, collez le bon qrSecret de la Feuille Config puis <b>Generer le QR</b>.</P>
          <P><b>Q : Ou partent les exports ?</b><br/>A : Les CSV partent dans votre dossier de telechargements ; les PDF s'exportent via la fenetre d'impression du navigateur.</P>
          <P><b>Q : Les donnees sont-elles privees ?</b><br/>A : Oui. Les pointages sont stockes dans votre Google Sheet (compte {'/' + (config && config.appName ? config.appName : 'de l\x27organisation')}) et vos sessions admin restent sur votre appareil.</P>
        </Section>
      </div>
    </div>
  );
});
