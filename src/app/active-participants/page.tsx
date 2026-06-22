import { redirect } from "next/navigation";

import { logoutAction } from "@/app/logout/actions";
import { ActiveParticipantsConsole } from "@/components/active/active-participants-console";
import { getCurrentSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function ActiveParticipantsPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <ActiveParticipantsConsole
      logoutAction={logoutAction}
      role={session.role}
      userName={session.userName}
    />
  );
}
