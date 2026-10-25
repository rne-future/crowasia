import { eq } from "drizzle-orm";
import { db } from "@/shared/db/client";
import { profiles, userRoles } from "@/shared/db/schema/identity";
import { createClient } from "@/shared/auth/server";
import {
  type Actor,
  type Role,
  UnauthorizedError,
  ForbiddenError,
} from "./types";

export async function getActor(
  request?: Request,
  dbClient = db
): Promise<Actor | null> {
  const supabase = await createClient(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  // Query user_roles from Drizzle DB
  const roleRows = await dbClient
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, user.id));

  const roles = roleRows.map((r) => r.role as Role);

  const authTime = user.last_sign_in_at
    ? new Date(user.last_sign_in_at)
    : user.created_at
      ? new Date(user.created_at)
      : new Date();

  // Invariant: verifiedEmail MUST come from user.email (auth.users), NEVER from editable profile fields.
  return {
    userId: user.id,
    verifiedEmail: user.email ?? "",
    roles,
    authTime,
  };
}

export async function requireActor(
  request?: Request,
  dbClient = db
): Promise<Actor> {
  const actor = await getActor(request, dbClient);
  if (!actor) {
    throw new UnauthorizedError("Unauthorized: actor authentication required");
  }
  return actor;
}

export function requireRole(actor: Actor, role: Role | Role[]): void {
  const allowed = Array.isArray(role) ? role : [role];
  const hasRole = allowed.some((r) => actor.roles.includes(r));
  if (!hasRole) {
    throw new ForbiddenError(
      `Forbidden: missing required role [${allowed.join(", ")}]`
    );
  }
}
