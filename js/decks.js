/**
 * js/decks.js
 * Logique de la page de gestion des decks :
 *  - Chargement et affichage de la liste des decks
 *  - Grille de toutes les cartes disponibles
 *  - Édition d'un deck (ajout / retrait de cartes)
 *  - Vue détail d'une carte (plein écran, +/-, navigation prev/next)
 *  - Sauvegarde et suppression
 *  - Decks préconstruits
 *
 * Dépend de : notifications.js (Toast, escapeHtml, Notifications)
 */

document.addEventListener('DOMContentLoaded', () => {

    /* ============================================================
       Références DOM — éditeur
       ============================================================ */
    const decksList         = document.getElementById('decks-list');
    const btnNewDeck        = document.getElementById('btn-new-deck');
    const editorPlaceholder = document.getElementById('editor-placeholder');
    const editorActive      = document.getElementById('editor-active');
    const editorTitle       = document.getElementById('editor-title');
    const deckNameInput     = document.getElementById('deck-name');
    const deckTotal         = document.getElementById('deck-total');
    const btnSaveDeck       = document.getElementById('btn-save-deck');
    const deckSaveStatus    = document.getElementById('deck-save-status');
    const cardFilter        = document.getElementById('card-filter');
    const cardGrid          = document.getElementById('card-grid');
    const btnDeleteDeck     = document.getElementById('btn-delete-deck');

    /* ============================================================
       Références DOM — modal détail carte
       ============================================================ */
    const cardDetailOverlay = document.getElementById('card-detail-overlay');
    const cardDetailImg     = document.getElementById('card-detail-img');
    const cardDetailId      = document.getElementById('card-detail-id');
    const cardDetailQty     = document.getElementById('card-detail-qty');
    const btnDetailClose    = document.getElementById('card-detail-close');
    const btnDetailPrev     = document.getElementById('card-detail-prev');
    const btnDetailNext     = document.getElementById('card-detail-next');
    const btnDetailAdd      = document.getElementById('card-detail-add');
    const btnDetailRemove   = document.getElementById('card-detail-remove');

    /* ============================================================
       Références DOM — modal decks préconstruits
       ============================================================ */
    const btnPrebuiltDeck = document.getElementById('btn-prebuilt-deck');
    const prebuiltOverlay = document.getElementById('prebuilt-modal-overlay');
    const prebuiltBody    = document.getElementById('prebuilt-modal-body');
    const prebuiltClose   = document.getElementById('prebuilt-modal-close');

    /* ============================================================
       État local
       ============================================================ */
    let allCardIds        = [];  // Tous les IDs de cartes disponibles
    let currentFilteredIds = []; // Cartes actuellement visibles dans la grille
    let currentDetailIndex = 0;  // Index dans currentFilteredIds de la carte affichée
    let currentDeckId     = 0;   // 0 = nouveau deck non sauvegardé
    let deckContents      = {};  // { card_id: quantity }

    /* ============================================================
       Désactiver le filtre le temps du chargement
       ============================================================ */
    cardFilter.disabled = true;
    cardFilter.placeholder = 'Chargement des cartes...';

    /* ============================================================
       Initialisation
       ============================================================ */
    // Affichage immédiat avec les données pré-chargées par PHP (pas de fetch)
    if (window.INITIAL_DECKS && window.INITIAL_DECKS.length > 0) {
        renderDeckList(window.INITIAL_DECKS);
    }

    loadCards();
    // loadDecks() rafraîchit la liste en arrière-plan pour refléter
    // d'éventuelles modifications depuis le chargement de la page
    loadDecks();

    /* ============================================================
       Chargement des cartes disponibles (sans authentification)
       ============================================================ */
    async function loadCards() {
        try {
            const res  = await fetch('api.php?action=get_cards');
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (parseErr) {
                console.error('loadCards JSON parse error:', parseErr, '— Response:', text);
                cardGrid.innerHTML = '<p class="card-grid-empty">Erreur lors du chargement des cartes.</p>';
                return;
            }

            allCardIds = data.cards || [];
            cardFilter.disabled = false;
            cardFilter.placeholder = 'Filtrer par numéro de carte...';
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
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (parseErr) {
                console.error('loadDecks JSON parse error:', parseErr, '— Response:', text);
                return; // Ne pas écraser l'affichage pré-chargé si le fetch échoue
            }
            if (data.error) {
                console.warn('loadDecks API error:', data.error);
                return; // Idem : garder l'affichage pré-chargé
            }
            renderDeckList(data.decks || []);
        } catch (err) {
            console.error('loadDecks fetch error:', err);
            // On ne touche pas à decksList si des données pré-chargées sont déjà affichées
            if (!window.INITIAL_DECKS || window.INITIAL_DECKS.length === 0) {
                if (decksList) decksList.innerHTML = '<p class="list-empty">Impossible de charger vos decks.</p>';
            }
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

            // Formatage de date robuste (updated_at peut être null sur certains serveurs)
            let dateStr = '';
            if (deck.updated_at) {
                try {
                    dateStr = new Date(deck.updated_at.replace(' ', 'T')).toLocaleDateString('fr-FR');
                } catch (e) {
                    dateStr = deck.updated_at;
                }
            }

            item.innerHTML = `
                <div class="deck-item-name">${escapeHtml(deck.name)}</div>
                <div class="deck-item-meta">${deck.card_count} carte(s)${dateStr ? ' &bull; ' + dateStr : ''}</div>
            `;

            item.addEventListener('click', () => openDeck(deck.id, deck.name));
            decksList.appendChild(item);
        });
    }

    /* ============================================================
       Affichage de la grille de cartes
       — Cliquer sur une carte ouvre la vue détail (plus d'incrément direct)
       ============================================================ */
    function renderCardGrid(cardIds) {
        // Mettre à jour la liste filtrée courante pour la navigation prev/next
        currentFilteredIds = [...cardIds];

        cardGrid.innerHTML = '';

        if (cardIds.length === 0) {
            const msg = allCardIds.length === 0
                ? 'Aucune carte disponible. Vérifiez que le dossier assets/cards/ contient des fichiers .webp.'
                : 'Aucune carte ne correspond à ce filtre.';
            cardGrid.innerHTML = `<p class="card-grid-empty">${msg}</p>`;
            return;
        }

        cardIds.forEach((cardId, index) => {
            const qty    = deckContents[cardId] || 0;
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
                <div class="card-img-placeholder" style="display:none;">#${cardId}</div>
                <span class="card-qty-badge">${qty}</span>
            `;

            // Clic sur la carte → ouvrir la vue détail
            cell.addEventListener('click', () => openCardDetail(index));

            cardGrid.appendChild(cell);
        });
    }

    /* ============================================================
       Mise à jour d'une cellule dans la grille (sans tout re-rendre)
       ============================================================ */
    function updateCardCell(cardId) {
        const qty    = deckContents[cardId] || 0;
        const inDeck = qty > 0;
        const cell   = cardGrid.querySelector(`[data-card-id="${cardId}"]`);
        if (!cell) return;
        cell.classList.toggle('in-deck', inDeck);
        const badge = cell.querySelector('.card-qty-badge');
        if (badge) badge.textContent = qty;
    }

    /* ============================================================
       Mise à jour du compteur total de cartes dans le deck
       ============================================================ */
    function updateTotal() {
        const total = Object.values(deckContents).reduce((sum, q) => sum + q, 0);
        deckTotal.textContent = total;
    }

    /* ============================================================
       Filtre de la grille par numéro
       ============================================================ */
    cardFilter.addEventListener('input', () => {
        const q        = cardFilter.value.trim();
        const filtered = q === ''
            ? allCardIds
            : allCardIds.filter(id => String(id).includes(q));
        renderCardGrid(filtered);
    });

    /* ============================================================
       Vue détail d'une carte
       ============================================================ */

    /** Ouvre la vue détail pour la carte à l'index donné dans currentFilteredIds */
    function openCardDetail(index) {
        if (!editorActive.style.display || editorActive.style.display === 'none') return;
        if (currentFilteredIds.length === 0) return;

        currentDetailIndex = index;
        renderCardDetail();
        cardDetailOverlay.classList.add('visible');
    }

    /** Met à jour le contenu de la vue détail */
    function renderCardDetail() {
        const cardId = currentFilteredIds[currentDetailIndex];
        if (cardId === undefined) return;

        // Image
        cardDetailImg.src = `assets/cards/${cardId}.webp`;
        cardDetailImg.alt = `Carte ${cardId}`;

        // ID affiché
        cardDetailId.textContent = `#${cardId}`;

        // Quantité dans le deck
        cardDetailQty.textContent = deckContents[cardId] || 0;

        // Navigation : désactiver les flèches aux extrémités
        btnDetailPrev.disabled = currentDetailIndex <= 0;
        btnDetailNext.disabled = currentDetailIndex >= currentFilteredIds.length - 1;
    }

    /** Ferme la vue détail */
    function closeCardDetail() {
        cardDetailOverlay.classList.remove('visible');
    }

    // Fermer avec le bouton X
    btnDetailClose.addEventListener('click', closeCardDetail);

    // Fermer avec Échap
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && cardDetailOverlay.classList.contains('visible')) {
            closeCardDetail();
        }
        // Navigation clavier dans la vue détail
        if (cardDetailOverlay.classList.contains('visible')) {
            if (e.key === 'ArrowLeft'  && !btnDetailPrev.disabled) navigateDetail(-1);
            if (e.key === 'ArrowRight' && !btnDetailNext.disabled) navigateDetail(+1);
        }
    });

    // Navigation prev / next
    btnDetailPrev.addEventListener('click', () => navigateDetail(-1));
    btnDetailNext.addEventListener('click', () => navigateDetail(+1));

    function navigateDetail(direction) {
        const newIndex = currentDetailIndex + direction;
        if (newIndex < 0 || newIndex >= currentFilteredIds.length) return;
        currentDetailIndex = newIndex;
        renderCardDetail();
    }

    // Ajouter une copie depuis la vue détail
    btnDetailAdd.addEventListener('click', () => {
        const cardId = currentFilteredIds[currentDetailIndex];
        if (cardId === undefined) return;
        deckContents[cardId] = (deckContents[cardId] || 0) + 1;
        updateCardCell(cardId);
        updateTotal();
        cardDetailQty.textContent = deckContents[cardId];
    });

    // Retirer une copie depuis la vue détail
    btnDetailRemove.addEventListener('click', () => {
        const cardId = currentFilteredIds[currentDetailIndex];
        if (!cardId || !deckContents[cardId]) return;
        deckContents[cardId]--;
        if (deckContents[cardId] <= 0) delete deckContents[cardId];
        updateCardCell(cardId);
        updateTotal();
        cardDetailQty.textContent = deckContents[cardId] || 0;
    });

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

            deckContents = {};
            (data.cards || []).forEach(c => {
                deckContents[parseInt(c.card_id)] = parseInt(c.quantity);
            });

            deckNameInput.value     = data.deck.name;
            editorTitle.textContent = 'Éditeur — ' + data.deck.name;

            showEditor();
            renderCardGrid(cardFilter.value.trim() === ''
                ? allCardIds
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
        deckNameInput.value     = '';
        editorTitle.textContent = 'Nouveau Deck';
        showEditor();
        renderCardGrid(allCardIds);
        updateTotal();
        highlightActiveDeck(null);
        deckNameInput.focus();
    }

    btnNewDeck.addEventListener('click', newDeck);

    /* ============================================================
       Afficher l'éditeur
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
                currentDeckId           = data.deck_id;
                editorTitle.textContent = 'Éditeur — ' + name;
                setSaveStatus('Deck sauvegardé !', 'success');
                Toast.show('&#9830; Deck "' + escapeHtml(name) + '" sauvegardé !', 'success');
                await loadDecks();
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
       — Si le deck n'a pas encore été sauvegardé (currentDeckId === 0),
         on ferme simplement l'éditeur sans appel serveur.
       ============================================================ */
    btnDeleteDeck.addEventListener('click', deleteDeck);

    async function deleteDeck() {
        // Deck non sauvegardé : fermer l'éditeur sans appel serveur
        if (currentDeckId === 0) {
            currentDeckId = 0;
            deckContents  = {};
            editorPlaceholder.style.display = 'flex';
            editorActive.style.display      = 'none';
            editorTitle.textContent = 'Éditeur de Deck';
            return;
        }

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

    /* ============================================================
       Modal decks préconstruits
       ============================================================ */
    btnPrebuiltDeck.addEventListener('click', openPrebuiltModal);
    prebuiltClose.addEventListener('click',   closePrebuiltModal);

    prebuiltOverlay.addEventListener('click', (e) => {
        if (e.target === prebuiltOverlay) closePrebuiltModal();
    });

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
                    <span style="font-size:0.78rem; color:var(--clr-text-dim);">${deck.card_count} carte(s)</span>
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

    async function importPrebuiltDeck(index, btnElement) {
        btnElement.disabled     = true;
        btnElement.textContent  = 'Ajout...';

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
                await loadDecks();
            } else {
                Toast.show(data.error || 'Erreur lors de l\'import.', 'error');
                btnElement.disabled  = false;
                btnElement.innerHTML = '&#43; Ajouter';
            }
        } catch (err) {
            console.error('importPrebuiltDeck error:', err);
            Toast.show('Erreur réseau. Réessayez.', 'error');
            btnElement.disabled  = false;
            btnElement.innerHTML = '&#43; Ajouter';
        }
    }

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

});