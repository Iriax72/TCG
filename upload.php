<?php
/**
 * upload.php
 * Gestion sécurisée de l'upload de photo de profil.
 *
 * Pipeline de sécurité :
 *  1. Vérification authentification
 *  2. Vérification taille brute (UPLOAD_MAX_BYTES)
 *  3. Vérification MIME réel via getimagesize() — pas besoin de l'extension fileinfo
 *  4. Vérification dimensions min/max
 *  5. Re-encodage GD → supprime EXIF/XMP, détruit tout code caché
 *  6. Redimensionnement si nécessaire
 *  7. Renommage aléatoire (bin2hex + .jpg forcé)
 *  8. Suppression de l'ancienne photo
 *  9. Stockage du chemin relatif en base
 *
 * Réponse : JSON { success, avatar_url } ou { error }
 */

// --- Suppression des erreurs PHP et tampon de sortie ---
// Empêche tout warning PHP de corrompre la réponse JSON.
ini_set('display_errors', '0');
error_reporting(0);
ob_start();

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');

// Fonction utilitaire : vider le buffer et retourner une erreur JSON propre
function jsonError(string $msg, int $code = 400): void {
    http_response_code($code);
    ob_clean();
    echo json_encode(['error' => $msg]);
    exit;
}

// --- 1. Authentification ---
if (!isLoggedIn()) {
    jsonError('Non authentifié.', 401);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError('Méthode non autorisée.', 405);
}

if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] === UPLOAD_ERR_NO_FILE) {
    jsonError('Aucun fichier reçu.');
}

$file = $_FILES['avatar'];

// --- 2. Vérification des erreurs d'upload PHP et taille brute ---
if ($file['error'] !== UPLOAD_ERR_OK) {
    $phpErrors = [
        UPLOAD_ERR_INI_SIZE   => 'Fichier trop volumineux (limite serveur).',
        UPLOAD_ERR_FORM_SIZE  => 'Fichier trop volumineux (limite formulaire).',
        UPLOAD_ERR_PARTIAL    => 'Upload interrompu.',
        UPLOAD_ERR_NO_TMP_DIR => 'Dossier temporaire manquant.',
        UPLOAD_ERR_CANT_WRITE => 'Impossible d\'écrire le fichier.',
        UPLOAD_ERR_EXTENSION  => 'Upload bloqué par une extension PHP.',
    ];
    jsonError($phpErrors[$file['error']] ?? 'Erreur d\'upload inconnue.');
}

if ($file['size'] > UPLOAD_MAX_BYTES) {
    jsonError('Fichier trop volumineux. Maximum : ' . (UPLOAD_MAX_BYTES / 1024 / 1024) . ' Mo.');
}

// --- 3. Vérification MIME réel via getimagesize() ---
// getimagesize() lit les magic bytes du fichier (pas l'extension déclarée)
// et retourne le type MIME réel — sans avoir besoin de l'extension fileinfo.
$imageInfo = @getimagesize($file['tmp_name']);

if ($imageInfo === false) {
    jsonError('Le fichier n\'est pas une image valide.');
}

$mimeReal  = $imageInfo['mime'];
$width     = $imageInfo[0];
$height    = $imageInfo[1];

if (!in_array($mimeReal, UPLOAD_ALLOWED_MIME, true)) {
    jsonError('Type de fichier non autorisé. Formats acceptés : JPG, PNG, WebP, GIF.');
}

// --- 4. Vérification des dimensions minimales ---
if ($width < UPLOAD_MIN_WIDTH || $height < UPLOAD_MIN_HEIGHT) {
    jsonError(sprintf(
        'Image trop petite. Dimensions minimales : %d×%d px.',
        UPLOAD_MIN_WIDTH,
        UPLOAD_MIN_HEIGHT
    ));
}

