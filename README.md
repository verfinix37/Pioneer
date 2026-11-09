# PIONEER — iPhone offline + Google cloud backup (Spark-plan build)

This build preserves the Pioneer dashboard and local-first data model. It adds optional Google sign-in and a private Firestore backup. The app continues to save to localStorage first; cloud sync is attempted in the background when the user is signed in and online.

## Cost guarantee setup

Use **Firebase Spark (no-cost) only**. Do not link a Cloud Billing account and do not upgrade to Blaze. On Spark, Firebase does not charge you when Firestore's free quota is exceeded; the affected service is paused until the quota resets or the project is changed to a paid plan. Keep the project on Spark. Google sign-in is a no-cost Authentication provider. Current Firestore Standard free quota: 1 GiB stored, 50,000 document reads/day, 20,000 writes/day, 20,000 deletes/day, and 10 GiB/month outbound transfer. This small personal app should use far less under normal use, but Google can change quotas and terms.

## One-time Firebase setup

1. Open https://console.firebase.google.com/ and create a project named `Pioneer` (or another name). Do not add billing; choose/keep the Spark plan.
2. In Project settings → General → Your apps, add a **Web app**. Register it as `Pioneer Web`. Copy the Firebase config object.
3. In Authentication → Sign-in method (or Sign-in providers), enable **Google**. Choose a support email and save.
4. In Authentication → Settings → Authorized domains, add your GitHub Pages host, for example `YOUR-GITHUB-USERNAME.github.io` (host only; no `https://` and no repository path).
5. In Firestore Database, create a **Native mode / Standard edition** database. Choose a nearby India location such as `asia-south1 (Mumbai)` if offered. Choose production mode.
6. Open Firestore Rules and replace them with the contents of `firestore.rules` in this package, then Publish. These rules ensure each signed-in user can read/write only `/users/{their-own-uid}`.
7. In this package, open `firebase-config.js` and replace the four placeholders with the values from your Firebase Web app config (`apiKey`, `authDomain`, `projectId`, `appId`). The Firebase web config is designed to be present in a client app; the security boundary is Authentication + Firestore Rules. Never publish service-account private keys.

## Deploy to GitHub Pages

Replace the repository-root files with **all** files in this package:

- `index.html`
- `manifest.json`
- `sw.js`
- `icon.svg`
- `apple-touch-icon.png`
- `firebase-config.js` (after adding your config)
- `firebase-cloud.js`
- `firestore.rules` (Firebase rules file; can also be pasted into console)

Commit to `main` and keep GitHub Pages set to `main` / `/(root)`.

## iPhone installation and first sync

1. On iPhone Safari, visit the GitHub Pages app while online and wait for it to load.
2. Sign in from Profile → Continue with Google. Google sign-in uses a redirect and returns to Pioneer.
3. On the first sign-in, if this Google account has no Pioneer cloud record, the app uploads this device's current data as the first backup.
4. If a cloud record already exists, Pioneer asks whether to restore the cloud copy to this device or upload this device's local data to the cloud. Export a JSON backup first if unsure.
5. Add Pioneer to Home Screen using Safari Share → Add to Home Screen → Open as Web App.
6. Test: record a small test entry online, wait for “All changes synced”, then switch Airplane Mode on and add another entry. Reconnect and wait for sync. Open the same app on another device and sign into the same Google account to verify the cloud data appears.

## Offline and safety notes

- Pioneer always saves locally first. Cloud sync is best-effort and happens when online.
- Firestore web persistence is enabled where supported by the browser. The app also keeps its own local copy in browser storage.
- A small per-user Firestore document stores the full Pioneer data object. It is suitable for this personal tracker; Firestore documents have a 1 MiB size limit.
- Avoid editing the same account on two devices simultaneously while offline. On reconnection, the last full-data upload can replace the other device's newer edits. Prefer one active editing device at a time, or sync before switching devices.
- Export a JSON backup occasionally as an extra precaution. Cloud sync is not the same as a versioned backup history.
- If a free quota is reached on Spark, Firestore cloud access pauses until reset. Local recording continues. Do not upgrade to Blaze if you want to guarantee no usage-based bill.
- The Firebase config file is not a password, but keep Firestore rules exactly as supplied. Never make the database publicly readable/writable.
