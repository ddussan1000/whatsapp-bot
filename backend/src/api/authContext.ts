import type { Context } from "hono";
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

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function resolveSession(c: Context): Promise<RequestSession | null> {
  if (!supabase) return null;
  const token = parseBearerToken(c.req.header("authorization"));
  if (!token) return null;

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

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;
  const user = authData.user;
  const emailNorm = user.email ? normalizeEmail(user.email) : null;

  let isPlatformAdmin = false;
  if (emailNorm) {
    const { data: pa } = await supabase.from("platform_admins").select("email").eq("email", emailNorm).maybeSingle();
    isPlatformAdmin = Boolean(pa);
  }

  const requestedOrg = c.req.header("x-organization-id")?.trim() || undefined;

  if (isPlatformAdmin && requestedOrg) {
    const { data: org } = await supabase.from("organizations").select("id").eq("id", requestedOrg).maybeSingle();
    if (org) {
      return {
        userId: user.id,
        email: user.email ?? null,
        organizationId: requestedOrg,
        role: "owner",
        isPlatformAdmin: true,
      };
    }
  }

  let membershipQuery = supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  if (requestedOrg) membershipQuery = membershipQuery.eq("organization_id", requestedOrg);
  let { data: membership } = await membershipQuery.maybeSingle<Membership>();

  if (!membership && emailNorm) {
    const { data: allow } = await supabase
      .from("organization_signup_allowlist")
      .select("id, organization_id, role")
      .eq("email", emailNorm)
      .maybeSingle();
    if (allow) {
      const { error: insErr } = await supabase.from("organization_members").insert({
        organization_id: allow.organization_id,
        user_id: user.id,
        role: allow.role,
      });
      if (!insErr) {
        await supabase.from("organization_signup_allowlist").delete().eq("id", allow.id);
        membership = { organization_id: allow.organization_id, role: allow.role };
      }
    }
  }

  if (!membership && emailNorm) {
    const { data: invite } = await supabase
      .from("organization_invites")
      .select("id, organization_id, role")
      .eq("email", emailNorm)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (invite) {
      const { error: insErr } = await supabase.from("organization_members").insert({
        organization_id: invite.organization_id,
        user_id: user.id,
        role: invite.role,
      });
      if (!insErr) {
        await supabase.from("organization_invites").update({ status: "accepted" }).eq("id", invite.id);
        membership = { organization_id: invite.organization_id, role: invite.role };
      }
    }
  }

  if (!membership) {
    if (isPlatformAdmin) {
      return {
        userId: user.id,
        email: user.email ?? null,
        organizationId: null,
        role: "owner",
        isPlatformAdmin: true,
      };
    }
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    organizationId: membership.organization_id,
    role: membership.role,
    isPlatformAdmin,
  };
}
