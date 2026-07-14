/**
 * js/game.js — Module ES
 *
 * Logique de la table de jeu basée sur boardgame.io (client-side) + PHP/SSE.
 *
 * Architecture :
 *   • boardgame.io  gère la machine à états du jeu (phases, moves) côté client.
 *   • PHP/SSE       synchronise les événements entre les deux navigateurs.
 *   • PHP           stocke l'état secret (deck choisi) sans jamais le révéler.
 *
 * Pont SSE ↔ boardgame.io :
 *   Quand le serveur envoie un événement SSE (ex: deck_confirmed),
 *   on applique le move boardgame.io correspondant pour mettre à jour
 *   la machine à états locale. boardgame.io décide ensuite si la phase
 *   doit se terminer (endIf) et met à jour l'UI via subscribe().
 */

import { Client } from 'https://esm.sh/boardgame.io@0.50.2/client';

/* ============================================================
   Définition du jeu — boardgame.io
   ============================================================ */

/**
 * Machine à états de la partie unTCG.
 *
 * Phase 1 — deckSelection (simultanée pour les deux joueurs) :
 *   • Chaque joueur choisit un deck parmi ses decks.
 *   • Le deck_id est envoyé UNIQUEMENT au serveur PHP (privé).
 *   • boardgame.io ne stocke que les booléens selfReady/opponentReady.
 *   • La phase se termine quand les deux joueurs ont confirmé (endIf).
 *
 * Phase 2 — main (à implémenter) :
 *   • Placeholder pour le jeu lui-même.
 */
const unTCGGame = {
    name: 'unTCG',

    setup: () => ({
        selfReady:     false,  // Ce joueur a confirmé son deck
        opponentReady: false,  // L'adversaire a confirmé son deck (via SSE)
    }),

    phases: {

        /* ------ Phase 1 : sélection du deck ------ */
        deckSelection: {
            start: true,

            moves: {
                /**
                 * Le joueur confirme son deck.
                 * Le deck_id réel est envoyé séparément à PHP via fetch.
                 * Ici on ne stocke que le fait d'être prêt.
                 */
                confirmDeck: ({ G }) => {
                    G.selfReady = true;
                },

                /**
                 * L'adversaire a confirmé son deck (déclenché par un événement SSE).
                 * Appelé depuis le handler SSE 'deck_confirmed', jamais par l'UI.
                 */
                opponentConfirmed: ({ G }) => {
                    G.opponentReady = true;
                },
            },

            /**
             * La phase se termine quand les deux joueurs ont confirmé.
             * boardgame.io appelle endIf après chaque move et transite
             * automatiquement vers la phase 'main' si ça retourne vrai.
             */
            endIf: ({ G }) => {
                if (G.selfReady && G.opponentReady) return true;
            },

            next: 'main',
        },

        /* ------ Phase 2 : jeu principal (placeholder) ------ */
        main: {
            moves: {
                // Les moves du jeu seront définis ici dans une prochaine étape.
                // Exemple futur : playCard, attackCreature, endTurn, etc.
            },
        },
    },
};

/* ============================================================
   Références DOM
   ============================================================ */

// — Phase de sélection —
const phaseDeckSelection  = document.getElementById('phase-deck-selection');
const deckChoiceGrid      = document.getElementById('deck-choice-grid');
const oppStatusDot        = document.getElementById('opp-status-dot');
const oppStatusLabel      = document.getElementById('opp-status-label');
const deckConfirmRow      = document.getElementById('deck-confirm-row');
const btnConfirmDeck      = document.getElementById('btn-confirm-deck');
const selectedDeckName    = document.getElementById('selected-deck-name');
const deckConfirmedMsg    = document.getElementById('deck-confirmed-msg');

// — Table de jeu —
const gameLayout          = document.getElementById('game-layout');
const gameStatusBadge     = document.getElementById('game-status-badge');
const avatarSelf          = document.getElementById('avatar-self');
const nameSelf            = document.getElementById('name-self');
const avatarOpponent      = document.getElementById('avatar-opponent');
const nameOpponent        = document.getElementById('name-opponent');
const connectionOpp       = document.getElementById('connection-opponent');
const eventLog            = document.getElementById('game-event-log');
const sseDot              = document.getElementById('sse-dot');
const sseLabel            = document.getElementById('sse-label');

/* ============================================================
   État local
   ============================================================ */

let gameInfo         = null;   // Données de la partie (get_game_info)
let myRole           = null;   // 'player1' | 'player2'
let myId             = window.APP.currentUserId;
let selectedDeckId   = null;   // Deck sélectionné (non confirmé)
let deckConfirmed    = false;  // Le joueur a confirmé son choix
let eventSource      = null;   // Instance EventSource SSE

