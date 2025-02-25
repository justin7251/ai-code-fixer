const functions = require("firebase-functions/v2");
const admin = require("firebase-admin");

const db = admin.firestore();

// Scheduled function to check PMD warnings
exports.checkPMDWarnings = functions.scheduler.onSchedule("every 24 hours", async () => {
    console.log("Running PMD warning check...");

    try {
        const users = await db.collection("users").get();
        users.forEach((doc) => {
            console.log(`Checking PMD warnings for user: ${doc.data().username}`);
            // TODO: Add logic to check for PMD warnings
        });
    } catch (error) {
        console.error("Error in scheduled job:", error);
    }
});
