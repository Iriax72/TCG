<?php
/**
 * index.php
 * Routeur principal de l'application.
 * Gère les actions POST (login, signup, logout) et
 * sert le bon template HTML selon l'état de connexion.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth.php';

// --- Initialisation de la base de données (crée les tables si besoin) ---
try {
    initDatabase();
} catch (PDOException $e) {
    // En cas d'erreur de connexion DB, afficher un message clair
    die('<p style="font-family:monospace;color:red;padding:2rem;">
        Erreur de connexion à la base de données : ' . htmlspecialchars($e->getMessage()) . '<br>
        Vérifiez les paramètres dans <strong>config.php</strong>.
    </p>');
}

// --- Mise à jour du statut "en ligne" si connecté ---
updateLastSeen();

// --- Traitement des actions POST ---
$error   = '';
$success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'login') {
        $result = login($_POST['username'] ?? '', $_POST['password'] ?? '');
        if (isset($result['error'])) {
            $error = $result['error'];
        } else {
            // Redirection propre après login pour éviter le re-envoi du formulaire
            header('Location: index.php');
            exit;
        }
    }

    if ($action === 'signup') {
        $result = signup(
            $_POST['username']         ?? '',
            $_POST['password']         ?? '',
            $_POST['password_confirm'] ?? ''
        );
        if (isset($result['error'])) {
            $error = $result['error'];
        } else {
            $success = 'Compte créé avec succès ! Vous pouvez maintenant vous connecter.';
        }
    }

    if ($action === 'logout') {
        logout();
        header('Location: index.php');
        exit;
    }
}

// --- Choix du template à afficher ---
if (isLoggedIn()) {
    // L'utilisateur est connecté → afficher le dashboard
    $currentUser = getCurrentUsername();
    $currentId   = getCurrentUserId();
    include __DIR__ . '/templates/dashboard.php';
} else {
    // L'utilisateur n'est pas connecté → afficher login/signup
    $page = $_GET['page'] ?? 'login'; // 'login' ou 'signup'
    if ($page === 'signup') {
        include __DIR__ . '/templates/signup.php';
    } else {
        include __DIR__ . '/templates/login.php';
    }
}