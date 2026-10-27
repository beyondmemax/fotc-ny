import { initializeApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase, ref, onValue, set, onDisconnect, serverTimestamp } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBFwZ8HDstTyJtsA22zfe_RCIYhRF39LX8",
  authDomain: "fotc-ny.firebaseapp.com",
  projectId: "fotc-ny",
  storageBucket: "fotc-ny.firebasestorage.app",
  messagingSenderId: "549057336309",
  appId: "1:549057336309:web:188196e1334fd05ea046bc",
  databaseURL: "https://fotc-ny-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);

// Use initializeAuth with persistence set synchronously — no race condition
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence
});

export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export { ref, onValue, set, onDisconnect, serverTimestamp };