/**
 * js/game.js — Module ES
 *
 * Architecture :
 *   • boardgame.io  gère la machine à états côté client (import dynamique avec fallback).
 *   • PHP/SSE       synchronise les événements entre navigateurs.
 *   • PHP           stocke le deck choisi en privé (jamais révélé à l'adversaire).
 *
 * Pourquoi import dynamique et non statique ?
 *   Un import statique ( import { X } from 'url' ) bloque le chargement de tout le
 *   module si l'URL est inaccessible. Avec un import() dynamique dans DOMContentLoaded,
 *   l'affichage des decks se fait immédiatement depuis window.INITIAL_PLAYER_DECKS,
 *   que boardgame.io soit disponible ou non.
 */

/* ============================================================
   Définition du jeu — utilisée par boardgame.io ET le fallback
   ============================================================ */

/**
 * Configuration de la machine à états unTCG.
 * Passée au Client boardgame.io si disponible,
 * utilisée directement par le fallback sinon.
 */
const unTCGGameDef = {
    name: 'unTCG',

    setup: () => ({
        selfReady:     false,
        opponentReady: false,
    }),

    phases: {
        /* Phase 1 — sélection simultanée du deck */
        deckSelection: {
            start: true,
            moves: {
                /** Le joueur confirme son deck (deck_id envoyé séparément à PHP). */
                confirmDeck: ({ G }) => { G.selfReady = true; },
                /** Déclenché par un événement SSE quand l'adversaire a confirmé. */
                opponentConfirmed: ({ G }) => { G.opponentReady = true; },
            },
            endIf: ({ G }) => G.selfReady && G.opponentReady || undefined,
            next: 'main',
        },

        /* Phase 2 — jeu principal (à implémenter) */
        main: { moves: {} },
    },
};

/* ============================================================
   Machine à états de secours (si boardgame.io ne charge pas)
   Même interface que bgioClient : moves.confirmDeck(), moves.opponentConfirmed()
   ============================================================ */
function createFallbackStateMachine(selfReady, opponentReady) {
    const state = { selfReady, opponentReady, phase: 'deckSelection' };

    function check() {
        if (state.selfReady && state.opponentReady && state.phase === 'deckSelection') {
            state.phase = 'main';
            transitionToGame();
        }
    }

    return {
        moves: {
            confirmDeck()       { state.selfReady     = true; check(); },
            opponentConfirmed() { state.opponentReady = true; check(); },
        },
        getState: () => ({ G: state, ctx: { phase: state.phase } }),
    };
}

/* ============================================================
   Références DOM
   ============================================================ */

// Phase sélection de deck
const phaseDeckSelection = document.getElementById('phase-deck-selection');
const deckChoiceGrid     = document.getElementById('deck-choice-grid');
const oppStatusDot       = document.getElementById('opp-status-dot');
const oppStatusLabel     = document.getElementById('opp-status-label');
const deckConfirmRow     = document.getElementById('deck-confirm-row');
const btnConfirmDeck     = document.getElementById('btn-confirm-deck');
const selectedDeckName   = document.getElementById('selected-deck-name');
const deckConfirmedMsg   = document.getElementById('deck-confirmed-msg');

// Table de jeu
const gameLayout       = document.getElementById('game-layout');
const gameStatusBadge  = document.getElementById('game-status-badge');
const avatarSelf       = document.getElementById('avatar-self');
const nameSelf         = document.getElementById('name-self');
const avatarOpponent   = document.getElementById('avatar-opponent');
const nameOpponent     = document.getElementById('name-opponent');
const connectionOpp    = document.getElementById('connection-opponent');
const eventLog         = document.getElementById('game-event-log');
const sseDot           = document.getElementById('sse-dot');
const sseLabel         = document.getElementById('sse-label');

/* ============================================================
   Rendu immédiat des decks — TOP LEVEL SYNCHRONE
   S'exécute après le parsing du DOM (module = deferred) mais AVANT
   DOMContentLoaded. Même si le handler async échoue plus tard,
   les decks sont déjà affichés.
   ============================================================ */
