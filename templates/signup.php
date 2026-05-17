<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Inscription — GameLobby</title>
    <link rel="stylesheet" href="css/main.css" />
    <link rel="stylesheet" href="css/auth.css" />
</head>
<body class="auth-page">

    <div class="auth-card">

        <!-- En-tête -->
        <div class="auth-header">
            <span class="auth-logo">GAMELOBBY</span>
            <span class="auth-logo-line"></span>
            <p class="auth-title">Créer un compte</p>
        </div>

        <!-- Messages d'état (injectés par PHP) -->
        <?php if (!empty($error)): ?>
            <div class="msg-error"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>

        <?php if (!empty($success)): ?>
            <div class="msg-success"><?= htmlspecialchars($success) ?></div>
        <?php endif; ?>

        <!-- Formulaire d'inscription -->
        <form class="auth-form" method="POST" action="index.php" novalidate id="signup-form">
            <!-- Champ caché identifiant l'action -->
            <input type="hidden" name="action" value="signup" />

            <div class="form-group">
                <label for="username">Pseudo</label>
                <input
                    type="text"
                    id="username"
                    name="username"
                    placeholder="mon_pseudo"
                    autocomplete="username"
                    minlength="3"
                    maxlength="32"
                    required
                />
            </div>

            <div class="form-group">
                <label for="password">Mot de passe</label>
                <input
                    type="password"
                    id="password"
                    name="password"
                    placeholder="6 caractères minimum"
                    autocomplete="new-password"
                    minlength="6"
                    required
                />
            </div>

            <div class="form-group">
                <label for="password_confirm">Confirmer le mot de passe</label>
                <input
                    type="password"
                    id="password_confirm"
                    name="password_confirm"
                    placeholder="••••••••"
                    autocomplete="new-password"
                    minlength="6"
                    required
                />
            </div>

            <button type="submit" class="btn btn-primary">
                Créer mon compte
            </button>
        </form>

        <!-- Lien vers la connexion -->
        <p class="auth-switch">
            Déjà un compte ?
            <a href="index.php?page=login">Se connecter</a>
        </p>

    </div>

    <!-- JS d'authentification (validation côté client légère) -->
    <script src="js/auth.js"></script>

</body>
</html>