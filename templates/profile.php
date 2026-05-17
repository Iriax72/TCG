<?php
/**
 * templates/profile.php
 * Page d'édition du profil utilisateur.
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
    <title>Mon Profil — GameLobby</title>
    <link rel="stylesheet" href="css/main.css" />
    <link rel="stylesheet" href="css/dashboard.css" />
    <link rel="stylesheet" href="css/profile.css" />
</head>
<body>

<script>
    window.APP = {
        currentUserId:   <?= json_encode($currentId) ?>,
        currentUsername: <?= json_encode($currentUser) ?>,
        pollInterval:    <?= POLL_INTERVAL_MS ?>
    };
</script>

<div class="profile-page">

    <!-- -------- Navbar (identique au dashboard) -------- -->
    <nav class="navbar">
        <span class="navbar-brand">GAMELOBBY</span>
        <div class="navbar-user">
            <span class="navbar-username">
                Connecté en tant que <span id="nav-username"><?= htmlspecialchars($currentUser) ?></span>
            </span>
            <form method="POST" action="index.php">
                <input type="hidden" name="action" value="logout" />
                <button type="submit" class="navbar-logout">Déconnexion</button>
            </form>
        </div>
    </nav>

    <!-- -------- Contenu -------- -->
    <main class="profile-content">

        <!-- Titre + bouton retour -->
        <div class="profile-page-header">
            <a href="index.php" class="profile-back-btn">&#8592; Retour</a>
            <h1 class="profile-page-title">&#9812; Mon Profil</h1>
        </div>

        <!-- Carte principale -->
        <div class="profile-card">

            <!-- En-tête bois -->
            <div class="profile-card-header">
                <span class="profile-card-icon">&#9998;</span>
                <h2>Éditer mon profil</h2>
            </div>

            <div class="profile-card-body">

                <!-- -------- Section avatar -------- -->
                <div class="avatar-section">

                    <!-- Aperçu de l'avatar (image ou initiale, rendu par JS) -->
                    <div class="avatar-preview-wrap" id="avatar-wrap" title="Changer la photo">
                        <!-- Rempli dynamiquement par profile.js -->
                        <div class="avatar-overlay">&#128247;</div>
                    </div>

                    <div class="avatar-info">
                        <p>
                            Votre photo de profil est visible par les autres joueurs.<br />
                            Par défaut, elle affiche votre initiale sur un fond coloré unique.
                        </p>
                        <small>Formats : JPG, PNG, WebP, GIF &bull; Min : 100×100 px &bull; Max : 5 Mo</small>

                        <!-- Bouton déclencheur (l'input file réel est caché) -->
                        <button class="btn btn-ghost" id="avatar-btn" type="button">
                            &#128247; Choisir une image
                        </button>
                        <input type="file" id="avatar-input" accept="image/jpeg,image/png,image/webp,image/gif" />

                        <!-- Barre de progression -->
                        <div class="upload-progress" id="upload-progress">
                            <div class="upload-progress-bar" id="upload-progress-bar"></div>
                        </div>

                        <!-- Statut de l'upload -->
                        <span class="upload-status" id="upload-status"></span>
                    </div>
                </div>

                <!-- Séparateur décoratif -->
                <div class="divider"></div>

                <!-- -------- Formulaire pseudo + bio -------- -->
                <form class="profile-form" id="profile-form" novalidate>

                    <!-- Pseudo -->
                    <div class="form-group">
                        <label for="profile-username">Pseudo</label>
                        <input
                            type="text"
                            id="profile-username"
                            name="username"
                            placeholder="Votre pseudo"
                            minlength="3"
                            maxlength="32"
                            autocomplete="username"
                        />
                    </div>

                    <!-- Bio -->
                    <div class="form-group">
                        <label for="profile-bio">Biographie <small style="font-style:italic;letter-spacing:0">(optionnel)</small></label>
                        <div class="bio-wrap">
                            <textarea
                                id="profile-bio"
                                name="bio"
                                placeholder="Parlez de vous en quelques mots..."
                                maxlength="500"
                            ></textarea>
                            <span class="char-counter" id="char-counter">0 / 500</span>
                        </div>
                    </div>

                    <!-- Sauvegarde -->
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
                        <span class="save-status" id="save-status"></span>
                        <button type="submit" class="btn btn-primary" id="save-btn">
                            &#10003; Sauvegarder
                        </button>
                    </div>

                </form>

            </div><!-- /.profile-card-body -->
        </div><!-- /.profile-card -->

    </main>
</div>

<!-- Toasts -->
<div class="toast-container" id="toast-container"></div>

<!-- Scripts -->
<script src="js/notifications.js"></script>
<script src="js/profile.js"></script>

</body>
</html>