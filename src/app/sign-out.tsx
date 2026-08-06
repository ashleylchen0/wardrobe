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
      <button type="submit" className="eyebrow hover:text-ink transition-colors">
        Sign out
      </button>
    </form>
  );
}
