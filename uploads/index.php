<?php
/**
 * uploads/index.php
 * Empêche la navigation directe dans le dossier uploads/.
 * Sur Wasmer (pas d'Apache, pas de .htaccess), ce fichier est
 * le seul garde-fou contre le listing du répertoire.
 */
http_response_code(403);
exit;