let currentUser = null;
let currentProfile = null;
let allRequests = [];

document.addEventListener("DOMContentLoaded", checkUser);

/* ===========================
   LOGIN / APP VIEW
=========================== */

async function checkUser() {
  const { data, error } = await supabaseClient.auth.getUser();

  if (error || !data || !data.user) {
    currentUser = null;
    currentProfile = null;
    showLogin();
    return;
  }

  currentUser = data.user;

  await loadProfile();

  if (!currentProfile) {
    showLogin();
    return;
  }

  await loadDropdowns();

  showApp();
  showSection("dashboard");
  await loadRequests();
}

function showLogin() {
  document.getElementById("loginPage").classList.remove("hidden");
  document.getElementById("loginPage").style.display = "block";

  document.getElementById("appPage").classList.add("hidden");
  document.getElementById("appPage").style.display = "none";
}

function showApp() {
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("loginPage").style.display = "none";

  document.getElementById("appPage").classList.remove("hidden");
  document.getElementById("appPage").style.display = "block";

  document.getElementById("userRole").textContent =
    `${currentProfile.full_name || currentProfile.email} | ${currentProfile.role}`;

  const newRequestButton = document.querySelector(
    "button[onclick=\"showSection('newRequest')\"]"
  );

  if (newRequestButton) {
    newRequestButton.style.display =
      currentProfile.role === "viewer" ? "none" : "block";
  }
}

function showSection(sectionId) {
  document.querySelectorAll(".section").forEach(section => {
    section.classList.add("hidden");
  });

  const section = document.getElementById(sectionId);
  if (section) section.classList.remove("hidden");
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
  await checkUser();
}

async function logout() {
  await supabaseClient.auth.signOut();

  currentUser = null;
  currentProfile = null;
  allRequests = [];

  showLogin();
}

/* ===========================
   LOAD DATA
=========================== */

async function loadProfile() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (error || !data) {
    alert("Profile not found.");
    currentProfile = null;
    return;
  }

  currentProfile = data;
}

async function loadDropdowns() {
  const { data: schools, error: schoolError } = await supabaseClient
    .from("schools")
    .select("*")
    .eq("active", true)
    .order("school_name");

  const { data: languages, error: languageError } = await supabaseClient
    .from("languages")
    .select("*")
    .eq("active", true)
    .order("language_name");

  if (schoolError) console.log(schoolError);
  if (languageError) console.log(languageError);

  const schoolSelect = document.getElementById("schoolSelect");
  const languageSelect = document.getElementById("languageSelect");

  if (!schoolSelect || !languageSelect) return;

  schoolSelect.innerHTML = `<option value="">Choose School</option>`;
  languageSelect.innerHTML = `<option value="">Choose Language</option>`;

  (schools || []).forEach(school => {
    schoolSelect.innerHTML += `
      <option value="${school.id}">${school.school_name}</option>
    `;
  });

  (languages || []).forEach(language => {
    languageSelect.innerHTML += `
      <option value="${language.id}">${language.language_name}</option>
    `;
  });
}

async function loadRequests() {
  const { data, error } = await supabaseClient
    .from("translation_requests")
    .select(`
      *,
      school:school_id(school_name),
      language:language_id(language_name)
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

/* ===========================
   NEW REQUEST
=========================== */

async function saveRequest() {
  const saveMessage = document.getElementById("saveMessage");

  const newRequest = {
    requestor_id: currentUser.id,
    lasid: document.getElementById("lasid").value.trim(),
    last_name: document.getElementById("lastName").value.trim(),
    first_name: document.getElementById("firstName").value.trim(),
    school_id: document.getElementById("schoolSelect").value || null,
    language_id: document.getElementById("languageSelect").value || null,
    sped: document.getElementById("sped").value,
    service_date: document.getElementById("serviceDate").value || null,
    request_notes: document.getElementById("requestNotes").value.trim(),
    status: "Pending Approval"
  };

  if (
    !newRequest.lasid ||
    !newRequest.last_name ||
    !newRequest.first_name ||
    !newRequest.service_date
  ) {
    saveMessage.textContent =
      "LASID, Last Name, First Name, and Service Date are required.";
    return;
  }

  const { error } = await supabaseClient
    .from("translation_requests")
    .insert([newRequest]);

  if (error) {
    saveMessage.textContent = "Error: " + error.message;
    return;
  }

  saveMessage.textContent = "Request submitted.";

  clearForm();
  await loadRequests();
  showSection("requests");
}

function clearForm() {
  document
    .querySelectorAll("#newRequest input, #newRequest textarea, #newRequest select")
    .forEach(el => {
      el.value = "";
    });
}

/* ===========================
   DASHBOARD / REQUEST TABLE
=========================== */

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
  const tbody = document.getElementById("requestTable");
  if (!tbody) return;

  const search = document.getElementById("searchBox")?.value.toLowerCase() || "";

  const filtered = allRequests.filter(row => {
    const text = `
      ${row.id}
      ${row.status}
      ${row.service_date}
      ${row.lasid}
      ${row.last_name}
      ${row.first_name}
      ${row.school?.school_name || ""}
      ${row.language?.language_name || ""}
      ${row.sped || ""}
      ${row.translator_name || ""}
    `.toLowerCase();

    return text.includes(search);
  });

  tbody.innerHTML = "";

  filtered.forEach(row => {
    tbody.innerHTML += buildRow(row);
  });
}

function buildRow(row) {
  const translatorName = row.translator_name || "Not Assigned";

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

/* ===========================
   ACTION BUTTONS
=========================== */

function actionButtons(row) {
  if (currentProfile.role === "super" || currentProfile.role === "coordinator") {
    return adminActions(row);
  }

  return "";
}

function adminActions(row) {
  if (row.status !== "Pending Approval") {
    return `
      <button onclick="toggleEdit(${row.id})">Edit</button>

      <div id="edit-${row.id}" class="action-box" style="display:none;">
        ${adminActionControls(row)}
      </div>
    `;
  }

  return `
    <div class="action-box">
      ${adminActionControls(row)}
    </div>
  `;
}

function adminActionControls(row) {
  return `
    <textarea id="adminNotes-${row.id}" placeholder="Admin notes">${row.admin_notes || ""}</textarea>

    <input 
      id="translator-${row.id}" 
      placeholder="Translator name"
      value="${row.translator_name || ""}"
    >

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
  `;
}

function toggleEdit(id) {
  const box = document.getElementById(`edit-${id}`);
  if (!box) return;

  box.style.display =
    box.style.display === "none" || box.style.display === ""
      ? "grid"
      : "none";
}

/* ===========================
   ADMIN UPDATES
=========================== */

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
  const translatorName = document.getElementById(`translator-${id}`).value.trim();
  const adminNotes = document.getElementById(`adminNotes-${id}`).value.trim();

  if (!translatorName) {
    alert("Please enter a translator name.");
    return;
  }

  const { error } = await supabaseClient
    .from("translation_requests")
    .update({
      status: "Assigned",
      translator_name: translatorName,
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
  const adminNotes = document.getElementById(`adminNotes-${id}`)?.value.trim() || "";
  const translatorName = document.getElementById(`translator-${id}`)?.value.trim() || "";

  const updateData = {
    status: "Completed",
    completed_at: new Date().toISOString()
  };

  if (adminNotes) updateData.admin_notes = adminNotes;
  if (translatorName) updateData.translator_name = translatorName;

  const { error } = await supabaseClient
    .from("translation_requests")
    .update(updateData)
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadRequests();
}
