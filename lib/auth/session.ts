import { headers } from "next/headers";

import { auth } from "@/lib/auth/auth";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

/**
 * Resolves the current Better Auth session on the server.
 * Returns null when the visitor is not authenticated.
 */
export async function getServerSession() {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession();

  if (!session?.user) {
    return null;
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  };
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getServerSession()) !== null;
}
