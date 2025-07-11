import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import config from '../public/config';

const firebaseConfig = {
  apiKey: config.FIREBASE_API_KEY || 'missing-api-key',
  authDomain: config.FIREBASE_AUTH_DOMAIN || 'missing-auth-domain',
  projectId: config.FIREBASE_PROJECT_ID || 'missing-project-id',
  storageBucket: config.FIREBASE_STORAGE_BUCKET || 'missing-storage-bucket',
  messagingSenderId: config.FIREBASE_MESSAGING_SENDER_ID || 'missing-sender-id',
  appId: config.FIREBASE_APP_ID || 'missing-app-id',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);