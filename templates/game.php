<?php
/**
 * templates/game.php
 * Table de jeu.
 * Garde d'authentification : redirige vers le login si non connecté.
 */

if (!function_exists('isLoggedIn')) {
    require_once __DIR__ . '/../auth.php';
}
if (!isLoggedIn()) {
    header('Location: ../index.php?page=login');
    exit;
}

$currentUser = $currentUser ?? getCurrentUsername();
$currentId   = $currentId   ?? getCurrentUserId();
$gameId      = (int) ($_GET['game_id'] ?? 0);

if ($gameId <= 0) {
    header('Location: ../index.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Table de jeu — unTCG</title>
    <link rel="stylesheet" href="css/main.css" />
    <link rel="stylesheet" href="css/game.css" />
    <?php include __DIR__ . '/_sw_register.php'; ?>
</head>
<body>

<script>
    window.APP = {
        currentUserId:   <?= json_encode($currentId) ?>,
        currentUsername: <?= json_encode($currentUser) ?>,
        gameId:          <?= json_encode($gameId) ?>,
        sseUrl:          'sse.php?game_id=<?= $gameId ?>',
        apiUrl:          'api.php'
    };
</script>

<div class="game-page">

    <!-- -------- Navbar -------- -->
    <nav class="game-navbar">
        <span class="game-navbar-brand">&#9876; unTCG — Table de jeu</span>

        <span class="game-status-badge waiting" id="game-status-badge">
            En attente...
        </span>

        <a href="index.php" class="navbar-logout">&#8592; Lobby</a>
    </nav>

    <!-- -------- Layout principal -------- -->
    <div class="game-layout">

        <!-- ---- Zone table de jeu ---- -->
        <section class="game-table-area">

            <!-- Bandeau joueur adverse (haut) -->
            <div class="player-banner opponent" id="banner-opponent">
                <div class="player-banner-avatar" id="avatar-opponent">?</div>
                <div class="player-banner-info">
                    <div class="player-banner-name" id="name-opponent">Chargement...</div>
                    <div class="player-banner-role">Adversaire</div>
                </div>
                <div class="player-connection" id="connection-opponent">
                    <span class="status-dot offline"></span>
                    <span>En attente</span>
                </div>
            </div>

            <!-- Zone de jeu centrale -->
            <div class="game-play-area" id="game-play-area">
                <!--
                    Zone réservée pour le jeu.
                    Le plateau de cartes, les decks, les zones de combat
                    seront implémentés ici dans une prochaine étape.
                    L'API window.Game.sendEvent(type, data) est déjà disponible.
                -->
                <div class="game-placeholder" id="game-placeholder">
                    <span class="game-placeholder-icon">&#9876;</span>
                    <p>La partie va commencer.<br />Le plateau de jeu sera implémenté ici.</p>
                </div>
            </div>

            <!-- Bandeau joueur courant (bas) -->
            <div class="player-banner self" id="banner-self">
                <div class="player-banner-avatar" id="avatar-self">?</div>
                <div class="player-banner-info">
                    <div class="player-banner-name" id="name-self"><?= htmlspecialchars($currentUser) ?></div>
                    <div class="player-banner-role">Vous</div>
                </div>
                <div class="player-connection">
                    <span class="status-dot online"></span>
                    <span>Connecté</span>
                </div>
            </div>

        </section>

        <!-- ---- Panneau latéral : journal ---- -->
        <aside class="game-sidebar">
            <div class="game-sidebar-header">
                <span class="game-sidebar-icon">&#128221;</span>
                <h3>Journal de partie</h3>
            </div>

            <!-- Événements SSE (remplis par game.js) -->
            <div class="game-event-log" id="game-event-log">
                <div class="game-event-entry server">
                    <span class="game-event-actor server">Système</span>
                    Connexion à la partie en cours...
                </div>
            </div>

            <!-- Indicateur de connexion SSE -->
            <div class="sse-indicator">
                <span class="sse-dot reconnecting" id="sse-dot"></span>
                <span id="sse-label">Connexion au canal...</span>
            </div>
        </aside>

    </div><!-- /.game-layout -->
</div><!-- /.game-page -->

<!-- Toasts -->
<div class="toast-container" id="toast-container"></div>

<!-- Scripts
     notifications.js n'est PAS chargé ici : on ne veut pas que le poll
     de notifications redirige le joueur pendant qu'il est en partie.
     game.js gère lui-même la connexion SSE et la communication. -->
<script src="js/game.js"></script>

</body>
</html>