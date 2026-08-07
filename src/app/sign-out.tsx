import { redirect } from "next/navigation";
import { endSession } from "@/lib/auth";

export function SignOutButton() {
  async function signOut() {
    "use server";
    await endSession();
    redirect("/login");
  }

  return (
    <form action={signOut} className="">
      <button type="submit" className="microcap text-muted hover:text-ink text-[10px] transition-colors">
        Sign out
      </button>
    </form>
  );
}
