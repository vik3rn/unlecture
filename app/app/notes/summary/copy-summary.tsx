"use client";

import { useState } from "react";

// "Copy as text": the whole summary as plain text, for a document or a message to a classmate.
export function CopySummary({ text }: { text: string }) {
  const [done, setDone] = useState<"" | "ok" | "fail">("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone("ok");
    } catch {
      setDone("fail");
    }
  };
  return (
    <>
      <button type="button" className="nh-btn" onClick={copy}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
        </svg>
        {done === "ok" ? "Copied" : "Copy as text"}
      </button>
      <span role="status" className="sr-only">
        {done === "ok" ? "The summary is copied." : done === "fail" ? "Copying did not work in this browser." : ""}
      </span>
    </>
  );
}