(function renderDecksImmediately() {
    const grid = document.getElementById('deck-choice-grid');
    if (!grid) return;

    if (window.INITIAL_PLAYER_DECKS && window.INITIAL_PLAYER_DECKS.length > 0) {
        // Données pré-chargées par PHP disponibles → affichage immédiat
        renderPlayerDeckGrid(window.INITIAL_PLAYER_DECKS);
    } else if (window.INITIAL_PLAYER_DECKS && window.INITIAL_PLAYER_DECKS.length === 0) {
        // PHP a répondu mais le joueur n'a aucun deck
        renderPlayerDeckGrid([]);
    }
    // Si INITIAL_PLAYER_DECKS est null (erreur PHP), on attend le fetch dans
    // DOMContentLoaded qui tentera l'API directement.
})();

/* ============================================================
   État local
   ============================================================ */
let gameInfo        = null;
let myRole          = null;
let myId            = window.APP.currentUserId;
let selectedDeckId  = null;
let deckConfirmed   = false;
let eventSource     = null;
let bgioClient      = null;   // boardgame.io Client ou fallback

/* ============================================================
   Utilitaires
   ============================================================ */

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = String(text ?? '');
    return d.innerHTML;
}

function showToast(msg, type = '') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = msg;
    container.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateX(20px)';
        t.style.transition = 'all 0.3s ease';
        setTimeout(() => t.remove(), 300);
    }, 3500);
}

function usernameToColor(username) {
    let hash = 5381;
    for (let i = 0; i < (username || '').length; i++) {
        hash = ((hash << 5) + hash) + username.charCodeAt(i);
        hash = hash & hash;
    }
    return `hsl(${Math.abs(hash) % 360}, 45%, 28%)`;
}

function renderAvatar(container, username, avatarPath) {
    container.innerHTML = '';
    container.style.background = '';
    if (avatarPath) {
        const img = document.createElement('img');
        img.src = avatarPath;
        img.alt = username || '?';
        img.onerror = () => { container.innerHTML = ''; renderInitialAvatar(container, username); };
        container.appendChild(img);
    } else {
        renderInitialAvatar(container, username);
    }
}

function renderInitialAvatar(container, username) {
    container.textContent = (username?.charAt(0) || '?').toUpperCase();
    container.style.background = usernameToColor(username);
}

/* ============================================================
   Chargement des infos de partie
   ============================================================ */
async function loadGameInfo() {
    const res  = await fetch(
        `${window.APP.apiUrl}?action=get_game_info&game_id=${window.APP.gameId}`,
        { credentials: 'same-origin' }
    );
    const data = await res.json();

    if (data.error) {
        addLogEntry('server', 'Système', escapeHtml(data.error));
        return null;
    }

    gameInfo = data.game;
    myRole   = data.role;

    const selfName   = myRole === 'player1' ? gameInfo.player1_name   : gameInfo.player2_name;
    const selfAvatar = myRole === 'player1' ? gameInfo.player1_avatar : gameInfo.player2_avatar;
    const oppName    = myRole === 'player1' ? gameInfo.player2_name   : gameInfo.player1_name;
    const oppAvatar  = myRole === 'player1' ? gameInfo.player2_avatar : gameInfo.player1_avatar;
    const oppJoined  = myRole === 'player1' ? gameInfo.player2_joined : gameInfo.player1_joined;

    nameSelf.textContent     = selfName;
    nameOpponent.textContent = oppName;
    renderAvatar(avatarSelf,     selfName,  selfAvatar);
    renderAvatar(avatarOpponent, oppName,   oppAvatar);
    updateOpponentConnection(parseInt(oppJoined) === 1);
    updateGameStatus(gameInfo.status);

    return data;
}

/* ============================================================
   Initialisation de boardgame.io (avec fallback)
   ============================================================ */
