const CACHE_NAME = "alan-os-shell-v1";
const SHELL_URLS = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});

// Phase 3 — Web Push. Payload shape sent by src/lib/push/send.ts:
// { title, body, reminderId, actionToken, url }. actionToken is a short-lived
// signed token (src/lib/reminders/action-token.ts) — Done/Snooze below don't
// rely on a live session, since a dormant PWA's session may well be expired
// by the time this fires days/weeks later.
self.addEventListener("push", (event) => {
  let data = { title: "Alan OS", body: "You have a reminder." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the default text above.
  }

  const actions = [];
  if (data.reminderId && data.actionToken) {
    actions.push({ action: "done", title: "Done" }, { action: "snooze", title: "Snooze 1h" });
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.reminderId ? `reminder-${data.reminderId}` : undefined,
      data,
      actions,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  async function handleAction() {
    // iOS PWA push action-button support is inconsistent even where basic
    // push delivery works — tapping the notification BODY (action === "")
    // always just opens the app to the reminders list, where Done/Snooze
    // exist as ordinary buttons regardless of OS-level action-button support.
    if ((event.action === "done" || event.action === "snooze") && data.reminderId && data.actionToken) {
      const endpoint = event.action === "done" ? "complete" : "snooze";
      try {
        await fetch(`/api/reminders/${data.reminderId}/${endpoint}?token=${encodeURIComponent(data.actionToken)}`, {
          method: "POST",
        });
      } catch {
        // Best-effort — opening the app below still lets the owner act manually.
      }
      return;
    }

    const targetUrl = data.url || "/today";
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      if (client.url.includes(self.location.origin) && "focus" in client) {
        client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  }

  event.waitUntil(handleAction());
});
