const admin = require('firebase-admin');
const logger = require('../utils/logger');

let firebaseApp = null;

const initializeFirebase = () => {
  try {
    // Check if Firebase is already initialized
    if (firebaseApp) {
      return firebaseApp;
    }

    // Firebase service account credentials from environment variables
    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
    };

    // Validate required credentials
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      logger.warn('Firebase credentials not fully configured. Push notifications will be disabled.');
      logger.warn('Missing: ' + (!serviceAccount.project_id ? 'project_id ' : '') + (!serviceAccount.private_key ? 'private_key ' : '') + (!serviceAccount.client_email ? 'client_email' : ''));
      return null;
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    logger.info(`Firebase initialized for project: ${serviceAccount.project_id}`);
    return firebaseApp;
  } catch (error) {
    logger.error('Failed to initialize Firebase:', error.message);
    return null;
  }
};

const getFirebaseApp = () => {
  if (!firebaseApp) {
    return initializeFirebase();
  }
  return firebaseApp;
};

const getMessaging = () => {
  const app = getFirebaseApp();
  if (!app) return null;
  return admin.messaging();
};

module.exports = {
  initializeFirebase,
  getFirebaseApp,
  getMessaging,
  admin
};

