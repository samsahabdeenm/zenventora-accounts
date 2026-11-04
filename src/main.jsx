import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import { ArrowRight, Eye, EyeOff, ShieldCheck, LockKeyhole, Mail, UserRound, CheckCircle2, AlertCircle, Sparkles, UserCircle, Settings, Smartphone, Users, Lock, Award, CalendarDays, ChevronRight, LogOut, Menu, X, CircleHelp, Globe, KeyRound } from "lucide-react";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const apiUrl = (import.meta.env.VITE_ACCOUNTS_API_URL || "").replace(/\/$/, "");
const PRODUCT_CALLBACKS = {
  emenu: import.meta.env.VITE_EMENU_SSO_CALLBACK || "",
  siteradar: import.meta.env.VITE_SITERADAR_SSO_CALLBACK || "",
  "visual-editor": import.meta.env.VITE_VISUAL_EDITOR_SSO_CALLBACK || ""
};
const PRODUCT_LABELS = { emenu: "eMenu", siteradar: "SiteRadar", "visual-editor": "Site Visual Editor" };
function getProductContext() {
  const requested = new URLSearchParams(window.location.search).get("product") || "";
  return Object.prototype.hasOwnProperty.call(PRODUCT_LABELS, requested) ? requested : "zenventora";
}
function getSsoRedirectTarget(product = getProductContext()) {
  const requested = new URLSearchParams(window.location.search).get("redirect_to") || PRODUCT_CALLBACKS[product] || "";
  return new Set(Object.values(PRODUCT_CALLBACKS).filter(Boolean)).has(requested) ? requested : null;
}
function getAuthReturnUrl(product, redirectTarget) {
  const url = new URL(window.location.pathname, window.location.origin);
  if (product !== "zenventora") url.searchParams.set("product", product);
  if (redirectTarget) url.searchParams.set("redirect_to", redirectTarget);
  return url.toString();
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function markCentralSignOut() {
  // Non-secret cross-subdomain signal so open product tabs can immediately clear local sessions.
  document.cookie = "zv_central_logout=" + Date.now() + "; Domain=.zenventora.com; Path=/; Max-Age=31536000; SameSite=Lax; Secure";
}

async function apiPost(path, payload) {
  if (!apiUrl) throw new Error("The secure account API is not configured yet. Please try again after deployment configuration.");
  const response = await fetch(apiUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed. Please try again.");
  return data;
}

function BrandMark() {
  return <div className="brand"><div className="brand-symbol" aria-hidden="true"><span>Z</span></div><span className="brand-name">ZenVentora<span>ACCOUNTS</span></span></div>;
}


function AccountHome({ user, onSignOut, isBusy }) {
  const [activeNav, setActiveNav] = useState("Profile");
  const [activeProfileTab, setActiveProfileTab] = useState("Personal Information");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const name = user.user_metadata?.full_name || user.user_metadata?.name || (user.email || "ZenVentora User").split("@")[0];
  const email = user.email || "";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const navItems = [
    { label: "My Products", icon: Sparkles },
    { label: "Profile", icon: UserCircle },
    { label: "Security", icon: ShieldCheck },
    { label: "Multi-Factor Authentication", icon: LockKeyhole },
    { label: "Settings", icon: Settings },
    { label: "Sessions", icon: Smartphone },
    { label: "Groups", icon: Users },
    { label: "Privacy", icon: Lock },
    { label: "Compliance", icon: Award }
  ];
  const profileTabs = ["Personal Information", "Email address", "Mobile Numbers"];
  return <main className="account-home">
    <header className="account-topbar">
      <button className="mobile-menu-toggle" aria-label="Open navigation" onClick={() => setMobileMenuOpen(v => !v)}>{mobileMenuOpen ? <X size={21}/> : <Menu size={21}/>}</button>
      <div className="account-brand"><div className="account-brand-mark">Z</div><span>ZenVentora <small>ACCOUNTS</small></span></div>
      <div className="topbar-right"><span className="topbar-label">My Account</span><div className="topbar-avatar">{initials || "Z"}</div></div>
    </header>
    <div className="account-layout">
      <aside className={`account-sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-section-label">ACCOUNT</div>
        {navItems.map(item => {
          const Icon = item.icon;
          return <button key={item.label} className={`sidebar-link ${activeNav === item.label ? "active" : ""}`} onClick={() => { setActiveNav(item.label); setMobileMenuOpen(false); }}>
            <Icon size={19}/><span>{item.label}</span>{activeNav === item.label && <span className="active-dot"/>}
          </button>;
        })}
        <div className="sidebar-bottom"><div className="help-card"><CircleHelp size={18}/><div><strong>Need help?</strong><span>We're here for you.</span></div><ChevronRight size={16}/></div><button className="sidebar-signout" onClick={onSignOut} disabled={isBusy} aria-busy={isBusy}>{isBusy ? <><span className="loading-spinner" aria-hidden="true" /> Signing out…</> : <><LogOut size={17}/> Sign out</>}</button></div>
      </aside>
      <section className="account-content">
        <div className="account-page-heading"><div><div className="page-eyebrow">PURAVIGAL ACCOUNTS</div><h1>{activeNav}</h1><p>Manage your account information and preferences.</p></div><div className="account-breadcrumb">Account <ChevronRight size={14}/> {activeNav}</div></div>
        {activeNav === "My Products" ? <section className="products-panel"><div className="products-intro"><div className="page-eyebrow">YOUR ZENVENTORA WORKSPACE</div><h2>Products connected to your account</h2><p>Use one ZenVentora identity to access the products enabled for your account.</p></div><div className="product-access-grid">{[{slug:"emenu",name:"eMenu",description:"Digital menu and restaurant experience",url:import.meta.env.VITE_EMENU_APP_URL},{slug:"siteradar",name:"SiteRadar",description:"Website monitoring and site health",url:import.meta.env.VITE_SITERADAR_APP_URL},{slug:"visual-editor",name:"Site Visual Editor",description:"Visual website editing workspace",url:import.meta.env.VITE_VISUAL_EDITOR_APP_URL}].map(product => { const enabled = Array.isArray(user.app_metadata?.product_access) && user.app_metadata.product_access.includes(product.slug); return <article className="product-access-card" key={product.slug}><div className="product-access-icon"><Sparkles size={20}/></div><div className="product-access-copy"><h3>{product.name}</h3><p>{product.description}</p></div><span className={enabled ? "product-access-status enabled" : "product-access-status"}>{enabled ? "Access enabled" : "Not enabled"}</span>{enabled && product.url ? <a className="product-open-link" href={product.url}>Open product <ArrowRight size={15}/></a> : <span className="product-access-help">{enabled ? "Product URL will be configured soon." : "Access is managed by ZenVentora."}</span>}</article>; })}</div></section> : activeNav === "Profile" ? <>
          <div className="profile-tabs" role="tablist" aria-label="Profile sections">{profileTabs.map(tab => <button key={tab} role="tab" aria-selected={activeProfileTab === tab} className={activeProfileTab === tab ? "selected" : ""} onClick={() => setActiveProfileTab(tab)}>{tab}</button>)}</div>
          {activeProfileTab === "Personal Information" && <>
            <section className="account-panel profile-overview">
              <div className="profile-card-top"><div className="profile-identity"><div className="profile-avatar">{initials || "P"}</div><div><h2>{name}</h2><p>{email}</p></div></div><span className="account-status"><CheckCircle2 size={15}/> Email verified</span></div>
              <div className="profile-details-grid">
                <div className="profile-detail"><span>Full name</span><strong>{name}</strong></div>
                <div className="profile-detail"><span>Display name</span><strong>{name.split(/\s+/)[0]}</strong></div>
                <div className="profile-detail"><span>Account email</span><strong>{email}</strong></div>
                <div className="profile-detail"><span>Account created</span><strong>{user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, {year:"numeric",month:"long",day:"numeric"}) : "—"}</strong></div>
                <div className="profile-detail"><span>Account type</span><strong>ZenVentora Account</strong></div>
                <div className="profile-detail"><span>Sign-in method</span><strong>Email and password</strong></div>
              </div>
              <div className="profile-panel-footer"><span><ShieldCheck size={16}/> Your account is protected by secure authentication.</span><button onClick={() => setActiveNav("Security")}>Security settings <ArrowRight size={15}/></button></div>
            </section>
            <div className="account-section-heading"><div><h2>Account security</h2><p>Review the basics that help keep your account safe.</p></div></div>
            <div className="security-cards">
              <button className="security-card" onClick={() => setActiveNav("Security")}><div className="security-card-icon blue"><KeyRound size={20}/></div><div><strong>Password</strong><span>Keep your password private and secure.</span></div><ChevronRight size={18}/></button>
              <button className="security-card" onClick={() => setActiveNav("Sessions")}><div className="security-card-icon violet"><Smartphone size={20}/></div><div><strong>Active sessions</strong><span>Review access to your account.</span></div><ChevronRight size={18}/></button>
              <button className="security-card" onClick={() => setActiveNav("Multi-Factor Authentication")}><div className="security-card-icon green"><ShieldCheck size={20}/></div><div><strong>Extra protection</strong><span>Explore additional sign-in security.</span></div><ChevronRight size={18}/></button>
            </div>
          </>}
          {activeProfileTab === "Email address" && <section className="account-panel email-panel"><div className="panel-heading"><div><h2>My Email Addresses</h2><p>Use this email address to sign in to your ZenVentora account.</p></div><span className="verified-pill"><CheckCircle2 size={15}/> Verified</span></div><div className="email-row"><div className="email-icon"><Mail size={20}/></div><div className="email-info"><strong>{email}</strong><span>Primary account email</span></div><span className="primary-email-label">Primary</span></div><div className="info-banner"><ShieldCheck size={18}/><span>Email changes are not available here yet. Your verified address is currently used for sign-in and account recovery.</span></div></section>}
          {activeProfileTab === "Mobile Numbers" && <section className="account-panel empty-panel"><div className="empty-icon"><Smartphone size={24}/></div><h2>No mobile number added</h2><p>Addition and verification of mobile numbers will be available in a future update.</p></section>}
        </> : <section className="account-panel placeholder-panel"><div className="placeholder-icon">{(() => { const ItemIcon = navItems.find(item => item.label === activeNav)?.icon || Settings; return <ItemIcon size={25}/>; })()}</div><div className="page-eyebrow">ACCOUNT MANAGEMENT</div><h2>{activeNav}</h2><p>This section is part of the ZenVentora Accounts dashboard. Its settings and management actions will be enabled in a later update.</p>{activeNav === "Security" && <div className="security-summary"><div><ShieldCheck size={19}/><span><strong>Email verification</strong><small>Your email address has been verified.</small></span><CheckCircle2 className="summary-check" size={18}/></div><div><KeyRound size={19}/><span><strong>Password sign-in</strong><small>Your account uses email and password authentication.</small></span></div></div>}<button className="secondary-action" onClick={() => {setActiveNav("Profile");setActiveProfileTab("Personal Information");}}>Back to profile <ArrowRight size={16}/></button></section>}
        <footer className="account-footer"><span>© {new Date().getFullYear()} ZenVentora. All rights reserved.</span><div><span><Lock size={13}/> Secure account</span><span><Globe size={13}/> English</span></div></footer>
      </section>
    </div>
  </main>;
}

function App() {
  const [mode, setMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname.toLowerCase();
    if (params.get("mode") === "reset") return "reset";
    if (params.get("mode") === "signup" || path === "/signup") return "signup";
    return "signin";
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [configured] = useState(Boolean(supabase));
  const productContext = getProductContext();
  const productLabel = PRODUCT_LABELS[productContext] || "ZenVentora";
  const ssoRedirectTarget = getSsoRedirectTarget(productContext);
  const statusParams = new URLSearchParams(window.location.search);
  const authStatusMode = statusParams.get("auth_status") === "1";
  const authActionSignOut = statusParams.get("auth_action") === "signout";
  const authStatusParent = statusParams.get("parent_origin");
  const allowedStatusParents = new Set(["https://zenventora.in", "https://www.zenventora.in", "https://emenu.zenventora.in", "https://siteradar.zenventora.in", "https://editor.zenventora.in"]);
  const isSignup = mode === "signup";
  const isVerify = mode === "verify";
  const isReset = mode === "reset";
  const isResetVerify = mode === "resetVerify";
  const isOtpScreen = isVerify || isResetVerify;
  const title = useMemo(() => isSignup ? "Create your ZenVentora account" : isVerify ? "Verify your email" : isResetVerify ? "Reset your password" : isReset ? "Reset your password" : "Welcome back", [isSignup, isVerify, isReset, isResetVerify]);



  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_signup") !== "1" || !supabase) return;
    params.delete("google_signup");
    const cleanQuery = params.toString();
    window.history.replaceState({}, document.title, window.location.pathname + (cleanQuery ? "?" + cleanQuery : "") + window.location.hash);
    setBusy(true);
    const redirectTo = getAuthReturnUrl(productContext, ssoRedirectTarget);
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" }
      }
    }).then(({ error }) => {
      if (error) throw error;
    }).catch(error => {
      setBusy(false);
      notify("error", error.message || "Google sign-in could not start. Please try again.");
    });
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthChecked(true);
      return;
    }
    const forceLogout = new URLSearchParams(window.location.search).get("logout") === "true";
    if (forceLogout || authActionSignOut) {
      // Revoke the central Accounts session before reporting signed-out status to the parent site.
      supabase.auth.getSession().then(async ({ data }) => {
        const accessToken = data.session?.access_token || null;
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }).then(() => {
        markCentralSignOut();
      }).catch((error) => {
        console.error("ZenVentora sign-out failed", error);
      }).finally(() => {
        setUser(null);
        setAuthChecked(true);
      });
      if (forceLogout) window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    supabase.auth.getSession()
      .then(({ data }) => {
        setUser(data.session?.user ?? null);
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authStatusMode || !authChecked || !authStatusParent || !allowedStatusParents.has(authStatusParent)) return;
    if (window.parent === window) return;
    window.parent.postMessage({
      type: "ZENVENTORA_AUTH_STATUS",
      authenticated: Boolean(user),
      fullName: user?.user_metadata?.full_name || user?.user_metadata?.name || (user?.email || "ZenVentora User").split("@")[0],
      email: user?.email || "",
      parentOrigin: authStatusParent
    }, authStatusParent);
  }, [authStatusMode, authChecked, authStatusParent, user]);
  
  useEffect(() => {
    if (!supabase || !user || !ssoRedirectTarget) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token;
      if (!cancelled && accessToken) {
        window.location.replace(ssoRedirectTarget + "#account_access_token=" + encodeURIComponent(accessToken));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user, ssoRedirectTarget]);

  function notify(type, message) { setNotice({ type, message }); }

  async function startGoogleSignIn() {
    if (!supabase || busy) return;
    setNotice(null);
    setBusy(true);
    const redirectTo = getAuthReturnUrl(productContext, ssoRedirectTarget);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, queryParams: { prompt: "select_account" } }
      });
      if (error) throw error;
    } catch (error) {
      setBusy(false);
      notify("error", error.message || "Google sign-in could not start. Please try again.");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setNotice(null);
    if (!supabase) { notify("error", "Supabase is not configured. Please contact support."); return; }
    setBusy(true);
    try {
      if (isSignup) {
        await apiPost("/api/auth/signup", { email: email.trim(), password, fullName: fullName.trim(), product: "zenventora" });
        setOtp("");
        setMode("verify");
        notify("success", "A 6-digit verification code has been sent to your email. Enter it below.");
      } else if (isVerify) {
        await apiPost("/api/auth/verify-email", { email: email.trim(), otp: otp.trim() });
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          notify("success", "Email verified successfully. Please sign in with the password you created.");
          setMode("signin");
          setOtp("");
          return;
        }
        notify("success", "Email verified. You are signed in to ZenVentora Accounts.");
      } else if (isReset) {
        await apiPost("/api/auth/password-reset/request", { email: email.trim() });
        setOtp("");
        setNewPassword("");
        setMode("resetVerify");
        notify("success", "If an account exists, a 6-digit password reset code has been sent.");
      } else if (isResetVerify) {
        await apiPost("/api/auth/password-reset/verify", { email: email.trim(), otp: otp.trim(), newPassword });
        setPassword("");
        setNewPassword("");
        setOtp("");
        setMode("signin");
        notify("success", "Password reset successfully. Sign in with your new password.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        notify("success", ssoRedirectTarget ? "Signed in. Opening " + productLabel + "…" : "Signed in to ZenVentora Accounts.");
      }
    } catch (error) {
      notify("error", error.message || "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  async function resendOtp() {
    setNotice(null);
    setBusy(true);
    try {
      if (isVerify) {
        await apiPost("/api/auth/resend-verification", { email: email.trim() });
        notify("success", "If verification is still needed, a new code has been requested. Check your inbox and spam folder.");
      } else {
        await apiPost("/api/auth/password-reset/request", { email: email.trim() });
        notify("success", "If an account exists, a new reset code has been requested.");
      }
    } catch (error) {
      notify("error", error.message || "Unable to resend the code right now. Please wait and try again.");
    } finally { setBusy(false); }
  }

  async function signOut() {
    if (!supabase || busy) return;
    setBusy(true);
    let accessToken = null;
    try {
      const { data } = await supabase.auth.getSession();
      accessToken = data.session?.access_token || null;
    } catch (_) {}

    // End the central browser session first so logout is immediate even if POS is unavailable.
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) {
      notify("error", error.message);
      return;
    }

    markCentralSignOut();
    notify("success", "You have signed out of ZenVentora Accounts.");
    // Connected products clear their own sessions when central sign-out is observed.
  }

  useEffect(() => {
    if (!authActionSignOut || !authStatusParent || !allowedStatusParents.has(authStatusParent) || !authChecked) return;
    if (user && !busy) {
      signOut();
      return;
    }
    if (!user && !busy && window.parent !== window) {
      window.parent.postMessage({
        type: "ZENVENTORA_AUTH_STATUS",
        authenticated: false,
        fullName: "",
        email: "",
        parentOrigin: authStatusParent
      }, authStatusParent);
    }
  }, [authActionSignOut, authStatusParent, authChecked, user, busy]);

  function switchMode(nextMode) {
    setMode(nextMode);
    setNotice(null);
    setOtp("");
    if (nextMode === "signup") setPassword("");
    if (nextMode === "signin") setNewPassword("");
  }

  if (user) return <><AccountHome user={user} onSignOut={signOut} isBusy={busy} />{busy && <div className="operation-overlay" role="status" aria-live="polite"><div className="operation-dialog"><span className="loading-spinner loading-spinner-large" aria-hidden="true" /><strong>Signing you out…</strong><span>Please wait while we securely end your session.</span></div></div>}</>;

  if (authStatusMode) return <div aria-hidden="true" />;

  return <>{busy && <div className="operation-overlay" role="status" aria-live="polite"><div className="operation-dialog"><span className="loading-spinner loading-spinner-large" aria-hidden="true" /><strong>Processing your request…</strong><span>Please wait. This may take a few seconds.</span></div></div>}<main className="page-shell">
    <section className="visual-panel">
      <div className="visual-glow glow-one" /><div className="visual-glow glow-two" />
      <BrandMark />
      <div className="visual-content">
        <div className="eyebrow"><Sparkles size={15} /> ONE ACCOUNT. MANY POSSIBILITIES.</div>
        <h1>One account. Every ZenVentora product.</h1>
        <p>One secure identity for eMenu, SiteRadar and Site Visual Editor. Sign in once and continue where you started.</p>
        <div className="feature-list"><div><ShieldCheck size={19} /><span>Secure account access</span></div><div><LockKeyhole size={19} /><span>Privacy-first authentication</span></div><div><CheckCircle2 size={19} /><span>Built for ZenVentora products</span></div></div>
      </div>
      <div className="visual-footer">A simpler way to work with ZenVentora.</div>
    </section>
    <section className="form-panel">
      <div className="mobile-brand"><BrandMark /></div>
      <div className="auth-card">
        <div className="welcome-tag">PURAVIGAL ACCOUNTS</div>
        <h2>{title}</h2>
        <p className="subtitle">{isSignup ? "Get started with one account for ZenVentora products." : isVerify ? `Enter the 6-digit code sent to ${email.trim()}.` : isResetVerify ? `Enter the code sent to ${email.trim()} and choose a new password.` : isReset ? "We'll send a secure 6-digit code to your email." : productContext === "zenventora" ? "Sign in to manage your ZenVentora account." : "Sign in to continue to " + productLabel + "."}</p>
        {!configured && <div className="notice error"><AlertCircle size={18} /><span>Supabase configuration is pending. Authentication will work after environment setup.</span></div>}
        {user ? <div className="signed-in-card"><div className="success-icon"><CheckCircle2 size={26} /></div><h3>You are signed in</h3><p>{user.email}</p><p className="muted">Your ZenVentora identity is ready to use across connected products.</p><button className="primary-button" onClick={signOut}>Sign out</button></div> : <form onSubmit={handleSubmit}>
          {isSignup && <label className="field"><span>Full name</span><div className="input-wrap"><UserRound size={18} /><input autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" required minLength={2} /></div></label>}
          <label className="field"><span>Email address</span><div className="input-wrap"><Mail size={18} /><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required readOnly={isOtpScreen} /></div></label>
          {isOtpScreen && <label className="field"><span>6-digit verification code</span><div className="input-wrap"><ShieldCheck size={18} /><input type="text" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter code" required minLength={6} maxLength={6} pattern="[0-9]{6}" aria-label="6-digit verification code" /></div></label>}
          {!isVerify && !isReset && !isResetVerify && <label className="field"><span>Password</span><div className="input-wrap"><LockKeyhole size={18} /><input type={showPassword ? "text" : "password"} autoComplete={isSignup ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder={isSignup ? "At least 8 characters" : "Enter your password"} required minLength={isSignup ? 8 : undefined} /><button className="icon-button" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>}
          {isResetVerify && <label className="field"><span>New password</span><div className="input-wrap"><LockKeyhole size={18} /><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} /><button className="icon-button" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>}
          {!isSignup && !isOtpScreen && !isReset && <div className="form-meta"><button type="button" className="text-button" onClick={() => switchMode("reset")}>Forgot password?</button></div>}
          {isSignup && <p className="terms">By creating an account, you agree to ZenVentora's Terms of Service and Privacy Policy.</p>}
          {notice && <div className={`notice ${notice.type}`}>{notice.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{notice.message}</span></div>}
          <button className="primary-button" type="submit" disabled={busy} aria-busy={busy}>{busy ? <><span className="loading-spinner" aria-hidden="true" /> Please wait…</> : <>{isSignup ? "Create account" : isVerify ? "Verify email" : isResetVerify ? "Reset password" : isReset ? "Send reset code" : "Sign in"} <ArrowRight size={18} /></>}</button>
          {isOtpScreen && <div className="switch-mode"><span>Didn't receive the code?</span><button type="button" className="text-button" disabled={busy} onClick={resendOtp}>Resend code</button><span>·</span><button type="button" className="text-button" onClick={() => switchMode(isVerify ? "signup" : "reset")}>{isVerify ? "Change email" : "Back"}</button></div>}
        </form>}
        {!user && !isOtpScreen && !isReset && <div className="google-auth-options">
          <button type="button" className="google-auth-button" onClick={startGoogleSignIn} disabled={busy}>
            <span className="google-auth-g" aria-hidden="true">G</span>
            Continue with Google
          </button>
          <div className="auth-divider"><span>or continue with email</span></div>
        </div>}
        {!user && !isOtpScreen && <div className="switch-mode">{isReset ? <>Remembered your password? <button className="text-button" onClick={() => switchMode("signin")}>Back to sign in</button></> : <>Need a ZenVentora account? <button type="button" className="text-button" onClick={() => switchMode("signup")}>Create an account</button></>}</div>}
        <div className="security-note"><ShieldCheck size={17} /><span>Your account security matters. Never share your password or verification codes.</span></div>
      </div>
      <footer className="form-footer">© {new Date().getFullYear()} ZenVentora. All rights reserved.</footer>
    </section>
  </main></>;
}

createRoot(document.getElementById("root")).render(<App />);
