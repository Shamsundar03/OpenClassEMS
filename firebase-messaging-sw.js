// 1. IMPORT FIREBASE SCRIPTS FOR THE BACKGROUND WORKER
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// 2. INITIALIZE FIREBASE IN THE SERVICE WORKER
firebase.initializeApp({
    apiKey: "AIzaSyAyMt0FPBsStGwlmXb-NTD5GgUf0njNPco",
    projectId: "optenixems-c6609",
    messagingSenderId: "1090894316770",
    appId: "1:1090894316770:web:6cf555ba335528b2bc0abb"
});

const messaging = firebase.messaging();

// 3. HANDLE BACKGROUND PUSH NOTIFICATIONS (App is closed/minimized)
messaging.onBackgroundMessage(function(payload) {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    // Extract data sent from your Node.js Cloud Function
    const notificationTitle = payload.notification.title || "Optenix EMS";
    const notificationOptions = {
        body: payload.notification.body || "You have a new message.",
        icon: 'https://res.cloudinary.com/dowhvdkjh/image/upload/v1784705930/Screenshot_20260715_131553_Gallery_2_bssa0e.jpg',
        badge: 'https://res.cloudinary.com/dowhvdkjh/image/upload/v1784705930/Screenshot_20260715_131553_Gallery_2_bssa0e.jpg',
        vibrate: [200, 100, 200, 100, 200, 100, 200],
        requireInteraction: true
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 4. HANDLE NOTIFICATION CLICKS (Bring user back to the app)
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(windowClients => {
            // Check if app is already open somewhere
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not open, open a new window
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});

// ============================================================
//  PWA OFFLINE CACHING LOGIC
// ============================================================

const CACHE_NAME = "optenix-ems-v10";

const urlsToCache = [
    "./",
    "./index.html",
    "./app.js",
    "./config.js",
    "./manifest.json",
    "https://res.cloudinary.com/dowhvdkjh/image/upload/v1784705930/Screenshot_20260715_131553_Gallery_2_bssa0e.jpg"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log("Opened cache");
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        console.log("Deleting old cache:", key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                return response || fetch(event.request);
            })
    );
});