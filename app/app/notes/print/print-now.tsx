"use client";

import { useEffect, useRef } from "react";

// Opens the print window once the notes are on the page, and offers it again as a button.
export function PrintNow() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    window.print();
  }, []);
  return (
    <button type="button" className="pp-print" onClick={() => window.print()}>
      Save as PDF
    </button>
  );
}
