import { useEffect, useState } from "react";

export default function ErrorPage() {
    const [error, setError] = useState("");
    
    useEffect(() => {
        // Extract message from URL using vanilla JS
        const urlParams = new URLSearchParams(window.location.search);
        const messageFromURL = urlParams.get("message");

        async function fetchError() {
            try {
                const res = await fetch("/api/auth/error", { credentials: "include" });
                if (!res.ok) {
                    throw new Error("Failed to fetch error details");
                }
                const data = await res.json();
                setError(data.error || "An unknown error occurred.");
            } catch (err) {
                console.error("Error fetching error details:", err);
                // If API fetch fails, use the error message from URL parameters
                if (messageFromURL) {
                    setError(decodeURIComponent(messageFromURL));
                } else {
                    setError("Authentication error. Please try again.");
                }
            }
        }
        
        // If we have a message in URL, use it directly
        if (messageFromURL) {
            setError(decodeURIComponent(messageFromURL));
        } else {
            // Otherwise try to fetch from API
            fetchError();
        }
    }, []);

    return (
        <div className="auth-error-container">
            <h1>Authentication Error</h1>
            <p>{error}</p>
            <div className="error-actions">
                <button onClick={() => window.location.href = "/"}>
                    Return to Home
                </button>
            </div>
        </div>
    );
}
