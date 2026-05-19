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

// --- Mise à jour du statut "en ligne" ---
updateLastSeen();

// --- Seuls les utilisateurs connectés peuvent utiliser l'API ---
if (!isLoggedIn()) {
    http_response_code(401);
    echo json_encode(['error' => 'Non authentifié.']);
    exit;
}

$action = $_REQUEST['action'] ?? '';

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

        $msg = ($response === 'accepted') ? 'Partie acceptée !' : 'Invitation refusée.';
        echo json_encode(['success' => true, 'message' => $msg, 'response' => $response]);
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

        echo json_encode(['notifications' => $notifications]);
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