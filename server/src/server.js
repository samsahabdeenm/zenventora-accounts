import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const app = express();
// Render terminates TLS and forwards the original client IP via X-Forwarded-For.
// Trust the single Render proxy hop so express-rate-limit can safely key requests.
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "20kb" }));

const frontendOrigin = process.env.FRONTEND_ORIGIN || "https://accounts.zenventora.in";
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === frontendOrigin || origin === "https://accounts.zenventora.in" || origin === "https://zenventora.in" || origin === "https://www.zenventora.in" || origin === "https://emenu.zenventora.in" || origin === "https://siteradar.zenventora.in" || origin === "https://editor.zenventora.in") return callback(null, true);
    return callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL, OTP_PEPPER } = process.env;
const adminConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const configured = Boolean(adminConfigured && RESEND_API_KEY && RESEND_FROM_EMAIL && OTP_PEPPER);
const admin = adminConfigured ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
}) : null;

// The admin client is used only for privileged user and OTP operations.
 // Password sign-in must use the project's public/anon key, never the service-role key.
const authClient = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a little and try again." }
});
app.use("/api/auth", authLimiter);

function fail(res, status, message) { return res.status(status).json({ error: message }); }
function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320; }
function otpCode() { return String(crypto.randomInt(100000, 1000000)); }
function hashOtp(userId, purpose, otp) {
  return crypto.createHmac("sha256", OTP_PEPPER).update(userId + ":" + purpose + ":" + otp).digest("hex");
}
function safeEqual(a, b) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
async function findUserByEmail(email) {
  // Admin list is paginated; email matching is done server-side only.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find(user => user.email?.toLowerCase() === email);
    if (match) return match;
    if (users.length < 1000) return null;
  }
  return null;
}
async function sendOtpEmail(email, otp, purpose) {
  const isSignup = purpose === "signup";
  const subject = isSignup ? "Your ZenVentora verification code" : "Your ZenVentora password reset code";
  const action = isSignup ? "verify your email address" : "reset your password";
  const html = `<div style="margin:0;padding:36px 16px;background:#f5f9fc;font-family:Inter,Arial,sans-serif;color:#102033"><div style="max-width:520px;margin:0 auto;padding:32px;background:#ffffff;border:1px solid #dbe6f3;border-radius:18px"><img src="https://zenventora.in/assets/zenventora.png" alt="ZenVentora" width="168" style="display:block;width:168px;height:auto;max-height:52px;object-fit:contain;margin:0 0 28px"><div style="font-size:11px;font-weight:800;letter-spacing:2px;color:#0ea5a4;margin-bottom:10px">ZENVENTORA ACCOUNTS</div><h2 style="margin:0 0 12px;color:#0b2440;font-size:23px;line-height:1.3">${isSignup ? "Verify your email" : "Reset your password"}</h2><p style="margin:0 0 22px;color:#64748b;line-height:1.65">Use this code to ${action}:</p><div style="font-size:32px;font-weight:800;letter-spacing:8px;padding:18px 14px;background:#f5f9fc;border:1px solid #dbe6f3;border-radius:12px;text-align:center;color:#0f3b68">${otp}</div><p style="margin:22px 0 8px;color:#64748b;line-height:1.6">This code expires in 10 minutes and can be used only once.</p><p style="margin:0;color:#64748b;font-size:13px;line-height:1.6">If you did not request this, you can safely ignore this email.</p><div style="height:3px;margin-top:28px;border-radius:3px;background:linear-gradient(90deg,#0f3b68,#0ea5a4)"></div></div><p style="max-width:520px;margin:16px auto 0;text-align:center;color:#94a3b8;font-size:11px">© ${new Date().getFullYear()} ZenVentora. All rights reserved.</p></div>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "ZenVentora Accounts <" + RESEND_FROM_EMAIL + ">",
      to: [email],
      subject,
      text: `Your ZenVentora code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      html
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("Resend send failed (" + response.status + "): " + detail.slice(0, 250));
  }
}
async function issueOtp(user, purpose) {
  const { data: recent, error: recentError } = await admin.from("email_otp_verifications")
    .select("created_at").eq("user_id", user.id).eq("purpose", purpose)
    .is("consumed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (recentError) throw recentError;
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 60_000) {
    const error = new Error("Please wait 60 seconds before requesting another code.");
    error.status = 429;
    throw error;
  }
  const otp = otpCode();
  const { data: inserted, error: insertError } = await admin.from("email_otp_verifications")
    .insert({ user_id: user.id, email: user.email.toLowerCase(), purpose, otp_hash: hashOtp(user.id, purpose, otp), expires_at: new Date(Date.now() + 10 * 60_000).toISOString() })
    .select("id").single();
  if (insertError) throw insertError;
  try {
    await sendOtpEmail(user.email, otp, purpose);
  } catch (error) {
    await admin.from("email_otp_verifications").update({ consumed_at: new Date().toISOString() }).eq("id", inserted.id);
    throw error;
  }
}

