import type { Context } from "hono";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../db/supabase";
import { env } from "../config/env";

type Membership = {
  organization_id: string;
  role: "owner" | "admin" | "agent" | "viewer";
};

export type RequestSession = {
  userId: string;
  email: string | null;
  organizationId: string | null;
  role: "owner" | "admin" | "agent" | "viewer";
  isPlatformAdmin: boolean;
};

function parseBearerToken(authHeader?: string) {
  if (!authHeader) return "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

/**
 * Cliente con JWT del usuario en el header para que Postgres vea auth.uid() en RPC con security invoker
 * (p. ej. is_org_member). El singleton en db/supabase.ts no envía el token; no usarlo en esas rutas.
 */
export function getSupabaseWithUserJwt(c: Context): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  const token = parseBearerToken(c.req.header("authorization"));
  if (!token) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isUuidString(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

/**
 * Cliente para resolver sesión en el API:
 * - Si existe SUPABASE_SERVICE_ROLE_KEY, usa service role (bypass RLS; adecuado para backend).
 * - Si no, usa SUPABASE_KEY con Authorization: Bearer <jwt> para que RLS vea auth.uid() con la anon key.
 */
function getDbForSession(token: string): SupabaseClient | null {
  if (!env.SUPABASE_URL) return null;
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  if (!env.SUPABASE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// Cache resolved sessions to avoid 3 Supabase round-trips per request.
// TTL 60s: role/org changes take effect within 1 minute. Side-effect: a revoked
// JWT (password change, forced sign-out) remains valid in the cache until expiry —
// acceptable tradeoff for this app's threat model.
const SESSION_CACHE_TTL_MS = 60_000;
const sessionCache = new Map<string, { session: RequestSession; expiresAt: number }>();

function tokenCacheKey(token: string, orgHeader: string): string {
  // Hash the JWT so raw tokens never appear in memory snapshots or debug output.
  const hash = createHash("sha256").update(token).digest("hex");
  return `${hash}:${orgHeader}`;
}

export async function resolveSession(c: Context): Promise<RequestSession | null> {
  if (!supabase) return null;
  const token = parseBearerToken(c.req.header("authorization"));
  if (!token) return null;

  // Skip cache for dashboard secret — it's a static token with no JWT expiry.
  const isDashboardSecret = env.DASHBOARD_SECRET && token === env.DASHBOARD_SECRET;
  const orgHeader = c.req.header("x-organization-id")?.trim() || "";

  if (!isDashboardSecret) {
    const cacheKey = tokenCacheKey(token, orgHeader);
    const cached = sessionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.session;
  }

  if (env.DASHBOARD_SECRET && token === env.DASHBOARD_SECRET) {
    const { data: fallbackMembership } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!fallbackMembership) return null;
    return {
      userId: "dashboard-secret",
      email: null,
      organizationId: fallbackMembership.organization_id,
      role: fallbackMembership.role,
      isPlatformAdmin: false,
    };
  }

  const db = getDbForSession(token);
  if (!db) return null;

  const { data: authData, error: authError } = await db.auth.getUser(token);
  if (authError || !authData.user) return null;
  const user = authData.user;
  const emailNorm = user.email ? normalizeEmail(user.email) : null;

  let isPlatformAdmin = false;
  if (emailNorm) {
    const { data: pa } = await db.from("platform_admins").select("email").eq("email", emailNorm).maybeSingle();
    isPlatformAdmin = Boolean(pa);
  }

  const requestedOrg = c.req.header("x-organization-id")?.trim() || undefined;

  if (isPlatformAdmin && requestedOrg) {
    const { data: org } = await db.from("organizations").select("id").eq("id", requestedOrg).maybeSingle();
    if (org) {
      return cacheAndReturn(token, orgHeader, {
        userId: user.id,
        email: user.email ?? null,
        organizationId: requestedOrg,
        role: "owner",
        isPlatformAdmin: true,
      });
    }
    // RLS en organizations solo permite ver filas donde el usuario es miembro; un platform admin
    // puede no aparecer en organization_members y el SELECT devuelve vacío. Confiar en el UUID del header.
    if (isUuidString(requestedOrg)) {
      return cacheAndReturn(token, orgHeader, {
        userId: user.id,
        email: user.email ?? null,
        organizationId: requestedOrg.trim(),
        role: "owner",
        isPlatformAdmin: true,
      });
    }
  }

  let membershipQuery = db
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  if (requestedOrg) membershipQuery = membershipQuery.eq("organization_id", requestedOrg);
  let { data: membership } = await membershipQuery.maybeSingle<Membership>();

  // Si el X-Organization-Id no coincide con ninguna membresía del usuario, ignorar el filtro
  // y buscar la primera org disponible (evita 401 por localStorage obsoleto)
  if (!membership && requestedOrg) {
    const { data: fallback } = await db
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<Membership>();
    if (fallback) membership = fallback;
  }

  if (!membership && emailNorm) {
    const { data: allow } = await db
      .from("organization_signup_allowlist")
      .select("id, organization_id, role")
      .eq("email", emailNorm)
      .maybeSingle();
    if (allow) {
      // Use the admin singleton (no user JWT override) so RLS is not applied on this privileged insert
      const adminDb = supabase;
      const { error: insErr } = await (adminDb ?? db).from("organization_members").insert({
        organization_id: allow.organization_id,
        user_id: user.id,
        role: allow.role,
      });
      if (!insErr) {
        await (adminDb ?? db).from("organization_signup_allowlist").delete().eq("id", allow.id);
        membership = { organization_id: allow.organization_id, role: allow.role };
      }
    }
  }

  if (!membership && emailNorm) {
    const { data: invite } = await db
      .from("organization_invites")
      .select("id, organization_id, role")
      .eq("email", emailNorm)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (invite) {
      // Use the admin singleton (no user JWT override) so RLS is not applied on this privileged insert
      const adminDb = supabase;
      const { error: insErr } = await (adminDb ?? db).from("organization_members").insert({
        organization_id: invite.organization_id,
        user_id: user.id,
        role: invite.role,
      });
      if (!insErr) {
        await (adminDb ?? db).from("organization_invites").update({ status: "accepted" }).eq("id", invite.id);
        membership = { organization_id: invite.organization_id, role: invite.role };
      }
    }
  }

  if (!membership) {
    if (isPlatformAdmin) {
      return cacheAndReturn(token, orgHeader, {
        userId: user.id,
        email: user.email ?? null,
        organizationId: null,
        role: "owner",
        isPlatformAdmin: true,
      });
    }
    return null;
  }

  return cacheAndReturn(token, orgHeader, {
    userId: user.id,
    email: user.email ?? null,
    organizationId: membership.organization_id,
    role: membership.role,
    isPlatformAdmin,
  });
}

function cacheAndReturn(token: string, orgHeader: string, session: RequestSession): RequestSession {
  const cacheKey = tokenCacheKey(token, orgHeader);
  sessionCache.set(cacheKey, { session, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
  // Evict stale entries to prevent unbounded growth (runs only on cache writes).
  if (sessionCache.size >= 500) {
    const now = Date.now();
    for (const [k, v] of sessionCache) {
      if (v.expiresAt <= now) sessionCache.delete(k);
    }
  }
  return session;
}
