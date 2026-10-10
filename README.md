# MGTCG

Ton classeur Pokémon en ligne : toutes les cartes par série et par langue, suivi de master set, cotes Cardmarket et collection.

Créé par **Mathis GILLIG**.

---

## Ce que fait la V1 (étape 1)

- **12 langues de cartes** : français, anglais, japonais, chinois (traditionnel et simplifié), coréen, thaï, indonésien, allemand, espagnol, italien, portugais.
- **Séries → sets → cartes**, triées dans l'ordre du master set.
- **Icônes de rareté** (●, ◆, ★, ★★, ★★★, ACE…) et filtre par rareté.
- **Suivi de collection** : clique sur le **+** d'une carte pour dire que tu l'as.
  - Barre « Set complet » (une carte de chaque).
  - Barre « Master set » (toutes les versions : normale, reverse, holo…).
  - Filtre **Manquantes**, bouton **Copier les manquantes**, **checklist à imprimer**.
- **Barre de recherche** de cartes.
- **Fiche carte** : cote Cardmarket (tendance, moyenne, plus bas, moyennes 24 h / 7 j / 30 j), rareté, illustrateur, liens Cardmarket / eBay / Leboncoin / Vinted, vidéos YouTube, liens de grading (PCA, CCC, CollectAura, PSA, CGC), conseils anti-arnaque.
- **Favoris** et **wishlist**.
- **Ma collection** : valeur estimée, sets commencés, cartes les plus précieuses, sauvegarde (export / import).

> Sans compte, la collection est enregistrée dans ton navigateur. Avec un compte, elle est sauvegardée en ligne (étape 2).

---

## 1. Tester le site sur ton ordinateur

1. Dézippe le dossier `mgtcg`.
2. Double-clique sur **`index.html`**. Le site s'ouvre dans ton navigateur.

C'est tout ! Il faut juste être connecté à Internet (les cartes viennent de la base TCGdex).

---

## 2. Mettre le site sur GitHub (pas à pas)

