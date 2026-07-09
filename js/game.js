/**
 * js/game.js
 * Logique de la table de jeu :
 *  - Chargement des informations de la partie (get_game_info)
 *  - Canal SSE vers sse.php (reconnexion automatique via EventSource)
 *  - Journal des événements reçus
 *  - window.Game.sendEvent(type, data) — API publique pour le futur jeu
 *
 * Ce fichier ne dépend pas de notifications.js (pas de poll de lobby
 * pendant une partie active).
 */

/* ============================================================
   Utilitaire : échapper le HTML (pas de dépendance externe)
   ============================================================ */
function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

/* ============================================================
   Utilitaire : afficher un toast léger
   ============================================================ */
function showToast(msg, type = '') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = msg;
    container.appendChild(t);
    setTimeout(() => {
        t.style.opacity    = '0';
        t.style.transform  = 'translateX(20px)';
        t.style.transition = 'all 0.3s ease';
        setTimeout(() => t.remove(), 300);
    }, 3500);
}

/* ============================================================
   Références DOM
   ============================================================ */
const gameStatusBadge   = document.getElementById('game-status-badge');
const bannerOpponent    = document.getElementById('banner-opponent');
const avatarOpponent    = document.getElementById('avatar-opponent');
const nameOpponent      = document.getElementById('name-opponent');
const connectionOpp     = document.getElementById('connection-opponent');
const avatarSelf        = document.getElementById('avatar-self');
const nameSelf          = document.getElementById('name-self');
const eventLog          = document.getElementById('game-event-log');
const sseDot            = document.getElementById('sse-dot');
const sseLabel          = document.getElementById('sse-label');

/* ============================================================
   État local
   ============================================================ */
let gameInfo   = null;   // Données de la partie (chargées au démarrage)
let myRole     = null;   // 'player1' | 'player2'
let myId       = window.APP.currentUserId;
let eventSource = null;  // Instance EventSource courante

/* ============================================================
   Couleur d'avatar déterministe (identique à profile.js)
   ============================================================ */
