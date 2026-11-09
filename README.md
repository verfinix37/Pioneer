# Pioneer — Local Edition

Pioneer is an offline-first Progressive Web App for personal RRB Station Master preparation. It has no Google sign-in, Firebase, cloud database, analytics, external runtime dependencies, or paid services.

## Deploy to GitHub Pages
1. Extract this ZIP.
2. Upload all files in this folder to the root of your `Pioneer` GitHub repository, replacing the existing files.
3. Commit to `main`. Keep GitHub Pages configured for `main` and `/(root)`.
4. Open `https://verfinix37.github.io/Pioneer/` in Safari on iPhone while online.
5. Add to Home Screen from Safari. Open Pioneer once online, then test Airplane Mode.

## Data storage and safety
- All records are stored in this browser's `localStorage` under `pioneer-data-v1`.
- The existing storage key is intentionally preserved, so this update does not intentionally reset existing Pioneer records on this browser.
- No records are transmitted to Google, Firebase, or a cloud service.
- Use Profile → Export backup regularly. Keep the JSON file somewhere safe.
- Use Restore backup to import a previous Pioneer JSON backup.
- Clearing Safari website data, removing the Home Screen web app, or clearing browser storage can erase local data.
- Local data does not automatically transfer between iPhone and Ubuntu.

## Features retained
Home, Track, Sprints, Record, Profile; phase roadmap; subject totals; mock score and accuracy analytics; study-hour history; editable records; JSON backup and restore; PWA installation and offline app-shell caching.

## Privacy
No authentication or cloud services are included. The app runs locally in the browser.
