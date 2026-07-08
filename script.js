let currentUser = null;
let currentProfile = null;
let translators = [];

document.addEventListener("DOMContentLoaded", checkUser);

async function checkUser() {
  const { data } = await supabaseClient.auth.getUser();

  if (!data.user) {
    showLogin();
    return;
  }

  currentUser = data.user;
  await loadProfile();
  showApp();
  await loadTranslators();
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
    `Logged in as: ${currentProfile.email} | Role: ${currentProfile.role}`;

  if (currentProfile.role === "translator") {
    document.getElementById("requestFormCard").classList.add("hidden");
  } else {
    document.getElementById("requestFormCard").classList.remove("hidden");
  }
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
    alert("Profile not found. Please create a profile row for this user.");
    return;
  }

  currentProfile = data;
}

async function loadTranslators() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("role", "translator")
    .order("full_name", { ascending: true });

  if (error) {
    console.log(error);
    return;
  }

  translators = data;
}

async function saveRequest() {
  const newRequest = {
    requestor_id: currentUser.id,
    last_name: document.getElementById("lastName").value.trim(),
    first_name: document.getElementById("firstName").value.trim(),
    email: document.getElementById("email").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    service_date: document.getElementById("serviceDate").value,
    language: document.getElementById("language").value.trim(),
    school: document.getElementById("school").value.trim(),
    sped: document.getElementById("sped").value,
    request_notes: document.getElementById("requestNotes").value.trim(),
    status: "Pending Approval"
  };

  const { error } = await supabaseClient
    .from("translation_requests")
    .insert([newRequest]);

  if (error) {
    document.getElementById("saveMessage").textContent = "Error: " + error.message;
    return;
  }

  document.getElementById("saveMessage").textContent = "Request submitted for approval.";
  clearForm();
  loadRequests();
}

function clearForm() {
  document.querySelectorAll("#requestFormCard input, #requestFormCard textarea, #requestFormCard select")
    .forEach(el => el.value = "");
}

async function loadRequests() {
  const { data, error } = await supabaseClient
    .from("translation_requests")
    .select(`
      *,
      translator:translator_id(full_name,email)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.log(error);
    return;
  }

  const tbody = document.getElementById("requestTable");
  tbody.innerHTML = "";

  data.forEach(row => {
    tbody.innerHTML += buildRow(row);
  });
}

function buildRow(row) {
  const translatorName = row.translator
    ? row.translator.full_name || row.translator.email
    : "";

  return `
    <tr>
      <td>${row.id}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${row.service_date || ""}</td>
      <td>${row.last_name || ""}, ${row.first_name || ""}</td>
      <td>${row.language || ""}</td>
      <td>${row.school || ""}</td>
      <td>${row.sped || ""}</td>
      <td>${translatorName}</td>
      <td>${actionButtons(row)}</td>
    </tr>
  `;
}

function statusBadge(status) {
  let cls = "pending";

  if (status === "Approved") cls = "approved";
  if (status === "Rejected") cls = "rejected";
  if (status === "Assigned") cls = "assigned";
  if (status === "Completed") cls = "completed";

  return `<span class="status ${cls}">${status}</span>`;
}

function actionButtons(row) {
  if (currentProfile.role === "super") {
    return superUserActions(row);
  }

  if (currentProfile.role === "translator" && row.translator_id === currentUser.id) {
    return translatorActions(row);
  }

  return "";
}

function superUserActions(row) {
  const translatorOptions = translators.map(t => {
    const selected = row.translator_id === t.id ? "selected" : "";
    return `<option value="${t.id}" ${selected}>${t.full_name || t.email}</option>`;
  }).join("");

  return `
    <div class="action-box">
      <select id="translator-${row.id}">
        <option value="">Choose Translator</option>
        ${translatorOptions}
      </select>

      <textarea id="adminNotes-${row.id}" placeholder="Admin notes">${row.admin_notes || ""}</textarea>

      <button class="approve" onclick="approveRequest(${row.id})">Approve / Assign</button>
      <button class="reject" onclick="rejectRequest(${row.id})">Reject</button>
      <button class="complete" onclick="completeRequest(${row.id})">Complete</button>
    </div>
  `;
}

function translatorActions(row) {
  return `
    <div class="action-box">
      <textarea id="afterNotes-${row.id}" placeholder="After notes">${row.after_notes || ""}</textarea>
      <button onclick="saveTranslatorNotes(${row.id})">Save Notes</button>
      <button class="complete" onclick="translatorComplete(${row.id})">Mark Complete</button>
    </div>
  `;
}

async function approveRequest(id) {
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
      approved_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  loadRequests();
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

  loadRequests();
}

async function completeRequest(id) {
  const { error } = await supabaseClient
    .from("translation_requests")
    .update({
      status: "Completed"
    })
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  loadRequests();
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
  loadRequests();
}

async function translatorComplete(id) {
  const afterNotes = document.getElementById(`afterNotes-${id}`).value.trim();

  const { error } = await supabaseClient
    .from("translation_requests")
    .update({
      after_notes: afterNotes,
      status: "Completed"
    })
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  loadRequests();
}