import { redirect } from "next/navigation";

import { logoutAction } from "@/app/logout/actions";
import { PauConsole } from "@/components/pau-console";
import { getCurrentSession } from "@/lib/auth/server";
import { getPauWorkspaceSnapshot } from "@/lib/pau/dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }
  const dashboard = await getPauWorkspaceSnapshot();

  return (
    <PauConsole
      initialData={dashboard}
      logoutAction={logoutAction}
      role={session.role}
      userName={session.userName}
    />
  );
}