async function initStateManager(selfReady, opponentReady) {
    try {
        // Import dynamique : si l'URL est inaccessible, on passe au catch
        const { Client } = await import('https://esm.sh/boardgame.io@0.50.2/client');

        const playerID = myRole === 'player1' ? '0' : '1';
        const client   = Client({ game: unTCGGameDef, playerID, debug: false });

        client.start();

        // Quand boardgame.io change de phase → déclencher la transition UI
        client.subscribe((state) => {
            if (state?.ctx?.phase === 'main') transitionToGame();
        });

        // Réhydrater si le joueur avait déjà sélectionné
        if (selfReady)     client.moves.confirmDeck();
        if (opponentReady) client.moves.opponentConfirmed();

        console.info('boardgame.io chargé avec succès.');
        return client;

    } catch (err) {
        // boardgame.io indisponible → fallback léger avec même interface
        console.warn('boardgame.io non disponible, fallback activé :', err.message);
        const fb = createFallbackStateMachine(selfReady, opponentReady);
        // Vérifier si les deux étaient déjà prêts (rechargement de page)
        if (selfReady && opponentReady) transitionToGame();
        return fb;
    }
}

/* ============================================================
   Affichage de la grille de decks
   ============================================================ */
function renderPlayerDeckGrid(decks) {
    if (!deckChoiceGrid) return;
    deckChoiceGrid.innerHTML = '';

    if (!decks || decks.length === 0) {
        deckChoiceGrid.innerHTML = `
            <div class="deck-choice-empty">
                <p>Vous n'avez aucun deck.</p>
                <a href="index.php?view=decks" class="btn btn-ghost" style="margin-top:0.75rem;">
                    &#9830; Créer un deck
                </a>
            </div>`;
        return;
    }

    decks.forEach((deck) => {
        const item = document.createElement('div');
        item.className = 'deck-choice-item';
        item.dataset.deckId = deck.id;
        item.innerHTML = `
            <div class="deck-choice-icon">&#9830;</div>
            <div class="deck-choice-name">${escapeHtml(deck.name)}</div>
            <div class="deck-choice-count">${deck.card_count} carte(s)</div>
            <div class="deck-choice-check">&#10003;</div>
        `;
        item.addEventListener('click', () => selectDeck(deck.id, deck.name));
        deckChoiceGrid.appendChild(item);
    });
}

/**
 * Charge les decks depuis window.INITIAL_PLAYER_DECKS (PHP, instantané)
 * puis rafraîchit depuis l'API en arrière-plan.
 */
async function loadPlayerDecks() {
    // Affichage immédiat depuis le pré-chargement PHP
    if (window.INITIAL_PLAYER_DECKS) {
        renderPlayerDeckGrid(window.INITIAL_PLAYER_DECKS);
    }

    // Rafraîchissement silencieux en arrière-plan
    try {
        const res  = await fetch(`${window.APP.apiUrl}?action=get_decks`, { credentials: 'same-origin' });
        const text = await res.text();
        const data = JSON.parse(text);
        if (!data.error) renderPlayerDeckGrid(data.decks || []);
    } catch (err) {
        // Silencieux : le pré-chargement est déjà affiché
        console.warn('loadPlayerDecks refresh error:', err);
    }
}

/* ============================================================
   Sélection et confirmation du deck
   ============================================================ */
function selectDeck(deckId, deckName) {
    if (deckConfirmed) return;
    selectedDeckId = deckId;

    document.querySelectorAll('.deck-choice-item').forEach((el) => {
        el.classList.toggle('selected', parseInt(el.dataset.deckId) === deckId);
    });

    if (selectedDeckName) selectedDeckName.textContent = deckName;
    if (deckConfirmRow) deckConfirmRow.style.display = 'flex';
    if (btnConfirmDeck) btnConfirmDeck.disabled = false;
}

btnConfirmDeck?.addEventListener('click', async () => {
    if (!selectedDeckId || deckConfirmed) return;

    btnConfirmDeck.disabled    = true;
    btnConfirmDeck.textContent = 'Envoi...';

    const formData = new FormData();
    formData.append('game_id', window.APP.gameId);
    formData.append('deck_id', selectedDeckId);

    try {
        const res  = await fetch(`${window.APP.apiUrl}?action=game_select_deck`, {
            method: 'POST', credentials: 'same-origin', body: formData,
        });
        const data = await res.json();

        if (data.error) {
            showToast(data.error, 'error');
            btnConfirmDeck.disabled    = false;
            btnConfirmDeck.textContent = '✓ Confirmer ce deck';
            return;
        }

        // Appliquer le move dans boardgame.io (ou fallback)
        bgioClient?.moves?.confirmDeck();
        deckConfirmed = true;
        showSelfConfirmedUI();
        addLogEntry('server', 'Système', 'Deck confirmé. En attente de l\'adversaire...');

    } catch (err) {
        console.error('game_select_deck error:', err);
        showToast('Erreur réseau. Réessayez.', 'error');
        btnConfirmDeck.disabled    = false;
        btnConfirmDeck.textContent = '✓ Confirmer ce deck';
    }
});

