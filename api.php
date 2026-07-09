<?php
/**
 * api.php
 * Point d'entrée pour toutes les requêtes AJAX de l'application.
 * Toutes les réponses sont en JSON.
 *
 * Actions disponibles (paramètre GET/POST "action") :
 *   - search_users       : recherche de joueurs par pseudo
 *   - send_invitation    : envoyer une demande de partie
 *   - respond_invitation : accepter ou refuser une invitation
 *   - get_notifications  : récupérer les invitations en attente reçues
 *   - get_sent           : récupérer les invitations envoyées
 *   - update_profile     : mettre à jour pseudo et bio
 *   - get_profile        : récupérer les données de profil
 */

// --- Suppression des erreurs PHP et tampon de sortie ---
// Sans cela, un warning PHP corrompt la réponse JSON (SyntaxError côté JS).
ini_set('display_errors', '0');
error_reporting(0);
ob_start();

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth.php';

// --- En-têtes JSON ---
header('Content-Type: application/json; charset=utf-8');

$action = $_REQUEST['action'] ?? '';

// --- get_cards est public : les IDs de cartes ne sont pas des données sensibles.
// Traité avant la vérification d'authentification pour éviter tout problème de session.
if ($action === 'get_cards') {
    $cardsDir = __DIR__ . '/assets/cards/';
    $cardIds  = [];

    if (is_dir($cardsDir)) {
        foreach (scandir($cardsDir) as $file) {
            // On ne garde que les fichiers .webp dont le nom est un entier positif
            if (preg_match('/^(\d+)\.webp$/i', $file, $m)) {
                $cardIds[] = (int) $m[1];
            }
        }
        sort($cardIds);
    }

    echo json_encode(['cards' => $cardIds]);
    exit;
}

// --- Mise à jour du statut "en ligne" ---
updateLastSeen();

// --- Toutes les autres actions nécessitent d'être connecté ---
if (!isLoggedIn()) {
    http_response_code(401);
    echo json_encode(['error' => 'Non authentifié.']);
    exit;
}

