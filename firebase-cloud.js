/* Pioneer optional cloud sync. Local-first: the app remains usable if Firebase is unavailable. */
(() => {
  const CFG = () => window.PIONEER_FIREBASE_CONFIG || {};
  const isConfigured = c => c.apiKey && c.appId && c.projectId &&
    !/PASTE_|YOUR_PROJECT_ID/.test([c.apiKey,c.appId,c.projectId].join(' '));
  const state = { ready:false, user:null, db:null, auth:null, busy:false, timer:null, lastLocalHash:null };
  const status = (message, kind='neutral') => {
    const el = document.getElementById('cloudStatus');
    if (el) { el.textContent = message; el.dataset.kind = kind; }
  };
  const account = () => {
    const el = document.getElementById('cloudAccount');
    if (el) el.textContent = state.user ? (state.user.displayName || state.user.email || 'Google account') : 'Not signed in';
  };
  const setButtons = () => {
    const signIn = document.getElementById('googleSignIn');
    const signOut = document.getElementById('googleSignOut');
    if (signIn) signIn.hidden = !!state.user;
    if (signOut) signOut.hidden = !state.user;
  };
  const localHash = value => JSON.stringify(value);
  const getLocal = () => window.PioneerApp?.getData?.();
  const setLocal = value => window.PioneerApp?.replaceData?.(value);
  const show = msg => window.PioneerApp?.notify?.(msg);

  async function loadSdk() {
    if (window.firebase?.firestore) return;
    const urls = [
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js'
    ];
    for (const src of urls) await new Promise((resolve,reject) => {
      const s=document.createElement('script'); s.src=src; s.async=false;
      s.onload=resolve; s.onerror=()=>reject(new Error('Could not load Firebase SDK. Check your internet connection.'));
      document.head.appendChild(s);
    });
  }

  async function start() {
    const config=CFG();
    if (!isConfigured(config)) { status('Cloud sync needs your Firebase project configuration. Local mode is active.','warn'); return; }
    if (!navigator.onLine) { status('Offline — your changes stay on this device and will sync when online.','warn'); return; }
    try {
      await loadSdk();
      if (!firebase.apps.length) firebase.initializeApp(config);
      state.auth=firebase.auth(); state.db=firebase.firestore();
      state.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});
      try { await state.db.enablePersistence({synchronizeTabs:true}); }
      catch (e) { console.info('Firestore persistence unavailable in this browser/tab:',e.code||e.message); }
      state.ready=true;
      state.auth.onAuthStateChanged(async user => {
        state.user=user||null; account(); setButtons();
        if (!user) { status('Not signed in. Your data remains on this device.','neutral'); return; }
        status('Checking your cloud profile…','pending');
        await restoreOrCreate(user);
      });
      const result=await state.auth.getRedirectResult().catch(()=>null);
      if (result?.user) show('Google account connected');
    } catch(e) {
      console.error('Pioneer cloud initialisation failed',e);
      status('Cloud unavailable — local mode is still working.','warn');
    }
  }

  async function restoreOrCreate(user) {
    if (state.busy) return;
    state.busy=true;
    try {
      const ref=state.db.collection('users').doc(user.uid);
      const snap=await ref.get();
      const local=getLocal();
      if (!snap.exists) {
        await ref.set({data:local, updatedAt:firebase.firestore.FieldValue.serverTimestamp(), schemaVersion:1});
        localStorage.setItem('pioneer-cloud-owner',user.uid);
        status('Cloud backup active · first backup saved','good');
      } else {
        const cloud=snap.data()?.data;
        const owner=localStorage.getItem('pioneer-cloud-owner');
        if (cloud && owner===user.uid) {
          const baseline=localStorage.getItem('pioneer-cloud-baseline');
          if (baseline && localHash(local)!==baseline) {
            await ref.set({data:local,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),schemaVersion:1});
            status('Connected · offline changes uploaded','good');
          } else {
            setLocal(cloud);
            status('Connected · cloud data restored','good');
          }
        } else if (cloud) {
          const choice=confirm('This Google account already has Pioneer data.\n\nOK = restore cloud data onto this device (replaces this device’s current Pioneer data).\nCancel = keep this device’s data and upload it to this Google account (replaces the cloud copy).\n\nIf unsure, export a local backup first.');
          if (choice) {
            setLocal(cloud);
            status('Connected · cloud data restored','good');
          } else {
            await ref.set({data:local,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),schemaVersion:1});
            status('Connected · this device uploaded to cloud','good');
          }
          localStorage.setItem('pioneer-cloud-owner',user.uid);
        } else {
          await ref.set({data:local,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),schemaVersion:1});
          localStorage.setItem('pioneer-cloud-owner',user.uid);
          status('Connected · backup created','good');
        }
      }
      state.lastLocalHash=localHash(getLocal());
      localStorage.setItem('pioneer-cloud-baseline',state.lastLocalHash);
    } catch(e) {
      console.error('Pioneer restore failed',e);
      status('Could not sync now. Your local data is safe; retry when online.','warn');
    } finally { state.busy=false; }
  }

  async function syncNow() {
    if (!state.user || !state.ready || !navigator.onLine || state.busy) return;
    const local=getLocal(); if (!local) return;
    const hash=localHash(local);
    if (hash===state.lastLocalHash) return;
    state.busy=true; status('Saving your latest progress to Google…','pending');
    try {
      await state.db.collection('users').doc(state.user.uid).set({
        data:local, updatedAt:firebase.firestore.FieldValue.serverTimestamp(), schemaVersion:1
      });
      state.lastLocalHash=hash;
      localStorage.setItem('pioneer-cloud-owner',state.user.uid);
      localStorage.setItem('pioneer-cloud-baseline',hash);
      status('All changes synced · cloud backup up to date','good');
    } catch(e) {
      console.error('Pioneer sync failed',e);
      status('Sync pending — your changes remain saved on this device.','warn');
    } finally { state.busy=false; }
  }

  function queueSync() {
    if (!state.user) return;
    status(navigator.onLine?'Changes saved here · syncing…':'Offline · changes queued on this device','pending');
    clearTimeout(state.timer); state.timer=setTimeout(syncNow,900);
  }

  async function signIn() {
    if (!state.ready) { show('Cloud setup is not configured yet.'); return; }
    try { const provider=new firebase.auth.GoogleAuthProvider(); await state.auth.signInWithRedirect(provider); }
    catch(e) { console.error(e); show('Google sign-in failed: '+(e.message||e.code)); }
  }
  async function signOut() {
    if (!state.auth) return;
    if (!confirm('Sign out of Google? Your current data will remain on this device.')) return;
    await state.auth.signOut();
  }

  window.PioneerCloud={queueSync,signIn,signOut,syncNow};
  window.addEventListener('online',()=>{ if(state.user) syncNow(); else start(); });
  window.addEventListener('offline',()=>{ if(state.user) status('Offline · changes are saved on this device and will sync later','warn'); });
  document.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('googleSignIn')?.addEventListener('click',signIn);
    document.getElementById('googleSignOut')?.addEventListener('click',signOut);
    document.getElementById('syncNow')?.addEventListener('click',syncNow);
    start();
  });
})();
