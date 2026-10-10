import type { Metadata } from "next";
import { login } from "@/app/actions/auth";
import { AuthForm } from "@/app/components/auth-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return <AuthForm mode="login" action={login} />;
}
