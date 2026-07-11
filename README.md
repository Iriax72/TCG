# unTCG

Une application web PHP pour jouer à un jeu de cartes à collectionner avec un système de lobby, invitations de parties, profils et decks.

## Fonctionnalités

- Inscription / connexion utilisateur
- Recherche de joueurs et invitations de partie
- Tableau de bord avec notifications en temps réel
- Profils utilisateurs avec bio et avatar
- Gestion de decks personnalisés
- Système de parties multijoueur avec suivi via SSE
- Chargement des cartes depuis le dossier `assets/cards`

## Installation

1. Clonez le dépôt :
   ```bash
   git clone https://github.com/Iriax72/TCG.git
   cd TCG
   ```

2. Configurez votre serveur web pour pointer vers le dossier du projet.

3. Assurez-vous d’avoir un serveur PHP et une base de données MySQL/MariaDB.

4. Configurez les variables d’environnement requises :
   - `DB_HOST`
   - `DB_PORT`
   - `DB_NAME`
   - `DB_USERNAME`
   - `DB_PASSWORD`

5. Vérifiez que PHP peut écrire dans le dossier :
   - `uploads/avatars`

6. Ouvrez `index.php` dans votre navigateur.

> L’application initialise automatiquement les tables MySQL à la première exécution via `config.php`.

## Configuration

Le fichier `config.php` charge les paramètres de connexion depuis les variables d’environnement, puis initialise PDO.

Il contient également les paramètres suivants :

- `SESSION_LIFETIME` : durée de session en secondes
- `POLL_INTERVAL_MS` : intervalle de polling pour les notifications JavaScript
- `UPLOAD_DIR` / `UPLOAD_URL` : configuration pour les avatars
- `UPLOAD_MAX_BYTES`, `UPLOAD_MIN_WIDTH`, `UPLOAD_MAX_HEIGHT` et `UPLOAD_ALLOWED_MIME`

## Structure du projet

- `index.php` : routeur principal et gestion des pages publiques/privées
- `api.php` : point d’entrée AJAX et API JSON
- `auth.php` : logique d’authentification (login/signup/logout)
- `config.php` : configuration DB et fonctions partagées
- `templates/` : pages HTML principales (`dashboard`, `decks`, `game`, `login`, `profile`, `signup`)
- `assets/` : images, polices et cartes
- `css/` : styles pour chaque page
- `js/` : scripts front-end (dashboard, decks, game, notifications, profil)
- `uploads/avatars/` : stockage des avatars d’utilisateurs

## Développement

- `templates/dashboard.php` gère le lobby et la recherche de joueurs
- `templates/game.php` est la table de jeu avec WebSocket-style SSE
- `api.php` gère les actions :
  - `search_users`
  - `send_invitation`
  - `respond_invitation`
  - `get_notifications`
  - `get_sent`
  - `update_profile`
  - `get_profile`
  - `get_cards`

## Ajout de cartes

Les cartes sont chargées dynamiquement depuis `assets/cards/`. Chaque fichier doit être nommé avec un identifiant numérique suivi de `.webp`.

## Notes

- Le projet utilise des sessions PHP natives pour l’authentification.
- L’upload d’avatar est limité à 5 Mo et redimensionné si nécessaire.
- Les invitations de parties sont stockées dans la base `invitations`, puis transformées en parties dans `games`.

## À améliorer

- Ajouter une base de données `cards` pour les noms et mots-clés des cartes
- Ajouter un moteur de jeu complet dans `templates/game.php`
- Améliorer l’interface de création et de gestion des decks

## Licence

Aucune licence spécifiée.