/* ============================================================
   Client boardgame.io (singleplayer — état géré localement)
   ============================================================ */

const bgioPlayerID = null; // Défini après loadGameInfo (player1→'0', player2→'1')
let bgioClient     = null; // Initialisé après chargement des infos de partie

/* ============================================================
   Utilitaires généraux
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
    t.innerHTML  = msg;
    container.appendChild(t);
    setTimeout(() => {
        t.style.opacity   = '0';
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
    container.innerHTML  = '';
    container.style.background = '';
    if (avatarPath) {
        const img    = document.createElement('img');
        img.src      = avatarPath;
        img.alt      = username || '?';
        img.onerror  = () => { container.innerHTML = ''; renderInitialAvatar(container, username); };
        container.appendChild(img);
    } else {
        renderInitialAvatar(container, username);
    }
}

function renderInitialAvatar(container, username) {
    container.textContent      = (username?.charAt(0) || '?').toUpperCase();
    container.style.background = usernameToColor(username);
}

/* ============================================================
   Chargement des informations de la partie
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

    // --- Renseigner les bandeaux joueurs ---
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
   Initialisation de boardgame.io
   ============================================================ */

function initBoardgameIO(selfAlreadyReady, opponentAlreadyReady) {
    const playerID = myRole === 'player1' ? '0' : '1';

    bgioClient = Client({
        game:     unTCGGame,
        playerID: playerID,
        debug:    false,      // Désactive le panneau de debug en production
    });

    bgioClient.start();

    // S'abonner aux changements d'état
    bgioClient.subscribe((state) => {
        if (!state) return;
        onBgioStateChange(state.G, state.ctx);
    });

    // Réhydrater l'état si le joueur a déjà sélectionné avant ce chargement de page
    if (selfAlreadyReady) {
        bgioClient.moves.confirmDeck();
        showSelfConfirmedUI();
    }
    if (opponentAlreadyReady) {
        bgioClient.moves.opponentConfirmed();
        updateOpponentStatus(true);
    }
}

/**
 * Appelé à chaque changement d'état boardgame.io.
 * C'est ici que les transitions de phase déclenchent les changements d'UI.
 */
function onBgioStateChange(G, ctx) {
    // La phase 'deckSelection' vient de se terminer → passer à la table de jeu
    if (ctx.phase === 'main') {
        transitionToGame();
    }
}

/* ============================================================
   Phase 1 — Sélection du deck
   ============================================================ */

/** Affiche une liste de decks dans la grille de sélection */
function renderPlayerDeckGrid(decks) {
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
        item.className      = 'deck-choice-item';
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
 * Charge les decks du joueur.
 * Utilise d'abord window.INITIAL_PLAYER_DECKS (pré-chargé par PHP, affichage
 * immédiat sans fetch), puis rafraîchit depuis l'API en arrière-plan.
 */
async function loadPlayerDecks() {
    // Affichage immédiat depuis les données pré-chargées
    if (window.INITIAL_PLAYER_DECKS) {
        renderPlayerDeckGrid(window.INITIAL_PLAYER_DECKS);
    } else {
        deckChoiceGrid.innerHTML = '<p class="list-empty">Chargement...</p>';
    }

    // Rafraîchissement depuis l'API (capture les decks créés après le chargement)
    try {
        const res  = await fetch(`${window.APP.apiUrl}?action=get_decks`, { credentials: 'same-origin' });
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.warn('loadPlayerDecks: réponse non-JSON', text);
            return; // Garder l'affichage pré-chargé
        }
        if (data.error) {
            console.warn('loadPlayerDecks API error:', data.error);
            return;
        }
        renderPlayerDeckGrid(data.decks || []);
    } catch (err) {
        console.warn('loadPlayerDecks fetch error:', err);
        // Le pré-chargement est déjà affiché, pas besoin de message d'erreur
    }
}

/** L'utilisateur clique sur un deck (pré-sélection, pas encore confirmé) */
function selectDeck(deckId, deckName) {
    if (deckConfirmed) return; // Ne rien faire après confirmation

    selectedDeckId = deckId;

    // Mettre en surbrillance l'item sélectionné
    document.querySelectorAll('.deck-choice-item').forEach((el) => {
        el.classList.toggle('selected', parseInt(el.dataset.deckId) === deckId);
    });

    // Afficher la rangée de confirmation
    selectedDeckName.textContent = deckName;
    deckConfirmRow.style.display = 'flex';
    btnConfirmDeck.disabled      = false;
}

