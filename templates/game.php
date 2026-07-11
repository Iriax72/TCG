<?php
/**
 * templates/game.php
 * Table de jeu — gérée par boardgame.io (client-side) + PHP/SSE (sync).
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

<!-- Variables PHP → JS (avant tout script) -->
<script>
    window.APP = {
        currentUserId:   <?= json_encode($currentId) ?>,
        currentUsername: <?= json_encode($currentUser) ?>,
        gameId:          <?= json_encode($gameId) ?>,
        apiUrl:          'api.php',
        sseUrl:          'sse.php?game_id=<?= $gameId ?>'
    };
</script>

<div class="game-page">

    <!-- -------- Navbar -------- -->
    <nav class="game-navbar">
        <span class="game-navbar-brand">&#9876; unTCG</span>
        <span class="game-status-badge waiting" id="game-status-badge">Chargement...</span>
        <a href="index.php" class="navbar-logout">&#8592; Lobby</a>
    </nav>

    <!-- ============================================================
         PHASE : Sélection du deck
         Overlay affiché pendant la phase deckSelection.
         Masqué par JS quand les deux joueurs ont confirmé.
         ============================================================ -->
    <div class="phase-overlay" id="phase-deck-selection">
        <div class="phase-panel">

            <h2 class="phase-title">&#9876; Choisissez votre deck</h2>
            <p class="phase-subtitle">
                Votre choix reste confidentiel jusqu'à la fin de la partie.<br />
                Vous pouvez changer de sélection avant de confirmer.
            </p>

            <!-- Statut de l'adversaire -->
            <div class="opponent-deck-status" id="opponent-deck-status">
                <span class="status-dot offline" id="opp-status-dot"></span>
                <span id="opp-status-label">Adversaire : en attente de sa sélection...</span>
            </div>

            <!-- Grille des decks du joueur (remplie par JS) -->
            <div class="deck-choice-grid" id="deck-choice-grid">
                <p class="list-empty">Chargement de vos decks...</p>
            </div>

            <!-- Deck actuellement sélectionné + bouton confirmer -->
            <div class="deck-confirm-row" id="deck-confirm-row" style="display:none;">
                <span class="deck-selected-label">
                    Deck sélectionné : <strong id="selected-deck-name">—</strong>
                </span>
                <button class="btn btn-primary" id="btn-confirm-deck">
                    &#10003; Confirmer ce deck
                </button>
            </div>

            <!-- Message après confirmation -->
            <div class="deck-confirmed-msg" id="deck-confirmed-msg" style="display:none;">
                &#10003; Deck confirmé — en attente de l'adversaire...
            </div>

        </div>
    </div>

    <!-- ============================================================
         TABLE DE JEU (visible après la phase de sélection)
         ============================================================ -->
    <div class="game-layout" id="game-layout" style="display:none;">

        <!-- Zone centrale -->
        <section class="game-table-area">

            <!-- Bandeau adversaire (haut) -->
            <div class="player-banner opponent">
                <div class="player-banner-avatar" id="avatar-opponent">?</div>
                <div class="player-banner-info">
                    <div class="player-banner-name" id="name-opponent">...</div>
                    <div class="player-banner-role">Adversaire</div>
                </div>
                <div class="player-connection" id="connection-opponent">
                    <span class="status-dot offline"></span>
                    <span>En attente</span>
                </div>
            </div>

            <!-- Zone de jeu (plateau — à implémenter) -->
            <div class="game-play-area" id="game-play-area">
                <div class="game-placeholder" id="game-placeholder">
                    <span class="game-placeholder-icon">&#9876;</span>
                    <p>Les deux joueurs ont choisi leur deck.<br />
                       Le plateau de jeu sera implémenté ici.</p>
                </div>
            </div>

            <!-- Bandeau joueur courant (bas) -->
            <div class="player-banner self">
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

        <!-- Journal latéral -->
        <aside class="game-sidebar">
            <div class="game-sidebar-header">
                <span class="game-sidebar-icon">&#128221;</span>
                <h3>Journal de partie</h3>
            </div>
            <div class="game-event-log" id="game-event-log">
                <div class="game-event-entry server">
                    <span class="game-event-actor server">Système</span>
                    Connexion en cours...
                </div>
            </div>
            <div class="sse-indicator">
                <span class="sse-dot reconnecting" id="sse-dot"></span>
                <span id="sse-label">Connexion au canal...</span>
            </div>
        </aside>

    </div><!-- /#game-layout -->

</div><!-- /.game-page -->

<!-- Toasts -->
<div class="toast-container" id="toast-container"></div>

<!--
    game.js est chargé en tant que module ES pour pouvoir importer
    boardgame.io depuis le CDN esm.sh.
    notifications.js n'est PAS inclus : on ne veut pas de poll de lobby
    pendant une partie.
-->
<script type="module" src="js/game.js"></script>

</body>
</html>