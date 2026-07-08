let currentUser = null;
let currentProfile = null;
let translators = [];
let allRequests = [];

document.addEventListener("DOMContentLoaded", checkUser);

async function checkUser() {
  const { data } = await supabaseClient.auth.getUser();

  if (!data.user) {
    showLogin();
    return;
  }

  currentUser = data.user;

  await loadProfile();
  await loadDropdowns();
  await loadTranslators();

  showApp();
  await loadRequests();
}

function showLogin() {
  document.getElementById("loginPage").classList.remove("hidden");
  document.getElementById("appPage").classList.add("hidden");
}

function showApp() {
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("appPage").classList.remove("hidden");

  document.getElementById("userRole").textContent =
    `${currentProfile.full_name || currentProfile.email} | ${currentProfile.role}`;

  if (currentProfile.role === "translator" || currentProfile.role === "viewer") {
    document.querySelector("button[onclick=\"showSection('newRequest')\"]").classList.add("hidden");
  }
}

function showSection(sectionId) {
  document.querySelectorAll(".section").forEach(section => {
    section.classList.add("hidden");
  });

  document.getElementById(sectionId).classList.remove("hidden");
}

async function login() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    document.getElementById("loginMessage").textContent = error.message;
    return;
  }

  document.getElementById("loginMessage").textContent = "";
  checkUser();
}

async function logout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  showLogin();
}

async function loadProfile() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (error || !data) {
    alert("Profile not found.");
    return;
  }

  currentProfile = data;
}

async function loadDropdowns() {
  const { data: schools } = await supabaseClient
    .from("schools")
    .select("*")
    .eq("active", true)
    .order("school_name");

  const { data: languages } = await supabaseClient
    .from("languages")
    .select("*")
    .eq("active", true)
    .order("language_name");

  const schoolSelect = document.getElementById("schoolSelect");
  const languageSelect = document.getElementById("languageSelect");

  schoolSelect.innerHTML = `<option value="">Choose School</option>`;
  languageSelect.innerHTML = `<option value="">Choose Language</option>`;

  schools.forEach(s => {
    schoolSelect.innerHTML += `<option value="${s.id}">${s.school_name}</option>`;
  });

  languages.forEach(l => {
    languageSelect.innerHTML += `<option value="${l.id}">${l.language_name}</option>`;
  });
}

async function loadTranslators() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("role", "translator")
    .order("full_name");

  if (error) {
    console.log(error);
    return;
  }

  translators = data || [];
}

async function saveRequest() {
  const newRequest = {
    requestor_id: currentUser.id,
    service_date: document.getElementById("serviceDate").value || null,
    lasid: document.getElementById("lasid").value.trim(),
    last_name: document.getElementById("lastName").value.trim(),
    first_name: document.getElementById("firstName").value.trim(),
    school_id: document.getElementById("schoolSelect").value || null,
    language_id: document.getElementById("languageSelect").value || null,
    sped: document.getElementById("sped").value,
    request_notes: document.getElementById("requestNotes").value.trim(),
    status: "Pending Approval"
  };

  if (!newRequest.service_date || !newRequest.lasid || !newRequest.last_name || !newRequest.first_name) {
    document.getElementById("saveMessage").textContent =
      "Service Date, LASID, Last Name, and First Name are required.";
    return;
  }

  const { error } = await supabaseClient
    .from("translation_requests")
    .insert([newRequest]);

  if (error) {
    document.getElementById("saveMessage").textContent = "Error: " + error.message;
    return;
  }

  document.getElementById("saveMessage").textContent = "Request submitted.";

  clearForm();
  await loadRequests();
  showSection("requests");
}

function clearForm() {
  document
    .querySelectorAll("#newRequest input, #newRequest textarea, #newRequest select")
    .forEach(el => el.value = "");
}

