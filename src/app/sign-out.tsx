import { redirect } from "next/navigation";
import { endSession } from "@/lib/auth";

export function SignOutButton() {
  async function signOut() {
    "use server";
    await endSession();
    redirect("/login");
  }

  return (
    <form action={signOut} className="ml-auto">
      <button
        type="submit"
        className="text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
      >
        Sign out
      </button>
    </form>
  );
}
