(() => {
  const config = window.NOVAORB_SUPABASE_CONFIG || {};
  const statusEl = document.getElementById("auth-status");
  const form = document.getElementById("auth-form");
  const emailEl = document.getElementById("email");
  const passwordEl = document.getElementById("password");
  const submitBtn = document.getElementById("submit-btn");
  const modeBtn = document.getElementById("mode-toggle");
  const resetBtn = document.getElementById("reset-password");
  const logoutBtn = document.getElementById("logout-btn");
  const accountPanel = document.getElementById("account-panel");
  const authPanel = document.getElementById("auth-panel");
  const configPanel = document.getElementById("config-help");
  const titleEl = document.getElementById("form-title");
  const subEl = document.getElementById("form-subtitle");
  let mode = "login";
  let client = null;

  function status(message, type = "info") {
    statusEl.textContent = message;
    statusEl.className = "status " + type;
    statusEl.hidden = !message;
  }
  function setBusy(busy) {
    submitBtn.disabled = busy;
    submitBtn.textContent = busy ? "Please wait…" : (mode === "login" ? "Sign in" : "Create account");
  }
  function setMode(next) {
    mode = next;
    titleEl.textContent = mode === "login" ? "Welcome back" : "Create your account";
    subEl.textContent = mode === "login" ? "Sign in to your NovaOrb account to continue." : "Create a NovaOrb account with your email.";
    setBusy(false);
    modeBtn.textContent = mode === "login" ? "Don’t have an account? Create one" : "Already have an account? Sign in";
    passwordEl.autocomplete = mode === "login" ? "current-password" : "new-password";
    status("");
  }
  function showSignedIn(user) {
    authPanel.hidden = true;
    configPanel.hidden = true;
    accountPanel.hidden = false;
    document.getElementById("account-email").textContent = user.email || "NovaOrb account";
    status("You are signed in successfully.", "success");
  }

  if (!window.supabase || !config.url || !config.anonKey ||
      config.url.includes("YOUR-PROJECT-ID") || config.anonKey.includes("YOUR_SUPABASE")) {
    configPanel.hidden = false;
    authPanel.hidden = true;
    status("To enable authentication, add your Supabase project settings.", "warning");
    return;
  }

  client = window.supabase.createClient(config.url, config.anonKey);
  setMode("login");

  client.auth.getSession().then(({ data, error }) => {
    if (error) status("Could not check your account status. Please try again.", "error");
    else if (data.session?.user) showSignedIn(data.session.user);
  });

  client.auth.onAuthStateChange((_event, session) => {
    if (session?.user) showSignedIn(session.user);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    if (!email || !password) return status("Enter your email address and password.", "error");
    if (password.length < 6) return status("Password must be at least 6 characters long.", "error");
    setBusy(true);
    status("");
    try {
      if (mode === "login") {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) { showSignedIn(data.user); window.location.replace("/"); }
      } else {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/login.html" }
        });
        if (error) throw error;
        if (data.session && data.user) { showSignedIn(data.user); window.location.replace("/"); }
        else status("Account created. Check your email to confirm your address.", "success");
      }
    } catch (error) {
      const msg = String(error?.message || "");
      if (/invalid login credentials/i.test(msg)) status("Incorrect email or password.", "error");
      else if (/user already registered/i.test(msg)) status("This email is already registered. Please sign in.", "error");
      else if (/email not confirmed/i.test(msg)) status("Please confirm your email address before signing in.", "error");
      else status("Sign-in failed: " + (msg || "Unknown error"), "error");
    } finally {
      setBusy(false);
    }
  });

  modeBtn.addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));
  resetBtn.addEventListener("click", async () => {
    const email = emailEl.value.trim();
    if (!email) return status("Enter your email address in the email field first.", "warning");
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/login.html"
      });
      if (error) throw error;
      status("If an account exists for this email, a password reset link will be sent.", "success");
    } catch (error) {
      status("Could not send password reset link: " + (error.message || "Error"), "error");
    }
  });
  logoutBtn.addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (error) return status("Sign-out failed. Please try again.", "error");
    accountPanel.hidden = true;
    authPanel.hidden = false;
    emailEl.value = "";
    passwordEl.value = "";
    setMode("login");
    status("You have signed out.", "success");
  });
})();