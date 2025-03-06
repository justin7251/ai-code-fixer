import { useEffect, useState } from "react";

export default function ErrorPage() {
    const [error, setError] = useState("");

    useEffect(() => {
        async function fetchError() {
            const res = await fetch("/api/auth/error", { credentials: "include" });
            const data = await res.json();
            setError(data.error || "An unknown error occurred.");
        }
        fetchError();
    }, []);

    return (
        <div>
            <h1>Authentication Error</h1>
            <p>{error}</p>
        </div>
    );
}
