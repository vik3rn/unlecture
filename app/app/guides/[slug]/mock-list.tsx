"use client";

import Link from "next/link";
import type { GuideFormat, MockSummary } from "@/lib/guides";
import { bestScore, fmtPoints, pickOfText } from "@/lib/scoring";
import { useGuide } from "./progress";
import { Html } from "./ui";

// The guide's timed mock exams on the course overview, with the student's best and last score. In the free
// preview they are listed but locked.
export function MockList({ mocks, format }: { mocks: MockSummary[]; format: GuideFormat }) {
  const { base, guest, progress } = useGuide();
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
          const meta = [
            `${m.minutes} min`,
            `${m.mcq} multiple choice`,
            m.open > 0 && `${m.open} open`,
            `${fmtPoints(m.points)} points`,
          ]
            .filter(Boolean)
            .join(" · ");
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
              </span>
              <span className="ps">
                {!locked && s?.submittedAt === null ? (
                  <span className="badge hot">In progress</span>
                ) : !locked && best ? (
                  <span className="badge done">
                    Best {fmtPoints(best.score)}/{fmtPoints(best.max)}
                    {last && last !== best && ` · last ${fmtPoints(last.score)}`}
                  </span>
                ) : null}
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