async function loadRequests() {
  const { data, error } = await supabaseClient
    .from("translation_requests")
    .select(`
      *,
      school:school_id(school_name),
      language:language_id(language_name),
      translator:translator_id(full_name,email)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.log(error);
    return;
  }

  allRequests = data || [];
  updateDashboard();
  renderRequests();
}

function updateDashboard() {
  document.getElementById("pendingCount").textContent =
    allRequests.filter(r => r.status === "Pending Approval").length;

  document.getElementById("waitingCount").textContent =
    allRequests.filter(r => r.status === "Waiting for Translator").length;

  document.getElementById("assignedCount").textContent =
    allRequests.filter(r => r.status === "Assigned").length;

  document.getElementById("completedCount").textContent =
    allRequests.filter(r => r.status === "Completed").length;
}

function renderRequests() {
  const search = document.getElementById("searchBox")?.value.toLowerCase() || "";

  const filtered = allRequests.filter(r => {
    const text = `
      ${r.id}
      ${r.status}
      ${r.service_date}
      ${r.lasid}
      ${r.last_name}
      ${r.first_name}
      ${r.school?.school_name}
      ${r.language?.language_name}
      ${r.sped}
    `.toLowerCase();

    return text.includes(search);
  });

  const tbody = document.getElementById("requestTable");
  tbody.innerHTML = "";

  filtered.forEach(row => {
    tbody.innerHTML += buildRow(row);
  });
}

function buildRow(row) {
  const translatorName = row.translator
    ? row.translator.full_name || row.translator.email
    : "Not Assigned";

  return `
    <tr>
      <td>${row.id}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${row.service_date || ""}</td>
      <td>${row.lasid || ""}</td>
      <td>${row.last_name || ""}, ${row.first_name || ""}</td>
      <td>${row.school?.school_name || ""}</td>
      <td>${row.language?.language_name || ""}</td>
      <td>${row.sped || ""}</td>
      <td>${translatorName}</td>
      <td>${actionButtons(row)}</td>
    </tr>
  `;
}

function statusBadge(status) {
  let cls = "pending";

  if (status === "Waiting for Translator") cls = "waiting";
  if (status === "Assigned") cls = "assigned";
  if (status === "Completed") cls = "completed";
  if (status === "Rejected") cls = "rejected";

  return `<span class="status ${cls}">${status}</span>`;
}

function actionButtons(row) {
  if (currentProfile.role === "super" || currentProfile.role === "coordinator") {
    return adminActions(row);
  }

  if (currentProfile.role === "translator" && row.translator_id === currentUser.id) {
    return translatorActions(row);
  }

  return "";
}

function adminActions(row) {
  const translatorOptions = translators.map(t => {
    const selected = row.translator_id === t.id ? "selected" : "";
    return `<option value="${t.id}" ${selected}>${t.full_name || t.email}</option>`;
  }).join("");

  return `
    <div class="action-box">
      <textarea id="adminNotes-${row.id}" placeholder="Admin notes">${row.admin_notes || ""}</textarea>

      <select id="translator-${row.id}">
        <option value="">Choose Translator Later</option>
        ${translatorOptions}
      </select>

      <button class="approve" onclick="approveWaiting(${row.id})">
        Approve / Wait
      </button>

      <button class="assign" onclick="assignTranslator(${row.id})">
        Assign Translator
      </button>

      <button class="reject" onclick="rejectRequest(${row.id})">
        Reject
      </button>

      <button class="complete" onclick="completeRequest(${row.id})">
        Complete
      </button>
    </div>
  `;
}

function translatorActions(row) {
  return `
    <div class="action-box">
      <textarea id="afterNotes-${row.id}" placeholder="After notes">${row.after_notes || ""}</textarea>

      <button onclick="saveTranslatorNotes(${row.id})">
        Save Notes
      </button>

      <button class="complete" onclick="translatorComplete(${row.id})">
        Mark Complete
      </button>
    </div>
  `;
}

async function approveWaiting(id) {
  const adminNotes = document.getElementById(`adminNotes-${id}`).value.trim();

  const { error } = await supabaseClient
    .from("translation_requests")
    .update({
      status: "Waiting for Translator",
      admin_notes: adminNotes,
      approved_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadRequests();
}

async function assignTranslator(id) {
  const translatorId = document.getElementById(`translator-${id}`).value;
  const adminNotes = document.getElementById(`adminNotes-${id}`).value.trim();

  if (!translatorId) {
    alert("Please choose a translator.");
    return;
  }

  const { error } = await supabaseClient
    .from("translation_requests")
    .update({
      status: "Assigned",
      translator_id: translatorId,
      admin_notes: adminNotes,
      assigned_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadRequests();
}

async function rejectRequest(id) {
  const adminNotes = document.getElementById(`adminNotes-${id}`).value.trim();

  const { error } = await supabaseClient
    .from("translation_requests")
    .update({
      status: "Rejected",
      admin_notes: adminNotes
    })
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadRequests();
}

async function completeRequest(id) {
  const { error } = await supabaseClient
    .from("translation_requests")
    .update({
      status: "Completed",
      completed_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadRequests();
}

async function saveTranslatorNotes(id) {
  const afterNotes = document.getElementById(`afterNotes-${id}`).value.trim();

  const { error } = await supabaseClient
    .from("translation_requests")
    .update({
      after_notes: afterNotes
    })
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  alert("Notes saved.");
  await loadRequests();
}

async function translatorComplete(id) {
  const afterNotes = document.getElementById(`afterNotes-${id}`).value.trim();

  const { error } = await supabaseClient
    .from("translation_requests")
    .update({
      after_notes: afterNotes,
      status: "Completed",
      completed_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadRequests();
}