/** L'utilisateur clique sur "Confirmer ce deck" */
btnConfirmDeck?.addEventListener('click', async () => {
    if (!selectedDeckId || deckConfirmed) return;

    btnConfirmDeck.disabled     = true;
    btnConfirmDeck.textContent  = 'Envoi...';

    const formData = new FormData();
    formData.append('game_id', window.APP.gameId);
    formData.append('deck_id', selectedDeckId);

    try {
        const res  = await fetch(`${window.APP.apiUrl}?action=game_select_deck`, {
            method:      'POST',
            credentials: 'same-origin',
            body:        formData,
        });
        const data = await res.json();

        if (data.error) {
            showToast(data.error, 'error');
            btnConfirmDeck.disabled    = false;
            btnConfirmDeck.textContent = '✓ Confirmer ce deck';
            return;
        }

        // Confirmer localement dans boardgame.io
        bgioClient.moves.confirmDeck();
        deckConfirmed = true;
        showSelfConfirmedUI();

        addLogEntry('server', 'Système', 'Vous avez confirmé votre deck. En attente de l\'adversaire...');

    } catch (err) {
        console.error('game_select_deck error:', err);
        showToast('Erreur réseau. Réessayez.', 'error');
        btnConfirmDeck.disabled    = false;
        btnConfirmDeck.textContent = '✓ Confirmer ce deck';
    }
});

/** Affiche l'UI post-confirmation pour ce joueur */
function showSelfConfirmedUI() {
    deckConfirmed                = true;

    // Griser les items non sélectionnés
    document.querySelectorAll('.deck-choice-item:not(.selected)').forEach((el) => {
        el.classList.add('disabled');
    });

    // Cacher la rangée de confirmation, afficher le message
    deckConfirmRow.style.display    = 'none';
    deckConfirmedMsg.style.display  = 'block';
}

/** Met à jour le statut de l'adversaire dans l'overlay */
function updateOpponentStatus(ready) {
    if (!oppStatusDot || !oppStatusLabel) return;
    if (ready) {
        oppStatusDot.className   = 'status-dot online';
        oppStatusLabel.textContent = 'Adversaire : deck confirmé ✓';
    } else {
        oppStatusDot.className   = 'status-dot offline';
        oppStatusLabel.textContent = 'Adversaire : en attente de sa sélection...';
    }
}

/* ============================================================
   Transition vers la table de jeu
   ============================================================ */

let transitioned = false; // Garde contre les doubles transitions

