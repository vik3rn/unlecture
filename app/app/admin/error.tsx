"use client";

// Shown when an admin page fails to render: what went wrong (or the server's error code) and a way to try again.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="ad-card" role="alert">
      <h2>The admin page could not load</h2>
      <p className="ad-sub" style={{ margin: 0 }}>
        {error.digest ? `Server error code ${error.digest}. ` : ""}
        {error.message || "Unknown error."}
      </p>
      <div>
        <button type="button" className="ad-btn" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
