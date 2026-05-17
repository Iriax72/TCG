<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Connexion — GameLobby</title>
    <link rel="stylesheet" href="css/main.css" />
    <link rel="stylesheet" href="css/auth.css" />
</head>
<body class="auth-page">

    <div class="auth-card">

        <!-- En-tête -->
        <div class="auth-header">
            <span class="auth-logo">GAMELOBBY</span>
            <span class="auth-logo-line"></span>
            <p class="auth-title">Connexion</p>
        </div>

        <!-- Messages d'état (injectés par PHP) -->
        <?php if (!empty($error)): ?>
            <div class="msg-error"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>

        <?php if (!empty($success)): ?>
            <div class="msg-success"><?= htmlspecialchars($success) ?></div>
        <?php endif; ?>

        <!-- Formulaire de connexion -->
        <form class="auth-form" method="POST" action="index.php" novalidate>
            <!-- Champ caché identifiant l'action -->
            <input type="hidden" name="action" value="login" />

            <div class="form-group">
                <label for="username">Pseudo</label>
                <input
                    type="text"
                    id="username"
                    name="username"
                    placeholder="votre_pseudo"
                    autocomplete="username"
                    required
                />
            </div>

            <div class="form-group">
                <label for="password">Mot de passe</label>
                <input
                    type="password"
                    id="password"
                    name="password"
                    placeholder="••••••••"
                    autocomplete="current-password"
                    required
                />
            </div>

            <button type="submit" class="btn btn-primary">
                Se connecter
            </button>
        </form>

        <!-- Lien vers l'inscription -->
        <p class="auth-switch">
            Pas encore de compte ?
            <a href="index.php?page=signup">S'inscrire</a>
        </p>

    </div>

    <!-- JS d'authentification (validation côté client légère) -->
    <script src="js/auth.js"></script>

</body>
</html>