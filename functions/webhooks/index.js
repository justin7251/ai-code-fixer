const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors({origin: "https://ai-code-fixer.web.app", credentials: true}));
app.use(express.json());

app.post("/github/webhook", (req, res) => {
    const event = req.headers["x-github-event"];
    const payload = req.body;

    console.log(`Received GitHub webhook event: ${event}`);

    if (event === "push") {
        console.log(`Push event received for repository: ${payload.repository.full_name}`);
        // TODO: Process PMD warning checks here
    }

    res.sendStatus(200);
});

exports.webhooks = functions.https.onRequest(app);