try {

switch ($action) {

    // ------------------------------------------------------------------
    // Recherche de joueurs par pseudo (hors soi-même)
    // Paramètres : q (chaîne de recherche)
    // ------------------------------------------------------------------
    case 'search_users':
        $q = trim($_GET['q'] ?? '');

        if (strlen($q) < 2) {
            echo json_encode(['users' => []]);
            exit;
        }

        $pdo  = getDB();
        $self = getCurrentUserId();

        // Un joueur est considéré "en ligne" s'il a été vu dans les 2 dernières minutes
        $stmt = $pdo->prepare("
            SELECT
                id,
                username,
                avatar_path,
                (last_seen >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)) AS online
            FROM users
            WHERE username LIKE :q
              AND id != :self
            ORDER BY username
            LIMIT 20
        ");
        $stmt->execute([':q' => '%' . $q . '%', ':self' => $self]);
        $users = $stmt->fetchAll();

        echo json_encode(['users' => $users]);
        break;

    // ------------------------------------------------------------------
    // Envoyer une invitation de partie
    // Paramètres : to_user_id
    // ------------------------------------------------------------------
    case 'send_invitation':
        $toId = (int) ($_POST['to_user_id'] ?? 0);
        $from = getCurrentUserId();

        if ($toId <= 0 || $toId === $from) {
            echo json_encode(['error' => 'Destinataire invalide.']);
            exit;
        }

        $pdo = getDB();

        // Vérifier que le destinataire existe
        $stmt = $pdo->prepare("SELECT id FROM users WHERE id = :id");
        $stmt->execute([':id' => $toId]);
        if (!$stmt->fetch()) {
            echo json_encode(['error' => 'Joueur introuvable.']);
            exit;
        }

        // Vérifier qu'il n'y a pas déjà une invitation en attente entre ces deux joueurs
        $stmt = $pdo->prepare("
            SELECT id FROM invitations
            WHERE from_user_id = :from
              AND to_user_id   = :to
              AND status       = 'pending'
        ");
        $stmt->execute([':from' => $from, ':to' => $toId]);
        if ($stmt->fetch()) {
            echo json_encode(['error' => 'Une invitation est déjà en attente pour ce joueur.']);
            exit;
        }

        // Insérer l'invitation
        $stmt = $pdo->prepare("
            INSERT INTO invitations (from_user_id, to_user_id)
            VALUES (:from, :to)
        ");
        $stmt->execute([':from' => $from, ':to' => $toId]);

        echo json_encode(['success' => true, 'message' => 'Invitation envoyée !']);
        break;

    // ------------------------------------------------------------------
    // Répondre à une invitation (accepter ou refuser)
    // Paramètres : invitation_id, response ('accepted' | 'declined')
    // ------------------------------------------------------------------
    case 'respond_invitation':
        $invId    = (int) ($_POST['invitation_id'] ?? 0);
        $response = $_POST['response'] ?? '';
        $userId   = getCurrentUserId();

        if ($invId <= 0 || !in_array($response, ['accepted', 'declined'])) {
            echo json_encode(['error' => 'Paramètres invalides.']);
            exit;
        }

        $pdo = getDB();

        // Vérifier que cette invitation appartient bien à l'utilisateur courant
        $stmt = $pdo->prepare("
            SELECT id FROM invitations
            WHERE id         = :id
              AND to_user_id = :uid
              AND status     = 'pending'
        ");
        $stmt->execute([':id' => $invId, ':uid' => $userId]);
        if (!$stmt->fetch()) {
            echo json_encode(['error' => 'Invitation introuvable ou déjà traitée.']);
            exit;
        }

        // Mettre à jour le statut
        $stmt = $pdo->prepare("
            UPDATE invitations SET status = :status WHERE id = :id
        ");
        $stmt->execute([':status' => $response, ':id' => $invId]);

        $gameId = null;

        if ($response === 'accepted') {
            // Récupérer les deux joueurs depuis l'invitation
            $stmt = $pdo->prepare("SELECT from_user_id, to_user_id FROM invitations WHERE id = :id");
            $stmt->execute([':id' => $invId]);
            $inv = $stmt->fetch();

            // Créer la partie (player1 = expéditeur, player2 = acceptant)
            $stmt = $pdo->prepare("
                INSERT INTO games (invitation_id, player1_id, player2_id)
                VALUES (:inv_id, :p1, :p2)
            ");
            $stmt->execute([
                ':inv_id' => $invId,
                ':p1'     => $inv['from_user_id'],
                ':p2'     => $inv['to_user_id'],
            ]);
            $gameId = (int) $pdo->lastInsertId();

            // Insérer l'événement de démarrage (visible par les deux via SSE)
            $stmt = $pdo->prepare("
                INSERT INTO game_events (game_id, player_id, event_type, event_data)
                VALUES (:gid, NULL, 'game_start', :data)
            ");
            $stmt->execute([
                ':gid'  => $gameId,
                ':data' => json_encode(['message' => 'La partie commence !']),
            ]);
        }

        $msg = ($response === 'accepted') ? 'Partie acceptée !' : 'Invitation refusée.';
        echo json_encode([
            'success'  => true,
            'message'  => $msg,
            'response' => $response,
            'game_id'  => $gameId,   // null si refusé
        ]);
        break;

    // ------------------------------------------------------------------
    // Récupérer les invitations reçues en attente (pour notifications)
    // ------------------------------------------------------------------
    case 'get_notifications':
        $pdo    = getDB();
        $userId = getCurrentUserId();

        $stmt = $pdo->prepare("
            SELECT
                i.id,
                u.username AS from_username,
                i.created_at
            FROM invitations i
            JOIN users u ON u.id = i.from_user_id
            WHERE i.to_user_id = :uid
              AND i.status     = 'pending'
            ORDER BY i.created_at DESC
        ");
        $stmt->execute([':uid' => $userId]);
        $notifications = $stmt->fetchAll();

        // Vérifier si le joueur a une partie en attente de redirection.
        // On marque le joueur comme ayant rejoint pour éviter les boucles.
        $pendingGameId = null;
        $stmt = $pdo->prepare("
            SELECT id,
                   CASE WHEN player1_id = :uid THEN 'player1' ELSE 'player2' END AS role
            FROM games
            WHERE (player1_id = :uid2 OR player2_id = :uid3)
              AND status = 'waiting'
              AND (
                  (player1_id = :uid4 AND player1_joined = 0)
                  OR (player2_id = :uid5 AND player2_joined = 0)
              )
            ORDER BY created_at DESC
            LIMIT 1
        ");
        $stmt->execute([
            ':uid'  => $userId, ':uid2' => $userId, ':uid3' => $userId,
            ':uid4' => $userId, ':uid5' => $userId,
        ]);
        $pendingGame = $stmt->fetch();

        if ($pendingGame) {
            $pendingGameId = $pendingGame['id'];
            $col = ($pendingGame['role'] === 'player1') ? 'player1_joined' : 'player2_joined';
            $pdo->prepare("UPDATE games SET $col = 1 WHERE id = :id")
                ->execute([':id' => $pendingGameId]);
        }

        echo json_encode([
            'notifications' => $notifications,
            'game_redirect'  => $pendingGameId,
        ]);
        break;

    // ------------------------------------------------------------------
    // Récupérer les invitations envoyées (pour affichage dans le menu)
    // ------------------------------------------------------------------
    case 'get_sent':
        $pdo    = getDB();
        $userId = getCurrentUserId();

        $stmt = $pdo->prepare("
            SELECT
                i.id,
                u.username AS to_username,
                i.status,
                i.updated_at
            FROM invitations i
            JOIN users u ON u.id = i.to_user_id
            WHERE i.from_user_id = :uid
            ORDER BY i.created_at DESC
            LIMIT 20
        ");
        $stmt->execute([':uid' => $userId]);
        $sent = $stmt->fetchAll();

        echo json_encode(['sent' => $sent]);
        break;

    // ------------------------------------------------------------------
    // Mettre à jour le profil (pseudo + bio)
    // Paramètres POST : username, bio
    // ------------------------------------------------------------------
    case 'update_profile':
        $userId  = getCurrentUserId();
        $pdo     = getDB();

        $newUsername = trim($_POST['username'] ?? '');
        $newBio      = trim($_POST['bio']      ?? '');

        // Récupérer le pseudo actuel
        $stmt = $pdo->prepare("SELECT username FROM users WHERE id = :id");
        $stmt->execute([':id' => $userId]);
        $current = $stmt->fetch();

        if ($newUsername !== '' && $newUsername !== $current['username']) {
            if (strlen($newUsername) < 3 || strlen($newUsername) > 32) {
                echo json_encode(['error' => 'Le pseudo doit contenir entre 3 et 32 caractères.']);
                exit;
            }
            if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $newUsername)) {
                echo json_encode(['error' => 'Le pseudo ne peut contenir que des lettres, chiffres, _ et -.']);
                exit;
            }
            // Vérifier l'unicité
            $stmt = $pdo->prepare("SELECT id FROM users WHERE username = :u AND id != :id");
            $stmt->execute([':u' => $newUsername, ':id' => $userId]);
            if ($stmt->fetch()) {
                echo json_encode(['error' => 'Ce pseudo est déjà utilisé.']);
                exit;
            }
        } else {
            // Conserver le pseudo actuel si non modifié
            $newUsername = $current['username'];
        }

        // Troncature de la bio (max 500 caractères)
        $newBio = mb_substr($newBio, 0, 500);

        $stmt = $pdo->prepare("UPDATE users SET username = :u, bio = :b WHERE id = :id");
        $stmt->execute([':u' => $newUsername, ':b' => $newBio, ':id' => $userId]);

        // Mettre à jour la session si le pseudo a changé
        $_SESSION['username'] = $newUsername;

        echo json_encode(['success' => true, 'username' => $newUsername, 'message' => 'Profil mis à jour.']);
        break;

    // ------------------------------------------------------------------
    // Récupérer les données de profil de l'utilisateur connecté
    // ------------------------------------------------------------------
    case 'get_profile':
        $userId = getCurrentUserId();
        $pdo    = getDB();

        $stmt = $pdo->prepare("SELECT username, bio, avatar_path FROM users WHERE id = :id");
        $stmt->execute([':id' => $userId]);
        $profile = $stmt->fetch();

        echo json_encode(['profile' => $profile]);
        break;

    // ------------------------------------------------------------------
    // Retourner la liste des IDs de cartes disponibles
    // PHP lit le dossier /assets/cards/ et retourne les IDs trouvés.
    // Extensible sans modification de code : ajouter des .webp suffit.
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // Lister les decks de l'utilisateur connecté
    // ------------------------------------------------------------------
    case 'get_decks':
        $userId = getCurrentUserId();
        $pdo    = getDB();

        // On récupère aussi le nombre de cartes (toutes copies confondues) pour affichage
        $stmt = $pdo->prepare("
            SELECT
                d.id,
                d.name,
                d.updated_at,
                COALESCE(SUM(dc.quantity), 0) AS card_count
            FROM decks d
            LEFT JOIN deck_cards dc ON dc.deck_id = d.id
            WHERE d.user_id = :uid
            GROUP BY d.id, d.name, d.updated_at
            ORDER BY d.updated_at DESC
        ");
        $stmt->execute([':uid' => $userId]);
        $decks = $stmt->fetchAll();

        echo json_encode(['decks' => $decks]);
        break;

    // ------------------------------------------------------------------
    // Récupérer le détail d'un deck (nom + liste des cartes)
    // Paramètres GET : deck_id
    // ------------------------------------------------------------------
    case 'get_deck':
        $deckId = (int) ($_GET['deck_id'] ?? 0);
        $userId = getCurrentUserId();
        $pdo    = getDB();

        // Vérifier que ce deck appartient à l'utilisateur
        $stmt = $pdo->prepare("SELECT id, name FROM decks WHERE id = :id AND user_id = :uid");
        $stmt->execute([':id' => $deckId, ':uid' => $userId]);
        $deck = $stmt->fetch();

        if (!$deck) {
            echo json_encode(['error' => 'Deck introuvable.']);
            exit;
        }

        $stmt = $pdo->prepare("SELECT card_id, quantity FROM deck_cards WHERE deck_id = :id");
        $stmt->execute([':id' => $deckId]);
        $cards = $stmt->fetchAll();

        echo json_encode(['deck' => $deck, 'cards' => $cards]);
        break;

    // ------------------------------------------------------------------
    // Créer ou mettre à jour un deck
    // Paramètres POST : deck_id (0 = nouveau), name, cards (JSON)
    // cards est un objet { card_id: quantity, ... }
    // ------------------------------------------------------------------
    case 'save_deck':
        $userId  = getCurrentUserId();
        $pdo     = getDB();
        $deckId  = (int) ($_POST['deck_id'] ?? 0);
        $name    = trim($_POST['name'] ?? '');
        $cardsJson = $_POST['cards'] ?? '{}';

        if ($name === '') {
            echo json_encode(['error' => 'Le deck doit avoir un nom.']);
            exit;
        }
        if (mb_strlen($name) > 64) {
            echo json_encode(['error' => 'Le nom du deck ne peut pas dépasser 64 caractères.']);
            exit;
        }

        // Décoder et valider la liste de cartes
        $cardsRaw = json_decode($cardsJson, true);
        if (!is_array($cardsRaw)) {
            echo json_encode(['error' => 'Liste de cartes invalide.']);
            exit;
        }

        // Nettoyer : ne garder que les card_id entiers positifs avec quantity >= 1
        $cards = [];
        foreach ($cardsRaw as $cardId => $qty) {
            $cardId = (int) $cardId;
            $qty    = (int) $qty;
            if ($cardId > 0 && $qty > 0) {
                $cards[$cardId] = $qty;
            }
        }

        $pdo->beginTransaction();
        try {
            if ($deckId > 0) {
                // Mise à jour d'un deck existant — vérifier la propriété
                $stmt = $pdo->prepare("SELECT id FROM decks WHERE id = :id AND user_id = :uid");
                $stmt->execute([':id' => $deckId, ':uid' => $userId]);
                if (!$stmt->fetch()) {
                    $pdo->rollBack();
                    echo json_encode(['error' => 'Deck introuvable.']);
                    exit;
                }
                $stmt = $pdo->prepare("UPDATE decks SET name = :name, updated_at = NOW() WHERE id = :id");
                $stmt->execute([':name' => $name, ':id' => $deckId]);
            } else {
                // Nouveau deck
                $stmt = $pdo->prepare("INSERT INTO decks (user_id, name) VALUES (:uid, :name)");
                $stmt->execute([':uid' => $userId, ':name' => $name]);
                $deckId = (int) $pdo->lastInsertId();
            }

            // Remplacer toutes les cartes du deck (supprimer puis réinsérer)
            $pdo->prepare("DELETE FROM deck_cards WHERE deck_id = :id")->execute([':id' => $deckId]);

            if (!empty($cards)) {
                $stmt = $pdo->prepare("
                    INSERT INTO deck_cards (deck_id, card_id, quantity)
                    VALUES (:deck_id, :card_id, :qty)
                ");
                foreach ($cards as $cardId => $qty) {
                    $stmt->execute([':deck_id' => $deckId, ':card_id' => $cardId, ':qty' => $qty]);
                }
            }

            $pdo->commit();
            echo json_encode(['success' => true, 'deck_id' => $deckId, 'message' => 'Deck sauvegardé !']);

        } catch (Throwable $e) {
            $pdo->rollBack();
            echo json_encode(['error' => 'Erreur lors de la sauvegarde : ' . $e->getMessage()]);
        }
        break;

    // ------------------------------------------------------------------
    // Supprimer un deck
    // Paramètres POST : deck_id
    // ------------------------------------------------------------------
    case 'delete_deck':
        $deckId = (int) ($_POST['deck_id'] ?? 0);
        $userId = getCurrentUserId();
        $pdo    = getDB();

        $stmt = $pdo->prepare("SELECT id FROM decks WHERE id = :id AND user_id = :uid");
        $stmt->execute([':id' => $deckId, ':uid' => $userId]);
        if (!$stmt->fetch()) {
            echo json_encode(['error' => 'Deck introuvable.']);
            exit;
        }

        // Les deck_cards sont supprimés en cascade (FK ON DELETE CASCADE)
        $pdo->prepare("DELETE FROM decks WHERE id = :id")->execute([':id' => $deckId]);

        echo json_encode(['success' => true, 'message' => 'Deck supprimé.']);
        break;

    // ------------------------------------------------------------------
    // Récupérer les informations d'une partie (joueurs, statut)
    // Paramètres GET : game_id
    // Marque automatiquement le joueur comme connecté (joined).
    // Si les deux joueurs sont connectés, passe la partie en 'active'.
    // ------------------------------------------------------------------
    case 'get_game_info':
        $gameId = (int) ($_GET['game_id'] ?? 0);
        $userId = getCurrentUserId();
        $pdo    = getDB();

        $stmt = $pdo->prepare("
            SELECT g.*,
                   u1.username    AS player1_name,
                   u1.avatar_path AS player1_avatar,
                   u2.username    AS player2_name,
                   u2.avatar_path AS player2_avatar
            FROM games g
            JOIN users u1 ON u1.id = g.player1_id
            JOIN users u2 ON u2.id = g.player2_id
            WHERE g.id = :gid
              AND (g.player1_id = :uid OR g.player2_id = :uid)
        ");
        $stmt->execute([':gid' => $gameId, ':uid' => $userId]);
        $game = $stmt->fetch();

        if (!$game) {
            echo json_encode(['error' => 'Partie introuvable.']);
            exit;
        }

        $role = ($game['player1_id'] == $userId) ? 'player1' : 'player2';

        // Marquer le joueur comme connecté
        $col = ($role === 'player1') ? 'player1_joined' : 'player2_joined';
        if (!$game[$col]) {
            $pdo->prepare("UPDATE games SET $col = 1 WHERE id = :id")
                ->execute([':id' => $gameId]);
            $game[$col] = 1;
        }

        // Si les deux joueurs sont connectés → passer en active
        if ($game['player1_joined'] && $game['player2_joined'] && $game['status'] === 'waiting') {
            $pdo->prepare("UPDATE games SET status = 'active' WHERE id = :id")
                ->execute([':id' => $gameId]);
            $game['status'] = 'active';
            $pdo->prepare("
                INSERT INTO game_events (game_id, player_id, event_type, event_data)
                VALUES (:gid, NULL, 'game_active', :data)
            ")->execute([
                ':gid'  => $gameId,
                ':data' => json_encode(['message' => 'Les deux joueurs sont connectés. La partie peut commencer !']),
            ]);
        }

        echo json_encode(['game' => $game, 'role' => $role]);
        break;

    // ------------------------------------------------------------------
    // Envoyer un événement de jeu (coup joué, action, message…)
    // Paramètres POST : game_id, event_type, event_data (JSON string)
    // L'événement est inséré dans game_events et immédiatement visible
    // par les deux joueurs via le canal SSE.
    // ------------------------------------------------------------------
    case 'send_game_event':
        $gameId    = (int) ($_POST['game_id']    ?? 0);
        $eventType = trim($_POST['event_type']   ?? '');
        $eventData = trim($_POST['event_data']   ?? '{}');
        $userId    = getCurrentUserId();
        $pdo       = getDB();

        // Vérifier que l'utilisateur est bien dans cette partie
        $stmt = $pdo->prepare("
            SELECT id FROM games
            WHERE id = :gid AND (player1_id = :uid OR player2_id = :uid)
              AND status = 'active'
        ");
        $stmt->execute([':gid' => $gameId, ':uid' => $userId]);
        if (!$stmt->fetch()) {
            echo json_encode(['error' => 'Partie introuvable ou non active.']);
            exit;
        }

        // Whitelist des types d'événements autorisés côté client
        $allowedTypes = ['game_move', 'game_action', 'game_chat', 'game_end', 'game_ping'];
        if (!in_array($eventType, $allowedTypes, true)) {
            echo json_encode(['error' => 'Type d\'événement non autorisé.']);
            exit;
        }

        // Valider que event_data est du JSON valide
        $parsed = json_decode($eventData, true);
        if (!is_array($parsed)) {
            echo json_encode(['error' => 'event_data doit être un objet JSON valide.']);
            exit;
        }

        $stmt = $pdo->prepare("
            INSERT INTO game_events (game_id, player_id, event_type, event_data)
            VALUES (:gid, :uid, :type, :data)
        ");
        $stmt->execute([
            ':gid'  => $gameId,
            ':uid'  => $userId,
            ':type' => $eventType,
            ':data' => json_encode($parsed),
        ]);

        echo json_encode(['success' => true, 'event_id' => (int) $pdo->lastInsertId()]);
        break;

    // ------------------------------------------------------------------
    // Lister les decks préconstruits disponibles
    // Lit /decks/prebuilt.json et retourne uniquement le nom et la
    // description de chaque deck (pas le contenu, inutile côté client
    // avant l'import).
    // ------------------------------------------------------------------
    case 'get_prebuilt_decks':
        // Chercher le fichier aux deux emplacements possibles :
        // 1. /decks/prebuilt.json (emplacement recommandé)
        // 2. /prebuilt.json       (racine du projet, fallback)
        $jsonPath = null;
        foreach ([
            __DIR__ . '/decks/prebuilt.json',
            __DIR__ . '/prebuilt.json',
        ] as $candidate) {
            if (is_file($candidate)) {
                $jsonPath = $candidate;
                break;
            }
        }

        if ($jsonPath === null) {
            echo json_encode(['decks' => []]);
            exit;
        }

        $raw  = file_get_contents($jsonPath);
        $data = json_decode($raw, true);

        if (!is_array($data)) {
            echo json_encode(['decks' => []]);
            exit;
        }

        // On ne renvoie que les infos utiles à l'affichage de la liste,
        // avec leur index (utilisé ensuite pour l'import).
        $list = [];
        foreach ($data as $index => $deck) {
            $list[] = [
                'index'       => $index,
                'name'        => $deck['name']        ?? 'Deck sans nom',
                'description' => $deck['description'] ?? '',
                'card_count'  => is_array($deck['cards'] ?? null)
                    ? array_sum($deck['cards'])
                    : 0,
            ];
        }

        echo json_encode(['decks' => $list]);
        break;

    // ------------------------------------------------------------------
    // Importer un deck préconstruit dans la collection de l'utilisateur
    // Paramètres POST : index (position dans prebuilt.json)
    // Crée un nouveau deck appartenant à l'utilisateur, avec les mêmes
    // cartes que le deck préconstruit.
    // ------------------------------------------------------------------
    case 'import_prebuilt_deck':
        $index  = (int) ($_POST['index'] ?? -1);
        $userId = getCurrentUserId();
        $pdo    = getDB();

        $jsonPath = null;
        foreach ([
            __DIR__ . '/decks/prebuilt.json',
            __DIR__ . '/prebuilt.json',
        ] as $candidate) {
            if (is_file($candidate)) {
                $jsonPath = $candidate;
                break;
            }
        }

        if ($jsonPath === null) {
            echo json_encode(['error' => 'Aucun deck préconstruit disponible.']);
            exit;
        }

        $data = json_decode(file_get_contents($jsonPath), true);

        if (!is_array($data) || !isset($data[$index])) {
            echo json_encode(['error' => 'Deck préconstruit introuvable.']);
            exit;
        }

        $prebuilt = $data[$index];
        $name     = trim($prebuilt['name'] ?? 'Deck préconstruit');
        $cards    = is_array($prebuilt['cards'] ?? null) ? $prebuilt['cards'] : [];

        // Nettoyage : ne garder que les card_id entiers positifs avec quantity >= 1
        $cleanCards = [];
        foreach ($cards as $cardId => $qty) {
            $cardId = (int) $cardId;
            $qty    = (int) $qty;
            if ($cardId > 0 && $qty > 0) {
                $cleanCards[$cardId] = $qty;
            }
        }

        $pdo->beginTransaction();
        try {
            // Créer le nouveau deck pour l'utilisateur
            $stmt = $pdo->prepare("INSERT INTO decks (user_id, name) VALUES (:uid, :name)");
            $stmt->execute([':uid' => $userId, ':name' => $name]);
            $deckId = (int) $pdo->lastInsertId();

            // Insérer les cartes du deck préconstruit
            if (!empty($cleanCards)) {
                $stmt = $pdo->prepare("
                    INSERT INTO deck_cards (deck_id, card_id, quantity)
                    VALUES (:deck_id, :card_id, :qty)
                ");
                foreach ($cleanCards as $cardId => $qty) {
                    $stmt->execute([':deck_id' => $deckId, ':card_id' => $cardId, ':qty' => $qty]);
                }
            }

            $pdo->commit();
            echo json_encode([
                'success' => true,
                'deck_id' => $deckId,
                'name'    => $name,
                'message' => 'Deck "' . $name . '" ajouté à votre collection !',
            ]);

        } catch (Throwable $e) {
            $pdo->rollBack();
            echo json_encode(['error' => 'Erreur lors de l\'import : ' . $e->getMessage()]);
        }
        break;

    // ------------------------------------------------------------------
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Action inconnue.']);
        break;
}

} catch (Throwable $e) {
    // Capturer toute exception non prévue et la retourner en JSON
    http_response_code(500);
    ob_clean();
    echo json_encode(['error' => 'Erreur serveur : ' . $e->getMessage()]);
}