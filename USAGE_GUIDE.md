# Guide d'utilisation — Application de Presence

---

## Table des matieres

1. [Installation de l'application](#1-installation-de-lapplication)
2. [Premiere utilisation (Employee)](#2-premiere-utilisation-employee)
3. [Pointer l'entree et la sortie](#3-pointer-lentree-et-la-sortie)
4. [Consulter son historique](#4-consulter-son-historique)
5. [Connexion admin](#5-connexion-admin)
6. [Tableau de bord admin](#6-tableau-de-bord-admin)
7. [Gestion des employes](#7-gestion-des-employes)
8. [Gestion des admins](#8-gestion-des-admins)
9. [Creation d'un nouvel espace (multi-tenant)](#9-creation-dun-nouvel-espace-multi-tenant)
10. [Mode hors ligne](#10-mode-hors-ligne)
11. [Questions frequentes](#11-questions-frequentes)

---

## 1. Installation de l'application

### Sur telephone (recommande)

1. Ouvrez le navigateur Chrome (ou Safari) et accedez a l'adresse de l'application
2. Si demandee, acceptez les conditions d'utilisation
3. Pour installer l'application sur votre telephone :
   - **Chrome (Android)** : Appuyez sur les trois points en haut a droite → « Installer l'application » ou « Ajouter a l'ecran d'accueil »
   - **Safari (iPhone)** : Appuyez sur l'icone de partage en bas → « Ajouter a l'ecran d'accueil »
4. L'application s'installe comme une application native, sans telechargement via un store

### Sur ordinateur

1. Ouvrez votre navigateur et accedez a l'adresse de l'application
2. Aucune installation necessaire — l'application fonctionne directement dans le navigateur

---

## 2. Premiere utilisation (Employee)

### Etape 1 : Accepter les conditions

Lors de la premiere ouverture, un bandeau de consentement s'affiche. Appuyez sur **Accepter** pour continuer.

### Etape 2 : Parcours de bienvenue

Un assistant de bienvenue vous guide en 3 etapes :
1. **Bienvenue** — Presentation de l'application
2. **Vos coordonnees** — Definir votre nom et email
3. **Scanner pour pointer** — Comment scanner le QR code

Vous pouvez appuyer sur **Passer** pour ignorer l'assistant.

### Etape 3 : Definir votre profil

1. Appuyez sur l'icone de profil (en haut a droite) ou sur **Suivant** dans l'assistant
2. Saisissez :
   - **Nom** : votre nom complet (obligatoire)
   - **Email** : votre adresse email professionnelle (obligatoire)
   - **Code espace** : le code de votre entreprise (facultatif — laissez vide si vous etes dans l'espace par defaut)
3. Appuyez sur **Enregistrer**

> **Important** : Votre profil est stocke sur cet appareil uniquement. Vous ne le definissez qu'une seule fois.

---

## 3. Pointer l'entree et la sortie

### Scanner le QR code

1. Sur l'ecran d'accueil, appuyez sur le bouton bleu **Scanner QR pour pointer**
2. Autorisez l'acces a la camera si demande
3. Centrez le code QR dans le cadre de scan
4. L'application detecte automatiquement si vous pointez l'entree ou la sortie

### Comprendre le fonctionnement

| Action | Quand | Resultat |
|--------|-------|----------|
| Premier scan | Arrivee au bureau | **Entree** (check-in) — l'application indique « Pointe » |
| Deuxieme scan | Depart du bureau | **Sortie** (check-out) — l'application indique « Sorti » |
| Scan ulterieur | Re-arrivee | Nouvelle **Entree** |

### Camera ne fonctionne pas ?

1. Appuyez sur **Scanner QR pour pointer**
2. Descendez et appuyez sur « Camera ne fonctionne pas? Saisissez le code manuellement »
3. Collez le contenu du code QR dans le champ de texte
4. Appuyez sur **Utiliser**

### Retour visuel

Apres chaque scan reussi :
- Un ecran de confirmation s'affiche avec « Bon retour, [prenom]! » ou « Au revoir, [prenom]! »
- La duree de presence s'affiche en temps reel sur l'ecran d'accueil

---

## 4. Consulter son historique

### Depuis l'ecran d'accueil

1. Appuyez sur **Mon historique** (en bas de l'ecran)
2. Un resume s'affiche avec :
   - Nombre de jours presents
   - Total d'heures
   - Nombre de retards
3. Le tableau detaille chaque jour avec les heures d'entree et de sortie

### Exporter vos donnees

1. Ouvrez **Mon historique**
2. Appuyez sur **Telecharger mes donnees (CSV)**
3. Le fichier CSV se telecharge automatiquement

### Effacer vos donnees

1. Ouvrez **Mon historique**
2. Appuyez sur **Effacer mes donnees**
3. Confirmez l'action — cette action est **irreversible**

### Activite recente et 7 derniers jours

Sur l'ecran d'accueil, deux cartes s'affichent si vous avez un profil :
- **Activite recente** : vos 5 derniers pointages
- **7 derniers jours** : un graphique en barres de vos heures par jour

---

## 5. Connexion admin

### Acceder au panneau admin

1. Sur l'ecran d'accueil, appuyez sur **Admin** (en bas de l'ecran)
2. Le formulaire de connexion s'affiche

### Connexion par email + OTP (recommande)

1. Saisissez votre **email admin** (doit etre dans la feuille Admins)
2. Laissez le champ PIN vide
3. Appuyez sur **Voir le resume du jour**
4. Un code a usage unique (OTP) est envoye a votre email
5. Saisissez le code a 6 chiffres dans le champ **Code a usage unique**
6. Appuyez sur **Verifier le code**

### Connexion par PIN + OTP (legacy)

1. Saisissez votre **PIN admin** (code PIN de l'entreprise)
2. Appuyez sur **Voir le resume du jour**
3. Un code OTP est envoye a l'adresse email configuree
4. Saisissez le code et validez

> **Note** : La session admin dure 30 minutes. Apres ce delai, vous devrez vous reconnecter.

---

## 6. Tableau de bord admin

Une fois connecte, le tableau de bord affiche :

### Statistiques du jour

| Indicateur | Description |
|------------|-------------|
| **Entrees aujourd'hui** | Nombre total de check-in aujourd'hui |
| **Sorties aujourd'hui** | Nombre total de check-out aujourd'hui |
| **Sur place** | Nombre de personnes actuellement au bureau |

### Resume du rapport

| Indicateur | Description |
|------------|-------------|
| **Total heures** | Heures totales pointees sur la periode |
| **Jours presents** | Nombre de jours avec au moins un pointage |
| **Retards** | Nombre de retards (apres l'heure configuree) |
| **Pas de sortie** | Nombre d'entrees sans check-out associe |

### Present maintenant

- Liste des personnes actuellement sur place avec leur nom
- Liste des personnes qui n'ont pas encore pointe aujourd'hui

### Periode du rapport

1. Selectionnez la date de debut (**Du**) et de fin (**Au**)
2. Appuyez sur **Charger le rapport**
3. Le tableau se met a jour avec les donnees de la periode

### Exporter en CSV

Appuyez sur **CSV** pour telecharger le rapport complet au format Excel/CSV.

### Acceder a la feuille Google

Appuyez sur **Feuille** pour ouvrir directement la feuille de calcul Google Sheets.

---

## 7. Gestion des employes

### Ajouter un employe

1. Dans le panneau admin, deployez la section **Employes**
2. Saisissez :
   - **Nom** : nom complet de l'employe
   - **Email** : adresse email professionnelle
   - **Departement** : (facultatif) service ou departement
3. Appuyez sur **Ajouter**

### Supprimer un employe

1. Dans la liste des employes, appuyez sur **Supprimer** a cote de l'employe
2. Confirmez la suppression

> **Note** : Les employes ajoutes ici sont pre-approuves. Leur nom enregistre remplace ce qu'ils saisissent dans leur profil, pour garder la coherence des donnees.

---

## 8. Gestion des admins

### Ajouter un admin

1. Dans le panneau admin, deployez la section **Admins**
2. Saisissez :
   - **Nom** : nom complet de l'admin
   - **Email** : adresse email de l'admin (ce sera son identifiant de connexion)
3. Appuyez sur **Ajouter un admin**

### Supprimer un admin

1. Dans la liste des admins, appuyez sur **Supprimer** a cote de l'admin
2. Confirmez la suppression

> **Important** : Chaque admin se connecte avec son propre email et recoit son propre code OTP. L'email doit etre dans la feuille Admins pour pouvoir se connecter.

---

## 9. Creation d'un nouvel espace (multi-tenant)

Si vous etes l'admin plateforme, vous pouvez creer de nouveaux espaces d'entreprise.

### Creer un espace

1. Dans le panneau admin, deployez la section **Creer un espace**
2. Saisissez :
   - **Code espace** : identifiant unique (2-24 caracteres, lettres/chiffres/tirets)
   - **Nom de l'entreprise** : nom affiche dans l'application
3. Appuyez sur **Creer**

### Informations generees

Apres la creation, le systeme affiche :
- **Code PIN admin** : PIN pour se connecter en tant qu'admin de cet espace
- **Contenu QR du bureau** : code a imprimer sur le QR code du bureau
- **Feuille de calcul** : lien vers la nouvelle feuille Google Sheets

> **Important** : Enregistrez ces informations — le PIN n'est affiche qu'une seule fois.

### Imprimer le QR code

1. Ouvrez le fichier `qr-generator.html` dans votre navigateur
2. Saisissez le code QR genere (format : `code-espace|token-QR`)
3. Imprimez le QR code et placez-le a l'entree du bureau

---

## 10. Mode hors ligne

L'application fonctionne meme sans connexion internet.

### Fonctionnement

1. **Scan hors ligne** : Le pointage est enregistre localement sur l'appareil
2. **Synchronisation automatique** : Lorsque la connexion revient, les pointages en attente sont envoyes automatiquement
3. **Notification** : Un message indique le nombre de pointages synchronises

### Limitations hors ligne

- L'historique et les rapports ne sont pas disponibles
- La connexion admin necessite une connexion internet (envoi d'email OTP)
- Maximum 20 pointages en file d'attente

---

## 11. Questions frequentes

### Le scanner ne s'ouvre pas

- Autorisez l'acces a la camera dans les parametres de votre navigateur
- Sur iPhone, allez dans **Parametres > Confidentialite > Camera** et activez l'acces pour l'application
- Essayez de rafraichir la page

### J'ai oublie de scanner en sortant

- Demandez a votre admin de corriger votre pointage manuellement dans la feuille Google Sheets
- Ou utilisez la fonctionnalite de scan hors ligne si vous avez un badge/QR personnel

### Mon email n'est pas reconnu

- Verifiez que votre email est bien dans la feuille **Employees** ou **Roster** de l'entreprise
- Contactez votre admin pour qu'il vous ajoute

### Le code OTP n'arrive pas

- Verifiez vos spams/courriers indesirables
- Verifiez que l'adresse email est correcte
- Le code est valide pendant 10 minutes — apres ce delai, reclamez un nouveau code

### Je ne peux plus me connecter en admin

- Apres 5 tentatives de PIN incorrectes, le compte est bloque pendant 15 minutes
- Attendez le delai de blocage ou contactez un autre admin

### Comment changer le PIN admin ?

1. Ouvrez la feuille Google Sheets
2. Allez dans **Extensions > Apps Script**
3. Dans le menu, allez dans **Attendance > Rotate admin PIN**
4. Le nouveau PIN s'affiche — enregistrez-le

### Mes donnees sont-elles privees ?

- Vos donnees restent sur cet appareil (profil) et dans la feuille Google Sheets de l'entreprise
- Seuls vous (avec votre email) et les admins peuvent consulter vos donnees
- Aucune donnee n'est partagee avec des tiers
- Vous pouvez effacer vos donnees a tout moment depuis **Mon historique**

---

*Guide genere pour l'application de presence. Pour toute question, contactez votre administrateur.*
