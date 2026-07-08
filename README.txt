Aditi Makeup Artistry
A private, offline booking studio for a makeup artist / hairstylist.

FILES
  index.html            App shell, Apple PWA meta tags, design system
  app.js                All logic (IndexedDB + localStorage fallback)
  sw.js                 Service worker (offline caching + install)
  manifest.json         PWA manifest (relative paths for subfolder deploys)
  icon-192 / 512        Standard PWA icons (gold "A" monogram)
  icon-maskable-512     Maskable icon (Android adaptive)
  apple-touch-icon      iOS home-screen icon (180x180)
  favicon.png           Browser tab icon

DEPLOY (same as Protocol 1000)
  1. Put this folder in a GitHub repo and enable GitHub Pages,
     OR host on any static HTTPS server.
  2. Open the URL in Safari on iPhone.
  3. Share -> Add to Home Screen. Launch from the icon (runs standalone,
     fully offline after first load).

FIRST-RUN
  Open Settings and fill in: name, WhatsApp number, and UPI ID.
  These power the UPI collection links / QR and pre-filled WhatsApp messages.

NOTES
  - All data stays on the device (IndexedDB). Settings -> Export backup saves
    a JSON copy; Import restores it or moves it to another device.
  - Tailwind + the QR library load from CDN and are cached for offline use;
    a local CSS fallback and a QR-link fallback keep it working on a cold
    offline first load too.
  - iOS allows notifications only after Add-to-Home-Screen; the always-on
    in-app "Tomorrow" banner + reminders badge work regardless.
