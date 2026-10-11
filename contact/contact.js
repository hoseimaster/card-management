let contactSession = null;
let contactAlbumID = "";
const contactDB = window.supabase.createClient(
  window.APP_CONFIG.supabaseUrl,
  window.APP_CONFIG.supabaseKey,
);
let contactIdentityGeneration = 0;
let resolvedContactUser = null;
async function updateContactIdentity() {
  const generation = ++contactIdentityGeneration;
  const { data, error: sessionError } = await contactDB.auth.getSession();
  if (generation !== contactIdentityGeneration) return;
  if (sessionError) throw sessionError;
  contactSession = data.session;
  const uid = contactSession?.user.id || null;
  const needsIdentity = uid && (uid !== resolvedContactUser || !contactAlbumID);
  if (uid !== resolvedContactUser) contactAlbumID = "";
  const email = document.getElementById("contact-email");
  email.closest("label").hidden = !!contactSession;
  email.required = !contactSession;
  document.getElementById("contact-album-field").hidden = !contactSession;
  document.getElementById("contact-album-id").textContent = contactSession
    ? "確認中…"
    : "";
  if (needsIdentity) {
    const { data: id, error } = await contactDB.rpc("card_album_my_id");
    if (generation !== contactIdentityGeneration) return;
    if (!error && typeof id === "string") {
      contactAlbumID = id;
      resolvedContactUser = uid;
    }
    document.getElementById("contact-album-id").textContent =
      contactAlbumID || "IDを確認できませんでした";
  }
  if (!needsIdentity)
    document.getElementById("contact-album-id").textContent = contactSession
      ? contactAlbumID
      : "";
  if (!contactSession) resolvedContactUser = null;
}
const contactIdentityReady = updateContactIdentity().catch(() => {});
contactDB.auth.onAuthStateChange(() =>
  setTimeout(() => updateContactIdentity().catch(() => {}), 0),
);
const $ = (id) => document.getElementById(id);
$("contact-form").onsubmit = async (event) => {
  event.preventDefault();
  $("contact-error").textContent = "";
  $("contact-submit").disabled = true;
  try {
    await contactIdentityReady;
    await updateContactIdentity();
    if (contactSession && !contactAlbumID)
      throw Error("アルバムIDを確認できません。再ログインしてください。");
    const body = {
      email: contactSession ? "" : $("contact-email").value.trim(),
      album_id: contactAlbumID,
      name: $("contact-name").value.trim(),
      category: $("contact-category").value,
      message: $("contact-message").value.trim(),
      consent: $("contact-consent").checked,
      website: $("contact-website").value,
    };
    if (!body.consent || body.message.length < 10 || body.message.length > 3000)
      throw Error("内容と同意欄を確認してください。");
    const endpoint =
      window.APP_CONFIG.supabaseUrl +
      "/functions/v1/" +
      (window.APP_CONFIG.contactFunction || "contact-submit") +
      "?action=submit";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: window.APP_CONFIG.supabaseKey,
        ...(contactSession
          ? { Authorization: "Bearer " + contactSession.access_token }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "送信できませんでした。");
    if (!result.id) throw Error("受付を確認できませんでした。");
    $("contact-reference").textContent = result.id;
    $("contact-panel").hidden = true;
    $("contact-complete").hidden = false;
    $("contact-form").reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    $("contact-error").textContent = /fetch|network|abort|timeout/i.test(
      error.message,
    )
      ? "通信できませんでした。時間をおいて再度お試しください。"
      : error.message;
  } finally {
    $("contact-submit").disabled = false;
  }
};
$("legal-close").onclick = () => $("info-dialog").close();
document.querySelectorAll("[data-info]").forEach(
  (button) =>
    (button.onclick = () => {
      const info = window.SITE_INFO[button.dataset.info];
      $("info-title").textContent = info.title;
      $("info-body").innerHTML = info.body;
      for (const placeholder of $("info-body").querySelectorAll(
        "[data-contact]",
      )) {
        const a = document.createElement("a");
        a.href = "./";
        a.textContent = "お問い合わせフォームへ";
        placeholder.replaceChildren(a);
      }
      $("info-dialog").showModal();
    }),
);
