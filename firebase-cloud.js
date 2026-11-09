/* 
 * PIONEER - FIREBASE CLOUD SYNC
 * Local-first architecture
 * Google Authentication + Cloud Firestore
 * Offline support + Automatic synchronisation
 */

(() => {
  'use strict';

  // ==========================================
  // CONFIGURATION
  // ==========================================

  const CFG = () => window.PIONEER_FIREBASE_CONFIG || {};

  const isConfigured = config =>
    config.apiKey &&
    config.appId &&
    config.projectId &&
    !/PASTE_|YOUR_PROJECT_ID/.test(
      [config.apiKey, config.appId, config.projectId].join(' ')
    );

  const state = {
    ready: false,
    user: null,
    db: null,
    auth: null,
    busy: false,
    timer: null,
    lastLocalHash: null,
    booted: false
  };


  // ==========================================
  // UI HELPERS
  // ==========================================

  const status = (message, kind = 'neutral') => {
    const el = document.getElementById('cloudStatus');

    if (el) {
      el.textContent = message;
      el.dataset.kind = kind;
    }
  };

  const account = () => {
    const el = document.getElementById('cloudAccount');

    if (el) {
      el.textContent = state.user
        ? (state.user.displayName || state.user.email || 'Google account')
        : 'Not signed in';
    }
  };

  const setButtons = () => {
    const signIn = document.getElementById('googleSignIn');
    const signOut = document.getElementById('googleSignOut');

    if (signIn) signIn.hidden = !!state.user;
    if (signOut) signOut.hidden = !state.user;
  };

  const notify = message => {
    window.PioneerApp?.notify?.(message);
  };


  // ==========================================
  // LOCAL DATA
  // ==========================================

  const getLocal = () =>
    window.PioneerApp?.getData?.();

  const setLocal = value =>
    window.PioneerApp?.replaceData?.(value);

  const localHash = value =>
    JSON.stringify(value);

  const getOwner = () =>
    localStorage.getItem('pioneer-cloud-owner');

  const setOwner = uid =>
    localStorage.setItem('pioneer-cloud-owner', uid);

  const setBaseline = value =>
    localStorage.setItem(
      'pioneer-cloud-baseline',
      localHash(value)
    );


  // ==========================================
  // FIREBASE SDK
  // ==========================================

  async function loadSdk() {

    if (
      window.firebase?.initializeApp &&
      window.firebase?.auth &&
      window.firebase?.firestore
    ) {
      return;
    }

    const scripts = [
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js'
    ];

    for (const src of scripts) {

      await new Promise((resolve, reject) => {

        const script = document.createElement('script');

        script.src = src;
        script.async = false;

        script.onload = resolve;

        script.onerror = () => {
          reject(
            new Error('Unable to load Firebase SDK: ' + src)
          );
        };

        document.head.appendChild(script);

      });
    }
  }


  // ==========================================
  // INITIALISE FIREBASE
  // ==========================================

  async function start() {

    if (state.booted) return;

    state.booted = true;

    const config = CFG();

    if (!isConfigured(config)) {

      status(
        'Firebase configuration missing. Local mode active.',
        'warn'
      );

      state.booted = false;
      return;
    }

    if (!navigator.onLine) {

      status(
        'Offline. Your data remains saved on this device.',
        'warn'
      );

      state.booted = false;
      return;
    }

    try {

      await loadSdk();

      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }

      state.auth = firebase.auth();
      state.db = firebase.firestore();

      // Persistent authentication
      await state.auth.setPersistence(
        firebase.auth.Auth.Persistence.LOCAL
      );

      // Enable offline Firestore caching where supported
      try {

        await state.db.enablePersistence({
          synchronizeTabs: true
        });

      } catch (error) {

        console.info(
          'Firestore offline persistence:',
          error.code || error.message
        );

      }

      state.ready = true;

      // Listen for authentication changes
      state.auth.onAuthStateChanged(
        async user => {

          state.user = user || null;

          account();
          setButtons();

          if (!user) {

            status(
              'Not signed in. Your data remains on this device.',
              'neutral'
            );

            return;
          }

          console.log(
            'PIONEER_AUTH_SUCCESS:',
            user.email
          );

          status(
            'Google connected. Checking cloud backup...',
            'pending'
          );

          await restoreOrCreate(user);

        },
        error => {

          console.error(
            'PIONEER_AUTH_STATE_ERROR:',
            error.code,
            error.message
          );

          status(
            'Authentication error: ' +
            (error.code || error.message),
            'warn'
          );

        }
      );

    } catch (error) {

      console.error(
        'PIONEER_INITIALISATION_ERROR:',
        error.code,
        error.message,
        error
      );

      status(
        'Cloud unavailable. Local mode remains active.',
        'warn'
      );

      state.booted = false;

    }
  }


  // ==========================================
  // GOOGLE SIGN-IN
  // ==========================================

  async function signIn() {

    if (!state.ready || !state.auth) {

      notify(
        'Firebase is not ready. Check your internet connection.'
      );

      return;
    }

    try {

      status(
        'Opening Google sign-in...',
        'pending'
      );

      const provider =
        new firebase.auth.GoogleAuthProvider();

      provider.setCustomParameters({
        prompt: 'select_account'
      });

      // Popup authentication instead of redirect authentication
      const result =
        await state.auth.signInWithPopup(provider);

      if (result.user) {

        console.log(
          'PIONEER_GOOGLE_AUTH_SUCCESS:',
          result.user.email
        );

        notify(
          'Google account connected successfully!'
        );

      }

    } catch (error) {

      console.error(
        'PIONEER_GOOGLE_AUTH_ERROR:',
        error.code,
        error.message,
        error
      );

      status(
        'Google sign-in failed: ' +
        (error.code || error.message),
        'warn'
      );

      notify(
        'Google sign-in failed: ' +
        (error.code || error.message)
      );

    }
  }


  // ==========================================
  // RESTORE OR CREATE CLOUD PROFILE
  // ==========================================

  async function restoreOrCreate(user) {

    if (state.busy || !state.db) return;

    state.busy = true;

    try {

      const ref = state.db
        .collection('users')
        .doc(user.uid);

      const snapshot = await ref.get();

      const local = getLocal();

      if (!local) {

        throw new Error(
          'Unable to read Pioneer local data.'
        );

      }

      // FIRST-TIME CLOUD ACCOUNT
      if (!snapshot.exists) {

        await ref.set({

          data: local,

          updatedAt:
            firebase.firestore.FieldValue.serverTimestamp(),

          schemaVersion: 1

        });

        setOwner(user.uid);
        setBaseline(local);

        status(
          'Cloud backup active. First backup saved.',
          'good'
        );

      }

      // EXISTING CLOUD ACCOUNT
      else {

        const cloud = snapshot.data()?.data;

        const owner = getOwner();

        if (cloud && owner === user.uid) {

          const baseline = localStorage.getItem(
            'pioneer-cloud-baseline'
          );

          if (
            baseline &&
            localHash(local) !== baseline
          ) {

            // Upload local changes
            await ref.set({

              data: local,

              updatedAt:
                firebase.firestore.FieldValue.serverTimestamp(),

              schemaVersion: 1

            });

            status(
              'Connected. Local changes uploaded.',
              'good'
            );

          } else {

            // Restore cloud data
            setLocal(cloud);

            status(
              'Connected. Cloud data restored.',
              'good'
            );

          }

        }

        // DIFFERENT DEVICE OR FIRST LOGIN
        else if (cloud) {

          const restore = confirm(

            'Your Google account already contains Pioneer data.\n\n' +

            'OK = Restore cloud data to this device.\n\n' +

            'CANCEL = Upload this device data to the cloud.\n\n' +

            'If unsure, export a local backup first.'

          );

          if (restore) {

            setLocal(cloud);

            status(
              'Connected. Cloud data restored.',
              'good'
            );

          } else {

            await ref.set({

              data: local,

              updatedAt:
                firebase.firestore.FieldValue.serverTimestamp(),

              schemaVersion: 1

            });

            status(
              'Connected. Local data uploaded.',
              'good'
            );

          }

        } else {

          await ref.set({

            data: local,

            updatedAt:
              firebase.firestore.FieldValue.serverTimestamp(),

            schemaVersion: 1

          });

          status(
            'Connected. Cloud backup created.',
            'good'
          );

        }

        setOwner(user.uid);

      }

      // Save current local baseline
      const current = getLocal();

      state.lastLocalHash = localHash(current);

      setBaseline(current);

    } catch (error) {

      console.error(
        'PIONEER_RESTORE_ERROR:',
        error.code,
        error.message,
        error
      );

      status(
        'Cloud sync failed. Your local data is safe.',
        'warn'
      );

    } finally {

      state.busy = false;

    }
  }


  // ==========================================
  // MANUAL CLOUD SYNC
  // ==========================================

  async function syncNow() {

    if (
      !state.user ||
      !state.ready ||
      !navigator.onLine ||
      state.busy
    ) {
      return;
    }

    const local = getLocal();

    if (!local) return;

    const hash = localHash(local);

    if (hash === state.lastLocalHash) return;

    state.busy = true;

    status(
      'Saving your latest progress to Google...',
      'pending'
    );

    try {

      await state.db
        .collection('users')
        .doc(state.user.uid)
        .set({

          data: local,

          updatedAt:
            firebase.firestore.FieldValue.serverTimestamp(),

          schemaVersion: 1

        });

      state.lastLocalHash = hash;

      setOwner(state.user.uid);
      setBaseline(local);

      status(
        'All changes synced. Cloud backup is up to date.',
        'good'
      );

    } catch (error) {

      console.error(
        'PIONEER_SYNC_ERROR:',
        error.code,
        error.message,
        error
      );

      status(
        'Sync pending. Your data remains saved locally.',
        'warn'
      );

    } finally {

      state.busy = false;

    }
  }


  // ==========================================
  // AUTOMATIC SYNC QUEUE
  // ==========================================

  function queueSync() {

    if (!state.user) return;

    status(
      navigator.onLine
        ? 'Changes saved locally. Syncing...'
        : 'Offline. Changes queued on this device.',
      'pending'
    );

    clearTimeout(state.timer);

    state.timer = setTimeout(
      syncNow,
      1000
    );
  }


  // ==========================================
  // GOOGLE SIGN-OUT
  // ==========================================

  async function signOut() {

    if (!state.auth) return;

    const confirmed = confirm(
      'Sign out of Google?\n\nYour Pioneer data will remain on this device.'
    );

    if (!confirmed) return;

    try {

      await state.auth.signOut();

      notify(
        'Successfully signed out.'
      );

    } catch (error) {

      console.error(
        'PIONEER_SIGNOUT_ERROR:',
        error
      );

      notify(
        'Unable to sign out.'
      );

    }
  }


  // ==========================================
  // NETWORK EVENTS
  // ==========================================

  window.addEventListener('online', async () => {

    if (!state.ready) {

      state.booted = false;

      await start();

      return;
    }

    if (state.user) {

      await syncNow();

    }

  });


  window.addEventListener('offline', () => {

    status(
      'Offline. Your data remains saved on this device.',
      'warn'
    );

  });


  // ==========================================
  // PUBLIC API
  // ==========================================

  window.PioneerCloud = {

    queueSync,

    signIn,

    signOut,

    syncNow,

    getUser: () => state.user,

    isReady: () => state.ready

  };


  // ==========================================
  // APPLICATION STARTUP
  // ==========================================

  function boot() {

    document
      .getElementById('googleSignIn')
      ?.addEventListener('click', signIn);

    document
      .getElementById('googleSignOut')
      ?.addEventListener('click', signOut);

    document
      .getElementById('syncNow')
      ?.addEventListener('click', syncNow);

    start();

  }

  if (document.readyState === 'loading') {

    document.addEventListener(
      'DOMContentLoaded',
      boot,
      { once: true }
    );

  } else {

    boot();

  }

})();
