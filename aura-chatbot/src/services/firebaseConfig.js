// src/services/firebaseConfig.js
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyDhk87l2Zms8mT80__bAZA56825C7yoxQo",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "fir-auth-46398.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "fir-auth-46398",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "fir-auth-46398.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "413507602598",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:413507602598:web:0e56b0d5df3aa4767a4c67",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-HMW3QX4G4V"
};

// Inicializar Firebase solo si no está inicializado
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export const db = firebase.firestore();

// Configurar proveedor de Google
export const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');

export default firebase;