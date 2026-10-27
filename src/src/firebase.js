import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBFwZ8HDstTyJtsA22zfe_RCIYhRF39LX8",
  authDomain: "fotc-ny.firebaseapp.com",
  projectId: "fotc-ny",
  storageBucket: "fotc-ny.firebasestorage.app",
  messagingSenderId: "549057336309",
  appId: "1:549057336309:web:188196e1334fd05ea046bc"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
