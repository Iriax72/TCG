/**
 * js/notifications.js
 * Gestion des notifications d'invitations reçues.
 *
 * Principe : polling régulier de l'API (toutes les APP.pollInterval ms)
 * pour récupérer les invitations en attente. Si de nouvelles arrivent,
 * le badge sur le bouton cloche est mis à jour.
 */

/* ============================================================
   Module Notifications (IIFE pour éviter les variables globales)
   ============================================================ */
const Notifications = (() => {

    // Références DOM
    const notifBtn   = document.getElementById('notif-btn');
    const notifBadge = document.getElementById('notif-badge');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalBody    = document.getElementById('modal-body');
    const modalClose   = document.getElementById('modal-close');

    // Ensemble des IDs d'invitations déjà connues (pour détecter les nouvelles)
    let knownIds = new Set();

    // Référence à l'intervalle de polling
    let pollTimer = null;

    /* -------- Initialisation -------- */
    function init() {
        // Ouvrir / fermer le modal
        notifBtn.addEventListener('click', openModal);
        modalClose.addEventListener('click', closeModal);
        modalOverlay.addEventListener('click', (e) => {
            // Clic en dehors du modal → fermer
            if (e.target === modalOverlay) closeModal();
        });

        // Fermer avec Échap
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });

        // Premier poll immédiat, puis polling régulier
        poll();
        pollTimer = setInterval(poll, window.APP.pollInterval);
    }

    /* -------- Polling de l'API -------- */
    async function poll() {
        try {
            const response = await fetch('api.php?action=get_notifications', { credentials: 'same-origin' });
            if (!response.ok) return;

            const data = await response.json();
            const notifications = data.notifications || [];

            // Si une partie vient d'être créée pour ce joueur → le rediriger.
            // On vérifie qu'il n'est pas déjà sur la page de jeu pour éviter
            // une boucle infinie de rechargements.
            if (data.game_redirect && !window.location.search.includes('view=game')) {
                window.location.href = `index.php?view=game&game_id=${data.game_redirect}`;
                return;
            }

            // Mettre à jour le badge
            updateBadge(notifications.length);

            // Détecter les nouvelles invitations et afficher un toast
            notifications.forEach((notif) => {
                if (!knownIds.has(notif.id)) {
                    knownIds.add(notif.id);
                    // Ne pas toaster si c'est le premier chargement (knownIds était vide)
                    if (knownIds.size > notifications.length || knownIds.size === 1 && notifications.length === 1) {
                        // Premier chargement : on ne toaste pas
                    } else {
                        Toast.show(`&#9993; ${notif.from_username} vous invite à jouer !`, 'warning');
                    }
                }
            });

            // Si le modal est ouvert, rafraîchir son contenu
            if (modalOverlay.classList.contains('visible')) {
                renderModal(notifications);
            }

        } catch (err) {
            // Erreur réseau silencieuse (ne pas spammer la console)
        }
    }

    /* -------- Mise à jour du badge -------- */
    function updateBadge(count) {
        if (count > 0) {
            notifBadge.textContent = count > 9 ? '9+' : count;
            notifBadge.style.display = 'flex';
            notifBtn.classList.add('has-notif');
        } else {
            notifBadge.style.display = 'none';
            notifBtn.classList.remove('has-notif');
        }
    }

    /* -------- Ouvrir le modal et charger les invitations -------- */
    async function openModal() {
        modalOverlay.classList.add('visible');

        // Charger les invitations fraîches
        try {
            const response = await fetch('api.php?action=get_notifications', { credentials: 'same-origin' });
            const data     = await response.json();
            renderModal(data.notifications || []);
        } catch {
            modalBody.innerHTML = '<p class="list-empty">Impossible de charger les invitations.</p>';
        }
    }

    /* -------- Fermer le modal -------- */
    function closeModal() {
        modalOverlay.classList.remove('visible');
    }

    /* -------- Rendu du contenu du modal -------- */
    function renderModal(notifications) {
        if (notifications.length === 0) {
            modalBody.innerHTML = '<p class="list-empty">Aucune invitation en attente.</p>';
            return;
        }

        modalBody.innerHTML = '';

        notifications.forEach((notif) => {
            const item = document.createElement('div');
            item.classList.add('notif-item');
            item.dataset.id = notif.id;

            item.innerHTML = `
                <div class="notif-text">
                    <strong>${escapeHtml(notif.from_username)}</strong>
                    vous invite à jouer une partie !
                </div>
                <div class="notif-actions">
                    <button class="btn btn-success btn-sm" data-action="accept" data-id="${notif.id}">
                        &#10003; Accepter
                    </button>
                    <button class="btn btn-danger btn-sm" data-action="decline" data-id="${notif.id}">
                        &#10007; Refuser
                    </button>
                </div>
            `;

            // Gestion des clics sur les boutons
            item.querySelectorAll('[data-action]').forEach((btn) => {
                btn.addEventListener('click', () => respondToInvitation(notif.id, btn.dataset.action, item));
            });

            modalBody.appendChild(item);
        });
    }

    /* -------- Répondre à une invitation -------- */
    async function respondToInvitation(invitationId, action, itemElement) {
        const response = (action === 'accept') ? 'accepted' : 'declined';

        try {
            const formData = new FormData();
            formData.append('invitation_id', invitationId);
            formData.append('response', response);

            const res  = await fetch('api.php?action=respond_invitation', { method: 'POST', credentials: 'same-origin', body: formData });
            const data = await res.json();

            if (data.success) {
                // Supprimer l'élément du modal avec animation
                itemElement.style.opacity = '0';
                itemElement.style.transform = 'translateX(20px)';
                itemElement.style.transition = 'all 0.3s ease';
                setTimeout(() => itemElement.remove(), 300);

                // Retirer de knownIds pour mettre à jour le badge
                knownIds.delete(parseInt(invitationId));

                if (response === 'accepted' && data.game_id) {
                    // Rediriger player B vers la table de jeu
                    Toast.show('&#9876; Partie créée ! Redirection...', 'success');
                    setTimeout(() => {
                        window.location.href = `index.php?view=game&game_id=${data.game_id}`;
                    }, 800);
                } else {
                    // Toast de confirmation pour un refus
                    Toast.show('&#10007; Invitation refusée.', 'error');
                    poll();
                }

            } else {
                Toast.show(data.error || 'Erreur.', 'error');
            }
        } catch {
            Toast.show('Erreur réseau.', 'error');
        }
    }

    /* -------- Expose les méthodes utiles à d'autres modules -------- */
    return { init, poll };

})();

/* ============================================================
   Module Toast
   ============================================================ */
const Toast = (() => {

    const container = document.getElementById('toast-container');

    /**
     * Affiche un toast.
     * @param {string} message - HTML autorisé (icônes).
     * @param {string} type    - 'success' | 'error' | 'warning' | ''
     * @param {number} duration - Durée en ms (défaut 3500).
     */
    function show(message, type = '', duration = 3500) {
        const toast = document.createElement('div');
        toast.classList.add('toast');
        if (type) toast.classList.add(type);
        toast.innerHTML = message;

        container.appendChild(toast);

        // Suppression automatique
        setTimeout(() => {
            toast.style.opacity    = '0';
            toast.style.transform  = 'translateX(20px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    return { show };

})();

/* ============================================================
   Utilitaire d'échappement HTML
   ============================================================ */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* ============================================================
   Démarrage du module de notifications
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    Notifications.init();
});