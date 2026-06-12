<?php
/**
 * templates/decks.php
 * Page de gestion des decks de cartes.
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
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mes Decks — unTCG</title>
    <link rel="stylesheet" href="css/main.css" />
    <link rel="stylesheet" href="css/dashboard.css" />
    <link rel="stylesheet" href="css/decks.css" />
    <?php include __DIR__ . "/_sw_register.php"; ?>
</head>
<body>

<script>
    window.APP = {
        currentUserId:   <?= json_encode($currentId) ?>,
        currentUsername: <?= json_encode($currentUser) ?>,
        pollInterval:    <?= POLL_INTERVAL_MS ?>
    };
</script>

<div class="decks-page">

    <!-- -------- Navbar -------- -->
    <nav class="navbar">
        <span class="navbar-brand">unTCG</span>
        <div class="navbar-user">
            <button class="notif-btn" id="notif-btn" title="Invitations reçues" aria-label="Voir les notifications">
                &#9993;
                <span class="notif-badge" id="notif-badge"></span>
            </button>
            <a href="index.php" class="navbar-logout" title="Retour au lobby">&#8592; Lobby</a>
            <span class="navbar-username">
                Connecté en tant que <span><?= htmlspecialchars($currentUser) ?></span>
            </span>
            <form method="POST" action="index.php">
                <input type="hidden" name="action" value="logout" />
                <button type="submit" class="navbar-logout">Déconnexion</button>
            </form>
        </div>
    </nav>

    <!-- -------- Contenu principal -------- -->
    <div class="decks-content">

        <!-- ---- Panneau gauche : liste des decks ---- -->
        <aside class="decks-sidebar">
            <div class="panel">
                <div class="panel-header">
                    <span class="panel-icon">&#9830;</span>
                    <h2>Mes Decks</h2>
                </div>
                <div class="panel-body">
                    <!-- Bouton charger un deck préconstruit -->
                    <button class="btn btn-ghost btn-prebuilt-deck" id="btn-prebuilt-deck">
                        &#128218; Charger un deck préconstruit
                    </button>

                    <!-- Bouton nouveau deck -->
                    <button class="btn btn-primary btn-new-deck" id="btn-new-deck">
                        &#43; Nouveau Deck
                    </button>

                    <!-- Liste des decks (remplie par JS) -->
                    <div id="decks-list">
                        <p class="list-empty">Chargement...</p>
                    </div>
                </div>
            </div>
        </aside>

        <!-- ---- Panneau droit : éditeur de deck ---- -->
        <section class="deck-editor">
            <div class="panel">
                <div class="panel-header">
                    <span class="panel-icon">&#9998;</span>
                    <h2 id="editor-title">Éditeur de Deck</h2>
                </div>
                <div class="panel-body" id="editor-body">

                    <!-- Placeholder affiché quand aucun deck n'est sélectionné -->
                    <div class="deck-editor-placeholder" id="editor-placeholder">
                        <span class="placeholder-icon">&#9830;</span>
                        <p>Sélectionnez un deck ou créez-en un nouveau.</p>
                    </div>

                    <!-- Éditeur actif (caché au départ) -->
                    <div id="editor-active" style="display:none; flex:1; overflow:hidden; flex-direction:column; gap:1rem;">

                        <!-- Nom du deck + compteur + sauvegarder -->
                        <div class="deck-editor-topbar">
                            <input
                                type="text"
                                id="deck-name"
                                placeholder="Nom du deck..."
                                maxlength="64"
                            />
                            <span class="deck-card-count">
                                <span id="deck-total">0</span> carte(s)
                            </span>
                            <button class="btn btn-primary" id="btn-save-deck">
                                &#10003; Sauvegarder
                            </button>
                        </div>

                        <!-- Message de statut sauvegarde -->
                        <span class="deck-save-status" id="deck-save-status"></span>

                        <!-- Filtre par ID de carte -->
                        <div class="card-filter-bar">
                            <input
                                type="text"
                                id="card-filter"
                                placeholder="Filtrer par numéro de carte..."
                                maxlength="10"
                            />
                        </div>

                        <!-- Grille de cartes (remplie par JS) -->
                        <div class="card-grid-wrap">
                            <div class="card-grid" id="card-grid">
                                <p class="card-grid-empty">Chargement des cartes...</p>
                            </div>
                        </div>

                    </div><!-- /#editor-active -->

                </div><!-- /.panel-body -->
            </div><!-- /.panel -->
        </section>

    </div><!-- /.decks-content -->
</div><!-- /.decks-page -->

<!-- Modal notifications (réutilisé depuis dashboard) -->
<div class="modal-overlay" id="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal">
        <div class="modal-header">
            <h3 id="modal-title">&#9993; Invitations reçues</h3>
            <button class="modal-close" id="modal-close" aria-label="Fermer">&#x2715;</button>
        </div>
        <div class="modal-body" id="modal-body"></div>
    </div>
</div>

<!-- Modal decks préconstruits -->
<div class="modal-overlay" id="prebuilt-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="prebuilt-modal-title">
    <div class="modal">
        <div class="modal-header">
            <h3 id="prebuilt-modal-title">&#128218; Decks préconstruits</h3>
            <button class="modal-close" id="prebuilt-modal-close" aria-label="Fermer">&#x2715;</button>
        </div>
        <div class="modal-body" id="prebuilt-modal-body">
            <!-- Liste injectée par JS -->
        </div>
    </div>
</div>

<!-- Toasts -->
<div class="toast-container" id="toast-container"></div>

<!-- Scripts -->
<script src="js/notifications.js"></script>
<script src="js/decks.js"></script>

</body>
</html>