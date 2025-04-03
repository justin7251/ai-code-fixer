const admin = require('firebase-admin');

// Initialize Firebase Admin only if it hasn't been initialized yet
let firebaseAdmin;
if (!admin.apps.length) {
    firebaseAdmin = admin.initializeApp();
} else {
    firebaseAdmin = admin.app();
}

module.exports = firebaseAdmin; 