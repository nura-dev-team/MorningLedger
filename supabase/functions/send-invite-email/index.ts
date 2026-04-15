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

  const inviterLine = senderName
    ? `${senderName} invited you to join <strong>${propertyName}</strong> on NURA as <strong>${roleLabel}</strong>.`
    : `You're invited to join <strong>${propertyName}</strong> on NURA as <strong>${roleLabel}</strong>.`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>You're invited to NURA</title>
  </head>
  <body style="margin:0;padding:0;background:#FAF9F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1B1A17;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F7;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #EDEAE4;border-radius:4px;overflow:hidden;max-width:520px;">
            <tr>
              <td style="background:#1B1A17;padding:28px 40px;text-align:left;">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:6px;text-transform:uppercase;color:#C9A84C;">NURA</div>
              </td>
            </tr>
            <tr>
              <td style="padding:40px;">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.3;color:#1B1A17;margin-bottom:16px;">
                  You're invited to ${propertyName}
                </div>
                <div style="font-size:15px;line-height:1.6;color:#4A4842;margin-bottom:8px;">
                  ${inviterLine}
                </div>
                <div style="font-size:15px;line-height:1.6;color:#4A4842;margin-bottom:32px;">
                  NURA is the morning ledger for restaurant operators &mdash; prime cost, budgets, and invoices, every morning before service.
                </div>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:#1B1A17;border-radius:3px;">
                      <a href="${inviteUrl}"
                         style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;letter-spacing:0.3px;">
                        Accept invite &rarr;
                      </a>
                    </td>
                  </tr>
                </table>
                <div style="font-size:12px;line-height:1.6;color:#8A857B;margin-top:32px;">
                  This invite expires in 7 days. If you didn't expect this email, you can safely ignore it.
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#FAF9F7;padding:20px 40px;border-top:1px solid #EDEAE4;">
                <div style="font-size:11px;line-height:1.5;color:#8A857B;">
                  NURA &middot; Run your restaurant on real numbers<br>
                  <a href="https://getnura.io" style="color:#8A857B;text-decoration:underline;">getnura.io</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
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

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>You're set up to get ${propertyName} running</title>
  </head>
  <body style="margin:0;padding:0;background:#FAF9F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1B1A17;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F7;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #EDEAE4;border-radius:4px;overflow:hidden;max-width:520px;">
            <tr>
              <td style="background:#1B1A17;padding:28px 40px;text-align:left;">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:6px;text-transform:uppercase;color:#C9A84C;">NURA</div>
              </td>
            </tr>
            <tr>
              <td style="padding:40px;">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.3;color:#1B1A17;margin-bottom:16px;">
                  You're set up to get ${propertyName} running
                </div>
                <div style="font-size:15px;line-height:1.6;color:#4A4842;margin-bottom:8px;">
                  ${who} created <strong>${propertyName}</strong> on NURA and added you as <strong>Controller / CFO</strong> to finish the financial setup &mdash; budgets, GL structure, and integrations.
                </div>
                <div style="font-size:15px;line-height:1.6;color:#4A4842;margin-bottom:32px;">
                  Once you're done, the team gets prime cost, budgets, and invoices in their inbox every morning.
                </div>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:#1B1A17;border-radius:3px;">
                      <a href="${inviteUrl}"
                         style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;letter-spacing:0.3px;">
                        Accept &amp; start setup &rarr;
                      </a>
                    </td>
                  </tr>
                </table>
                <div style="font-size:12px;line-height:1.6;color:#8A857B;margin-top:32px;">
                  This invite expires in 7 days. If you didn't expect this email, you can safely ignore it.
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#FAF9F7;padding:20px 40px;border-top:1px solid #EDEAE4;">
                <div style="font-size:11px;line-height:1.5;color:#8A857B;">
                  NURA &middot; Run your restaurant on real numbers<br>
                  <a href="https://getnura.io" style="color:#8A857B;text-decoration:underline;">getnura.io</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
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
