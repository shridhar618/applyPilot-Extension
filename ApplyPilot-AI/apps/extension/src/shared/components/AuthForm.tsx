import { LogIn, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../api";
import { useAction } from "../hooks";
import { Button, ErrorBanner, Field } from "../ui";

export function AuthForm({ compact }: { compact?: boolean }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const submit = useAction(async () => (mode === "login" ? api.login(email.trim(), password) : api.register(email.trim(), password, name.trim())));
  const onSubmit = (e: FormEvent) => { e.preventDefault(); void submit.run(); };
  const tooShort = mode === "register" && password.length > 0 && password.length < 10;
  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label={mode === "login" ? "Sign in" : "Create account"}>
      {!compact && <p className="text-ink-dim">{mode === "login" ? "Sign in to analyze jobs against your resume." : "Create an account to save resumes and track applications."}</p>}
      {mode === "register" && <Field label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
      <Field label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <Field label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"}
        hint={mode === "register" ? "At least 10 characters." : undefined} error={tooShort ? "Use at least 10 characters." : undefined} />
      {submit.error && <ErrorBanner message={submit.error} />}
      <Button type="submit" block loading={submit.loading} disabled={tooShort || !email || !password} icon={mode === "login" ? <LogIn size={15} /> : <UserPlus size={15} />}>
        {mode === "login" ? "Sign in" : "Create account"}
      </Button>
      <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); submit.clearError(); }} className="w-full text-center text-[12px] text-ink-dim hover:text-accent">
        {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
    </form>
  );
}