function showSelfConfirmedUI() {
    deckConfirmed = true;
    document.querySelectorAll('.deck-choice-item:not(.selected)').forEach(el => el.classList.add('disabled'));
    if (deckConfirmRow)   deckConfirmRow.style.display  = 'none';
    if (deckConfirmedMsg) deckConfirmedMsg.style.display = 'block';
}

function updateOpponentStatus(ready) {
    if (!oppStatusDot || !oppStatusLabel) return;
    oppStatusDot.className   = 'status-dot ' + (ready ? 'online' : 'offline');
    oppStatusLabel.textContent = ready ? 'Adversaire : deck confirmé ✓' : 'Adversaire : en attente...';
}

/* ============================================================
   Transition vers la table de jeu
   ============================================================ */
let transitioned = false;

function transitionToGame() {
    if (transitioned) return;
    transitioned = true;

    phaseDeckSelection.style.transition = 'opacity 0.6s ease';
    phaseDeckSelection.style.opacity    = '0';
    setTimeout(() => {
        phaseDeckSelection.style.display = 'none';
        gameLayout.style.display         = 'grid';
        updateGameStatus('active');
        addLogEntry('server', 'Système', 'Les deux decks ont été choisis. La partie peut commencer !');
        showToast('&#9876; Les decks sont prêts !', 'success');
    }, 600);
}

/* ============================================================
   Canal SSE
   ============================================================ */
function openSSE() {
    if (eventSource) eventSource.close();
    setSseStatus('reconnecting', 'Connexion...');
    eventSource = new EventSource(window.APP.sseUrl);

    eventSource.onopen  = () => setSseStatus('connected', 'Canal actif');
    eventSource.onerror = () => setSseStatus('reconnecting', 'Reconnexion...');

    eventSource.addEventListener('game_start', (e) => {
        const d = JSON.parse(e.data);
        addLogEntry('server', 'Système', escapeHtml(d.message || 'La partie a démarré !'));
    });

    eventSource.addEventListener('game_active', (e) => {
        const d = JSON.parse(e.data);
        updateOpponentConnection(true);
        addLogEntry('server', 'Système', escapeHtml(d.message || 'Les deux joueurs sont connectés.'));
    });

    eventSource.addEventListener('deck_confirmed', (e) => {
        const d = JSON.parse(e.data);
        if (parseInt(d.player_id) !== parseInt(myId)) {
            bgioClient?.moves?.opponentConfirmed();
            updateOpponentStatus(true);
            addLogEntry('server', 'Système', 'L\'adversaire a confirmé son deck.');
        }
    });

    // Filet de sécurité si boardgame.io n'a pas déclenché la transition
    eventSource.addEventListener('all_decks_selected', (e) => {
        const d = JSON.parse(e.data);
        addLogEntry('server', 'Système', escapeHtml(d.message || 'Les deux decks ont été sélectionnés.'));
        transitionToGame();
    });

    eventSource.addEventListener('game_move', (e) => {
        const d   = JSON.parse(e.data);
        const who = parseInt(d.player_id) === parseInt(myId) ? 'self' : 'opponent';
        addLogEntry(who, escapeHtml(d.player_name || 'Joueur'), escapeHtml(JSON.stringify(d)));
        window.Game?.onEvent?.('game_move', d);
    });

    eventSource.addEventListener('game_action', (e) => {
        const d   = JSON.parse(e.data);
        const who = parseInt(d.player_id) === parseInt(myId) ? 'self' : 'opponent';
        addLogEntry(who, escapeHtml(d.player_name || 'Joueur'), escapeHtml(d.message || ''));
        window.Game?.onEvent?.('game_action', d);
    });

    eventSource.addEventListener('game_end', (e) => {
        const d = JSON.parse(e.data);
        updateGameStatus('finished');
        addLogEntry('server', 'Système', escapeHtml(d.message || 'Partie terminée.'));
        showToast('Partie terminée.', 'warning');
        window.Game?.onEvent?.('game_end', d);
    });

    eventSource.addEventListener('game_chat', (e) => {
        const d   = JSON.parse(e.data);
        const who = parseInt(d.player_id) === parseInt(myId) ? 'self' : 'opponent';
        addLogEntry(who, escapeHtml(d.player_name || 'Joueur'), escapeHtml(d.text || ''));
    });
}

