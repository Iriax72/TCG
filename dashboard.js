/**
 * js/dashboard.js
 * Logique du tableau de bord :
 *  - Recherche de joueurs
 *  - Envoi d'invitations de partie
 *  - Affichage des invitations envoyées
 *
 * Dépend de : notifications.js (Toast, escapeHtml, Notifications)
 */

document.addEventListener('DOMContentLoaded', () => {

    /* ============================================================
       Références DOM
       ============================================================ */
    const searchInput = document.getElementById('search-input');
    const searchBtn   = document.getElementById('search-btn');
    const playerList  = document.getElementById('player-list');
    const sentPanel   = document.getElementById('sent-panel');

    /* ============================================================
       Debounce : déclenche la recherche après 400ms de pause de frappe
       ============================================================ */
    let debounceTimer = null;

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const q = searchInput.value.trim();

        if (q.length < 2) {
            renderEmptySearch('Tapez un pseudo pour rechercher un joueur.');
            return;
        }

        debounceTimer = setTimeout(() => searchPlayers(q), 400);
    });

    // Déclenchement aussi sur le bouton et la touche Entrée
    searchBtn.addEventListener('click', () => searchPlayers(searchInput.value.trim()));
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchPlayers(searchInput.value.trim());
    });

    /* ============================================================
       Recherche de joueurs via l'API
       ============================================================ */
    async function searchPlayers(query) {
        if (query.length < 2) {
            renderEmptySearch('Le pseudo doit contenir au moins 2 caractères.');
            return;
        }

        // Indicateur de chargement
        playerList.innerHTML = '<p class="list-empty">Recherche en cours…</p>';

        try {
            const response = await fetch(`api.php?action=search_users&q=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('Erreur serveur');

            const data  = await response.json();
            const users = data.users || [];

            renderPlayerList(users);

        } catch (err) {
            playerList.innerHTML = '<p class="list-empty">Erreur lors de la recherche. Réessayez.</p>';
        }
    }

    /* ============================================================
       Rendu de la liste de joueurs
       ============================================================ */
    function renderPlayerList(users) {
        if (users.length === 0) {
            renderEmptySearch('Aucun joueur trouvé pour ce pseudo.');
            return;
        }

        playerList.innerHTML = '';

        users.forEach((user, index) => {
            const isOnline = parseInt(user.online) === 1;

            // Initiale pour l'avatar
            const initial = user.username.charAt(0).toUpperCase();

            const item = document.createElement('div');
            item.classList.add('player-item');
            item.style.animationDelay = `${index * 0.05}s`;

            item.innerHTML = `
                <div class="player-avatar">${escapeHtml(initial)}</div>
                <div class="player-info">
                    <div class="player-name">${escapeHtml(user.username)}</div>
                    <div class="player-status-text">
                        <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
                        ${isOnline ? 'En ligne' : 'Hors ligne'}
                    </div>
                </div>
                <button
                    class="btn btn-primary invite-btn"
                    data-id="${user.id}"
                    data-username="${escapeHtml(user.username)}"
                    title="Inviter ${escapeHtml(user.username)} à jouer"
                >
                    &#9993; Inviter
                </button>
            `;

            // Bouton d'invitation
            item.querySelector('.invite-btn').addEventListener('click', (e) => {
                const btn = e.currentTarget;
                sendInvitation(parseInt(btn.dataset.id), btn.dataset.username, btn);
            });

            playerList.appendChild(item);
        });
    }

    /* ============================================================
       Message vide dans la liste de joueurs
       ============================================================ */
    function renderEmptySearch(message) {
        playerList.innerHTML = `<p class="list-empty">${escapeHtml(message)}</p>`;
    }

    /* ============================================================
       Envoi d'une invitation de partie
       ============================================================ */
    async function sendInvitation(toUserId, toUsername, btnElement) {
        // Désactiver le bouton immédiatement (évite les doubles envois)
        btnElement.disabled = true;
        btnElement.textContent = 'Envoi…';

        const formData = new FormData();
        formData.append('to_user_id', toUserId);

        try {
            const response = await fetch('api.php?action=send_invitation', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                Toast.show(`&#9993; Invitation envoyée à <strong>${escapeHtml(toUsername)}</strong> !`, 'success');
                btnElement.textContent = '&#10003; Envoyé';
                // Rafraîchir la liste des invitations envoyées
                loadSentInvitations();
            } else {
                Toast.show(data.error || 'Erreur lors de l\'envoi.', 'error');
                // Réactiver le bouton en cas d'erreur
                btnElement.disabled = false;
                btnElement.innerHTML = '&#9993; Inviter';
            }

        } catch {
            Toast.show('Erreur réseau. Réessayez.', 'error');
            btnElement.disabled = false;
            btnElement.innerHTML = '&#9993; Inviter';
        }
    }

    /* ============================================================
       Chargement et rendu des invitations envoyées
       ============================================================ */
    async function loadSentInvitations() {
        try {
            const response = await fetch('api.php?action=get_sent');
            if (!response.ok) return;

            const data = await response.json();
            const sent = data.sent || [];

            renderSentInvitations(sent);

        } catch {
            sentPanel.innerHTML = '<p class="list-empty">Impossible de charger vos invitations.</p>';
        }
    }

    function renderSentInvitations(sent) {
        if (sent.length === 0) {
            sentPanel.innerHTML = '<p class="list-empty">Aucune invitation envoyée pour l\'instant.</p>';
            return;
        }

        sentPanel.innerHTML = '';

        sent.forEach((inv, index) => {
            const item = document.createElement('div');
            item.classList.add('invitation-item');
            item.style.animationDelay = `${index * 0.04}s`;

            // Formatage de la date
            const date = new Date(inv.updated_at.replace(' ', 'T'));
            const dateStr = date.toLocaleString('fr-FR', {
                day:    '2-digit',
                month:  '2-digit',
                hour:   '2-digit',
                minute: '2-digit'
            });

            item.innerHTML = `
                <div class="invitation-to">&#9993; ${escapeHtml(inv.to_username)}</div>
                <div class="invitation-status ${inv.status}">${statusLabel(inv.status)}</div>
                <div class="invitation-time">${dateStr}</div>
            `;

            sentPanel.appendChild(item);
        });
    }

    /**
     * Traduit le statut en libellé français.
     * @param {string} status
     * @returns {string}
     */
    function statusLabel(status) {
        const labels = {
            pending:  '⏳ En attente',
            accepted: '✓ Acceptée',
            declined: '✗ Refusée'
        };
        return labels[status] || status;
    }

    /* ============================================================
       Rafraîchissement périodique des invitations envoyées
       (pour voir si quelqu'un a répondu)
       ============================================================ */
    loadSentInvitations();
    setInterval(loadSentInvitations, window.APP.pollInterval);

});