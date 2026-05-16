/**
 * js/auth.js
 * Validation légère côté client pour les formulaires d'authentification.
 * La vraie validation se fait côté serveur (auth.php).
 */

document.addEventListener('DOMContentLoaded', () => {

    /* -------- Validation du formulaire d'inscription -------- */
    const signupForm = document.getElementById('signup-form');

    if (signupForm) {
        signupForm.addEventListener('submit', (event) => {
            const password        = document.getElementById('password').value;
            const passwordConfirm = document.getElementById('password_confirm').value;
            const username        = document.getElementById('username').value.trim();

            // Vérification basique du pseudo
            if (username.length < 3) {
                event.preventDefault();
                showInlineError('Le pseudo doit contenir au moins 3 caractères.');
                return;
            }

            // Vérification que les mots de passe correspondent
            if (password !== passwordConfirm) {
                event.preventDefault();
                showInlineError('Les mots de passe ne correspondent pas.');
                return;
            }

            if (password.length < 6) {
                event.preventDefault();
                showInlineError('Le mot de passe doit contenir au moins 6 caractères.');
                return;
            }
        });
    }

    /* -------- Validation du formulaire de connexion -------- */
    const loginForm = document.querySelector('form[action="index.php"]:not(#signup-form)');

    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            const username = document.getElementById('username')?.value.trim();
            const password = document.getElementById('password')?.value;

            if (!username || !password) {
                event.preventDefault();
                showInlineError('Veuillez remplir tous les champs.');
            }
        });
    }

    /**
     * Affiche un message d'erreur inline en haut de la carte.
     * Supprime le message existant s'il y en a déjà un.
     * @param {string} message - Le message à afficher.
     */
    function showInlineError(message) {
        // Supprimer un éventuel message existant créé par cette fonction
        const existing = document.querySelector('.msg-error.js-error');
        if (existing) existing.remove();

        const card = document.querySelector('.auth-card');
        if (!card) return;

        const div = document.createElement('div');
        div.classList.add('msg-error', 'js-error');
        div.textContent = message;

        // Insérer avant le formulaire
        const form = card.querySelector('form');
        card.insertBefore(div, form);
    }

});