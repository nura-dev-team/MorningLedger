// deno-lint-ignore-file
/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
// @ts-nocheck — This file runs on Deno (Supabase Edge Functions), not Node.js
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "NURA <nura@getnura.io>";
const BASE_URL = "https://morning-ledger.vercel.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Standard invite email HTML ──────────────────────────────────────────────

function buildInviteHtml({
  propertyName,
  role,
  token,
  senderName,
}: {
  propertyName: string;
  role: string;
  token: string;
  senderName?: string;
}) {
  const inviteUrl = `${BASE_URL}/invite/${token}`;
  const roleLabel =
    role === "gm"
      ? "General Manager"
      : role === "controller"
      ? "Controller / CFO"
      : role === "viewer"
      ? "Viewer"
      : role;

  const invitedBy = senderName ? `${senderName} has` : "You have been";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:32px 32px 0;text-align:center;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;letter-spacing:6px;color:#1a1a1a;">NURA</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:24px 32px 32px;">
          <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 8px;">
            ${invitedBy} invited you to join <strong>${propertyName}</strong> on NURA.
          </p>
          <p style="font-size:14px;color:#666;line-height:1.6;margin:0 0 24px;">
            Your role: <strong>${roleLabel}</strong>
          </p>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${inviteUrl}"
                 style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;
                        padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;">
                Accept Invite
              </a>
            </td></tr>
          </table>

          <p style="font-size:12px;color:#999;margin:24px 0 0;text-align:center;">
            This link expires in 7 days. If you didn't expect this, you can ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Setup/delegate invite email HTML ────────────────────────────────────────

function buildSetupInviteHtml({
  propertyName,
  token,
  senderName,
}: {
  propertyName: string;
  token: string;
  senderName?: string;
}) {
  const inviteUrl = `${BASE_URL}/invite/${token}`;
  const who = senderName || "The property owner";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:32px 32px 0;text-align:center;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;letter-spacing:6px;color:#1a1a1a;">NURA</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:24px 32px 32px;">
          <p style="font-size:16px;color:#1a1a1a;line-height:1.6;margin:0 0 8px;">
            <strong>${propertyName}</strong> needs your help on NURA.
          </p>
          <p style="font-size:14px;color:#666;line-height:1.6;margin:0 0 8px;">
            ${who} has set up their property and needs you to complete the financial configuration — budgets, GL structure, and integrations.
          </p>
          <p style="font-size:14px;color:#666;line-height:1.6;margin:0 0 24px;">
            Your role: <strong>Controller / CFO</strong>
          </p>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${inviteUrl}"
                 style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;
                        padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;">
                Accept &amp; Start Setup
              </a>
            </td></tr>
          </table>

          <p style="font-size:12px;color:#999;margin:24px 0 0;text-align:center;">
            This link expires in 7 days. If you didn't expect this, you can ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Handler ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }

    const {
      email,
      propertyName,
      role,
      token,
      senderName,
      setupInvite,
    } = await req.json();

    if (!email || !propertyName || !token) {
      throw new Error("Missing required fields: email, propertyName, token");
    }

    const isSetup = setupInvite === true;

    const subject = isSetup
      ? `${propertyName} needs your help on NURA`
      : `You've been invited to join ${propertyName} on NURA`;

    const html = isSetup
      ? buildSetupInviteHtml({ propertyName, token, senderName })
      : buildInviteHtml({ propertyName, role, token, senderName });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend API error:", data);
      return new Response(JSON.stringify({ error: data }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