function usernameToColor(username) {
    let hash = 5381;
    for (let i = 0; i < username.length; i++) {
        hash = ((hash << 5) + hash) + username.charCodeAt(i);
        hash = hash & hash;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 45%, 28%)`;
}

/** Rendu d'un avatar : image si disponible, sinon initiale colorée */
function renderAvatar(container, username, avatarPath) {
    container.innerHTML = '';
    if (avatarPath) {
        const img = document.createElement('img');
        img.src   = avatarPath;
        img.alt   = username;
        img.onerror = () => {
            container.innerHTML = '';
            renderInitialAvatar(container, username);
        };
        container.appendChild(img);
    } else {
        renderInitialAvatar(container, username);
    }
}

function renderInitialAvatar(container, username) {
    container.textContent   = (username.charAt(0) || '?').toUpperCase();
    container.style.background = usernameToColor(username);
}

/* ============================================================
   Chargement des informations de la partie
   ============================================================ */
async function loadGameInfo() {
    try {
        const res  = await fetch(
            `${window.APP.apiUrl}?action=get_game_info&game_id=${window.APP.gameId}`,
            { credentials: 'same-origin' }
        );
        const data = await res.json();

        if (data.error) {
            addLogEntry('server', 'Système', data.error);
            return;
        }

        gameInfo = data.game;
        myRole   = data.role;

        // --- Renseigner les bandeaux joueurs ---
        const selfName     = (myRole === 'player1') ? gameInfo.player1_name     : gameInfo.player2_name;
        const selfAvatar   = (myRole === 'player1') ? gameInfo.player1_avatar   : gameInfo.player2_avatar;
        const oppName      = (myRole === 'player1') ? gameInfo.player2_name     : gameInfo.player1_name;
        const oppAvatar    = (myRole === 'player1') ? gameInfo.player2_avatar   : gameInfo.player1_avatar;
        const oppJoined    = (myRole === 'player1') ? gameInfo.player2_joined   : gameInfo.player1_joined;

        nameSelf.textContent = selfName;
        renderAvatar(avatarSelf, selfName, selfAvatar);

        nameOpponent.textContent = oppName;
        renderAvatar(avatarOpponent, oppName, oppAvatar);

        // Connexion de l'adversaire
        updateOpponentConnection(parseInt(oppJoined) === 1);

        // Statut de la partie
        updateGameStatus(gameInfo.status);

    } catch (err) {
        console.error('loadGameInfo error:', err);
        addLogEntry('server', 'Système', 'Erreur lors du chargement de la partie.');
    }
}

/* ============================================================
   Mise à jour de l'indicateur de statut de la partie
   ============================================================ */
function updateGameStatus(status) {
    const labels = {
        waiting:  'En attente...',
        active:   'Partie en cours',
        finished: 'Partie terminée',
    };
    gameStatusBadge.textContent = labels[status] || status;
    gameStatusBadge.className   = `game-status-badge ${status}`;
}

/* ============================================================
   Mise à jour de l'indicateur de connexion de l'adversaire
   ============================================================ */
function updateOpponentConnection(isConnected) {
    const dot  = connectionOpp.querySelector('.status-dot');
    const span = connectionOpp.querySelector('span:last-child');
    if (!dot || !span) return;
    dot.className  = 'status-dot ' + (isConnected ? 'online' : 'offline');
    span.textContent = isConnected ? 'Connecté' : 'En attente';
}

/* ============================================================
   Canal SSE
   ============================================================ */
function openSSE() {
    if (eventSource) {
        eventSource.close();
    }

    setSseStatus('reconnecting', 'Connexion...');

    const url = `${window.APP.sseUrl}`;
    eventSource = new EventSource(url);

    // --- Connexion établie ---
    eventSource.onopen = () => {
        setSseStatus('connected', 'Canal actif');
    };

    // --- Erreur / déconnexion (EventSource reconnecte automatiquement) ---
    eventSource.onerror = () => {
        setSseStatus('reconnecting', 'Reconnexion...');
    };

    // ---- Handlers d'événements de jeu ----

    /** La partie a été créée (invitation acceptée) */
    eventSource.addEventListener('game_start', (e) => {
        const data = JSON.parse(e.data);
        addLogEntry('server', 'Système', data.message || 'La partie a démarré !');
        showToast('&#9876; La partie a démarré !', 'success');
    });

    /** Les deux joueurs sont connectés → partie active */
    eventSource.addEventListener('game_active', (e) => {
        const data = JSON.parse(e.data);
        updateGameStatus('active');
        updateOpponentConnection(true);
        addLogEntry('server', 'Système', data.message || 'Les deux joueurs sont connectés.');
        showToast('&#9876; Les deux joueurs sont prêts !', 'success');
    });

    /**
     * Événement de coup joué — sera traité par la logique de jeu future.
     * Pour l'instant, on le logue simplement.
     */
    eventSource.addEventListener('game_move', (e) => {
        const data = JSON.parse(e.data);
        const who  = (data.player_id === myId) ? 'self' : 'opponent';
        const name = escapeHtml(data.player_name || 'Joueur');
        addLogEntry(who, name, `Coup joué : ${JSON.stringify(data)}`);
        // TODO: transmettre à la logique de plateau quand elle sera implémentée
        if (window.Game && typeof window.Game.onEvent === 'function') {
            window.Game.onEvent('game_move', data);
        }
    });

    /** Événement d'action générique */
    eventSource.addEventListener('game_action', (e) => {
        const data = JSON.parse(e.data);
        const who  = (data.player_id === myId) ? 'self' : 'opponent';
        const name = escapeHtml(data.player_name || 'Joueur');
        addLogEntry(who, name, data.message || JSON.stringify(data));
        if (window.Game && typeof window.Game.onEvent === 'function') {
            window.Game.onEvent('game_action', data);
        }
    });

    /** Fin de partie */
    eventSource.addEventListener('game_end', (e) => {
        const data = JSON.parse(e.data);
        updateGameStatus('finished');
        addLogEntry('server', 'Système', data.message || 'La partie est terminée.');
        showToast('Partie terminée.', 'warning');
        if (window.Game && typeof window.Game.onEvent === 'function') {
            window.Game.onEvent('game_end', data);
        }
    });

    /** Message de chat en jeu */
    eventSource.addEventListener('game_chat', (e) => {
        const data = JSON.parse(e.data);
        const who  = (data.player_id === myId) ? 'self' : 'opponent';
        const name = escapeHtml(data.player_name || 'Joueur');
        addLogEntry(who, name, escapeHtml(data.text || ''));
    });
}

/* ============================================================
   Mise à jour de l'indicateur SSE
   ============================================================ */
function setSseStatus(state, label) {
    sseDot.className   = `sse-dot ${state}`;
    sseLabel.textContent = label;
}

/* ============================================================
   Journal des événements
   ============================================================ */
function addLogEntry(who, actor, message) {
    // Formater l'heure
    const now = new Date();
    const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const entry = document.createElement('div');
    entry.className = `game-event-entry ${who}`;
    entry.innerHTML = `
        <span class="game-event-time">${time}</span>
        <span class="game-event-actor ${who}">${actor}</span>
        ${message}
    `;

    eventLog.appendChild(entry);

    // Scroll automatique vers le bas
    eventLog.scrollTop = eventLog.scrollHeight;
}

/* ============================================================
   API publique — window.Game
   Utilisée par la logique de jeu future (plateau, cartes, etc.)
   ============================================================ */
window.Game = {

    /**
     * Envoyer un événement au serveur (puis broadcast aux deux joueurs via SSE).
     * @param {string} type  — 'game_move' | 'game_action' | 'game_chat' | 'game_end' | 'game_ping'
     * @param {object} data  — Données libres (sérialisées en JSON)
     */
    sendEvent: async function(type, data = {}) {
        if (!gameInfo) {
            console.warn('Game.sendEvent: partie non chargée');
            return null;
        }

        const formData = new FormData();
        formData.append('game_id',    window.APP.gameId);
        formData.append('event_type', type);
        formData.append('event_data', JSON.stringify(data));

        try {
            const res  = await fetch(`${window.APP.apiUrl}?action=send_game_event`, {
                method:      'POST',
                credentials: 'same-origin',
                body:        formData,
            });
            return await res.json();
        } catch (err) {
            console.error('Game.sendEvent error:', err);
            return null;
        }
    },

    /**
     * Hook appelé à chaque événement SSE reçu.
     * À redéfinir par la logique de jeu :
     *   window.Game.onEvent = (type, data) => { ... }
     */
    onEvent: null,

    /** Accès aux données de la partie chargées */
    getInfo:  () => gameInfo,
    getRole:  () => myRole,
    getMyId:  () => myId,
};

/* ============================================================
   Démarrage
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Charger les infos de la partie (marque aussi le joueur comme connecté)
    await loadGameInfo();

    // 2. Ouvrir le canal SSE
    openSSE();

    addLogEntry('server', 'Système', 'Vous êtes connecté à la table de jeu.');
});