function transitionToGame() {
    if (transitioned) return;
    transitioned = true;

    // Animer la disparition de l'overlay
    phaseDeckSelection.style.transition = 'opacity 0.6s ease';
    phaseDeckSelection.style.opacity    = '0';

    setTimeout(() => {
        phaseDeckSelection.style.display = 'none';
        gameLayout.style.display         = 'grid';
        updateGameStatus('active');
        addLogEntry('server', 'Système', 'Les deux joueurs ont choisi leur deck. La partie peut commencer !');
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

    // ---- Événements de partie ----

    /** Partie créée (invitation acceptée) */
    eventSource.addEventListener('game_start', (e) => {
        const d = JSON.parse(e.data);
        addLogEntry('server', 'Système', escapeHtml(d.message || 'La partie a démarré !'));
    });

    /** Les deux joueurs sont connectés à la page */
    eventSource.addEventListener('game_active', (e) => {
        const d = JSON.parse(e.data);
        updateOpponentConnection(true);
        addLogEntry('server', 'Système', escapeHtml(d.message || 'Les deux joueurs sont connectés.'));
    });

    /**
     * Un joueur a confirmé son deck.
     * Le player_id indique QUI a confirmé.
     * Si c'est l'adversaire → appliquer le move boardgame.io opponentConfirmed.
     * Si c'est nous      → on a déjà appliqué confirmDeck() localement.
     */
    eventSource.addEventListener('deck_confirmed', (e) => {
        const d = JSON.parse(e.data);
        if (parseInt(d.player_id) !== parseInt(myId)) {
            // C'est l'adversaire
            bgioClient?.moves.opponentConfirmed();
            updateOpponentStatus(true);
            addLogEntry('server', 'Système', 'L\'adversaire a confirmé son deck.');
        }
    });

    /**
     * Les deux ont confirmé → boardgame.io a déjà déclenché la transition
     * via endIf + subscribe. Ce handler SSE est un filet de sécurité
     * (ex : si subscribe n'a pas encore reçu le dernier état).
     */
    eventSource.addEventListener('all_decks_selected', (e) => {
        const d = JSON.parse(e.data);
        addLogEntry('server', 'Système', escapeHtml(d.message || 'Les deux decks ont été sélectionnés.'));
        transitionToGame(); // Idempotent grâce à la garde `transitioned`
    });

    /** Coup joué (phase main — futur) */
    eventSource.addEventListener('game_move', (e) => {
        const d   = JSON.parse(e.data);
        const who = parseInt(d.player_id) === parseInt(myId) ? 'self' : 'opponent';
        addLogEntry(who, escapeHtml(d.player_name || 'Joueur'), escapeHtml(JSON.stringify(d)));
        window.Game?.onEvent?.('game_move', d);
    });

    /** Action générique */
    eventSource.addEventListener('game_action', (e) => {
        const d   = JSON.parse(e.data);
        const who = parseInt(d.player_id) === parseInt(myId) ? 'self' : 'opponent';
        addLogEntry(who, escapeHtml(d.player_name || 'Joueur'), escapeHtml(d.message || ''));
        window.Game?.onEvent?.('game_action', d);
    });

    /** Fin de partie */
    eventSource.addEventListener('game_end', (e) => {
        const d = JSON.parse(e.data);
        updateGameStatus('finished');
        addLogEntry('server', 'Système', escapeHtml(d.message || 'Partie terminée.'));
        showToast('Partie terminée.', 'warning');
        window.Game?.onEvent?.('game_end', d);
    });

    /** Chat */
    eventSource.addEventListener('game_chat', (e) => {
        const d   = JSON.parse(e.data);
        const who = parseInt(d.player_id) === parseInt(myId) ? 'self' : 'opponent';
        addLogEntry(who, escapeHtml(d.player_name || 'Joueur'), escapeHtml(d.text || ''));
    });
}

/* ============================================================
   Helpers UI — table de jeu
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
    sseDot.className     = `sse-dot ${state}`;
    sseLabel.textContent = label;
}

function addLogEntry(who, actor, message) {
    const time  = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');
    entry.className = `game-event-entry ${who}`;
    entry.innerHTML = `
        <span class="game-event-time">${time}</span>
        <span class="game-event-actor ${who}">${actor}</span>
        ${message}
    `;
    eventLog.appendChild(entry);
    eventLog.scrollTop = eventLog.scrollHeight;
}

/* ============================================================
   API publique window.Game
   Utilisée par la logique de plateau dans les prochaines étapes.
   ============================================================ */

window.Game = {
    /**
     * Envoie un événement de jeu au serveur (puis broadcast via SSE).
     * @param {string} type  — 'game_move' | 'game_action' | 'game_chat' | 'game_end'
     * @param {object} data  — Données libres
     */
    sendEvent: async (type, data = {}) => {
        const formData = new FormData();
        formData.append('game_id',    window.APP.gameId);
        formData.append('event_type', type);
        formData.append('event_data', JSON.stringify(data));

        return fetch(`${window.APP.apiUrl}?action=send_game_event`, {
            method:      'POST',
            credentials: 'same-origin',
            body:        formData,
        }).then(r => r.json()).catch(console.error);
    },

    /** Accès à l'état boardgame.io courant */
    getState: () => bgioClient?.getState() ?? null,

    /** Infos de la partie chargées depuis PHP */
    getInfo: () => gameInfo,
    getRole: () => myRole,
    getMyId: () => myId,

    /**
     * Hook à redéfinir pour recevoir les événements SSE dans le plateau :
     *   window.Game.onEvent = (type, data) => { ... }
     */
    onEvent: null,
};

/* ============================================================
   Démarrage
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {

    try {
        // 1. Charger les infos de partie (marque le joueur comme connecté)
        const data = await loadGameInfo();
        if (!data) return;

        const selfReady     = !!gameInfo.self_selected;
        const opponentReady = !!gameInfo.opponent_selected;

        // 2. Ouvrir le canal SSE
        openSSE();

        addLogEntry('server', 'Système', 'Connecté à la table de jeu.');

        // 3. Si les deux ont déjà sélectionné (page rechargée après la phase), passer directement
        if (selfReady && opponentReady) {
            transitionToGame();
            return;
        }

        // 4. Initialiser boardgame.io et commencer la phase de sélection
        initBoardgameIO(selfReady, opponentReady);

        // 5. Charger les decks du joueur (sauf si déjà confirmé)
        if (!selfReady) {
            await loadPlayerDecks();
        } else {
            // Le joueur avait déjà sélectionné avant ce chargement de page
            showSelfConfirmedUI();
            await loadPlayerDecks(); // Charger quand même pour afficher quel deck était choisi
        }

    } catch (err) {
        console.error('game.js init error:', err);
        addLogEntry('server', 'Système', 'Erreur lors de l\'initialisation. Rechargez la page.');
    }

});