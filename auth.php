<?php
/**
 * auth.php
 * Gestion de l'authentification : inscription, connexion, déconnexion.
 * Ce fichier ne produit aucun HTML ; il traite uniquement la logique métier.
 */

require_once __DIR__ . '/config.php';

// --- Démarrage sécurisé de la session ---
if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => SESSION_LIFETIME,
        'path'     => '/',
        'secure'   => false, // Passer à true en HTTPS
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

/**
 * Retourne true si un utilisateur est connecté.
 */
function isLoggedIn(): bool {
    return isset($_SESSION['user_id']);
}

/**
 * Retourne l'ID de l'utilisateur connecté, ou null.
 */
function getCurrentUserId(): ?int {
    return $_SESSION['user_id'] ?? null;
}

/**
 * Retourne le pseudo de l'utilisateur connecté, ou null.
 */
function getCurrentUsername(): ?string {
    return $_SESSION['username'] ?? null;
}

/**
 * Met à jour last_seen pour que le système sache qu'un utilisateur est "en ligne".
 * Appelé à chaque requête d'un utilisateur connecté.
 */
function updateLastSeen(): void {
    if (!isLoggedIn()) return;

    $pdo = getDB();
    $stmt = $pdo->prepare("UPDATE users SET last_seen = NOW() WHERE id = :id");
    $stmt->execute([':id' => getCurrentUserId()]);
}

/**
 * Tente d'inscrire un nouvel utilisateur.
 * Retourne ['success' => true] ou ['error' => 'message'].
 */
function signup(string $username, string $password, string $passwordConfirm): array {
    // --- Validation des entrées ---
    $username = trim($username);

    if (strlen($username) < 3 || strlen($username) > 32) {
        return ['error' => 'Le pseudo doit contenir entre 3 et 32 caractères.'];
    }
    if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $username)) {
        return ['error' => 'Le pseudo ne peut contenir que des lettres, chiffres, _ et -.'];
    }
    if (strlen($password) < 6) {
        return ['error' => 'Le mot de passe doit contenir au moins 6 caractères.'];
    }
    if ($password !== $passwordConfirm) {
        return ['error' => 'Les mots de passe ne correspondent pas.'];
    }

    $pdo = getDB();

    // --- Vérification de l'unicité du pseudo ---
    $stmt = $pdo->prepare("SELECT id FROM users WHERE username = :username");
    $stmt->execute([':username' => $username]);
    if ($stmt->fetch()) {
        return ['error' => 'Ce pseudo est déjà utilisé.'];
    }

    // --- Insertion en base ---
    $hash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare("INSERT INTO users (username, password) VALUES (:username, :password)");
    $stmt->execute([':username' => $username, ':password' => $hash]);

    return ['success' => true];
}

/**
 * Tente de connecter un utilisateur.
 * Retourne ['success' => true] ou ['error' => 'message'].
 */
function login(string $username, string $password): array {
    $username = trim($username);

    if (empty($username) || empty($password)) {
        return ['error' => 'Veuillez remplir tous les champs.'];
    }

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT id, username, password FROM users WHERE username = :username");
    $stmt->execute([':username' => $username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        return ['error' => 'Pseudo ou mot de passe incorrect.'];
    }

    // --- Création de la session ---
    session_regenerate_id(true); // Protection contre la fixation de session
    $_SESSION['user_id']  = (int) $user['id'];
    $_SESSION['username'] = $user['username'];

    return ['success' => true];
}

/**
 * Déconnecte l'utilisateur courant.
 */
function logout(): void {
    $_SESSION = [];
    session_destroy();
}