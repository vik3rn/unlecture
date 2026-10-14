"use client";

import { useEffect, useRef } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { partFromSegment } from "@/lib/guide-time";
import { trackStudyTime } from "@/lib/study-tracker";

// Measures active study time while a logged-in student is in a guide (mounted in the guide layout only, never in
// the free preview). The part comes from the route: the [part] segment, or −1 on the overview and other pages.
export function StudyTimer({ guideId }: { guideId: string }) {
  const part = partFromSegment(useSelectedLayoutSegment());
  const partRef = useRef(part);
  const flushRef = useRef<() => void>(() => {});

  useEffect(() => {
    const tracker = trackStudyTime(guideId, () => partRef.current);
    flushRef.current = tracker.flush;
    return () => {
      flushRef.current = () => {};
      tracker.stop();
    };
  }, [guideId]);

  // Moving to another part: send the time of the page being left before counting for the new one.
  useEffect(() => {
    if (partRef.current === part) return;
    flushRef.current();
    partRef.current = part;
  }, [part]);

  return null;
}
