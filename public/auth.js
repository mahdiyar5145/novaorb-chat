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
    submitBtn.textContent = busy ? "لطفاً صبر کن…" : (mode === "login" ? "ورود به حساب" : "ساخت حساب");
  }
  function setMode(next) {
    mode = next;
    titleEl.textContent = mode === "login" ? "خوش برگشتی" : "حساب جدید بساز";
    subEl.textContent = mode === "login" ? "برای ادامه وارد حساب NovaOrb شو." : "با ایمیلت یک حساب NovaOrb بساز.";
    setBusy(false);
    modeBtn.textContent = mode === "login" ? "حساب نداری؟ ثبت‌نام کن" : "از قبل حساب داری؟ وارد شو";
    passwordEl.autocomplete = mode === "login" ? "current-password" : "new-password";
    status("");
  }
  function showSignedIn(user) {
    authPanel.hidden = true;
    configPanel.hidden = true;
    accountPanel.hidden = false;
    document.getElementById("account-email").textContent = user.email || "حساب NovaOrb";
    status("با موفقیت وارد شدی.", "success");
  }

  if (!window.supabase || !config.url || !config.anonKey ||
      config.url.includes("YOUR-PROJECT-ID") || config.anonKey.includes("YOUR_SUPABASE")) {
    configPanel.hidden = false;
    authPanel.hidden = true;
    status("برای فعال‌شدن ورود واقعی، تنظیمات پروژهٔ Supabase باید وارد شود.", "warning");
    return;
  }

  client = window.supabase.createClient(config.url, config.anonKey);
  setMode("login");

  client.auth.getSession().then(({ data, error }) => {
    if (error) status("بررسی وضعیت حساب انجام نشد. دوباره تلاش کن.", "error");
    else if (data.session?.user) showSignedIn(data.session.user);
  });

  client.auth.onAuthStateChange((_event, session) => {
    if (session?.user) showSignedIn(session.user);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    if (!email || !password) return status("ایمیل و رمز عبور را وارد کن.", "error");
    if (password.length < 6) return status("رمز عبور باید حداقل ۶ کاراکتر باشد.", "error");
    setBusy(true);
    status("");
    try {
      if (mode === "login") {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) showSignedIn(data.user);
      } else {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/login.html" }
        });
        if (error) throw error;
        if (data.session && data.user) showSignedIn(data.user);
        else status("حساب ساخته شد. ایمیلت را برای تأیید بررسی کن.", "success");
      }
    } catch (error) {
      const msg = String(error?.message || "");
      if (/invalid login credentials/i.test(msg)) status("ایمیل یا رمز عبور درست نیست.", "error");
      else if (/user already registered/i.test(msg)) status("این ایمیل قبلاً ثبت‌نام کرده؛ وارد شو.", "error");
      else if (/email not confirmed/i.test(msg)) status("اول ایمیلت را تأیید کن، بعد وارد شو.", "error");
      else status("ورود انجام نشد: " + (msg || "خطای ناشناخته"), "error");
    } finally {
      setBusy(false);
    }
  });

  modeBtn.addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));
  resetBtn.addEventListener("click", async () => {
    const email = emailEl.value.trim();
    if (!email) return status("اول ایمیلت را در کادر ایمیل وارد کن.", "warning");
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/login.html"
      });
      if (error) throw error;
      status("اگر این ایمیل حساب داشته باشد، لینک بازیابی برایش ارسال می‌شود.", "success");
    } catch (error) {
      status("ارسال لینک بازیابی ناموفق بود: " + (error.message || "خطا"), "error");
    }
  });
  logoutBtn.addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (error) return status("خروج انجام نشد. دوباره تلاش کن.", "error");
    accountPanel.hidden = true;
    authPanel.hidden = false;
    emailEl.value = "";
    passwordEl.value = "";
    setMode("login");
    status("از حساب خارج شدی.", "success");
  });
})();