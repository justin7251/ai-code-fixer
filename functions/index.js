const functions = require("firebase-functions");
const admin = require('./firebase-admin');
const express = require("express");
const path = require('path');
const fs = require('fs');
const config = require("./config");

// Load environment variables from .env file if it exists
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        console.log('[CONFIG] Loading environment variables from .env file');
        require('dotenv').config({path: envPath});
    }
} catch (error) {
    console.warn('[CONFIG] Error loading .env file:', error.message);
}

// Import Express apps from src directory
const apiApp = require("./src/api/app");

// Log environment
const isDev = process.env.FUNCTIONS_EMULATOR === 'true';
console.log('[DEBUG] Running in:', isDev ? 'LOCAL EMULATOR' : 'PRODUCTION');

// Function execution monitoring
const monitorExecution = (req, res, next) => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    res.on('finish', () => {
        const endTime = Date.now();
        const endMemory = process.memoryUsage().heapUsed;
        const executionTime = endTime - startTime;
        const memoryUsed = endMemory - startMemory;

        console.log(`[MONITOR] Request to ${req.path} - Time: ${executionTime}ms, Memory: ${memoryUsed} bytes`);
    });

    next();
};

// Apply monitoring middleware
apiApp.use(monitorExecution);

// Export Firebase Functions
exports.api = functions.https.onRequest(apiApp);

// Optional scheduler (commented out by default)
// exports.scheduler = functions.pubsub.schedule("every 24 hours").onRun(context => {
//     return require("./src/jobs/checkPMDWarnings")();
// });