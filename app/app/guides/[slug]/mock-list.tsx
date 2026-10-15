"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { GuideFormat, MockSummary } from "@/lib/guides";
import { bestScore, fmtPoints, mockDeadline, pickOfText } from "@/lib/scoring";
import { useGuide } from "./progress";
import { Html } from "./ui";

// The time, checked every 30 seconds while the list is on screen; null on the server so the first render matches.
const subscribeHalfMinute = (cb: () => void) => {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
};
const halfMinuteNow = () => Math.floor(Date.now() / 30_000) * 30_000;
const noTime = () => null;

// The guide's timed mock exams on the course overview, with the student's best and last score. In the free
// preview they are listed but locked. An attempt whose time ran out while its page was closed is submitted when the
// student opens it again; until then it shows "Time is up".
export function MockList({ mocks, format }: { mocks: MockSummary[]; format: GuideFormat }) {
  const { base, guest, progress } = useGuide();
  const now = useSyncExternalStore(subscribeHalfMinute, halfMinuteNow, noTime);
  return (
    <section className="unit" aria-labelledby="mock-exams">
      <h2 id="mock-exams">Mock exams</h2>
      <p className="unit-note">
        Full length and timed, scored like the exam ({format.label || pickOfText(format)}). No feedback until you submit.
      </p>
      <ul className="parts">
        {mocks.map((m, i) => {
          const s = progress.mocks?.[m.id];
          const locked = guest || m.locked;
          const best = s ? bestScore(s.history) : null;
          const last = s?.history.at(-1) ?? null;
          const running = !locked && s?.submittedAt === null;
          const timeUp = running && now !== null && now >= mockDeadline(s.startedAt, m.minutes);
          const meta = [
            `${m.minutes} min`,
            `${m.mcq} multiple choice`,
            m.open > 0 && `${m.open} open`,
            `${fmtPoints(m.points)} points`,
          ]
            .filter(Boolean)
            .join(" · ");
          const status = running
            ? timeUp
              ? "Time is up: open it to see your score"
              : "In progress"
            : !locked && best
              ? `Best ${fmtPoints(best.score)}/${fmtPoints(best.max)}${last && last !== best ? ` · last ${fmtPoints(last.score)}` : ""}`
              : "";
          const body = (
            <>
              <span className="pn" aria-hidden="true">
                {locked ? "🔒" : `M${i + 1}`}
              </span>
              <span className="pt">
                <span className="t">
                  <span className="sr-only">Mock exam {i + 1}: </span>
                  <Html html={m.title} />
                </span>
                <span className="pm">{locked ? `Log in to take timed mock exams · ${meta}` : meta}</span>
                {/* Phones hide the badges on the right: the status goes under the title there. */}
                {status && <span className="pm mock-status">{status}</span>}
              </span>
              <span className="ps">
                {status && <span className={`badge ${running ? "hot" : "done"}`}>{timeUp ? "Time is up" : status}</span>}
                <span className="go" aria-hidden="true">
                  →
                </span>
              </span>
            </>
          );
          return (
            <li key={m.id}>
              {locked ? (
                <Link href="/login" className="row locked">
                  {body}
                </Link>
              ) : (
                <Link href={`${base}/mock/${m.id}`} className="row">
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
