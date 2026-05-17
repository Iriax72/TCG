/**
 * js/profile.js
 * Logique de la page d'édition de profil :
 *  - Chargement et affichage des données actuelles
 *  - Avatar par défaut (initiale + couleur dérivée du pseudo)
 *  - Upload sécurisé de photo via XMLHttpRequest (pour la progression)
 *  - Sauvegarde du pseudo et de la bio via fetch
 *
 * Dépend de : notifications.js (Toast, escapeHtml)
 */

document.addEventListener('DOMContentLoaded', () => {

    /* ============================================================
       Références DOM
       ============================================================ */
    const avatarWrap       = document.getElementById('avatar-wrap');
    const avatarBtn        = document.getElementById('avatar-btn');
    const avatarInput      = document.getElementById('avatar-input');
    const uploadProgress   = document.getElementById('upload-progress');
    const uploadProgressBar= document.getElementById('upload-progress-bar');
    const uploadStatus     = document.getElementById('upload-status');

    const profileForm      = document.getElementById('profile-form');
    const usernameInput    = document.getElementById('profile-username');
    const bioInput         = document.getElementById('profile-bio');
    const charCounter      = document.getElementById('char-counter');
    const saveBtn          = document.getElementById('save-btn');
    const saveStatus       = document.getElementById('save-status');
    const navUsername      = document.getElementById('nav-username');

    // Bio max length
    const BIO_MAX = 500;

    /* ============================================================
       Chargement initial du profil depuis l'API
       ============================================================ */
    async function loadProfile() {
        try {
            const res  = await fetch('api.php?action=get_profile', { credentials: 'same-origin' });
            const data = await res.json();
            const p    = data.profile;

            if (!p) return;

            // Pré-remplir le formulaire
            usernameInput.value = p.username || '';
            bioInput.value      = p.bio      || '';
            updateCharCounter();

            // Afficher l'avatar
            renderAvatar(p.avatar_path || null, p.username || '?');

        } catch (err) {
            console.error('loadProfile error:', err);
        }
    }

    /* ============================================================
       Rendu de l'avatar
       - Si avatar_path est fourni : affiche l'image
       - Sinon : génère un canvas avec initiale + couleur déterministe
       ============================================================ */
    function renderAvatar(avatarPath, username) {
        // Supprimer le contenu existant (sauf l'overlay)
        const overlay = avatarWrap.querySelector('.avatar-overlay');
        avatarWrap.querySelectorAll('img, canvas, .avatar-default').forEach(el => el.remove());

        if (avatarPath) {
            // --- Image uploadée ---
            const img = document.createElement('img');
            img.src       = avatarPath;
            img.alt       = 'Avatar';
            img.className = 'avatar-preview';

            // Fallback si l'image ne charge pas
            img.onerror = () => {
                img.remove();
                renderInitialAvatar(username);
            };

            avatarWrap.insertBefore(img, overlay);
        } else {
            renderInitialAvatar(username);
        }
    }

    /**
     * Génère un avatar initiale + fond coloré déterministe
     * (même pseudo → même couleur, sans appel serveur).
     */
    function renderInitialAvatar(username) {
        const overlay = avatarWrap.querySelector('.avatar-overlay');

        const div = document.createElement('div');
        div.className   = 'avatar-default';
        div.textContent = (username.charAt(0) || '?').toUpperCase();
        div.style.background = usernameToColor(username);

        // Clic sur l'avatar par défaut → ouvre le sélecteur de fichier
        div.addEventListener('click', () => avatarInput.click());

        avatarWrap.insertBefore(div, overlay);
    }

    /**
     * Convertit un pseudo en couleur HSL déterministe et sombre.
     * Algorithme : hash djb2 → teinte HSL, saturation et luminosité fixes.
     */
    function usernameToColor(username) {
        let hash = 5381;
        for (let i = 0; i < username.length; i++) {
            hash = ((hash << 5) + hash) + username.charCodeAt(i);
            hash = hash & hash; // conversion en int32
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 45%, 28%)`; // sombre, cohérent avec le thème
    }

    /* ============================================================
       Gestion du clic sur le bouton / l'image pour ouvrir le picker
       ============================================================ */
    avatarBtn.addEventListener('click', () => avatarInput.click());

    // Clic sur la zone image (si c'est un <img>)
    avatarWrap.addEventListener('click', (e) => {
        if (e.target.classList.contains('avatar-preview')) {
            avatarInput.click();
        }
    });

    /* ============================================================
       Upload de l'avatar dès qu'un fichier est sélectionné
       On utilise XMLHttpRequest (et non fetch) pour suivre la progression.
       ============================================================ */
    avatarInput.addEventListener('change', () => {
        const file = avatarInput.files[0];
        if (!file) return;

        // Validation client légère (le serveur re-vérifie tout)
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            setUploadStatus('Format non autorisé. Utilisez JPG, PNG, WebP ou GIF.', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setUploadStatus('Fichier trop volumineux (max 5 Mo).', 'error');
            return;
        }

        uploadAvatar(file);
        // Réinitialiser l'input pour permettre de re-sélectionner le même fichier
        avatarInput.value = '';
    });

    /**
     * Envoie le fichier au serveur via XHR avec barre de progression.
     * @param {File} file
     */
    function uploadAvatar(file) {
        const formData = new FormData();
        formData.append('avatar', file);

        const xhr = new XMLHttpRequest();

        // --- Affichage de la progression ---
        xhr.upload.addEventListener('progress', (e) => {
            if (!e.lengthComputable) return;
            const pct = Math.round((e.loaded / e.total) * 100);
            uploadProgress.style.display = 'block';
            uploadProgressBar.style.width = pct + '%';
        });

        // --- Fin de l'upload ---
        xhr.addEventListener('load', () => {
            uploadProgress.style.display = 'none';
            uploadProgressBar.style.width = '0%';

            try {
                const data = JSON.parse(xhr.responseText);
                if (data.success) {
                    setUploadStatus('Photo mise à jour !', 'success');
                    // Rafraîchir l'aperçu avec la nouvelle image
                    renderAvatar(data.avatar_url, usernameInput.value || window.APP.currentUsername);
                    Toast.show('&#128247; Photo de profil mise à jour !', 'success');
                } else {
                    setUploadStatus(data.error || 'Erreur lors de l\'upload.', 'error');
                }
            } catch {
                setUploadStatus('Réponse serveur invalide.', 'error');
            }
        });

        xhr.addEventListener('error', () => {
            uploadProgress.style.display = 'none';
            setUploadStatus('Erreur réseau lors de l\'upload.', 'error');
        });

        setUploadStatus('Envoi en cours...', '');
        xhr.open('POST', 'upload.php');
        xhr.withCredentials = true; // envoie le cookie de session
        xhr.send(formData);
    }

    /**
     * Met à jour le message de statut de l'upload.
     * @param {string} msg
     * @param {string} type 'success' | 'error' | ''
     */
    function setUploadStatus(msg, type) {
        uploadStatus.textContent = msg;
        uploadStatus.className   = 'upload-status ' + type;
    }

    /* ============================================================
       Compteur de caractères pour la bio
       ============================================================ */
    function updateCharCounter() {
        const len = bioInput.value.length;
        charCounter.textContent = `${len} / ${BIO_MAX}`;
        charCounter.className   = 'char-counter'
            + (len >= BIO_MAX ? ' limit' : len >= BIO_MAX * 0.85 ? ' warn' : '');
    }

    bioInput.addEventListener('input', updateCharCounter);

    /* ============================================================
       Sauvegarde du pseudo + bio
       ============================================================ */
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = usernameInput.value.trim();
        const bio      = bioInput.value.trim();

        // Validation client
        if (username.length < 3) {
            setSaveStatus('Le pseudo doit contenir au moins 3 caractères.', 'error');
            return;
        }

        saveBtn.disabled = true;
        setSaveStatus('Sauvegarde...', '');

        try {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('bio', bio);

            const res  = await fetch('api.php?action=update_profile', {
                method:      'POST',
                credentials: 'same-origin',
                body:        formData,
            });
            const data = await res.json();

            if (data.success) {
                setSaveStatus('Profil sauvegardé !', 'success');
                Toast.show('&#10003; Profil mis à jour.', 'success');

                // Mettre à jour le pseudo affiché dans la navbar
                if (navUsername) navUsername.textContent = data.username;

                // Mettre à jour l'avatar si le pseudo a changé (couleur déterministe)
                const noImage = !avatarWrap.querySelector('img');
                if (noImage) {
                    renderAvatar(null, data.username);
                }
            } else {
                setSaveStatus(data.error || 'Erreur lors de la sauvegarde.', 'error');
            }
        } catch (err) {
            console.error('update_profile error:', err);
            setSaveStatus('Erreur réseau. Réessayez.', 'error');
        } finally {
            saveBtn.disabled = false;
        }
    });

    /**
     * Affiche un message de statut sous le formulaire de sauvegarde.
     * @param {string} msg
     * @param {string} type 'success' | 'error' | ''
     */
    function setSaveStatus(msg, type) {
        saveStatus.textContent = msg;
        saveStatus.className   = 'save-status ' + type;

        // Effacer après 4 secondes si succès
        if (type === 'success') {
            setTimeout(() => {
                saveStatus.textContent = '';
                saveStatus.className   = 'save-status';
            }, 4000);
        }
    }

    /* ============================================================
       Initialisation
       ============================================================ */
    loadProfile();

});