app.get("/health", (_req, res) => res.json({ ok: true, configured, ssoConfigured: Boolean(admin) }));

// Server-to-server verification endpoint for connected ZenVentora products.
// It accepts only a Supabase access token and returns the verified account's minimal identity.
const ssoVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false });
app.post("/api/sso/verify", ssoVerifyLimiter, async (req, res) => {
  if (!admin) return fail(res, 503, "Central account verification is not configured.");
  const accessToken = req.body?.access_token;
  if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 8192) {
    return fail(res, 400, "A valid account access token is required.");
  }
  try {
    const { data, error } = await admin.auth.getUser(accessToken);
    const user = data?.user;
    if (error || !user || !user.email || !user.email_confirmed_at) {
      return fail(res, 401, "The ZenVentora account session is invalid or the email is not verified.");
    }
    return res.json({
      user: {
        id: user.id,
        email: user.email.toLowerCase(),
        full_name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "",
        phone_e164: typeof user.user_metadata?.phone_e164 === "string" ? user.user_metadata.phone_e164 : "",
        email_verified: true,
        product_access: Array.isArray(user.app_metadata?.product_access) ? user.app_metadata.product_access : []
      }
    });
  } catch (error) {
    console.error("Central account token verification failed", error);
    return fail(res, 503, "Unable to verify the central account right now.");
  }
});
app.post("/api/auth/signup", async (req, res) => {
  if (!configured) return fail(res, 503, "Account verification service is not configured yet.");
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
  if (!validEmail(email) || typeof password !== "string" || password.length < 8 || password.length > 128 || fullName.length < 2 || fullName.length > 120) {
    return fail(res, 400, "Enter a valid email, full name, and password of at least 8 characters.");
  }
  try {
    let user = await findUserByEmail(email);
    if (user?.email_confirmed_at) return fail(res, 409, "An account with this email already exists. Sign in or reset your password.");
    if (user) {
      const { data, error } = await admin.auth.admin.updateUserById(user.id, {
        password, user_metadata: { ...(user.user_metadata || {}), full_name: fullName, signup_source: "zenventora" }, app_metadata: { ...(user.app_metadata || {}), product_access: Array.isArray(user.app_metadata?.product_access) ? user.app_metadata.product_access : [] }, email_confirm: false
      });
      if (error) throw error;
      user = data.user;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: false, user_metadata: { full_name: fullName, signup_source: "zenventora" }, app_metadata: { product_access: [] }
      });
      if (error) throw error;
      user = data.user;
    }
    await issueOtp(user, "signup");
    return res.json({ ok: true, message: "Verification code sent. Check your email." });
  } catch (error) {
    console.error("Signup OTP failed:", error.message);
    return fail(res, error.status || 502, error.status === 429 ? error.message : "Unable to send the verification code right now. Please try again later.");
  }
});
app.post("/api/auth/product-access", async (req, res) => {
  if (!admin) return fail(res, 503, "Account service is not configured.");
  const product = typeof req.body?.product === "string" ? req.body.product.trim().toLowerCase() : "";
  const accessToken = typeof req.body?.access_token === "string" ? req.body.access_token : "";
  if (!["emenu", "siteradar", "visual-editor"].includes(product)) return fail(res, 400, "Choose a valid ZenVentora product.");
  if (accessToken.length < 20 || accessToken.length > 8192) return fail(res, 401, "A valid signed-in account session is required.");
  try {
    const { data, error } = await admin.auth.getUser(accessToken);
    const user = data?.user;
    if (error || !user?.email_confirmed_at) return fail(res, 401, "Your account session is invalid or your email is not verified.");
    const productAccess = [...new Set([...(Array.isArray(user.app_metadata?.product_access) ? user.app_metadata.product_access : []), product])];
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...(user.app_metadata || {}), product_access: productAccess } });
    if (updateError) throw updateError;
    return res.json({ ok: true, product_access: productAccess });
  } catch (error) {
    console.error("Product access grant failed:", error.message);
    return fail(res, 503, "Could not enable this product right now. Please try again.");
  }
});
app.post("/api/auth/product-signup", async (req, res) => {
  if (!configured) return fail(res, 503, "Account verification service is not configured yet.");
  const product = typeof req.body?.product === "string" ? req.body.product.trim().toLowerCase() : "";
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
  const businessName = typeof req.body?.businessName === "string" ? req.body.businessName.trim() : "";
  const businessType = typeof req.body?.businessType === "string" ? req.body.businessType.trim() : "";
  const countryCode = typeof req.body?.countryCode === "string" ? req.body.countryCode.trim() : "";
  const countryName = typeof req.body?.countryName === "string" ? req.body.countryName.trim() : "";
  const phoneNumber = typeof req.body?.phoneNumber === "string" ? req.body.phoneNumber.replace(/[^0-9]/g, "") : "";
  const marketingConsent = req.body?.marketingConsent === true;
  if (!["emenu", "siteradar", "visual-editor"].includes(product)) return fail(res, 400, "Choose a valid ZenVentora product.");
  if (!validEmail(email) || typeof password !== "string" || password.length < 8 || password.length > 128 || fullName.length < 2 || fullName.length > 120) {
    return fail(res, 400, "Enter a valid email, full name, and password of at least 8 characters.");
  }
  if (!/^\+[1-9]\d{0,3}$/.test(countryCode) || !countryName || phoneNumber.length < 6 || phoneNumber.length > 15) {
    return fail(res, 400, "Choose a country calling code and enter a valid phone number.");
  }
  try {
    let user = await findUserByEmail(email);
    if (user?.email_confirmed_at) return fail(res, 409, "An account with this email already exists. Sign in or reset your password.");
    const userMetadata = {
      ...(user?.user_metadata || {}),
      full_name: fullName,
      signup_product: product,
      phone_country_code: countryCode,
      phone_country_name: countryName,
      phone_number: phoneNumber,
      phone_e164: countryCode + phoneNumber,
      marketing_consent: marketingConsent,
      ...(marketingConsent ? { marketing_consent_at: new Date().toISOString() } : {}),
      ...(businessName ? { business_name: businessName } : {}),
      ...(businessType ? { business_type: businessType } : {})
    };
    const appMetadata = { ...(user?.app_metadata || {}), product_access: [...new Set([...(Array.isArray(user?.app_metadata?.product_access) ? user.app_metadata.product_access : []), product])] };
    if (user) {
      const { data, error } = await admin.auth.admin.updateUserById(user.id, {
        password, user_metadata: userMetadata, app_metadata: appMetadata, email_confirm: false
      });
      if (error) throw error;
      user = data.user;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: false, user_metadata: userMetadata, app_metadata: appMetadata
      });
      if (error) throw error;
      user = data.user;
    }
    await issueOtp(user, "signup");
    return res.json({ ok: true, message: "Verification code sent. Check your email.", product });
  } catch (error) {
    console.error("Product signup failed:", error.message);
    return fail(res, error.status || 502, error.status === 429 ? error.message : "Unable to send the verification code right now. Please try again later.");
  }
});
app.post("/api/auth/verify-email", async (req, res) => {
  if (!configured) return fail(res, 503, "Account verification service is not configured yet.");
  const email = normalizeEmail(req.body?.email);
  const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const returnSession = req.body?.returnSession === true;
  if (!validEmail(email) || !/^\d{6}$/.test(otp)) return fail(res, 400, "Enter your email and the 6-digit code.");
  try {
    const user = await findUserByEmail(email);
    if (!user) return fail(res, 400, "The code is invalid or expired.");
    const { data: row, error } = await admin.from("email_otp_verifications").select("*")
      .eq("user_id", user.id).eq("purpose", "signup").is("consumed_at", null)
      .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!row) return fail(res, 400, "The code is invalid or expired.");
    if (row.attempts >= 5) return fail(res, 429, "Too many incorrect attempts. Request a new code.");
    if (!safeEqual(row.otp_hash, hashOtp(user.id, "signup", otp))) {
      await admin.from("email_otp_verifications").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      return fail(res, 400, "The code is invalid or expired.");
    }
    const now = new Date().toISOString();
    const { error: confirmError } = await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
    if (confirmError) throw confirmError;
    await admin.from("email_otp_verifications").update({ consumed_at: now }).eq("id", row.id);
    await admin.from("email_otp_verifications").update({ consumed_at: now }).eq("user_id", user.id).eq("purpose", "signup").is("consumed_at", null);
    if (returnSession) {
      if (!authClient) return fail(res, 503, "Automatic sign-in is not configured. Please sign in to continue.");
      if (password.length < 8 || password.length > 128) return fail(res, 400, "Enter the password you used when signing up.");
      const { data: sessionData, error: signInError } = await authClient.auth.signInWithPassword({ email, password });
      if (signInError || !sessionData?.session?.access_token) {
        console.error("Post-signup sign-in failed:", signInError?.message || "No session returned");
        return fail(res, 401, "Email verified, but automatic sign-in failed. Please sign in to continue.");
      }
      return res.json({
        ok: true,
        message: "Email verified and signed in.",
        session: {
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
          expires_at: sessionData.session.expires_at,
          expires_in: sessionData.session.expires_in,
          token_type: sessionData.session.token_type
        }
      });
    }
    return res.json({ ok: true, message: "Email verified. You can now sign in." });
  } catch (error) {
    console.error("Email OTP verification failed:", error.message);
    return fail(res, 500, "Unable to verify the code right now. Please try again.");
  }
});
app.post("/api/auth/resend-verification", async (req, res) => {
  if (!configured) return fail(res, 503, "Account verification service is not configured yet.");
  const email = normalizeEmail(req.body?.email);
  if (!validEmail(email)) return fail(res, 400, "Enter a valid email address.");
  try {
    const user = await findUserByEmail(email);
    if (!user || user.email_confirmed_at) return res.json({ ok: true, message: "If verification is needed, a new code will be sent." });
    await issueOtp(user, "signup");
    return res.json({ ok: true, message: "If verification is needed, a new code will be sent." });
  } catch (error) {
    console.error("Resend verification failed:", error.message);
    return fail(res, error.status || 502, error.status === 429 ? error.message : "Unable to resend the code right now.");
  }
});
app.post("/api/auth/password-reset/request", async (req, res) => {
  if (!configured) return fail(res, 503, "Password reset service is not configured yet.");
  const email = normalizeEmail(req.body?.email);
  if (!validEmail(email)) return fail(res, 400, "Enter a valid email address.");
  try {
    const user = await findUserByEmail(email);
    if (user?.email_confirmed_at) {
      await issueOtp(user, "password_reset");
    }
    return res.json({ ok: true, message: "If an account exists, a reset code has been sent." });
  } catch (error) {
    console.error("Password reset OTP request failed:", error.message);
    return fail(res, error.status || 502, error.status === 429 ? error.message : "Unable to send a reset code right now.");
  }
});
app.post("/api/auth/password-reset/verify", async (req, res) => {
  if (!configured) return fail(res, 503, "Password reset service is not configured yet.");
  const email = normalizeEmail(req.body?.email);
  const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
  const password = req.body?.newPassword;
  if (!validEmail(email) || !/^\d{6}$/.test(otp) || typeof password !== "string" || password.length < 8 || password.length > 128) {
    return fail(res, 400, "Enter your email, 6-digit code, and a new password of at least 8 characters.");
  }
  try {
    const user = await findUserByEmail(email);
    if (!user?.email_confirmed_at) return fail(res, 400, "The code is invalid or expired.");
    const { data: row, error } = await admin.from("email_otp_verifications").select("*")
      .eq("user_id", user.id).eq("purpose", "password_reset").is("consumed_at", null)
      .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!row) return fail(res, 400, "The code is invalid or expired.");
    if (row.attempts >= 5) return fail(res, 429, "Too many incorrect attempts. Request a new code.");
    if (!safeEqual(row.otp_hash, hashOtp(user.id, "password_reset", otp))) {
      await admin.from("email_otp_verifications").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      return fail(res, 400, "The code is invalid or expired.");
    }
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password });
    if (updateError) throw updateError;
    const now = new Date().toISOString();
    await admin.from("email_otp_verifications").update({ consumed_at: now }).eq("id", row.id);
    await admin.from("email_otp_verifications").update({ consumed_at: now }).eq("user_id", user.id).eq("purpose", "password_reset").is("consumed_at", null);
    return res.json({ ok: true, message: "Password reset successfully. You can now sign in." });
  } catch (error) {
    console.error("Password reset OTP verify failed:", error.message);
    return fail(res, 500, "Unable to reset the password right now. Please try again.");
  }
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled API error:", error.message);
  return res.status(500).json({ error: "Unexpected server error." });
});

const port = Number(process.env.PORT || 10000);
app.listen(port, () => console.log("ZenVentora Accounts OTP API listening on port " + port));
