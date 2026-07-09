// ---------- View toggle ----------
// Tracks which customer the Notification Preferences panel is currently "loaded" for.
// Saving always uses this locked-in value, never whatever happens to be typed in the
// Customer ID field at click time — otherwise a user could load cust-1's tickets, then
// edit the field to cust-2 without refreshing, and accidentally save a preference for
// a customer whose data was never actually loaded into the panel.
let activePreferenceCustomerId = null;

const btnCustomerView = document.getElementById('btnCustomerView');
const btnAdminView = document.getElementById('btnAdminView');
const customerView = document.getElementById('customerView');
const adminView = document.getElementById('adminView');

function setActiveView(view) {
  [customerView, adminView].forEach(v => v.style.display = 'none');
  [btnCustomerView, btnAdminView].forEach(b => b.classList.remove('active'));

  if (view === 'customer') { customerView.style.display = 'flex'; btnCustomerView.classList.add('active'); }
  if (view === 'admin') {
    adminView.style.display = 'flex';
    btnAdminView.classList.add('active');
    refreshAdminGate();
  }
}

btnCustomerView.addEventListener('click', () => setActiveView('customer'));
btnAdminView.addEventListener('click', () => setActiveView('admin'));

// ---------- Admin login ----------
// Session lives in sessionStorage only — closing the tab logs the admin out, which is fine
// for this demo (there's no sensitive data at stake, and it avoids building real token refresh).
const ADMIN_SESSION_KEY = 'adminSession';

function getAdminSession() {
  try {
    return JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY));
  } catch (_) {
    return null;
  }
}

function setAdminSession(agent) {
  sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(agent));
}

function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

// Shows the login form or the dashboard depending on whether an admin is already logged in
// for this browser tab session. Called whenever the Admin tab is opened.
function refreshAdminGate() {
  const session = getAdminSession();
  const loginPanel = document.getElementById('adminLoginPanel');
  const dashboard = document.getElementById('adminDashboard');

  if (session) {
    loginPanel.style.display = 'none';
    dashboard.style.display = 'block';
    document.getElementById('adminWelcome').textContent = `Logged in as ${session.name} (${session.email})`;
    loadAgentTickets();
  } else {
    loginPanel.style.display = 'block';
    dashboard.style.display = 'none';
  }
}

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = document.getElementById('adminLoginStatus');
  status.textContent = 'Logging in...';

  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;

  try {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Server responded ${res.status}`);
    }

    const { agent } = await res.json();
    setAdminSession(agent);
    document.getElementById('adminLoginForm').reset();
    status.textContent = '';
    refreshAdminGate();
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  }
});

document.getElementById('btnAdminLogout').addEventListener('click', () => {
  clearAdminSession();
  refreshAdminGate();
});

// ---------- Admin sub-tabs (Tickets / Analytics) ----------
const btnAdminTickets = document.getElementById('btnAdminTickets');
const btnAdminAnalytics = document.getElementById('btnAdminAnalytics');
const adminTicketsPanel = document.getElementById('adminTicketsPanel');
const adminAnalyticsPanel = document.getElementById('adminAnalyticsPanel');

btnAdminTickets.addEventListener('click', () => {
  btnAdminTickets.classList.add('active');
  btnAdminAnalytics.classList.remove('active');
  adminTicketsPanel.style.display = 'block';
  document.getElementById('ticketDetailPanel').style.display = 'none';
  adminAnalyticsPanel.style.display = 'none';
  loadAgentTickets();
});

btnAdminAnalytics.addEventListener('click', () => {
  btnAdminAnalytics.classList.add('active');
  btnAdminTickets.classList.remove('active');
  adminAnalyticsPanel.style.display = 'block';
  adminTicketsPanel.style.display = 'none';
  document.getElementById('ticketDetailPanel').style.display = 'none';
  loadAnalytics();
});

// ---------- Ticket submission ----------
const ticketForm = document.getElementById('ticketForm');
const submitStatus = document.getElementById('submitStatus');

// Mirrors the backend's allowlist/size limit in uploadAttachment.js — checking here first gives
// instant feedback instead of making the user wait through a doomed upload round-trip.
const ALLOWED_ATTACHMENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain']);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

ticketForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitStatus.textContent = 'Submitting...';

  const customerId = document.getElementById('customerId').value.trim();
  const subject = document.getElementById('subject').value;
  const description = document.getElementById('description').value;
  const fileInput = document.getElementById('attachment');
  const file = fileInput.files && fileInput.files[0];

  if (file) {
    if (file.type && !ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      submitStatus.textContent = `Unsupported file type "${file.type}". Allowed: images, PDF, plain text.`;
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      submitStatus.textContent = `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max is ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`;
      return;
    }
  }

  let attachment = null;

  try {
    if (file) {
      submitStatus.textContent = 'Uploading attachment...';
      attachment = await uploadAttachment(file);
    }

    const res = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, subject, description, attachment })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Server responded ${res.status}`);
    }

    const ticket = await res.json();
    // Intentionally no success details here (category/priority/agent) — the created ticket
    // simply appears in My Tickets below, which is confirmation enough.
    submitStatus.textContent = 'Ticket submitted successfully.';
    // Carry the Customer ID over to the My Tickets field so the new ticket shows up
    // immediately without the customer having to retype their ID down there.
    document.getElementById('myTicketsCustomerId').value = customerId;
    ticketForm.reset();
    loadCustomerTickets();
  } catch (err) {
    submitStatus.textContent = `Error: ${err.message}`;
  }
});

