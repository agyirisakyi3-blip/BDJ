import { useState, useEffect, useRef, useCallback } from 'react';

const STEPS = [
  {
    view: 'dashboard', selector: '.dash-toolbar',
    title: 'La barre de periode',
    body: <>Choisissez ici la periode analysee : « Aujourd'hui », 7 jours, 30 jours ou Ce mois. Les dates « Du / Au » permettent une plage personnalisee, puis « Charger » actualise les donnees.</>,
  },
  {
    view: 'dashboard', selector: '.kpi-grid .kpi:nth-child(1)',
    title: 'Les KPIs',
    body: <>Ce nombre indique l'<b>effectif total</b> (le nombre de personnes dans l'organisation). Les trois autres cartes affichent « Sur place », « Entrees » et « Sorties » du jour.</>,
  },
  {
    view: 'dashboard', selector: '.charts-row .chart-card:first-child',
    title: 'Heures par jour',
    body: <>Histogramme des heures pointees jour par jour. Le total de la periode s'affiche en haut a droite de la carte. Survolez les barres pour voir le detail.</>,
  },
  {
    view: 'effectif', selector: '.people-table',
    title: 'L' + '\u2019' + 'effectif',
    body: <>Liste complete du personnel. Recherchez un nom, triez en cliquant sur les en-tetes, ou cliquez sur une ligne pour ouvrir la fiche detaillee de l'employe.</>,
  },
  {
    view: 'rapport', selector: '.table-wrap',
    title: 'Le rapport de presence',
    body: <>Journal chronologique de tous les pointages : date, nom, entree, sortie, heures et statut. Utilisez les boutons <b>CSV</b> et <b>PDF</b> pour exporter.</>,
  },
  {
    view: 'paie', selector: '.kpi-grid .kpi:nth-child(1)',
    title: 'La synthese paie',
    body: <>Agregation des heures <b>netes</b> (entree − sortie − pause) par salarie. C'est la reference pour le calcul de la paie sur la periode.</>,
  },
  {
    view: 'assiduite', selector: '.table-wrap',
    title: 'Assiduite & series',
    body: <>Regularite de chaque employe : pourcentage de presence, serie actuelle de jours consecutifs et record sur la periode. Les barres colorees indiquent le niveau.</>,
  },
  {
    view: 'alertes', selector: '.card.block',
    title: 'Alertes & anomalies',
    body: <>Surveillez automatiquement les absences du jour, sorties manquantes, retards et journees anormalement courtes ou longues.</>,
  },
  {
    view: 'gestion', selector: '.collapsible',
    title: 'Gestion du personnel',
    body: <>Ajoutez, modifiez ou supprimez les employes, importez en masse via CSV, gerez les admins, les conges et les jours feries.</>,
  },
  {
    view: 'qr', selector: '.collapsible',
    title: 'QR & acces',
    body: <>Generez le QR permanent de l'entree (avec le qrSecret de la Config) et ouvrez l'ecran d'entree rotatif pour la tablette du bureau.</>,
  },
  {
    view: 'annonces', selector: '.collapsible',
    title: 'Annonces',
    body: <>Publiez des messages (jours feries, changements d'horaire, reunions) que vos employes verront sur leur ecran d'accueil.</>,
  },
  {
    view: 'aide', selector: '.help-search',
    title: 'Centre d' + '\u2019' + 'aide',
    body: <>Recherchez une section avec la barre de recherche, filtrez par categorie, ou utilisez « Lancer une visite guidee » a tout moment.</>,
  },
];

export default function AdminTour({ onOpenView, onClose }) {
  const [step, setStep] = useState(0);
  const [box, setBox] = useState(null);
  const [viewReady, setViewReady] = useState(false);
  const renderTick = useRef(0);

  const current = STEPS[step];

  useEffect(() => {
    setBox(null);
    setViewReady(false);
    if (current && typeof onOpenView === 'function') {
      onOpenView(current.view);
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wait for the target element to (re)render before measuring.
  useEffect(() => {
    if (!current) return;
    let raf;
    const attempt = () => {
      const el = document.querySelector(current.selector);
      if (el) {
        const r = el.getBoundingClientRect();
        setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
        setViewReady(true);
        return;
      }
      renderTick.current += 1;
      if (renderTick.current < 60) raf = requestAnimationFrame(attempt);
      else setViewReady(true);
    };
    const t = setTimeout(attempt, 120);
    return () => { clearTimeout(t); if (raf) cancelAnimationFrame(raf); };
  }, [current, viewReady]);

  const next = useCallback(() => {
    renderTick.current = 0;
    setViewReady(false);
    if (step < STEPS.length - 1) setStep(step + 1);
    else onClose();
  }, [step, onClose]);

  const prev = useCallback(() => {
    renderTick.current = 0;
    setViewReady(false);
    setStep((s) => (s > 0 ? s - 1 : 0));
  }, []);

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="Visite guidee">
      {box && <div className="tour-spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />}

      <div className="tour-card">
        <div className="tour-head">
          <span className="pill">{step + 1} / {STEPS.length}</span>
          <button type="button" className="icon-btn tour-close" onClick={onClose} aria-label="Fermer la visite" title="Fermer">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="tour-body">
          <h3>{current.title}</h3>
          <p>{current.body}</p>
        </div>
        <div className="tour-foot">
          <button type="button" className="ghost-btn sm" onClick={prev} disabled={step === 0}>Precedent</button>
          <div className="tour-progress">
            {STEPS.map((_, i) => <span key={i} className={'tour-dot' + (i === step ? ' active' : '') + (i < step ? ' done' : '')} />)}
          </div>
          <button type="button" className="primary-btn sm" onClick={next}>
            {step === STEPS.length - 1 ? 'Terminer' : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  );
}
