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

> Pour l'instant, la collection est enregistrée **dans ton navigateur**. Les comptes (email + mot de passe) arrivent à l'étape 2.

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
2. Ouvre le dossier `mgtcg` sur ton ordinateur, sélectionne **tout son contenu** (`index.html`, `README.md`, les dossiers `css` et `js`) et glisse-le dans la page.
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
├── index.html      → la structure de la page (barre du haut, pied de page)
├── css/style.css   → les couleurs et la mise en page (change :root pour les couleurs)
└── js/
    ├── api.js      → récupère les cartes et les prix (TCGdex)
    ├── rarity.js   → les icônes de rareté
    ├── store.js    → ta collection, tes favoris, ta wishlist
    └── app.js      → les pages du site
```

---

## 4. Sécurité déjà en place

- Tout texte venant de l'extérieur est « nettoyé » avant d'être affiché (protection XSS).
- Le site n'accepte que les images et les données de TCGdex (règle CSP dans `index.html`).
- Les fichiers importés sont vérifiés avant d'être chargés.
- Les liens externes s'ouvrent sans donner accès à ton site (`noopener`).
- Aucune donnée personnelle n'est collectée pour l'instant.

La protection anti-DDoS, la limite de tentatives de mot de passe et le compte administrateur arriveront avec les comptes (étape 2).

---

## 5. La suite (feuille de route)

- **Étape 2** : comptes (email + mot de passe) avec Supabase, compte administrateur, limite de tentatives, collection synchronisée sur tous tes appareils.
- **V2** : graphique d'évolution de la collection, alertes de prix, produits scellés (ETB, UPC…), carte des boutiques en France avec itinéraire, sorties à venir.
- **V3** : scan de cartes, assistant IA, échanges entre collectionneurs, communauté, bouclier anti-arnaques, simulateur de boosters, application mobile.

---

## Crédits

- Données et images des cartes : [TCGdex](https://tcgdex.dev) (gratuit, open source).
- Prix : Cardmarket, via TCGdex. Données indicatives, pas un conseil d'investissement.
- MGTCG n'est pas affilié à Nintendo, Creatures, GAME FREAK ou The Pokémon Company.