// ---------- Attachment upload ----------
async function uploadAttachment(file) {
  const base64 = await fileToBase64(file);
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fileContentBase64: base64, contentType: file.type })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload failed with status ${res.status}`);
  }
  const data = await res.json();
  // blobName (not a URL) — the backend regenerates a fresh, non-expired SAS URL
  // every time the ticket is fetched, so nothing here goes stale.
  return { blobName: data.blobName, originalFileName: data.originalFileName, contentType: data.contentType };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Customer ticket list ----------
document.getElementById('refreshCustomerTickets').addEventListener('click', loadCustomerTickets);
document.getElementById('myTicketsCustomerId').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadCustomerTickets();
});

async function loadCustomerTickets() {
  const container = document.getElementById('customerTicketList');
  const customerId = document.getElementById('myTicketsCustomerId').value.trim();

  // Nothing entered yet (e.g. on first page load, before the customer types their ID) —
  // show a helpful prompt instead of fetching (and displaying) every ticket in the system.
  if (!customerId) {
    container.innerHTML = '<p>Enter your Customer ID above and submit a ticket, or click Refresh after entering it, to see your tickets here.</p>';
    setPreferencePanelLocked(null);
    return;
  }

  container.innerHTML = 'Loading...';

  try {
    const res = await fetch(`${API_BASE}/tickets?customerId=${encodeURIComponent(customerId)}`);
    if (!res.ok) throw new Error(`Failed to load tickets (Status: ${res.status})`);
    const tickets = await res.json();
    container.innerHTML = '';

    if (tickets.length === 0) {
      container.innerHTML = '<p>No tickets yet for this Customer ID.</p>';
      return;
    }

    tickets.forEach(t => container.appendChild(renderTicketCard(t, true)));
  } catch (err) {
    container.innerHTML = `<p>Error loading tickets: ${err.message}</p>`;
  }

  // Keep the preference checkbox in sync with whichever customer ID is currently entered,
  // rather than leaving it stuck on its default "checked" state regardless of what's saved.
  loadNotificationPreference(customerId);
}

async function loadNotificationPreference(customerId) {
  const status = document.getElementById('preferenceStatus');

  try {
    const res = await fetch(`${API_BASE}/customers/${encodeURIComponent(customerId)}/preferences`);
    if (!res.ok) {
      // Customer not found, etc. — lock the panel back to "no customer loaded" rather than
      // leaving stale controls enabled for an ID that turned out not to resolve.
      setPreferencePanelLocked(null);
      status.textContent = res.status === 404 ? 'No customer found for this Customer ID.' : '';
      return;
    }
    const data = await res.json();
    setPreferencePanelLocked(customerId, data.notifyByEmail);
    status.textContent = '';
  } catch (err) {
    setPreferencePanelLocked(null);
    status.textContent = '';
  }
}

// Enables/disables the Notification Preferences panel and records which customer ID it's locked
// to. Passing null disables the panel entirely (no verified customer loaded).
function setPreferencePanelLocked(customerId, notifyByEmail) {
  activePreferenceCustomerId = customerId;
  const checkbox = document.getElementById('notifyByEmailCheckbox');
  const saveBtn = document.getElementById('savePreferenceBtn');
  const label = document.getElementById('preferenceCustomerLabel');

  if (!customerId) {
    checkbox.disabled = true;
    saveBtn.disabled = true;
    label.textContent = 'No customer loaded yet.';
    return;
  }

  checkbox.disabled = false;
  saveBtn.disabled = false;
  checkbox.checked = notifyByEmail;
  label.textContent = `Showing preference for Customer ID: ${customerId}`;
}

// ---------- Agent ticket list ----------
document.getElementById('refreshAgentTickets').addEventListener('click', loadAgentTickets);

async function loadAgentTickets() {
  const container = document.getElementById('agentTicketList');
  container.innerHTML = 'Loading...';

  try {
    const res = await fetch(`${API_BASE}/tickets`);
    if (!res.ok) throw new Error(`Failed to load tickets (Status: ${res.status})`);
    const tickets = await res.json();
    container.innerHTML = '';

    renderStats(tickets);

    tickets.forEach(t => {
      const card = renderTicketCard(t, false, true);
      card.addEventListener('click', () => openTicketDetail(t.id));
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `<p>Error loading tickets: ${err.message}</p>`;
  }
}

function renderStats(tickets) {
  const statsBar = document.getElementById('statsBar');
  const total = tickets.length;
  const open = tickets.filter(t => t.status === 'Open').length;
  const resolved = tickets.filter(t => t.status === 'Resolved').length;
  const escalated = tickets.filter(t => t.status === 'Escalated').length;

  statsBar.innerHTML = `
    <div class="stat-box"><span class="num">${total}</span>Total Tickets</div>
    <div class="stat-box"><span class="num">${open}</span>Open</div>
    <div class="stat-box"><span class="num">${resolved}</span>Resolved</div>
    <div class="stat-box"><span class="num">${escalated}</span>Escalated</div>
  `;
}

function renderTicketCard(t, showRating, showDelete) {
  const div = document.createElement('div');
  div.className = 'ticket-card';
  div.innerHTML = `
    <h3>${escapeHtml(t.subject)}</h3>
    <span class="badge ${t.status}">${t.status}</span>
    <span class="badge ${t.priority}">${t.priority}</span>
    <span class="badge">${t.category || 'Uncategorized'}</span>
    ${showDelete ? `<button class="delete-ticket-btn" data-ticket-id="${t.id}" onclick="event.stopPropagation()">Delete</button>` : ''}
    <p>${escapeHtml(t.description).slice(0, 100)}${t.description.length > 100 ? '...' : ''}</p>
    <small>Customer: ${escapeHtml(t.customerName || 'Unknown')} | Agent: ${escapeHtml(t.agentName || 'Unassigned')}</small>
    ${t.attachmentUrl ? `<br><a href="${t.attachmentUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">View Attachment</a>` : ''}    ${showRating && t.status === 'Resolved' ? renderRatingWidget(t) : ''}
  `;

  // Only wire up clickable rating buttons if there's no score yet — once a ticket has been
  // rated, renderRatingWidget shows a read-only display instead, so there's nothing to attach
  // handlers to (and no way to accidentally overwrite the customer's original rating).
  if (showRating && t.status === 'Resolved' && typeof t.csatScore !== 'number') {
    setTimeout(() => attachRatingHandlers(div, t.id), 0);
  }

  if (showDelete) {
    const deleteBtn = div.querySelector('.delete-ticket-btn');
    deleteBtn.addEventListener('click', () => deleteTicket(t.id, t.subject));
  }

  return div;
}

async function deleteTicket(ticketId, subject) {
  const confirmed = confirm(`Delete ticket "${subject}"? This cannot be undone.`);
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_BASE}/tickets/${encodeURIComponent(ticketId)}`, { method: 'DELETE' });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Server responded ${res.status}`);
    }

    // If the deleted ticket's detail panel happens to be open, close it — otherwise it would
    // keep showing a ticket that no longer exists.
    const detailPanel = document.getElementById('ticketDetailPanel');
    if (detailPanel.dataset.ticketId === ticketId) {
      detailPanel.style.display = 'none';
    }

    loadAgentTickets();
  } catch (err) {
    alert(`Error deleting ticket: ${err.message}`);
  }
}

function renderRatingWidget(t) {
  // Already rated — show a read-only summary instead of clickable stars, so the customer can
  // see their rating but can't resubmit/overwrite it (rateTicket.js also rejects this server-side).
  if (typeof t.csatScore === 'number') {
    const filled = '★'.repeat(t.csatScore);
    const empty = '☆'.repeat(5 - t.csatScore);
    return `<div class="rating-stars rated" onclick="event.stopPropagation()">Rated: <span class="stars-readonly">${filled}${empty}</span> (${t.csatScore}/5)</div>`;
  }

  const stars = [1, 2, 3, 4, 5].map(n => `<button data-score="${n}">★</button>`).join('');
  return `<div class="rating-stars" onclick="event.stopPropagation()">Rate: ${stars}</div>`;
}

function attachRatingHandlers(cardEl, ticketId) {
  const buttons = cardEl.querySelectorAll('.rating-stars button');
  buttons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const score = Number(btn.dataset.score);

      try {
        const res = await fetch(`${API_BASE}/tickets/${ticketId}/rating`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Rating failed with status ${res.status}`);
        }

        loadCustomerTickets();
      } catch (err) {
        alert(`Error submitting rating: ${err.message}`);
      }
    });
  });
}

