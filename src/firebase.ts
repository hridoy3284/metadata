import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDm2eY_VtZe9jmSa4faZywpK8CD0XRo8dk",
  authDomain: "metadata-7c3ce.firebaseapp.com",
  databaseURL: "https://metadata-7c3ce-default-rtdb.firebaseio.com",
  projectId: "metadata-7c3ce",
  storageBucket: "metadata-7c3ce.firebasestorage.app",
  messagingSenderId: "117663026922",
  appId: "1:117663026922:web:2402f9df307006f44f5193"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
