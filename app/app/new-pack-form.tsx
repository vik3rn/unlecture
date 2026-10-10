"use client";

import { useActionState } from "react";
import { createStudyPack, type CreatePackState } from "./actions";

const initialState: CreatePackState = { error: null };

export function NewPackForm() {
  const [state, formAction, pending] = useActionState(createStudyPack, initialState);

  return (
    <form action={formAction} className="card p-4 sm:p-5">
      <label htmlFor="core-input" className="block font-medium">
        What do you want to understand?
      </label>
      <p id="core-input-hint" className="mt-1 text-sm text-muted">
        A topic from your lecture, e.g. &ldquo;OLS regression&rdquo; or &ldquo;Porter&rsquo;s five forces&rdquo;.
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          id="core-input"
          data-testid="core-input"
          name="title"
          type="text"
          required
          maxLength={200}
          autoComplete="off"
          placeholder="OLS regression"
          aria-describedby={state.error ? "core-input-hint core-input-error" : "core-input-hint"}
          className="field flex-1"
        />
        <button
          type="submit"
          data-testid="core-submit"
          disabled={pending}
          className="btn-primary sm:w-auto"
        >
          {pending ? "Saving…" : "Add study pack"}
        </button>
      </div>
      {state.error && (
        <p id="core-input-error" role="alert" className="mt-3 text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
