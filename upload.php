<?php
/**
 * upload.php
 * Gestion sécurisée de l'upload de photo de profil.
 *
 * Pipeline de sécurité appliqué à chaque image :
 *  1. Vérification que l'utilisateur est connecté
 *  2. Vérification taille brute du fichier (UPLOAD_MAX_BYTES)
 *  3. Vérification du type MIME réel via finfo (pas la déclaration du navigateur)
 *  4. Vérification que PHP peut lire l'image (getimagesize)
 *  5. Vérification des dimensions min/max
 *  6. Re-encodage via GD → détruit toutes les métadonnées EXIF/XMP/IPTC
 *     et supprime tout code malveillant éventuellement caché dans les chunks
 *  7. Redimensionnement si l'image dépasse UPLOAD_MAX_WIDTH/HEIGHT
 *  8. Renommage en token aléatoire (bin2hex) — le nom original est ignoré
 *  9. Suppression de l'ancienne photo avant enregistrement du nouveau chemin
 * 10. Stockage du chemin relatif en base (jamais le chemin absolu serveur)
 *
 * Réponse : JSON { success, avatar_url } ou { error }
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');

// --- 1. Authentification ---
if (!isLoggedIn()) {
    http_response_code(401);
    echo json_encode(['error' => 'Non authentifié.']);
    exit;
}

// --- Seules les requêtes POST sont acceptées ---
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée.']);
    exit;
}

// --- Vérification de la présence du fichier ---
if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] === UPLOAD_ERR_NO_FILE) {
    echo json_encode(['error' => 'Aucun fichier reçu.']);
    exit;
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
    $msg = $phpErrors[$file['error']] ?? 'Erreur d\'upload inconnue.';
    echo json_encode(['error' => $msg]);
    exit;
}

if ($file['size'] > UPLOAD_MAX_BYTES) {
    echo json_encode(['error' => 'Fichier trop volumineux. Maximum : ' . (UPLOAD_MAX_BYTES / 1024 / 1024) . ' Mo.']);
    exit;
}

// --- 3. Vérification du type MIME réel (finfo lit les magic bytes) ---
$finfo    = new finfo(FILEINFO_MIME_TYPE);
$mimeReal = $finfo->file($file['tmp_name']);

if (!in_array($mimeReal, UPLOAD_ALLOWED_MIME, true)) {
    echo json_encode(['error' => 'Type de fichier non autorisé. Formats acceptés : JPG, PNG, WebP, GIF.']);
    exit;
}

// --- 4. Vérification que PHP peut décoder l'image ---
$imageInfo = @getimagesize($file['tmp_name']);
if ($imageInfo === false) {
    echo json_encode(['error' => 'Le fichier n\'est pas une image valide.']);
    exit;
}

[$width, $height, $imageType] = $imageInfo;

// --- 5. Vérification des dimensions minimales ---
if ($width < UPLOAD_MIN_WIDTH || $height < UPLOAD_MIN_HEIGHT) {
    echo json_encode([
        'error' => sprintf(
            'Image trop petite. Dimensions minimales : %d×%d px.',
            UPLOAD_MIN_WIDTH,
            UPLOAD_MIN_HEIGHT
        )
    ]);
    exit;
}

// --- 6 & 7. Re-encodage via GD (supprime EXIF + redimensionne si nécessaire) ---

// Chargement de l'image source selon son type réel
$source = match ($mimeReal) {
    'image/jpeg' => @imagecreatefromjpeg($file['tmp_name']),
    'image/png'  => @imagecreatefrompng($file['tmp_name']),
    'image/webp' => @imagecreatefromwebp($file['tmp_name']),
    'image/gif'  => @imagecreatefromgif($file['tmp_name']),
    default      => false,
};

if ($source === false) {
    echo json_encode(['error' => 'Impossible de décoder l\'image. Fichier corrompu ?']);
    exit;
}

// Calcul des dimensions de sortie (redimensionnement proportionnel si trop grand)
$outWidth  = $width;
$outHeight = $height;

if ($outWidth > UPLOAD_MAX_WIDTH || $outHeight > UPLOAD_MAX_HEIGHT) {
    $ratio     = min(UPLOAD_MAX_WIDTH / $outWidth, UPLOAD_MAX_HEIGHT / $outHeight);
    $outWidth  = (int) round($outWidth  * $ratio);
    $outHeight = (int) round($outHeight * $ratio);
}

// Création d'un canvas propre (fond blanc pour les PNG transparents)
$canvas = imagecreatetruecolor($outWidth, $outHeight);

// Gestion de la transparence pour PNG et WebP
if (in_array($mimeReal, ['image/png', 'image/webp'], true)) {
    imagealphablending($canvas, false);
    imagesavealpha($canvas, true);
    $transparent = imagecolorallocatealpha($canvas, 255, 255, 255, 127);
    imagefilledrectangle($canvas, 0, 0, $outWidth, $outHeight, $transparent);
    imagealphablending($canvas, true);
}

// Redimensionnement avec rééchantillonnage de qualité
imagecopyresampled($canvas, $source, 0, 0, 0, 0, $outWidth, $outHeight, $width, $height);
imagedestroy($source);

// --- 8. Génération d'un nom de fichier aléatoire ---
// Le nom original de l'utilisateur est complètement ignoré.
// On stocke toujours en JPEG pour uniformiser et simplifier la gestion.
$newFilename = bin2hex(random_bytes(16)) . '.jpg';

// Création du dossier si absent
if (!is_dir(UPLOAD_DIR)) {
    mkdir(UPLOAD_DIR, 0755, true);
}

$destPath = UPLOAD_DIR . $newFilename;

// Encodage final en JPEG (supprime définitivement toutes les métadonnées)
$saved = imagejpeg($canvas, $destPath, UPLOAD_JPEG_QUALITY);
imagedestroy($canvas);

if (!$saved) {
    echo json_encode(['error' => 'Échec de l\'enregistrement de l\'image sur le serveur.']);
    exit;
}

// --- 9. Suppression de l'ancienne photo ---
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

// --- 10. Enregistrement du chemin relatif en base ---
// On stocke le chemin relatif depuis la racine du projet (jamais le chemin absolu).
$relativePath = UPLOAD_URL . $newFilename;

$stmt = $pdo->prepare("UPDATE users SET avatar_path = :path WHERE id = :id");
$stmt->execute([':path' => $relativePath, ':id' => $userId]);

// Mise à jour de last_seen
updateLastSeen();

echo json_encode([
    'success'    => true,
    'avatar_url' => $relativePath,
    'message'    => 'Photo de profil mise à jour.',
]);