/* ============================================================
   Helpers UI
   ============================================================ */
function updateGameStatus(status) {
    const labels = { waiting: 'En attente...', active: 'Partie en cours', finished: 'Terminée' };
    gameStatusBadge.textContent = labels[status] ?? status;
    gameStatusBadge.className   = `game-status-badge ${status}`;
}

function updateOpponentConnection(connected) {
    const dot  = connectionOpp?.querySelector('.status-dot');
    const span = connectionOpp?.querySelector('span:last-child');
    if (!dot || !span) return;
    dot.className    = 'status-dot ' + (connected ? 'online' : 'offline');
    span.textContent = connected ? 'Connecté' : 'En attente';
}

function setSseStatus(state, label) {
    if (sseDot)   sseDot.className     = `sse-dot ${state}`;
    if (sseLabel) sseLabel.textContent = label;
}

function addLogEntry(who, actor, message) {
    const time  = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');
    entry.className = `game-event-entry ${who}`;
    entry.innerHTML = `
        <span class="game-event-time">${time}</span>
        <span class="game-event-actor ${who}">${escapeHtml(actor)}</span>
        ${message}
    `;
    eventLog?.appendChild(entry);
    if (eventLog) eventLog.scrollTop = eventLog.scrollHeight;
}

/* ============================================================
   API publique window.Game
   ============================================================ */
window.Game = {
    sendEvent: async (type, data = {}) => {
        const formData = new FormData();
        formData.append('game_id',    window.APP.gameId);
        formData.append('event_type', type);
        formData.append('event_data', JSON.stringify(data));
        return fetch(`${window.APP.apiUrl}?action=send_game_event`, {
            method: 'POST', credentials: 'same-origin', body: formData,
        }).then(r => r.json()).catch(console.error);
    },
    getState: () => bgioClient?.getState?.() ?? null,
    getInfo:  () => gameInfo,
    getRole:  () => myRole,
    getMyId:  () => myId,
    onEvent:  null,
};

/* ============================================================
   Démarrage
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
    // ── Étape A : s'assurer que les decks sont visibles ──────────────────
    // Le rendu synchrone top-level a déjà affiché les decks si INITIAL était
    // disponible. Si ce n'est pas le cas (erreur PHP), on tente un fetch direct.
    if (!window.INITIAL_PLAYER_DECKS) {
        loadPlayerDecks(); // Sans await : parallèle avec la suite
    }

    // ── Étape B : initialisation de la partie ─────────────────────────────
    try {
        // 1. Infos de partie (marque le joueur comme connecté)
        const data = await loadGameInfo();
        if (!data) {
            // La partie n'est pas accessible, mais les decks sont déjà affichés
            return;
        }

        const selfReady     = !!gameInfo.self_selected;
        const opponentReady = !!gameInfo.opponent_selected;

        // 2. Canal SSE
        openSSE();
        addLogEntry('server', 'Système', 'Connecté à la table de jeu.');

        // 3. Si les deux ont déjà sélectionné → passer directement à la table
        if (selfReady && opponentReady) {
            transitionToGame();
            return;
        }

        // 4. Machine à états (boardgame.io ou fallback)
        bgioClient = await initStateManager(selfReady, opponentReady);

        // 5. UI si le joueur avait déjà confirmé son deck
        if (selfReady) showSelfConfirmedUI();
        if (opponentReady) updateOpponentStatus(true);

        // 6. Rafraîchir les decks depuis l'API (si pas déjà fait en étape A)
        if (window.INITIAL_PLAYER_DECKS) {
            loadPlayerDecks(); // Refresh en arrière-plan
        }

    } catch (err) {
        console.error('game.js init error:', err);
        addLogEntry('server', 'Système', 'Erreur lors de l\'initialisation. Rechargez la page.');
    }
});