"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/actions/auth";

type Props = {
  mode: "signup" | "login";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
};

const copy = {
  signup: {
    title: "Create your account",
    subtitle: "Free for students. Your account saves your progress in every guide.",
    submit: "Sign up",
    pending: "Creating account…",
    switchText: "Already have an account?",
    switchLabel: "Log in",
    switchHref: "/login",
  },
  login: {
    title: "Welcome back",
    subtitle: "Log in to your exam guides and your saved progress.",
    submit: "Log in",
    pending: "Logging in…",
    switchText: "New to Unlecture?",
    switchLabel: "Create an account",
    switchHref: "/signup",
  },
};

export function AuthForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null, email: "" });
  const t = copy[mode];

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
      <p className="mt-2 text-muted">{t.subtitle}</p>

      <form action={formAction} className="mt-8 space-y-5">
        <div>
          <label htmlFor={`${mode}-email`} className="block text-sm font-medium">
            Email
          </label>
          <input
            id={`${mode}-email`}
            data-testid={`${mode}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            defaultValue={state.email}
            className="field mt-1.5"
            placeholder="you@student.ie.edu"
          />
        </div>

        <div>
          <label htmlFor={`${mode}-password`} className="block text-sm font-medium">
            Password
          </label>
          <input
            id={`${mode}-password`}
            data-testid={`${mode}-password`}
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            className="field mt-1.5"
            aria-describedby={mode === "signup" ? "password-hint" : undefined}
          />
          {mode === "signup" && (
            <p id="password-hint" className="mt-1.5 text-sm text-muted">
              At least 6 characters.
            </p>
          )}
        </div>

        {state.error && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          data-testid={`${mode}-submit`}
          disabled={pending}
          className="btn-primary w-full"
        >
          {pending ? t.pending : t.submit}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {t.switchText}{" "}
        <Link href={t.switchHref} className="font-medium text-accent underline-offset-4 hover:underline">
          {t.switchLabel}
        </Link>
      </p>
    </div>
  );
}
