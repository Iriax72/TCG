<?php
/**
 * Garde d'authentification.
 * Si ce fichier est appelé directement (sans passer par index.php),
 * auth.php n'a pas encore été chargé : on le charge et on vérifie la session.
 * Si l'utilisateur n'est pas connecté, redirection immédiate vers le login.
 */
if (!function_exists('isLoggedIn')) {
    require_once __DIR__ . '/../auth.php';
}
if (!isLoggedIn()) {
    header('Location: ../index.php?page=login');
    exit;
}

// Récupération des variables de session si on arrive directement (hors include)
$currentUser = $currentUser ?? getCurrentUsername();
$currentId   = $currentId   ?? getCurrentUserId();
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lobby — unTCG</title>
    <link rel="stylesheet" href="css/main.css" />
    <link rel="stylesheet" href="css/dashboard.css" />
</head>
<body>

<!-- ============================================================
     Variables PHP exposées en JS via un objet global
     ============================================================ -->
<script>
    // Données de session injectées par PHP — utilisées par les scripts JS
    window.APP = {
        currentUserId:   <?= json_encode($currentId) ?>,
        currentUsername: <?= json_encode($currentUser) ?>,
        pollInterval:    <?= POLL_INTERVAL_MS ?>
    };
</script>

<!-- ============================================================
     Dashboard
     ============================================================ -->
<div class="dashboard">

    <!-- -------- Barre de navigation -------- -->
    <nav class="navbar">
        <span class="navbar-brand">&#9679; unTCG</span>

        <div class="navbar-user">
            <!-- Bouton notifications -->
            <button class="notif-btn" id="notif-btn" title="Invitations reçues" aria-label="Voir les notifications">
                &#9993;
                <span class="notif-badge" id="notif-badge"></span>
            </button>

            <!-- Bouton decks -->
            <a href="index.php?view=decks" class="navbar-logout" title="Mes Decks">&#9830; Decks</a>

            <!-- Bouton profil -->
            <a href="index.php?view=profile" class="navbar-logout" title="Mon profil">&#9812; Profil</a>

            <!-- Pseudo de l'utilisateur connecté -->
            <span class="navbar-username">
                Connecté en tant que <span><?= htmlspecialchars($currentUser) ?></span>
            </span>

            <!-- Déconnexion -->
            <form method="POST" action="index.php">
                <input type="hidden" name="action" value="logout" />
                <button type="submit" class="navbar-logout">Déconnexion</button>
            </form>
        </div>
    </nav>

    <!-- -------- Contenu principal -------- -->
    <main class="dashboard-content">

        <!-- ---- Panneau gauche : recherche de joueurs ---- -->
        <section class="panel">
            <div class="panel-header">
                <span class="panel-icon">&#128269;</span>
                <h2>Rechercher un joueur</h2>
            </div>
            <div class="panel-body">

                <!-- Barre de recherche -->
                <div class="search-bar">
                    <input
                        type="text"
                        id="search-input"
                        placeholder="Entrez un pseudo..."
                        autocomplete="off"
                        maxlength="32"
                    />
                    <button class="btn btn-ghost" id="search-btn">
                        Rechercher
                    </button>
                </div>

                <!-- Résultats de recherche (remplis par JS) -->
                <div class="player-list" id="player-list">
                    <p class="list-empty">Tapez un pseudo pour rechercher un joueur.</p>
                </div>

            </div>
        </section>

        <!-- ---- Panneau droit : invitations envoyées ---- -->
        <aside class="panel">
            <div class="panel-header">
                <span class="panel-icon">&#9993;</span>
                <h2>Mes invitations envoyées</h2>
            </div>
            <div class="panel-body" id="sent-panel">
                <p class="list-empty">Aucune invitation envoyée pour l'instant.</p>
            </div>
        </aside>

    </main>

</div>

<!-- ============================================================
     Modal : invitations reçues (notifications)
     ============================================================ -->
<div class="modal-overlay" id="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal">
        <div class="modal-header">
            <h3 id="modal-title">&#9993; Invitations reçues</h3>
            <button class="modal-close" id="modal-close" aria-label="Fermer">&#x2715;</button>
        </div>
        <div class="modal-body" id="modal-body">
            <!-- Invitations injectées par JS -->
        </div>
    </div>
</div>

<!-- ============================================================
     Conteneur de toasts (messages temporaires)
     ============================================================ -->
<div class="toast-container" id="toast-container"></div>

<!-- ============================================================
     Scripts JS
     (chargés en bas pour ne pas bloquer le rendu)
     ============================================================ -->
<script src="js/notifications.js"></script>
<script src="js/dashboard.js"></script>

</body>
</html>