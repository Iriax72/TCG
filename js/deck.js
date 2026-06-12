/**
 * js/decks.js
 * Logique de la page de gestion des decks :
 *  - Chargement de la liste des decks
 *  - Chargement de la grille de toutes les cartes disponibles
 *  - Édition d'un deck (ajout / retrait de cartes)
 *  - Sauvegarde et suppression
 *
 * Dépend de : notifications.js (Toast, escapeHtml, Notifications)
 */

document.addEventListener('DOMContentLoaded', () => {

    /* ============================================================
       Références DOM
       ============================================================ */
    const decksList       = document.getElementById('decks-list');
    const btnNewDeck      = document.getElementById('btn-new-deck');
    const editorPlaceholder = document.getElementById('editor-placeholder');
    const editorActive    = document.getElementById('editor-active');
    const editorTitle     = document.getElementById('editor-title');
    const deckNameInput   = document.getElementById('deck-name');
    const deckTotal       = document.getElementById('deck-total');
    const btnSaveDeck     = document.getElementById('btn-save-deck');
    const deckSaveStatus  = document.getElementById('deck-save-status');
    const cardFilter      = document.getElementById('card-filter');
    const cardGrid        = document.getElementById('card-grid');

    // Modal "decks préconstruits"
    const btnPrebuiltDeck     = document.getElementById('btn-prebuilt-deck');
    const prebuiltOverlay     = document.getElementById('prebuilt-modal-overlay');
    const prebuiltBody        = document.getElementById('prebuilt-modal-body');
    const prebuiltClose       = document.getElementById('prebuilt-modal-close');

    /* ============================================================
       État local de l'éditeur
       ============================================================ */
    let allCardIds   = [];    // Tous les IDs de cartes disponibles (depuis api.php)
    let currentDeckId = 0;    // 0 = nouveau deck
    let deckContents  = {};   // { card_id: quantity }

    /* ============================================================
       Initialisation
       ============================================================ */
    loadCards();
    loadDecks();

    /* ============================================================
       Chargement des cartes disponibles
       ============================================================ */
    async function loadCards() {
        try {
            const res  = await fetch('api.php?action=get_cards', { credentials: 'same-origin' });
            const data = await res.json();
            allCardIds = data.cards || [];
            renderCardGrid(allCardIds);
        } catch (err) {
            console.error('loadCards error:', err);
            cardGrid.innerHTML = '<p class="card-grid-empty">Erreur lors du chargement des cartes.</p>';
        }
    }

    /* ============================================================
       Chargement de la liste des decks
       ============================================================ */
    async function loadDecks() {
        try {
            const res  = await fetch('api.php?action=get_decks', { credentials: 'same-origin' });
            const data = await res.json();
            renderDeckList(data.decks || []);
        } catch (err) {
            console.error('loadDecks error:', err);
            decksList.innerHTML = '<p class="list-empty">Erreur lors du chargement.</p>';
        }
    }

    /* ============================================================
       Affichage de la liste des decks
       ============================================================ */
    function renderDeckList(decks) {
        if (decks.length === 0) {
            decksList.innerHTML = '<p class="list-empty">Aucun deck pour l\'instant.</p>';
            return;
        }

        decksList.innerHTML = '';

        decks.forEach((deck, index) => {
            const item = document.createElement('div');
            item.classList.add('deck-item');
            item.dataset.id = deck.id;
            item.style.animationDelay = `${index * 0.04}s`;

            if (parseInt(deck.id) === currentDeckId) {
                item.classList.add('active');
            }

            const date = new Date(deck.updated_at.replace(' ', 'T'));
            const dateStr = date.toLocaleDateString('fr-FR');

            item.innerHTML = `
                <div class="deck-item-name">${escapeHtml(deck.name)}</div>
                <div class="deck-item-meta">${deck.card_count} carte(s) &bull; ${dateStr}</div>
            `;

            item.addEventListener('click', () => openDeck(deck.id, deck.name));
            decksList.appendChild(item);
        });
    }

    /* ============================================================
       Affichage de la grille de cartes
       ============================================================ */
    function renderCardGrid(cardIds) {
        cardGrid.innerHTML = '';

        if (cardIds.length === 0) {
            cardGrid.innerHTML = '<p class="card-grid-empty">Aucune carte trouvée.</p>';
            return;
        }

        cardIds.forEach((cardId) => {
            const qty = deckContents[cardId] || 0;
            const inDeck = qty > 0;

            const cell = document.createElement('div');
            cell.classList.add('card-cell');
            cell.dataset.cardId = cardId;
            if (inDeck) cell.classList.add('in-deck');

            cell.innerHTML = `
                <img
                    src="assets/cards/${cardId}.webp"
                    alt="Carte ${cardId}"
                    class="card-img"
                    loading="lazy"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                />
                <div class="card-img-placeholder" style="display:none;">
                    #${cardId}
                </div>
                <span class="card-qty-badge">${qty}</span>
                <div class="card-overlay">
                    <button class="card-overlay-btn add"  data-action="add"    data-id="${cardId}" title="Ajouter">+</button>
                    <button class="card-overlay-btn remove" data-action="remove" data-id="${cardId}" title="Retirer">−</button>
                </div>
            `;

            // Gestion des boutons +/-
            cell.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation(); // ne pas propager au clic sur la cellule
                    const id = parseInt(btn.dataset.id);
                    if (btn.dataset.action === 'add') {
                        addCard(id);
                    } else {
                        removeCard(id);
                    }
                });
            });

            // Clic sur la carte elle-même = ajouter
            cell.addEventListener('click', () => addCard(cardId));

            cardGrid.appendChild(cell);
        });
    }

    /* ============================================================
       Filtre de la grille par numéro
       ============================================================ */
    cardFilter.addEventListener('input', () => {
        const q = cardFilter.value.trim();

        const filtered = q === ''
            ? allCardIds
            : allCardIds.filter(id => String(id).includes(q));

        renderCardGrid(filtered);
    });

    /* ============================================================
       Mise à jour d'une cellule de carte sans tout re-rendre
       ============================================================ */
    function updateCardCell(cardId) {
        const qty    = deckContents[cardId] || 0;
        const inDeck = qty > 0;

        const cell = cardGrid.querySelector(`[data-card-id="${cardId}"]`);
        if (!cell) return; // la carte est peut-être filtrée

        cell.classList.toggle('in-deck', inDeck);

        const badge = cell.querySelector('.card-qty-badge');
        if (badge) badge.textContent = qty;
    }

    /* ============================================================
       Mise à jour du compteur total de cartes
       ============================================================ */
    function updateTotal() {
        const total = Object.values(deckContents).reduce((sum, q) => sum + q, 0);
        deckTotal.textContent = total;
    }

    /* ============================================================
       Ajouter une carte au deck
       ============================================================ */
    function addCard(cardId) {
        if (!editorActive.style.display || editorActive.style.display === 'none') return;
        deckContents[cardId] = (deckContents[cardId] || 0) + 1;
        updateCardCell(cardId);
        updateTotal();
    }

    /* ============================================================
       Retirer une carte du deck (minimum 0)
       ============================================================ */
    function removeCard(cardId) {
        if (!deckContents[cardId]) return;
        deckContents[cardId]--;
        if (deckContents[cardId] <= 0) {
            delete deckContents[cardId];
        }
        updateCardCell(cardId);
        updateTotal();
    }

    /* ============================================================
       Ouvrir un deck existant dans l'éditeur
       ============================================================ */
    async function openDeck(deckId, deckName) {
        try {
            const res  = await fetch(`api.php?action=get_deck&deck_id=${deckId}`, { credentials: 'same-origin' });
            const data = await res.json();

            if (data.error) {
                Toast.show(data.error, 'error');
                return;
            }

            currentDeckId = parseInt(deckId);

            // Reconstruire deckContents depuis la réponse
            deckContents = {};
            (data.cards || []).forEach(c => {
                deckContents[parseInt(c.card_id)] = parseInt(c.quantity);
            });

            deckNameInput.value = data.deck.name;
            editorTitle.textContent = 'Éditeur — ' + data.deck.name;

            showEditor();
            renderCardGrid(cardFilter.value.trim() === '' ? allCardIds
                : allCardIds.filter(id => String(id).includes(cardFilter.value.trim())));
            updateTotal();
            highlightActiveDeck(deckId);

        } catch (err) {
            console.error('openDeck error:', err);
            Toast.show('Erreur lors de l\'ouverture du deck.', 'error');
        }
    }

    /* ============================================================
       Nouveau deck vierge
       ============================================================ */
    function newDeck() {
        currentDeckId = 0;
        deckContents  = {};
        deckNameInput.value = '';
        editorTitle.textContent = 'Nouveau Deck';
        showEditor();
        renderCardGrid(allCardIds);
        updateTotal();
        highlightActiveDeck(null);
        deckNameInput.focus();
    }

    btnNewDeck.addEventListener('click', newDeck);

    /* ============================================================
       Afficher / cacher l'éditeur
       ============================================================ */
    function showEditor() {
        editorPlaceholder.style.display = 'none';
        editorActive.style.display      = 'flex';
        clearSaveStatus();
    }

    /* ============================================================
       Marquer le deck actif dans la liste
       ============================================================ */
    function highlightActiveDeck(deckId) {
        document.querySelectorAll('.deck-item').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.id) === parseInt(deckId));
        });
    }

    /* ============================================================
       Sauvegarde du deck
       ============================================================ */
    btnSaveDeck.addEventListener('click', saveDeck);

    async function saveDeck() {
        const name = deckNameInput.value.trim();
        if (!name) {
            setSaveStatus('Donnez un nom à votre deck.', 'error');
            return;
        }

        btnSaveDeck.disabled = true;
        setSaveStatus('Sauvegarde...', '');

        const formData = new FormData();
        formData.append('deck_id', currentDeckId);
        formData.append('name',    name);
        formData.append('cards',   JSON.stringify(deckContents));

        try {
            const res  = await fetch('api.php?action=save_deck', {
                method:      'POST',
                credentials: 'same-origin',
                body:        formData,
            });
            const data = await res.json();

            if (data.success) {
                currentDeckId = data.deck_id;
                editorTitle.textContent = 'Éditeur — ' + name;
                setSaveStatus('Deck sauvegardé !', 'success');
                Toast.show('&#9830; Deck "' + escapeHtml(name) + '" sauvegardé !', 'success');
                await loadDecks(); // Rafraîchir la liste
                highlightActiveDeck(currentDeckId);
            } else {
                setSaveStatus(data.error || 'Erreur lors de la sauvegarde.', 'error');
            }

        } catch (err) {
            console.error('saveDeck error:', err);
            setSaveStatus('Erreur réseau. Réessayez.', 'error');
        } finally {
            btnSaveDeck.disabled = false;
        }
    }

    /* ============================================================
       Suppression du deck courant
       ============================================================ */
    async function deleteDeck() {
        if (currentDeckId === 0) return;

        if (!confirm('Supprimer ce deck ? Cette action est irréversible.')) return;

        const formData = new FormData();
        formData.append('deck_id', currentDeckId);

        try {
            const res  = await fetch('api.php?action=delete_deck', {
                method:      'POST',
                credentials: 'same-origin',
                body:        formData,
            });
            const data = await res.json();

            if (data.success) {
                Toast.show('Deck supprimé.', 'warning');
                currentDeckId = 0;
                deckContents  = {};
                editorPlaceholder.style.display = 'flex';
                editorActive.style.display      = 'none';
                editorTitle.textContent = 'Éditeur de Deck';
                await loadDecks();
            } else {
                Toast.show(data.error || 'Erreur lors de la suppression.', 'error');
            }
        } catch (err) {
            Toast.show('Erreur réseau.', 'error');
        }
    }

    // Bouton supprimer (injecté dynamiquement dans le panel body)
    const btnDelete = document.createElement('button');
    btnDelete.className   = 'btn btn-danger btn-delete-deck';
    btnDelete.id          = 'btn-delete-deck';
    btnDelete.textContent = '✕ Supprimer ce deck';
    btnDelete.addEventListener('click', deleteDeck);
    editorActive.appendChild(btnDelete);

    /* ============================================================
       Utilitaires de statut
       ============================================================ */
    function setSaveStatus(msg, type) {
        deckSaveStatus.textContent = msg;
        deckSaveStatus.className   = 'deck-save-status ' + type;
        if (type === 'success') {
            setTimeout(() => {
                deckSaveStatus.textContent = '';
                deckSaveStatus.className   = 'deck-save-status';
            }, 4000);
        }
    }

    function clearSaveStatus() {
        deckSaveStatus.textContent = '';
        deckSaveStatus.className   = 'deck-save-status';
    }

    /* ============================================================
       Decks préconstruits — ouverture / fermeture de la modal
       ============================================================ */
    btnPrebuiltDeck.addEventListener('click', openPrebuiltModal);
    prebuiltClose.addEventListener('click', closePrebuiltModal);

    // Clic en dehors de la modal → fermer
    prebuiltOverlay.addEventListener('click', (e) => {
        if (e.target === prebuiltOverlay) closePrebuiltModal();
    });

    // Fermer avec Échap
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && prebuiltOverlay.classList.contains('visible')) {
            closePrebuiltModal();
        }
    });

    function openPrebuiltModal() {
        prebuiltOverlay.classList.add('visible');
        loadPrebuiltDecks();
    }

    function closePrebuiltModal() {
        prebuiltOverlay.classList.remove('visible');
    }

    /* ============================================================
       Chargement de la liste des decks préconstruits
       ============================================================ */
    async function loadPrebuiltDecks() {
        prebuiltBody.innerHTML = '<p class="list-empty">Chargement...</p>';

        try {
            const res  = await fetch('api.php?action=get_prebuilt_decks', { credentials: 'same-origin' });
            const data = await res.json();
            renderPrebuiltDecks(data.decks || []);
        } catch (err) {
            console.error('loadPrebuiltDecks error:', err);
            prebuiltBody.innerHTML = '<p class="list-empty">Erreur lors du chargement.</p>';
        }
    }

    /* ============================================================
       Affichage de la liste des decks préconstruits
       ============================================================ */
    function renderPrebuiltDecks(decks) {
        if (decks.length === 0) {
            prebuiltBody.innerHTML = '<p class="list-empty">Aucun deck préconstruit disponible.</p>';
            return;
        }

        prebuiltBody.innerHTML = '';

        decks.forEach((deck) => {
            const item = document.createElement('div');
            item.classList.add('notif-item');

            item.innerHTML = `
                <div class="notif-text">
                    <strong>${escapeHtml(deck.name)}</strong><br />
                    ${escapeHtml(deck.description)}<br />
                    <span style="font-size:0.78rem; color: var(--clr-text-dim);">
                        ${deck.card_count} carte(s)
                    </span>
                </div>
                <div class="notif-actions">
                    <button class="btn btn-success btn-sm" data-action="import" data-index="${deck.index}">
                        &#43; Ajouter
                    </button>
                </div>
            `;

            item.querySelector('[data-action="import"]').addEventListener('click', (e) => {
                importPrebuiltDeck(deck.index, e.currentTarget);
            });

            prebuiltBody.appendChild(item);
        });
    }

    /* ============================================================
       Import d'un deck préconstruit dans la collection de l'utilisateur
       ============================================================ */
    async function importPrebuiltDeck(index, btnElement) {
        btnElement.disabled = true;
        btnElement.textContent = 'Ajout...';

        const formData = new FormData();
        formData.append('index', index);

        try {
            const res  = await fetch('api.php?action=import_prebuilt_deck', {
                method:      'POST',
                credentials: 'same-origin',
                body:        formData,
            });
            const data = await res.json();

            if (data.success) {
                Toast.show('&#9830; ' + escapeHtml(data.message), 'success');
                btnElement.innerHTML = '&#10003; Ajouté';

                // Rafraîchir la liste des decks de l'utilisateur
                await loadDecks();
            } else {
                Toast.show(data.error || 'Erreur lors de l\'import.', 'error');
                btnElement.disabled = false;
                btnElement.innerHTML = '&#43; Ajouter';
            }

        } catch (err) {
            console.error('importPrebuiltDeck error:', err);
            Toast.show('Erreur réseau. Réessayez.', 'error');
            btnElement.disabled = false;
            btnElement.innerHTML = '&#43; Ajouter';
        }
    }

});