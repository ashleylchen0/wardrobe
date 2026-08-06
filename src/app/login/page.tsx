import { redirect } from "next/navigation";
import { checkPassword, startSession } from "@/lib/auth";

export const metadata = { title: "Sign in · Wardrobe" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  async function signIn(formData: FormData) {
    "use server";
    const password = String(formData.get("password") ?? "");
    const target = String(formData.get("next") ?? "/") || "/";

    if (!(await checkPassword(password))) {
      redirect(`/login?error=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
    }
    await startSession();
    redirect(target);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form
        action={signIn}
        className="border-hair flex w-full max-w-sm flex-col gap-5 rounded-2xl border bg-card p-8"
      >
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-2xl tracking-tight">Wardrobe</h1>
          <p className="text-muted text-sm">Enter your password to continue.</p>
        </div>

        <input type="hidden" name="next" value={next ?? "/"} />
        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          aria-label="Password"
          className="border-hair focus:border-sage w-full rounded-lg border bg-card px-3 py-2 outline-none"
        />

        {error && (
          <p className="text-cpw-bad text-sm">That password didn&apos;t match.</p>
        )}

        <button
          type="submit"
          className="bg-sage hover:bg-sage/90 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
