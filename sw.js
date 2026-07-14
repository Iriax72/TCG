/**
 * sw.js — Service Worker de cache
 *
 * Stratégie par type de ressource :
 *
 *  • Images de cartes (/assets/cards/*.webp)
 *    → Cache-first avec expiration longue (30 jours).
 *      Les cartes ne changent pas souvent ; on les sert depuis le cache
 *      dès qu'elles y sont, sans aller sur le réseau.
 *
 *  • Assets statiques (CSS, JS, fonts, images UI)
 *    → Stale-while-revalidate : on sert le cache immédiatement
 *      et on revalide en arrière-plan pour la prochaine visite.
 *
 *  • Requêtes API (api.php, upload.php, index.php)
 *    → Network-only : jamais mises en cache, toujours fraîches.
 */

const CACHE_VERSION  = 'v5';
const CACHE_CARDS    = `untcg-cards-${CACHE_VERSION}`;
const CACHE_STATIC   = `untcg-static-${CACHE_VERSION}`;

// Durée maximale de vie d'une entrée carte dans le cache (en secondes)
const CARD_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 jours

/* ============================================================
   Installation : pré-cache des assets statiques essentiels
   ============================================================ */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_STATIC).then((cache) => {
            return cache.addAll([
                'css/main.css',
                'css/auth.css',
                'css/dashboard.css',
                'css/profile.css',
                'css/decks.css',
                'js/auth.js',
                'js/dashboard.js',
                'js/notifications.js',
                'js/profile.js',
                'js/decks.js',
                'js/game.js',
                'css/game.css',
            ]);
        })
    );
    // Activer immédiatement sans attendre que l'ancien SW soit libéré
    self.skipWaiting();
});

/* ============================================================
   Activation : suppression des anciens caches
   ============================================================ */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter(key => key !== CACHE_CARDS && key !== CACHE_STATIC)
                    .map(key => caches.delete(key))
            );
        })
    );
    // Prendre le contrôle de tous les onglets ouverts immédiatement
    self.clients.claim();
});

/* ============================================================
   Fetch : interception des requêtes
   ============================================================ */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // --- Ne jamais mettre en cache les requêtes non-GET ---
    if (event.request.method !== 'GET') return;

    // --- Ne jamais mettre en cache les appels API et pages PHP ---
    if (
        url.pathname.includes('api.php')    ||
        url.pathname.includes('upload.php') ||
        url.pathname.endsWith('index.php')  ||
        url.pathname.endsWith('.php')
    ) {
        return; // laisse le navigateur gérer normalement
    }

    // --- Images de cartes : Cache-first avec vérification d'âge ---
    if (url.pathname.includes('/assets/cards/') && url.pathname.endsWith('.webp')) {
        event.respondWith(cardCacheFirst(event.request));
        return;
    }

    // --- Autres assets statiques (CSS, JS, fonts, images UI) : Stale-while-revalidate ---
    if (
        url.pathname.match(/\.(css|js|ttf|woff2?|png|webp|jpg|jpeg|svg|ico)$/)
    ) {
        event.respondWith(staleWhileRevalidate(event.request));
        return;
    }
});

/* ============================================================
   Stratégie Cache-first pour les images de cartes
   Inclut une vérification d'âge pour expirer les entrées trop vieilles.
   ============================================================ */
async function cardCacheFirst(request) {
    const cache    = await caches.open(CACHE_CARDS);
    const cached   = await cache.match(request);

    if (cached) {
        // Vérifier l'âge via l'en-tête personnalisé qu'on a ajouté à la mise en cache
        const cachedAt = cached.headers.get('x-cached-at');
        if (cachedAt) {
            const ageSeconds = (Date.now() - parseInt(cachedAt, 10)) / 1000;
            if (ageSeconds < CARD_MAX_AGE_S) {
                return cached; // Encore frais → servir depuis le cache
            }
        } else {
            return cached; // Pas d'en-tête d'âge → on fait confiance
        }
    }

    // Cache manquant ou expiré → aller chercher sur le réseau
    try {
        const response = await fetch(request);
        if (response.ok) {
            // Cloner la réponse et y ajouter un timestamp pour la gestion d'âge
            const headers   = new Headers(response.headers);
            headers.set('x-cached-at', Date.now().toString());
            const augmented = new Response(await response.blob(), {
                status:     response.status,
                statusText: response.statusText,
                headers,
            });
            await cache.put(request, augmented);
        }
        return response;
    } catch {
        // Réseau indisponible et pas de cache → réponse vide (image cassée)
        return new Response('', { status: 503 });
    }
}

/* ============================================================
   Stratégie Stale-while-revalidate pour les assets statiques
   Sert immédiatement depuis le cache et revalide en arrière-plan.
   ============================================================ */
async function staleWhileRevalidate(request) {
    const cache    = await caches.open(CACHE_STATIC);
    const cached   = await cache.match(request);

    // Lancer la revalidation en arrière-plan (pas d'await intentionnel)
    const networkFetch = fetch(request).then((response) => {
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    }).catch(() => null);

    // Retourner le cache immédiatement s'il existe, sinon attendre le réseau
    return cached || networkFetch;
}