"use client";

import { useState } from "react";
import { examInstant, formatExam, type ExamSetting } from "@/lib/guides";
import { Countdown } from "./countdown";
import { useGuide } from "./progress";

const FALLBACK_ZONES = ["Europe/Madrid", "Europe/London", "Europe/Oslo", "Europe/Paris", "UTC", "America/New_York", "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore"];

function zones(current: string) {
  const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? FALLBACK_ZONES;
  return all.includes(current) ? all : [current, ...all];
}

// The student's own exam for this course. Nothing is shown until they add it; then the date, time and time zone
// and a countdown. Saved with their progress, so it applies to this course only.
export function ExamDate() {
  const { guest, progress, update } = useGuide();
  const exam = progress.exam;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExamSetting>({ date: "", time: "", tz: "UTC" });
  const [error, setError] = useState("");

  if (guest) return null;

  const open = () => {
    setDraft(exam ?? { date: "", time: "09:00", tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" });
    setError("");
    setEditing(true);
  };

  const saveExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.date || !draft.time) {
      setError("Add both the date and the time of your exam.");
      return;
    }
    update((p) => ({ ...p, exam: draft }));
    setEditing(false);
  };

  const remove = () => {
    update((p) => {
      const next = { ...p };
      delete next.exam;
      return next;
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <form className="exam-form" onSubmit={saveExam} aria-label="Your exam date">
        <label>
          <span>Date</span>
          <input type="date" required value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        </label>
        <label>
          <span>Time</span>
          <input type="time" required value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
        </label>
        <label className="tz">
          <span>Time zone</span>
          <select value={draft.tz} onChange={(e) => setDraft({ ...draft, tz: e.target.value })}>
            {zones(draft.tz).map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <div className="exam-actions">
          <button type="submit" className="btn">
            Save
          </button>
          <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
          {exam && (
            <button type="button" className="link-btn" onClick={remove}>
              Remove
            </button>
          )}
        </div>
        {error && (
          <p className="exam-err" role="alert">
            {error}
          </p>
        )}
      </form>
    );
  }

  if (!exam) {
    return (
      <button type="button" className="exam-add" onClick={open}>
        + Add your exam date
      </button>
    );
  }

  return (
    <p className="exam-set">
      <span className="chip hot">
        Your exam: {formatExam(exam)}{" · "}
        <Countdown at={examInstant(exam)} />
      </span>
      <button type="button" className="link-btn" onClick={open}>
        Change
      </button>
    </p>
  );
}
