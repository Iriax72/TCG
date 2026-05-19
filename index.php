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
            // Forcer l'affichage de la page login avec le message d'erreur
            $_GET['page'] = 'login';
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
            // Forcer l'affichage de la page signup avec le message d'erreur
            $_GET['page'] = 'signup';
        } else {
            // Inscription réussie : la session est déjà ouverte dans signup().
            // On redirige directement vers le dashboard.
            header('Location: index.php');
            exit;
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
    // L'utilisateur est connecté → dashboard ou profil selon le paramètre 'view'
    $currentUser = getCurrentUsername();
    $currentId   = getCurrentUserId();

    $view = $_GET['view'] ?? 'dashboard';

    if ($view === 'profile') {
        include __DIR__ . '/templates/profile.php';
    } elseif ($view === 'decks') {
        include __DIR__ . '/templates/decks.php';
    } else {
        include __DIR__ . '/templates/dashboard.php';
    }
} else {
    // L'utilisateur n'est pas connecté → redirection vers login ou signup
    // On utilise header() + exit pour une vraie redirection HTTP 302,
    // ce qui empêche tout contenu du dashboard d'être envoyé au client.
    $page = $_GET['page'] ?? '';

    if ($page === 'signup') {
        include __DIR__ . '/templates/signup.php';
    } elseif ($page === 'login') {
        include __DIR__ . '/templates/login.php';
    } else {
        // Toute autre valeur (page inconnue, accès direct sans paramètre, etc.)
        // → redirection explicite vers le login.
        header('Location: index.php?page=login');
        exit;
    }
}