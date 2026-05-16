<?php
/**
 * config.php
 * Configuration de la base de données et constantes globales.
 * À adapter selon votre environnement.
 */

// --- Paramètres de connexion MySQL ---
define('DB_HOST', 'localhost');
define('DB_NAME', 'game_lobby');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_CHARSET', 'utf8mb4');

// --- Durée de session (secondes) ---
define('SESSION_LIFETIME', 3600); // 1 heure

// --- Fréquence de polling des notifications (ms, utilisée côté JS) ---
define('POLL_INTERVAL_MS', 3000);

/**
 * Retourne une connexion PDO partagée (singleton).
 * Lève une exception en cas d'échec de connexion.
 */
function getDB(): PDO {
    static $pdo = null;

    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            DB_HOST,
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

    // Table des utilisateurs
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            username    VARCHAR(32) NOT NULL UNIQUE,
            password    VARCHAR(255) NOT NULL,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

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
}