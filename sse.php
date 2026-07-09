<?php
/**
 * sse.php — Endpoint Server-Sent Events pour la table de jeu.
 *
 * Protocole SSE : le serveur envoie des chunks texte "data: ...\n\n"
 * et le navigateur les reçoit via EventSource sans polling explicite.
 *
 * Compatibilité Wasmer (PHP single-thread) :
 * Au lieu d'une boucle infinie bloquante, ce script retourne
 * immédiatement tous les événements en attente, fixe un retry court
 * (1,5 s), puis se termine. L'EventSource du navigateur reconnecte
 * automatiquement et envoie l'en-tête Last-Event-ID pour reprendre
 * là où il s'est arrêté. Résultat : quasi-temps-réel sans bloquer
 * le serveur.
 */

ini_set('display_errors', '0');
error_reporting(0);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth.php';

// --- En-têtes SSE obligatoires ---
header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache, no-store');
header('X-Accel-Buffering: no');   // Désactive le buffering Nginx
header('Connection: keep-alive');

// Désactiver le buffering PHP pour que les événements soient
// envoyés dès qu'ils sont écrits
@ini_set('output_buffering', 'off');
@ini_set('zlib.output_compression', false);
while (@ob_end_flush()) {} // Vider tous les buffers actifs

// --- Authentification ---
if (!isLoggedIn()) {
    echo "event: error\n";
    echo "data: " . json_encode(['error' => 'Non authentifié.']) . "\n\n";
    flush();
    exit;
}

$gameId      = (int) ($_GET['game_id'] ?? 0);
// Last-Event-ID : envoyé automatiquement par l'EventSource lors des reconnexions
$lastEventId = (int) ($_SERVER['HTTP_LAST_EVENT_ID'] ?? $_GET['last_id'] ?? 0);
$userId      = getCurrentUserId();

if ($gameId <= 0) {
    echo "event: error\n";
    echo "data: " . json_encode(['error' => 'game_id invalide.']) . "\n\n";
    flush();
    exit;
}

// --- Vérifier que l'utilisateur est dans cette partie ---
$pdo  = getDB();
$stmt = $pdo->prepare("
    SELECT id FROM games
    WHERE id = :gid AND (player1_id = :uid OR player2_id = :uid)
");
$stmt->execute([':gid' => $gameId, ':uid' => $userId]);
if (!$stmt->fetch()) {
    echo "event: error\n";
    echo "data: " . json_encode(['error' => 'Accès refusé.']) . "\n\n";
    flush();
    exit;
}

// --- Mettre à jour last_seen ---
updateLastSeen();

// --- Récupérer tous les événements postérieurs au dernier connu ---
$stmt = $pdo->prepare("
    SELECT
        ge.id,
        ge.player_id,
        ge.event_type,
        ge.event_data,
        ge.created_at,
        u.username AS player_name
    FROM game_events ge
    LEFT JOIN users u ON u.id = ge.player_id
    WHERE ge.game_id = :gid
      AND ge.id      > :last_id
    ORDER BY ge.id ASC
    LIMIT 100
");
$stmt->execute([':gid' => $gameId, ':last_id' => $lastEventId]);
$events = $stmt->fetchAll();

// --- Envoyer les événements ---
foreach ($events as $event) {
    // Décoder les données JSON et enrichir avec les métadonnées
    $data = $event['event_data'] ? json_decode($event['event_data'], true) : [];
    $data['player_id']   = $event['player_id'];
    $data['player_name'] = $event['player_name'] ?? 'Serveur';
    $data['timestamp']   = $event['created_at'];

    echo "id: {$event['id']}\n";
    echo "event: {$event['event_type']}\n";
    echo "data: " . json_encode($data) . "\n\n";
}

// --- Keep-alive commentaire (pas d'événement = pas d'output sinon déconnexion) ---
if (empty($events)) {
    echo ": ping\n\n";
}

// --- Demander à l'EventSource de reconnecter dans 1,5 secondes ---
echo "retry: 1500\n\n";

flush();