// --- 5 & 6. Re-encodage GD + redimensionnement ---
// Chargement selon le MIME réel (pas l'extension du fichier)
switch ($mimeReal) {
    case 'image/jpeg': $source = @imagecreatefromjpeg($file['tmp_name']); break;
    case 'image/png':  $source = @imagecreatefrompng($file['tmp_name']);  break;
    case 'image/webp': $source = @imagecreatefromwebp($file['tmp_name']); break;
    case 'image/gif':  $source = @imagecreatefromgif($file['tmp_name']);  break;
    default:           $source = false;
}

if ($source === false) {
    jsonError('Impossible de décoder l\'image. Fichier corrompu ?');
}

// Calcul des dimensions de sortie (redimensionnement proportionnel si trop grand)
$outWidth  = $width;
$outHeight = $height;

if ($outWidth > UPLOAD_MAX_WIDTH || $outHeight > UPLOAD_MAX_HEIGHT) {
    $ratio     = min(UPLOAD_MAX_WIDTH / $outWidth, UPLOAD_MAX_HEIGHT / $outHeight);
    $outWidth  = (int) round($outWidth  * $ratio);
    $outHeight = (int) round($outHeight * $ratio);
}

// Canvas propre (gère la transparence PNG/WebP)
$canvas = imagecreatetruecolor($outWidth, $outHeight);

if (in_array($mimeReal, ['image/png', 'image/webp'], true)) {
    imagealphablending($canvas, false);
    imagesavealpha($canvas, true);
    $transparent = imagecolorallocatealpha($canvas, 255, 255, 255, 127);
    imagefilledrectangle($canvas, 0, 0, $outWidth, $outHeight, $transparent);
    imagealphablending($canvas, true);
}

imagecopyresampled($canvas, $source, 0, 0, 0, 0, $outWidth, $outHeight, $width, $height);
imagedestroy($source);

// --- 7. Génération d'un nom de fichier aléatoire ---
// Toujours encodé en JPEG → supprime définitivement toutes les métadonnées.
// Extension .jpg forcée, nom original de l'utilisateur complètement ignoré.
$newFilename = bin2hex(random_bytes(16)) . '.jpg';

// Vérification paranoïaque : jamais d'extension exécutable
$dangerousExtensions = ['php','php3','php4','php5','php7','phtml',
                        'phar','pl','py','cgi','sh','htaccess'];
$ext = strtolower(pathinfo($newFilename, PATHINFO_EXTENSION));
if (in_array($ext, $dangerousExtensions, true)) {
    imagedestroy($canvas);
    jsonError('Extension de fichier refusée par sécurité.');
}

if (!is_dir(UPLOAD_DIR)) {
    mkdir(UPLOAD_DIR, 0755, true);
}

$destPath = UPLOAD_DIR . $newFilename;
$saved    = imagejpeg($canvas, $destPath, UPLOAD_JPEG_QUALITY);
imagedestroy($canvas);

if (!$saved) {
    jsonError('Échec de l\'enregistrement de l\'image sur le serveur.');
}

// --- 8. Suppression de l'ancienne photo ---
$pdo    = getDB();
$userId = getCurrentUserId();

$stmt = $pdo->prepare("SELECT avatar_path FROM users WHERE id = :id");
$stmt->execute([':id' => $userId]);
$user = $stmt->fetch();

if ($user && !empty($user['avatar_path'])) {
    $oldPath = __DIR__ . '/' . $user['avatar_path'];
    if (is_file($oldPath)) {
        unlink($oldPath);
    }
}

// --- 9. Enregistrement du chemin relatif en base ---
$relativePath = UPLOAD_URL . $newFilename;

$stmt = $pdo->prepare("UPDATE users SET avatar_path = :path WHERE id = :id");
$stmt->execute([':path' => $relativePath, ':id' => $userId]);

updateLastSeen();

ob_clean();
echo json_encode([
    'success'    => true,
    'avatar_url' => $relativePath,
    'message'    => 'Photo de profil mise à jour.',
]);