### a) Créer ton compte
Va sur [github.com](https://github.com) et crée un compte gratuit si tu n'en as pas.

### b) Créer le dépôt (le « dossier » du projet)
1. En haut à droite, clique sur **+** puis **New repository**.
2. **Repository name** : `mgtcg`
3. Coche **Public**.
4. Clique sur **Create repository**.

### c) Envoyer les fichiers
1. Sur la page du dépôt, clique sur le lien **uploading an existing file**.
2. Ouvre le dossier `mgtcg` sur ton ordinateur, sélectionne **tous les fichiers** qu'il contient et glisse-le dans la page.
   ⚠️ Glisse le *contenu* du dossier, pas le dossier lui-même : `index.html` doit être à la racine.
3. En bas, clique sur **Commit changes**.

### d) Mettre le site en ligne (GitHub Pages)
1. Dans ton dépôt, va dans **Settings** (l'onglet avec la roue dentée).
2. Dans le menu de gauche, clique sur **Pages**.
3. Sous **Build and deployment** → **Source**, choisis **Deploy from a branch**.
4. Sous **Branch**, choisis **main** et **/ (root)**, puis clique sur **Save**.
5. Attends 1 à 2 minutes et recharge la page : ton adresse s'affiche en haut, du type
   `https://TON-PSEUDO.github.io/mgtcg/`

🎉 Ton site est en ligne !

### e) Mettre à jour le site plus tard
Quand on modifie des fichiers, refais l'étape **c)** avec les nouveaux fichiers : GitHub remplace les anciens et le site se met à jour tout seul en 1 à 2 minutes.

---

## 3. Organisation des fichiers

```
mgtcg/
├── index.html          → la structure de la page
├── style.css           → les couleurs et la mise en page (change :root pour les couleurs)
├── api.js              → récupère les cartes et les prix (TCGdex)
├── rarity.js           → les icônes de rareté
├── store.js            → ta collection, tes favoris, ta wishlist
├── config.js           → les 2 infos de ton projet Supabase (étape 2)
├── auth.js             → comptes, connexion, compte admin, sauvegarde en ligne
├── boutiques.js        → carte 3D des boutiques, trajets, tournée, restocks (V2)
├── app.js              → les pages du site
├── supabase-setup.sql  → à coller une fois dans Supabase (comptes + sécurité)
└── supabase-boutiques.sql → à coller une fois dans Supabase (boutiques + restocks)
```

---

## 4. Activer les comptes (étape 2) avec Supabase

Supabase est un service gratuit qui gère les comptes, les mots de passe (chiffrés) et la base de données.
Sans cette étape, le site marche quand même : la collection reste dans le navigateur.

### a) Créer le projet
1. Va sur [supabase.com](https://supabase.com) → **Start your project** → connecte-toi avec GitHub.
2. **New project** : nom `mgtcg`, choisis un **mot de passe de base de données** (note-le dans un endroit sûr, tu n'en auras pas besoin dans le site) et une **région en Europe** (Paris si proposée).
3. Attends 1 à 2 minutes que le projet soit prêt.

### b) Créer les tables et la sécurité
1. Menu de gauche → **SQL Editor** → **New query**.
2. Ouvre `supabase-setup.sql`, copie **tout**, colle-le, clique sur **Run**. Le message doit être « Success ».

### c) Régler la connexion
Menu de gauche → **Authentication** :
1. **URL Configuration** → **Site URL** : `https://mathisven-ui.github.io/mgtcg/`
   et dans **Redirect URLs**, ajoute la même adresse. Enregistre.
2. **Sign In / Providers** → **Email** : laisse « Confirm email » activé, et mets la longueur minimale du mot de passe à **10**.
3. **Rate Limits** : les valeurs par défaut limitent déjà les tentatives. Tu peux baisser les connexions à environ 30 par heure et par adresse IP.

### d) Relier le site
1. Va dans **Project Settings** (roue dentée) → **API Keys** (ou bouton **Connect** en haut).
2. Copie l'**URL du projet** et la clé **publishable** (ou **anon public**).
3. Ouvre `config.js` et colle-les entre les guillemets.
   ⚠️ Jamais la clé **secret** / **service_role** !
4. Envoie sur GitHub les fichiers modifiés (même méthode qu'avant : **+** → **Upload files**).

### e) Devenir administrateur
1. Sur ton site, clique sur **Connexion → Créer un compte** avec ton email, puis confirme via l'email reçu.
2. Dans Supabase → **SQL Editor** → **New query**, colle (avec TON email) :
   `update public.profiles set role = 'admin' where email = 'TON-EMAIL';` puis **Run**.
3. Déconnecte-toi et reconnecte-toi : le bouton **👑 Espace admin** apparaît dans **Mon compte**.

> Bon à savoir : un projet Supabase gratuit se met en pause après une semaine sans aucune visite. Il suffit de le relancer depuis le tableau de bord Supabase.

---

## 5. Sécurité en place

**Sur le site**
- Tout texte venant de l'extérieur est « nettoyé » avant d'être affiché (protection XSS).
- Règle CSP : le site ne peut parler qu'à TCGdex et Supabase.
- 5 erreurs de mot de passe → blocage 15 minutes ; messages d'erreur vagues (on ne dit pas si l'email existe).
- Mot de passe solide obligatoire (10 caractères, lettre, chiffre, caractère spécial) + jauge de solidité.
- Champ piège invisible contre les robots.
- Déconnexion simple ou de tous les appareils ; la collection est effacée du navigateur à la déconnexion (ordinateur partagé).
- Fichiers importés vérifiés avant d'être chargés.

**Côté serveur (Supabase)**
- Mots de passe chiffrés : personne ne peut les lire, même pas l'administrateur.
- Confirmation de l'email obligatoire.
- Limitation des tentatives par Supabase.
- Règles RLS : chaque compte ne peut lire et modifier QUE sa propre collection. Seul l'admin voit la liste des comptes. Personne ne peut se donner le rôle admin depuis le site.
- Taille maximale d'une collection pour éviter les abus.

**Anti-DDoS** : GitHub Pages et Supabase sont protégés par leurs propres infrastructures. Pour aller plus loin (nom de domaine perso + Cloudflare, CAPTCHA), on le fera quand le site aura du trafic.

---

## 6. Carte des boutiques (V2)

Page **Boutiques** :
- Carte **3D** (bouton 2D/3D, rotation et inclinaison avec la souris ou deux doigts).
- Boutiques trouvées automatiquement dans **OpenStreetMap** (points bleus) + boutiques **proposées par les membres** et validées par l'admin (points jaunes).
- **Trajet** en voiture, transports, vélo ou à pied : durée, distance, **coût** (carburant selon la consommation et le prix du litre réglables, tickets estimés), aller-retour, bouton **GPS Google Maps**.
- **Tournée « Chasse aux cartes »** : jusqu'à 10 boutiques, ordre de passage optimisé, durée et coût total.
- **Restocks** signalés par les membres (🔥 sur la carte pendant 7 jours).

**Activation** : dans Supabase → SQL Editor → New query, colle tout le fichier `supabase-boutiques.sql` → **Run**.
Les propositions de boutiques et les restocks se modèrent dans **👑 Espace admin**.

---

## 7. La suite (feuille de route)

- ✅ **Étape 2** : comptes (email + mot de passe), compte administrateur, sécurité, collection synchronisée sur tous tes appareils.
- **V2** : graphique d'évolution de la collection, alertes de prix, produits scellés (ETB, UPC…), carte des boutiques en France avec itinéraire, sorties à venir.
- **V3** : scan de cartes, assistant IA, échanges entre collectionneurs, communauté, bouclier anti-arnaques, simulateur de boosters, application mobile.

---

## Crédits

- Données et images des cartes : [TCGdex](https://tcgdex.dev) (gratuit, open source).
- Prix : Cardmarket, via TCGdex. Données indicatives, pas un conseil d'investissement.
- MGTCG n'est pas affilié à Nintendo, Creatures, GAME FREAK ou The Pokémon Company.