// ---------- Ticket detail (agent actions) ----------
async function openTicketDetail(ticketId) {
  const panel = document.getElementById('ticketDetailPanel');
  const detail = document.getElementById('ticketDetail');
  panel.style.display = 'block';
  panel.dataset.ticketId = ticketId;
  detail.innerHTML = 'Loading...';

  try {
    const res = await fetch(`${API_BASE}/tickets/${ticketId}`);
    if(!res.ok){
      let msg=`Failed to load ticket details (Status: ${res.status})`;
      try{
        const err=await res.json();
        if(err?.error) msg+=`: ${err.error}`;
      }catch(_){}
      throw new Error(msg);
    }
    const t = await res.json();

    detail.innerHTML = `
      <h3>${escapeHtml(t.subject)}</h3>
      <p>${escapeHtml(t.description)}</p>
      <small>Customer: ${escapeHtml(t.customerName)} (${escapeHtml(t.customerEmail || '')})</small>
      
      ${t.attachmentUrl ? `<br><br><a href="${t.attachmentUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">View Attachment</a>` : ''}

      <label>Status</label>
      <select id="statusSelect">
        ${['Open', 'InProgress', 'Resolved', 'Escalated'].map(s =>
          `<option value="${s}" ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>

      <label>Priority</label>
      <select id="prioritySelect">
        ${['Low', 'Normal', 'High'].map(p =>
          `<option value="${p}" ${t.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
      </select>

      <button id="saveTicketBtn">Save Changes</button>
      <button id="deleteTicketDetailBtn" class="delete-ticket-btn">Delete Ticket</button>
      <p id="saveStatus"></p>

      <h4>Comments</h4>
      <div id="commentsList">
        ${(t.comments || []).map(c => `
          <div class="comment">
            <div class="meta">${escapeHtml(c.authorName)} (${c.authorType}) — ${new Date(c.createdAt).toLocaleString()}</div>
            ${escapeHtml(c.message)}
          </div>
        `).join('') || '<p>No comments yet.</p>'}
      </div>

      <label>Add Comment</label>
      <input type="text" id="commentAuthor" placeholder="Your name (Agent)">
      <input type="text" id="commentMessage" placeholder="Message" style="margin-top:6px;">
      <button id="addCommentBtn" style="margin-top:8px;">Add Comment</button>
    `;

    document.getElementById('saveTicketBtn').addEventListener('click', () => saveTicketChanges(ticketId));
    document.getElementById('addCommentBtn').addEventListener('click', () => submitComment(ticketId));
    document.getElementById('deleteTicketDetailBtn').addEventListener('click', () => deleteTicket(ticketId, t.subject));
  } catch (err) {
    detail.innerHTML = `<p>Error: ${err.message}</p>`;
  }
}

async function saveTicketChanges(ticketId) {
  const status = document.getElementById('statusSelect').value;
  const priority = document.getElementById('prioritySelect').value;
  const saveStatus = document.getElementById('saveStatus');
  saveStatus.textContent = 'Saving...';

  try {
    const res = await fetch(`${API_BASE}/tickets/${ticketId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, priority })
    });
    // THE FIX: properly extract the backend error message
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server responded ${res.status}`);
    }
    saveStatus.textContent = 'Saved.';
    loadAgentTickets();
  } catch (err) {
    saveStatus.textContent = `Error: ${err.message}`;
  }
}

async function submitComment(ticketId) {
  const authorName = document.getElementById('commentAuthor').value || 'Agent';
  const message = document.getElementById('commentMessage').value;
  if (!message) return;

  try {
    const res = await fetch(`${API_BASE}/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorType: 'Agent', authorName, message })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to add comment (status ${res.status})`);
    }
    openTicketDetail(ticketId);
  } catch (err) {
    alert(`Error adding comment: ${err.message}`);
  }
}

