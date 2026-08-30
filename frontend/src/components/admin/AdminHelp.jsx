import { memo } from 'react';
import { useApp } from '../../contexts/AppContext';

const SECTIONS = [
  { id: 'debut', title: '1. Prise en main', short: 'Prise en main' },
  { id: 'periode', title: '2. La periode affichee', short: 'Periode' },
  { id: 'dashboard', title: '3. Tableau de bord', short: 'Tableau de bord' },
  { id: 'effectif', title: '4. Effectif & annuaire', short: 'Effectif' },
  { id: 'rapport', title: '5. Rapport de presence', short: 'Rapport' },
  { id: 'paie', title: '6. Synthese paie', short: 'Paie' },
  { id: 'dept', title: '7. Departements', short: 'Departements' },
  { id: 'assiduite', title: '8. Assiduite & series', short: 'Assiduite' },
  { id: 'alertes', title: '9. Alertes & anomalies', short: 'Alertes' },
  { id: 'gestion', title: '10. Gestion', short: 'Gestion' },
  { id: 'qr', title: '11. QR & acces', short: 'QR & acces' },
  { id: 'annonces', title: '12. Annonces', short: 'Annonces' },
  { id: 'exports', title: '13. Exports (CSV & PDF)', short: 'Exports' },
  { id: 'faq', title: '14. Questions frequentes', short: 'FAQ' },
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
          <Ul items={[
            <b key="a">Connexion :</b>,
            <>Pour entrer dans la console, utilisez votre compte admin ({'nom@email'}) via l'ecran « Admin ». Votre session reste active sur cet appareil.</>,
            <>Le bouton <b>Actualiser</b> recharge les donnees. La vue « Aujourd'hui » se rafraichit seul toutes les 30 s quand <b>En direct</b> est active.</>,
            <>Le bouton <b>Se deconnecter</b> (en bas du menu) ferme votre session admin.</>,
          ]} />
          <Tip>Chaque vue a une barre du haut avec le titre et la <b>periode</b> choisie. Voir la section suivante.</Tip>
        </Section>

        <Section id="periode" title="2. La periode affichee">
          <P>En haut de chaque page, vous choisissez la plage de temps analysee. Cela filtre toutes les stats, tableaux et exports.</P>
          <Ul items={[
            <b key="a">Raccourcis :</b>,
            <b key="b">Aujourd'hui</b>, <b key="c">7 jours</b>, <b key="d">30 jours</b>, <b key="e">Ce mois</b>,
            <>Dates libres : renseignez <b>Du / Au</b> puis appuyez sur <b>Charger</b> pour une periode personnalisee.</>,
          ]} />
          <Tip>Pour comparer deux periodes, changez simplement les dates et rechargez. Les chiffres (KPIs, totaux, tableaux) se mettent a jour automatiquement.</Tip>
        </Section>

        <Section id="dashboard" title="3. Tableau de bord">
          <P>La vue d'accueil resume l'activite du jour et de la periode :</P>
          <Ul items={[
            <b key="a">Effectif</b>, <>- nombre total de personnes dans le roster.</>,
            <b key="b">Sur place</b>, <>- personnes actuellement presentes (on-site).</>,
            <b key="c">Entrees / Sorties du jour</b>, <>- pointages de la journee.</>,
            <b key="d">Heures par jour</b>, <>- histogramme des heures pointees.</>,
            <b key="e">Presence aujourd'hui</b>, <>- repartition : sur place / pause / conge / sorti / absent.</>,
            <b key="f">Present maintenant & Pas encore pointe</b>, <>- listes en temps reel des personnes presentes et absentes.</>,
          ]} />
          <Tip>Le voyant <b>En direct</b> active le rafraichissement automatique, utile pendant les heures d'affluence (entrees/sorties).</Tip>
        </Section>

        <Section id="effectif" title="4. Effectif & annuaire">
          <P><b>Effectif</b> affiche la liste complete du personnel : photo, jours presents, heures, moyenne, retards et statut du jour. Cliquez sur une ligne pour ouvrir la fiche detaillee de l'employe.</P>
          <P><b>Annuaire (bios)</b> donne une vue enrichie (photos, informations personnelles) de l'effectif — ideal pour un trombinoscope.</P>
          <Ul items={[
            <>Recherchez et triez par colonne (cliquez sur l'en-tete).</>,
            <>Exportez l'effectif en CSV avec <b>Exporter l'effectif (CSV)</b>.</>,
          ]} />
        </Section>

        <Section id="rapport" title="5. Rapport de presence">
          <P>Journal chronologique des pointages sur la periode : par jour, employe, entree, sortie, heures et statut.</P>
          <Ul items={[
            <b key="a">Statuts :</b>,
            <b key="b">OK</b>, <>- entree + sortie normales.</>,
            <b key="c">Retard</b>, <>- arrivee apres l'heure ou la marge configuree.</>,
            <b key="d">Pas de sortie</b>, <>- la personne a pointe une entree mais pas de sortie le jour.</>,
          ]} />
          <Tip>Exportez ce journal en <b>CSV</b>, <b>PDF</b> ou ouvrez la <b>Feuille</b> source (Google Sheets).</Tip>
        </Section>

        <Section id="paie" title="6. Synthese paie">
          <P>Agregation par employe sur la periode : nombre de jours, total d'heures, moyenne/jour, temps de pause, retards et sorties manquantes.</P>
          <Ul items={[
            <>Les KPIs du haut donnent le total salaire (nombre de salaries), heures totales et pauses sur la periode.</>,
            <>Le tableau est triable et filtrable par nom.</>,
            <>Boutons <b>Exporter (CSV)</b> et <b>PDF</b> pour la paie.</>,
          ]} />
          <Tip>C'est ici que vous croisez les heures avec vos taux pour etablir la paie. Les heures sont nettes (entree - sortie - pause).</Tip>
        </Section>

        <Section id="dept" title="7. Departements">
          <P>Regroupe les pointages par departement de l'employe : effectif pointe, heures totales, moyenne/jour, pauses, retards et sorties manquantes.</P>
          <Ul items={[
            <>Les employes sans departement sont groupes sous « <b>Sans departement</b> ».</>,
            <>Attribuez un departement a chaque employe dans <b>Gestion</b> pour enrichir ces stats.</>,
            <>Export en <b>CSV</b> et <b>PDF</b> disponibles.</>,
          ]} />
        </Section>

        <Section id="assiduite" title="8. Assiduite & series">
          <P>Mesure la regularite de chaque employe sur la periode :</P>
          <Ul items={[
            <b key="a">Assiduite (%)</b>, <>- jours presents / jours ouvres de la periode. Plus c'est haut, plus la regularite est bonne.</>,
            <b key="b">Serie actuelle</b>, <>- nombre de jours ouvres consecutifs de presence jusqu'a aujourd'hui.</>,
            <b key="c">Meilleure serie</b>, <>- record de jours consecutifs sur la periode.</>,
            <>La barre de couleur sous le pourcentage visualise le niveau d'assiduite (vert = haute, rouge/orange = faible).</>,
          ]} />
          <Tip>Utilisez cette vue pour repérer les absences recurrentes ou feuil possible un employe le plus assidu.</Tip>
        </Section>

        <Section id="alertes" title="9. Alertes & anomalies">
          <P>Deux listes automatiques pour surveiller ce qui sort de l'ordinaire :</P>
          <Ul items={[
            <b key="a">Alertes</b>, <>- personnes pas encore pointees aujourd'hui, sorties manquantes ou retards sur la periode.</>,
            <b key="b">Anomalies</b>, <>- journees anormalement courtes (&lt; 2 h) ou longues (&gt; 16 h), pauses excessives (&gt; 120 min), retards repetes (&gt;= 5).</>,
          ]} />
          <Tip>Pour corriger une anomalie (entree/sortie manquante), utilisez la section <b>Corrections</b> dans <b>Gestion</b>.</Tip>
        </Section>

        <Section id="gestion" title="10. Gestion">
          <P>Le centre d'administration du personnel :</P>
          <Ul items={[
            <b key="a">Employes</b>, <>- ajouter, modifier (photo, departement, role), supprimer, ou importer un <b>CSV</b> en masse.</>,
            <b key="b">Admins</b>, <>- donner ou retirer le droit admin a une adresse email.</>,
            <b key="c">Conges</b>, <>- enregistrer des periodes de conge (l'employe apparait alors « En conge »).</>,
            <b key="d">Jours feries</b>, <>- marquer des jours ou personne n'est attendu.</>,
            <b key="e">Corrections</b>, <>- forcer une sortie manquante, ajouter une entree/sortie manuelle, ou retirer le dernier pointage. Chaque action est auditee.</>,
          ]} />
          <Tip>L'import CSV est pratique pour installer votre effectif rapidement : preparez une feuille avec nom, email, departement, poste, etc.</Tip>
        </Section>

        <Section id="qr" title="11. QR & acces">
          <P>Pour chaque employe, un <b>QR code</b> est genere. Imprimez-le et affichez-le a l'entree : le personnel le scanne avec son telephone pour pointer.</P>
          <Ul items={[
            <>La <b>liste des QR</b> permet de tout imprimer d'un coup.</>,
            <><b>Ecran d'accueil</b> (&laquo; Office screen &raquo;) affiche en grand un ecran de pointage/affichage pour le bureau (tablette/TV).</>,
          ]} />
          <Tip>Pointez l'ecran du premier QR d'un employe face a votre propre telephone pour tester rapidement le scan.</Tip>
        </Section>

        <Section id="annonces" title="12. Annonces">
          <P>Publiez des messages que vos employes voient sur leur ecran d'accueil :</P>
          <Ul items={[
            <>Saisissez un <b>titre</b> (optionnel) et un <b>message</b>.</>,
            <>Cochez <b>Epingler</b> pour une annonce importante affichee en haut de la liste.</>,
            <>Appuyez sur <b>Publier</b>. L'annonce apparait aussitot dans la <b>fiche Annonces</b> du personnel.</>,
            <>Supprimez une annonce avec le bouton <b>Supprimer</b> correspondant.</>,
          ]} />
          <Tip>Attendu : jours feries, changements d'horaire, reunions ou consignes du jour.</Tip>
        </Section>

        <Section id="exports" title="13. Exports (CSV & PDF)">
          <P>La plupart des vues proposent des boutons d'export en bas de page :</P>
          <Ul items={[
            <b key="a">CSV</b>, <>- fichier tableur (Excel/Sheets) avec un nom predefini : presence-, effectif-, paie-, departements-, assiduite- (suivi des dates de la periode).</>,
            <b key="b">PDF</b>, <>- ouvre une fenetre d'impression : choisissez « Enregistrer en PDF » comme destination.</>,
            <b key="c">Feuille</b>, <>- lien direct vers la Google Sheet source.</>,
          ]} />
          <Tip>Les fichiers CSV contiennent une marque BOM et un point-virgule-compatible : ils s'ouvrent correctement meme avec des accents en francais.</Tip>
        </Section>

        <Section id="faq" title="14. Questions frequentes">
          <P><b>Q : Comment ajouter plusieurs employes rapidement ?</b><br/>A : Dans <b>Gestion</b>, utilisez l'import CSV des employes pour tout charger d'un coup.</P>
          <P><b>Q : Un employe a oublie de pointer en sortant. Comment corriger ?</b><br/>A : Dans <b>Gestion &rarr; Corrections</b>, choisissez « forcer une sortie » pour sa journee ouverte.</P>
          <P><b>Q : Comment marquer un jour ou l'entreprise est fermee ?</b><br/>A : Enregistrez-le comme <b>Jour ferie</b> dans <b>Gestion</b>. Personne ne sera alors considere absent ce jour.</P>
          <P><b>Q : Comment changer le QR d'un employe ?</b><br/>A : Les QR sont generes automatiquement. Regenerez/renvoyez-les depuis <b>QR &amp; acces</b>.</P>
          <P><b>Q : Ou partent les exports ?</b><br/>A : Les CSV sont telecharges dans votre dossier de telechargements ; les PDF s'exportent via la fenetre d'impression du navigateur.</P>
          <P><b>Q : Les donnees sont-elles privees ?</b><br/>A : Oui. Les pointages sont stockes dans votre Google Sheet (compte {'/' + (config && config.appName ? config.appName : 'de l\x27organisation')}) et vos sessions admin restent sur votre appareil.</P>
        </Section>
      </div>
    </div>
  );
});
