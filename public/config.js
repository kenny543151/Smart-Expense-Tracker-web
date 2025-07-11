const config = {
  EMAILJS_SERVICE_ID: import.meta.env.VITE_EMAILJS_SERVICE_ID,
  EMAILJS_TEMPLATE_ID: import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
  EMAILJS_PUBLIC_KEY: import.meta.env.VITE_EMAILJS_PUBLIC_KEY,
  FIREBASE_VAPID_KEY: 'BAcwjPKvHOq5paW-cCe0FYARL2LQiSa6ESiVFVW1q3n-aCQ2BrNllZti302OS3fDE8OahY_qaz2sTeGX4i4vyLE',
  FIREBASE_API_KEY: 'AIzaSyBBJwo1yVkrDB-7xDn9eJotrqRwbavgkIQ',
  FIREBASE_AUTH_DOMAIN: 'smart-expense-tracker-95fd6.firebaseapp.com',
  FIREBASE_PROJECT_ID: 'smart-expense-tracker-95fd6',
  FIREBASE_STORAGE_BUCKET: 'smart-expense-tracker-95fd6.firebasestorage.app',
  FIREBASE_MESSAGING_SENDER_ID: '153451200309',
  FIREBASE_APP_ID: '1:153451200309:web:56dfe1b585513b1495567c',
};

self.config = config; // Make config available in service worker
export default config; // For ES modules in Dashboard.jsx