// ---------- Analytics ----------
document.getElementById('refreshAnalytics').addEventListener('click', loadAnalytics);

async function loadAnalytics() {
  const container = document.getElementById('analyticsContent');
  container.innerHTML = 'Loading...';

  try {
    const res = await fetch(`${API_BASE}/analytics`);
    
    // --> FIX: Check if the response is successful before parsing data
    if (!res.ok) {
      let msg = `Failed to load analytics (Status: ${res.status})`;
      try {
        const err = await res.json();
        if (err?.error) msg += `: ${err.error}`;
      } catch (_) {} // Ignore JSON parse errors if the response was HTML/text
      throw new Error(msg);
    }

    const data = await res.json();

    const statusRows = Object.entries(data.byStatus || {})
      .map(([k, v]) => `<div class="breakdown-row"><span>${k}</span><span>${v}</span></div>`).join('');
    const categoryRows = Object.entries(data.byCategory || {})
      .map(([k, v]) => `<div class="breakdown-row"><span>${k}</span><span>${v}</span></div>`).join('');
    const priorityRows = Object.entries(data.byPriority || {})
      .map(([k, v]) => `<div class="breakdown-row"><span>${k}</span><span>${v}</span></div>`).join('');

    const agentRows = (data.agentPerformance || []).map(a => `
      <tr>
        <td>${escapeHtml(a.agentName || a.agentId)}</td>
        <td>${a.assignedCount}</td>
        <td>${a.resolvedCount}</td>
        <td>${a.resolutionRate}%</td>
        <td>${a.avgResolutionHours ?? 'N/A'}</td>
        <td>${a.avgCsat ?? 'N/A'}</td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="analytics-grid">
        <div class="analytics-card">
          <h4>Overview</h4>
          <div class="breakdown-row"><span>Total Tickets</span><span>${data.totalTickets}</span></div>
          <div class="breakdown-row"><span>Resolved</span><span>${data.resolution.resolvedCount}</span></div>
          <div class="breakdown-row"><span>Avg Resolution (hrs)</span><span>${data.resolution.avgHours ?? 'N/A'}</span></div>
          <div class="breakdown-row"><span>Min / Max Resolution (hrs)</span><span>${data.resolution.minHours ?? 'N/A'} / ${data.resolution.maxHours ?? 'N/A'}</span></div>
          <div class="breakdown-row"><span>Avg CSAT (out of 5)</span><span>${data.csat.average ?? 'N/A'}</span></div>
          <div class="breakdown-row"><span>Rated Tickets</span><span>${data.csat.ratedCount}</span></div>
        </div>

        <div class="analytics-card">
          <h4>By Status</h4>
          ${statusRows || '<p>No data yet.</p>'}
        </div>

        <div class="analytics-card">
          <h4>By Category</h4>
          ${categoryRows || '<p>No data yet.</p>'}
        </div>

        <div class="analytics-card">
          <h4>By Priority</h4>
          ${priorityRows || '<p>No data yet.</p>'}
        </div>
      </div>

      <div class="analytics-card" style="margin-top:16px;">
        <h4>Agent Performance</h4>
        <table class="agent-table">
          <thead>
            <tr><th>Agent</th><th>Assigned</th><th>Resolved</th><th>Resolution Rate</th><th>Avg Resolution (hrs)</th><th>Avg CSAT</th></tr>
          </thead>
          <tbody>${agentRows || '<tr><td colspan="6">No data yet.</td></tr>'}</tbody>
        </table>
      </div>
    `;
  } catch (err) {
    // Now backend configuration errors will correctly show up on the screen here
    container.innerHTML = `<p style="color: red;">Error loading analytics: ${err.message}</p>`;
  }
}

// ---------- Notification preferences ----------
document.getElementById('savePreferenceBtn').addEventListener('click', async () => {
  const notifyByEmail = document.getElementById('notifyByEmailCheckbox').checked;
  const status = document.getElementById('preferenceStatus');

  // Save against the customer ID the panel is actually locked to (set by loadNotificationPreference
  // after a successful load), not whatever text currently sits in the Customer ID input — those can
  // diverge if the user edits the field without clicking Refresh again.
  if (!activePreferenceCustomerId) {
    status.textContent = 'Load a Customer ID first (enter it above and click Refresh).';
    return;
  }

  status.textContent = 'Saving...';

  try {
    const res = await fetch(`${API_BASE}/customers/${encodeURIComponent(activePreferenceCustomerId)}/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifyByEmail })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed with status ${res.status}`);
    }

    status.textContent = notifyByEmail
      ? `Saved for ${activePreferenceCustomerId} — email notifications are on.`
      : `Saved for ${activePreferenceCustomerId} — email notifications are off.`;
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  }
});

// ---------- Utility ----------
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// Initial load
loadCustomerTickets();
