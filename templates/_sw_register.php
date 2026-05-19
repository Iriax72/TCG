<?php
/**
 * templates/_sw_register.php
 * Snippet d'enregistrement du Service Worker.
 * Inclus dans le <head> de chaque template.
 * Le underscore indique que ce fichier n'est pas une page autonome.
 */
?>
<script>
    // Enregistrement du Service Worker pour la mise en cache des assets
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .catch((err) => console.warn('Service Worker non enregistré :', err));
        });
    }
</script>