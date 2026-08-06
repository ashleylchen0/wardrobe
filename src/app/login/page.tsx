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
    <main className="flex min-h-dvh items-center justify-center bg-stone-50 p-6 dark:bg-stone-950">
      <form
        action={signIn}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">
            Wardrobe
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Enter your password to continue.
          </p>
        </div>

        <input type="hidden" name="next" value={next ?? "/"} />
        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          aria-label="Password"
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-50 dark:focus:border-stone-400"
        />

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            That password didn&apos;t match.
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-stone-900 px-4 py-2 font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
