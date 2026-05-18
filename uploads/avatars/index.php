<?php
/**
 * uploads/avatars/index.php
 * Empeche la navigation directe dans le dossier uploads/avatars/
 * Même protection que pour le fichier uploads/index.php.
 */
http_response_code(403);
exit;