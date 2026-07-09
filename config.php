<?php
/**
 * config.php
 * Configuration de la base de données et constantes globales.
 * À adapter selon votre environnement.
 */

// --- Paramètres de connexion MySQL ---
define('DB_HOST', getenv('DB_HOST'));
define('DB_NAME', getenv('DB_NAME'));
define('DB_PORT', getenv('DB_PORT'));
define('DB_USER', getenv('DB_USERNAME'));
define('DB_PASS', getenv('DB_PASSWORD'));
define('DB_CHARSET', 'utf8mb4');

// --- Durée de session (secondes) ---
define('SESSION_LIFETIME', 3600); // 1 heure

// --- Fréquence de polling des notifications (ms, utilisée côté JS) ---
define('POLL_INTERVAL_MS', 3000);

// --- Upload de photos de profil ---
// Dossier de stockage (chemin absolu depuis la racine du projet)
define('UPLOAD_DIR',      __DIR__ . '/uploads/avatars/');
// URL publique correspondante (chemin relatif depuis la racine web)
define('UPLOAD_URL',      'uploads/avatars/');
// Taille maximale du fichier envoyé (5 Mo)
define('UPLOAD_MAX_BYTES', 5 * 1024 * 1024);
// Dimensions minimales acceptées (px)
define('UPLOAD_MIN_WIDTH',  100);
define('UPLOAD_MIN_HEIGHT', 100);
// Dimensions maximales acceptées (px) — au-delà on redimensionne
define('UPLOAD_MAX_WIDTH',  1200);
define('UPLOAD_MAX_HEIGHT', 1200);
// Qualité JPEG de re-encodage (0-100)
define('UPLOAD_JPEG_QUALITY', 88);
// Types MIME autorisés
define('UPLOAD_ALLOWED_MIME', ['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Retourne une connexion PDO partagée (singleton).
 * Lève une exception en cas d'échec de connexion.
 */
function getDB(): PDO {
    static $pdo = null;

    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=%s',
            DB_HOST,
            DB_PORT,
            DB_NAME,
            DB_CHARSET
        );

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];

        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    }

    return $pdo;
}

/**
 * Initialise les tables de la base de données si elles n'existent pas encore.
 * Appelé une seule fois au démarrage de l'application.
 */
function initDatabase(): void {
    $pdo = getDB();

    // Table des utilisateurs (avec colonnes de profil)
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            username    VARCHAR(32)  NOT NULL UNIQUE,
            password    VARCHAR(255) NOT NULL,
            bio         TEXT         DEFAULT NULL,
            avatar_path VARCHAR(512) DEFAULT NULL,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    // Migration : ajouter les colonnes si la table existait déjà sans elles
    foreach (['bio TEXT DEFAULT NULL', 'avatar_path VARCHAR(512) DEFAULT NULL'] as $colDef) {
        $colName = explode(' ', $colDef)[0];
        $rows = $pdo->query("SHOW COLUMNS FROM users LIKE '$colName'")->fetchAll();
        if (empty($rows)) {
            $pdo->exec("ALTER TABLE users ADD COLUMN $colDef");
        }
    }

    // Table des invitations de partie
    // status : 'pending' | 'accepted' | 'declined'
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS invitations (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            from_user_id  INT NOT NULL,
            to_user_id    INT NOT NULL,
            status        ENUM('pending','accepted','declined') DEFAULT 'pending',
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (to_user_id)   REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    // Table des decks de cartes
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS decks (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            user_id    INT         NOT NULL,
            name       VARCHAR(64) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    // Table du contenu des decks
    // card_id est l'identifiant numérique de la carte (nom du fichier image).
    // quantity : nombre de copies de cette carte dans ce deck.
    // Pas de FK vers une table cards : les cartes sont définies par leurs fichiers image,
    // ce qui permet d'en ajouter sans migration de base de données.
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS deck_cards (
            deck_id  INT NOT NULL,
            card_id  INT NOT NULL,
            quantity INT NOT NULL DEFAULT 1,
            PRIMARY KEY (deck_id, card_id),
            FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    // Table des parties en cours
    // player1 = celui qui a envoyé l'invitation, player2 = celui qui a accepté.
    // player1_joined / player2_joined : le joueur a chargé la page de jeu.
    // status : 'waiting' (créée, joueurs pas encore tous connectés)
    //          'active'  (les deux joueurs sont connectés)
    //          'finished'(partie terminée)
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS games (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            invitation_id    INT NOT NULL UNIQUE,
            player1_id       INT NOT NULL,
            player2_id       INT NOT NULL,
            status           ENUM('waiting','active','finished') DEFAULT 'waiting',
            player1_joined   TINYINT NOT NULL DEFAULT 0,
            player2_joined   TINYINT NOT NULL DEFAULT 0,
            created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE,
            FOREIGN KEY (player1_id)    REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (player2_id)    REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    // File d'événements de partie — utilisée par le canal SSE.
    // Chaque action de jeu (coup, message, fin de partie…) est un événement.
    // player_id NULL = événement serveur (début de partie, timer…).
    // La précision à la milliseconde sur created_at garantit l'ordre même
    // si plusieurs événements arrivent dans la même seconde.
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS game_events (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            game_id     INT NOT NULL,
            player_id   INT          DEFAULT NULL,
            event_type  VARCHAR(64)  NOT NULL,
            event_data  TEXT         DEFAULT NULL,
            created_at  DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3),
            FOREIGN KEY (game_id)   REFERENCES games(id) ON DELETE CASCADE,
            FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");
}