// -------- SUPABASE CONFIG ----------  //
const SUPABASE_URL = 'https://noqfhommfvnbmlsqlaan.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UIYBrBTGlP7bSIWERpv7dQ_sGgayUSR';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Your deployed Edge Function URL for sending reset emails
const EDGE_FUNCTION_URL = 'https://noqfhommfvnbmlsqlaan.functions.supabase.co/send-reset-email';

const AppState = {
  session: null,
  user: null,      // will be the profile row (id, name, role, ...)
  tickets: [],
  currentView: 'view-dashboard',
};

/* ── UI Helpers ── */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  // Hide forgot / new-password forms when switching tabs
  const forgotForm = document.getElementById('forgot-password-form');
  const newPwdForm = document.getElementById('new-password-form');
  if (forgotForm) forgotForm.style.display = 'none';
  if (newPwdForm) newPwdForm.style.display = 'none';
  document.getElementById('tab-login').style.display = 'inline-block';
  document.getElementById('tab-register').style.display = 'inline-block';
  clearAuthMessages();
}

function clearAuthMessages() {
  ['auth-error', 'auth-success', 'reset-error', 'reset-success', 'update-error', 'update-success'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('show');
      el.textContent = '';
    }
  });
}

function showAuthMessage(id, message) {
  clearAuthMessages();
  const el = document.getElementById(id);
  if (el) {
    el.textContent = message;
    el.classList.add('show');
  }
}

/* ── Auth ── */
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    return showAuthMessage('auth-error', 'Please enter your email and password.');
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    return showAuthMessage('auth-error', error.message);
  }

  showAuthMessage('auth-success', 'Login successful! Redirecting...');
  setTimeout(() => bootApp(), 600);
}

async function handleRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const role = document.getElementById('reg-role').value;
  const department = document.getElementById('reg-dept').value.trim();

  if (!name || !email || !password) {
    return showAuthMessage('auth-error', 'Please fill in all required fields.');
  }
  if (password.length < 6) {
    return showAuthMessage('auth-error', 'Password must be at least 6 characters.');
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { name, role, department },
    },
  });

  if (error) {
    return showAuthMessage('auth-error', error.message);
  }

  showAuthMessage('auth-success', 'Account created! You can now sign in.');
  setTimeout(() => switchAuthTab('login'), 1500);
}

// This function is called by the logout button
async function handleLogout() {
  const logoutBtn = document.querySelector('.logout-btn');
  if (logoutBtn) {
    logoutBtn.disabled = true;
    logoutBtn.textContent = '⏳';
  }

  try {
    // Only sign out – do NOT clean up UI here
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.error('Sign-out failed:', err);
    showToast('Sign-out failed: ' + err.message, 'error');
    if (logoutBtn) {
      logoutBtn.disabled = false;
      logoutBtn.textContent = '⏏';
    }
    // If sign-out fails, do nothing else
  }
  // If successful, the SIGNED_OUT listener will call cleanupAfterLogout()
}

// This function only resets the UI and state (called by the auth listener)
function cleanupAfterLogout() {
  supabaseClient.removeAllChannels();   // stop real-time subscriptions

  AppState.session = null;
  AppState.user = null;
  AppState.tickets = [];

  const logoutBtn = document.querySelector('.logout-btn');
  if (logoutBtn) {
    logoutBtn.disabled = false;
    logoutBtn.textContent = '⏏';
  }

  document.getElementById('app-screen').classList.remove('visible');
  document.getElementById('auth-screen').style.display = 'flex';
  switchAuthTab('login');
}

/* ── User Profile ── */
async function fetchUserProfile(userId) {
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return profile;
}

/* ── Boot ── */
async function bootApp() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) {
    document.getElementById('auth-screen').style.display = 'flex';
    return;
  }

  AppState.session = session;
  try {
    AppState.user = await fetchUserProfile(session.user.id);
  } catch (err) {
    console.error('Failed to fetch user profile:', err);
    return handleLogout();
  }

  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').classList.add('visible');

  const initials = AppState.user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('user-avatar-initials').textContent = initials;
  document.getElementById('sidebar-user-name').textContent = AppState.user.name;
  document.getElementById('sidebar-user-role').textContent = capitalise(AppState.user.role);
  document.getElementById('topbar-user-greeting').textContent = `Hello, ${AppState.user.name.split(' ')[0]} 👋`;

  buildSidebarNav(AppState.user.role);
  navigateTo('view-dashboard');
  setupRealtime();   // activate real‑time updates
}

/* ── Sidebar Nav ── */
function buildSidebarNav(role) {
  const nav = document.getElementById('sidebar-nav');
  const items = [
    { icon: `<img class="sidebar-icon" src="./Assets/dashboard.png"/>`, label: 'Dashboard',    view: 'view-dashboard', roles: ['user','technician','admin'] },
    { icon: `<img class="sidebar-icon" src="./Assets/report.png"/>`, label: 'Report Issue', view: 'view-report',    roles: ['user'] },
    { icon: `<img class="sidebar-icon" src="./Assets/tickets.png"/>`, label: 'My Tickets',   view: 'view-tickets',   roles: ['user'] },
    { icon: `<img class="sidebar-icon" src="./Assets/settings.png"/>`, label: 'Assigned Work',view: 'view-tickets',   roles: ['technician'] },
    { icon: '<img class="sidebar-icon" src="./Assets/tickets.png"/>', label: 'All Tickets',  view: 'view-tickets',   roles: ['admin'] },
  ];

  nav.innerHTML = '<div class="nav-section-label">Main Menu</div>';
  items
    .filter(item => item.roles.includes(role))
    .forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.dataset.view = item.view;
      btn.innerHTML = `<span class="nav-icon">${item.icon}</span>${item.label}`;
      btn.onclick = () => { navigateTo(item.view); closeSidebar(); };
      nav.appendChild(btn);
    });
}

/* ── Navigation ── */
function navigateTo(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId)?.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewId);
  });

  const titles = {
    'view-dashboard': 'Dashboard',
    'view-report': 'Report Issue',
    'view-tickets': 'My Tickets',
  };
  document.getElementById('topbar-title').textContent = titles[viewId] || 'ABUAD Maintenance';

  AppState.currentView = viewId;

  if (viewId === 'view-dashboard') loadDashboard();
  if (viewId === 'view-tickets')   loadMyTickets();
}

/* ── Dashboard ── */
async function loadDashboard() {
  try {
    const userId = AppState.user.id;
    const role = AppState.user.role;

    // For technician (and admin) – show stats for all tickets
    if (role === 'technician' || role === 'admin') {
      // Count all tickets (no user filter)
      const { count: total } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true });

      const { count: open } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['Submitted', 'Assigned']);

      const { count: progress } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'In Progress');

      const { count: resolved } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['Resolved', 'Closed']);

      document.getElementById('stat-total').textContent = total || 0;
      document.getElementById('stat-open').textContent = open || 0;
      document.getElementById('stat-progress').textContent = progress || 0;
      document.getElementById('stat-resolved').textContent = resolved || 0;

      // Recent tickets – all, sorted by newest
      const { data: recent } = await supabaseClient
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      AppState.tickets = recent || [];
      renderTicketList('dashboard-recent-tickets', recent || []);
      return;
    }

    // Normal user – their own tickets (unchanged)
    const { count: total } = await supabaseClient
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: open } = await supabaseClient
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['Submitted', 'Assigned']);

    const { count: progress } = await supabaseClient
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'In Progress');

    const { count: resolved } = await supabaseClient
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['Resolved', 'Closed']);

    document.getElementById('stat-total').textContent = total || 0;
    document.getElementById('stat-open').textContent = open || 0;
    document.getElementById('stat-progress').textContent = progress || 0;
    document.getElementById('stat-resolved').textContent = resolved || 0;

    const { data: recent } = await supabaseClient
      .from('tickets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    AppState.tickets = recent || [];
    renderTicketList('dashboard-recent-tickets', recent || []);
  } catch (err) {
    document.getElementById('dashboard-recent-tickets').innerHTML =
      `<p style="color:var(--danger);font-size:0.875rem;">Could not load dashboard: ${err.message}</p>`;
  }
}

/* ── Tickets List ── */
async function loadMyTickets() {
  const status   = document.getElementById('filter-status')?.value || '';
  const category = document.getElementById('filter-category')?.value || '';

  let query = supabaseClient.from('tickets').select('*', { count: 'exact' });

  const role = AppState.user.role;
  const userId = AppState.user.id;

  if (role === 'user') {
    // Normal user: only their own tickets
    query = query.eq('user_id', userId);
  } else if (role === 'technician') {
    // Technician sees ALL tickets (unassigned and assigned, everything)
    // No user_id filter – just let the status/category filters apply
  } else if (role === 'admin') {
    // Admin also sees all tickets – no filter
  }

  if (status)   query = query.eq('status', status);
  if (category) query = query.eq('category', category);
  query = query.order('created_at', { ascending: false });

  document.getElementById('tickets-list-container').innerHTML =
    `<div class="loading-container"><div class="spinner"></div><p>Loading tickets...</p></div>`;

  const { data, error } = await query;
  if (error) {
    document.getElementById('tickets-list-container').innerHTML =
      `<p style="color:var(--danger);font-size:0.875rem;">Error: ${error.message}</p>`;
    return;
  }

  AppState.tickets = data || [];
  renderTicketList('tickets-list-container', data || []);
}

/* ── Render Ticket Cards ── */
function renderTicketList(containerId, tickets) {
  const container = document.getElementById(containerId);
  if (!tickets || tickets.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <h3>No tickets found</h3>
        <p>Nothing to show here.</p>
      </div>`;
    return;
  }

  const html = tickets.map(ticket => `
    <div class="ticket-card" onclick="openTicketDetail('${ticket.id}')">
      <div class="ticket-card-inner">
        <div class="ticket-priority-stripe stripe-${ticket.priority}"></div>
        <div class="ticket-card-body">
          <div class="ticket-header-row">
            <div>
              <div class="ticket-id-badge">${ticket.ticket_id}</div>
              <div class="ticket-title">${escapeHtml(ticket.title)}</div>
            </div>
            <span class="status-badge badge-${ticket.status}">${ticket.status}</span>
          </div>
          <div class="ticket-meta">
            <span class="ticket-chip chip-category">${categoryIcon(ticket.category)} ${ticket.category}</span>
            <span class="ticket-chip chip-location">📍 ${escapeHtml(ticket.location?.building || '—')}</span>
            <span class="chip-date">🕒 ${formatDate(ticket.created_at)}</span>
          </div>
        </div>
      </div>
    </div>`).join('');

  container.innerHTML = `<div class="ticket-list">${html}</div>`;
}

/* ── Ticket Detail ── */
async function openTicketDetail(ticketId) {
  const overlay = document.getElementById('detail-overlay');
  const content = document.getElementById('detail-content');
  overlay.classList.add('show');
  content.innerHTML = `<div class="loading-container" style="margin-top:4rem;"><div class="spinner"></div><p>Loading...</p></div>`;

  const { data: ticket, error } = await supabaseClient
    .from('tickets')
    .select('*, assigned_to:profiles!tickets_assigned_to_fkey(name, specialization), user:profiles!tickets_user_id_fkey(name)')
    .eq('id', ticketId)
    .single();

  if (error) {
    content.innerHTML = `<p style="color:var(--danger);">Error: ${error.message}</p>`;
    return;
  }

  content.innerHTML = renderDetailPanel(ticket);
}

/* ── Render Detail Panel with action buttons ── */
function renderDetailPanel(ticket) {
  const STEPS = [
    { key: 'Submitted',   label: 'Submitted',   icon: '📩' },
    { key: 'Assigned',    label: 'Assigned',     icon: '👷' },
    { key: 'In Progress', label: 'In Progress',  icon: '🔧' },
    { key: 'Resolved',    label: 'Resolved',     icon: '✅' },
  ];

  const statusOrder = { Submitted:0, Assigned:1, 'In Progress':2, 'On Hold':2, Resolved:3, Closed:3 };
  const currentStep = statusOrder[ticket.status] ?? 0;

  const stepperHTML = STEPS.map((step, idx) => {
    let cls = '';
    if (idx < currentStep) cls = 'completed';
    else if (idx === currentStep) cls = 'active';

    const histEntry = ticket.status_history?.find(h => h.status === step.key);
    const timeLabel = histEntry ? formatDate(histEntry.timestamp) : '';

    return `
      <div class="step ${cls}">
        <div class="step-circle">${cls === 'completed' ? '✓' : step.icon}</div>
        <div class="step-label">${step.label}</div>
        <div class="step-time">${timeLabel}</div>
      </div>`;
  }).join('');

  const historyHTML = (ticket.status_history || [])
    .slice().reverse()
    .map((entry, idx) => `
      <div class="history-item">
        <div class="history-dot ${idx === 0 ? 'latest' : ''}">●</div>
        <div class="history-content">
          <div class="history-status">${entry.status}</div>
          ${entry.note ? `<div class="history-note">${escapeHtml(entry.note)}</div>` : ''}
          <div class="history-time">
            ${entry.changed_by?.name ? `By ${escapeHtml(entry.changed_by.name)} · ` : ''}
            ${formatDate(entry.timestamp)}
          </div>
        </div>
      </div>`).join('');

  let resolutionBadge = '';
  if (ticket.resolved_at && ticket.created_at) {
    const diffHours = ((new Date(ticket.resolved_at) - new Date(ticket.created_at)) / 3600000).toFixed(1);
    resolutionBadge = `<div style="background:var(--gray-50);border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);display:inline-block;font-size:0.82rem;color:var(--success);font-weight:600;">⏱ Resolved in ${diffHours} hours</div>`;
  }

  // ═══════ ACTION BUTTONS ═══════
  let actionsHTML = '';
  // Technician status progression
  if (AppState.user.role === 'technician') {
    if (ticket.status === 'Submitted') {
      actionsHTML += `<button class="btn btn-primary" style="margin-right:0.5rem;" onclick="updateTicketStatus(${ticket.id}, 'Assigned')">🔧 Take Task</button>`;
    } else if (ticket.status === 'Assigned') {
      actionsHTML += `<button class="btn btn-primary" style="margin-right:0.5rem;" onclick="updateTicketStatus(${ticket.id}, 'In Progress')">▶️ Start Work</button>`;
    } else if (ticket.status === 'In Progress') {
      actionsHTML += `<button class="btn btn-success" style="margin-right:0.5rem;" onclick="updateTicketStatus(${ticket.id}, 'Resolved')">✅ Mark Resolved</button>`;
    }
  }

  // Delete button (only when resolved/closed, for both user and technician)
  if ((ticket.status === 'Resolved' || ticket.status === 'Closed') &&
      (AppState.user.role === 'technician' || AppState.user.id === ticket.user_id)) {
    actionsHTML += `<button class="btn btn-danger" style="margin-right:0.5rem;" onclick="deleteTicket(${ticket.id})">🗑️ Delete Ticket</button>`;
  }

  const actionsSection = actionsHTML
    ? `<hr class="detail-divider" />
       <div style="margin-bottom:var(--space-5);">${actionsHTML}</div>`
    : '';

  return `
    <div>
      <div style="margin-bottom:var(--space-5);">
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-2);">
          <code style="font-size:0.72rem;color:var(--gray-400);background:var(--gray-100);padding:2px 8px;border-radius:4px;">${ticket.ticket_id}</code>
          <span class="status-badge badge-${ticket.status}">${ticket.status}</span>
        </div>
        <h2 style="font-family:var(--font-display);font-size:1.3rem;color:var(--brand-navy);">${escapeHtml(ticket.title)}</h2>
      </div>

      <div class="progress-tracker">
        <h4>Repair Progress</h4>
        <div class="stepper">${stepperHTML}</div>
      </div>

      ${resolutionBadge ? `<div style="margin-bottom:var(--space-5);">${resolutionBadge}</div>` : ''}

      <div class="detail-field">
        <div class="detail-field-label">Category</div>
        <div class="detail-field-value">${categoryIcon(ticket.category)} ${ticket.category}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">Priority</div>
        <div class="detail-field-value">${priorityBadge(ticket.priority)}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">Location</div>
        <div class="detail-field-value">
          📍 ${escapeHtml(ticket.location?.building || '—')}
          ${ticket.location?.floor ? ', ' + ticket.location.floor : ''}
          ${ticket.location?.room ? ' · ' + ticket.location.room : ''}
        </div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">Description</div>
        <div class="detail-field-value" style="white-space:pre-wrap;">${escapeHtml(ticket.description)}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">Submitted</div>
        <div class="detail-field-value">${formatDate(ticket.created_at)}</div>
      </div>

      ${ticket.assigned_to ? `
      <hr class="detail-divider" />
      <div class="detail-field">
        <div class="detail-field-label">Assigned Technician</div>
        <div class="detail-field-value">
          👷 ${escapeHtml(ticket.assigned_to.name)}
          ${ticket.assigned_to.specialization ? ` · ${ticket.assigned_to.specialization}` : ''}
        </div>
      </div>` : ''}

      ${ticket.resolution_note ? `
      <div class="detail-field">
        <div class="detail-field-label">Resolution Notes</div>
        <div class="detail-field-value" style="background:var(--gray-50);padding:var(--space-3);border-radius:var(--radius-sm);">${escapeHtml(ticket.resolution_note)}</div>
      </div>` : ''}

      ${ticket.rating ? `
      <div class="detail-field">
        <div class="detail-field-label">Rating</div>
        <div class="detail-field-value">${'⭐'.repeat(ticket.rating)} (${ticket.rating}/5)</div>
      </div>` : ''}

      ${actionsSection}

      <hr class="detail-divider" />
      <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--gray-400);margin-bottom:var(--space-4);">Activity History</div>
      <div class="history-timeline">
        ${historyHTML || '<p style="color:var(--gray-400);">No history recorded.</p>'}
      </div>
    </div>`;
}

function closeDetailPanel(event) {
  if (event && event.target !== document.getElementById('detail-overlay')) return;
  document.getElementById('detail-overlay').classList.remove('show');
}

/* ── Technician: Update ticket status ── */
async function updateTicketStatus(ticketId, newStatus) {
  const currentUser = AppState.user;

  const updates = { status: newStatus };

  if (newStatus === 'Assigned' && currentUser.role === 'technician') {
    updates.assigned_to = currentUser.id;
  }

  if (newStatus === 'Resolved') {
    updates.resolved_at = new Date().toISOString();
  }

  // Fetch current history
  const { data: ticket, error: fetchErr } = await supabaseClient
    .from('tickets')
    .select('status_history')
    .eq('id', ticketId)
    .single();

  if (fetchErr) {
    showToast('Error loading ticket: ' + fetchErr.message, 'error');
    return;
  }

  const history = ticket.status_history || [];
  history.push({
    status: newStatus,
    timestamp: new Date().toISOString(),
    changed_by: { id: currentUser.id, name: currentUser.name },
    note: '',
  });

  updates.status_history = history;

  const { error } = await supabaseClient
    .from('tickets')
    .update(updates)
    .eq('id', ticketId);

  if (error) {
    showToast('Update failed: ' + error.message, 'error');
  } else {
    showToast('Status updated to ' + newStatus);
    openTicketDetail(ticketId);
    // Refresh lists in background
    if (AppState.currentView === 'view-dashboard') loadDashboard();
    if (AppState.currentView === 'view-tickets') loadMyTickets();
  }
}

/* ── Delete ticket (both user & technician) ── */
async function deleteTicket(ticketId) {
  if (!confirm('Are you sure you want to permanently delete this ticket?')) return;

  const { error } = await supabaseClient
    .from('tickets')
    .delete()
    .eq('id', ticketId);

  if (error) {
    showToast('Delete failed: ' + error.message, 'error');
  } else {
    showToast('Ticket deleted');
    document.getElementById('detail-overlay').classList.remove('show');
    if (AppState.currentView === 'view-dashboard') loadDashboard();
    if (AppState.currentView === 'view-tickets') loadMyTickets();
  }
}

/* ── Submit Ticket ── */
async function handleSubmitTicket() {
  const category    = document.getElementById('tk-category').value;
  const title       = document.getElementById('tk-title').value.trim();
  const description = document.getElementById('tk-description').value.trim();
  const building    = document.getElementById('tk-building').value;
  const floor       = document.getElementById('tk-floor').value;
  const room        = document.getElementById('tk-room').value.trim();
  const priority    = document.querySelector('input[name="priority"]:checked')?.value || 'Medium';

  const errorEl   = document.getElementById('ticket-form-error');
  const successEl = document.getElementById('ticket-form-success');
  errorEl.classList.remove('show');
  successEl.classList.remove('show');

  if (!category || !title || !description || !building) {
    errorEl.textContent = 'Please fill in all required fields (Category, Title, Description, Building).';
    return errorEl.classList.add('show');
  }

  const btn = document.getElementById('submit-ticket-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const ticketData = {
      user_id: AppState.user.id,
      category,
      title,
      description,
      priority,
      location: { building, floor, room },
      status: 'Submitted',
      status_history: [
        {
          status: 'Submitted',
          timestamp: new Date().toISOString(),
          changed_by: null,
          note: null,
        }
      ],
    };

    const { error } = await supabaseClient.from('tickets').insert([ticketData]);
    if (error) throw error;

    successEl.textContent = '✅ Ticket submitted successfully! View it in "My Tickets".';
    successEl.classList.add('show');

    document.getElementById('tk-category').value = '';
    document.getElementById('tk-title').value = '';
    document.getElementById('tk-description').value = '';
    document.getElementById('tk-building').value = '';
    document.getElementById('tk-floor').value = '';
    document.getElementById('tk-room').value = '';
    document.getElementById('p-medium').checked = true;

    showToast('Ticket submitted successfully!');
    setTimeout(() => navigateTo('view-tickets'), 2000);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Maintenance Request →';
  }
}

/* ── Mobile Sidebar ── */
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  sidebar.classList.toggle('open');
  backdrop.classList.toggle('show');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('show');
}

/* ── Utility Functions ── */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function categoryIcon(cat) {
  const icons = { Plumbing:'🚿', Electrical:'⚡', Carpentry:'🪑', HVAC:'❄️', Civil:'🧱', IT:'💻', General:'🔧' };
  return icons[cat] || '🔧';
}

function priorityBadge(priority) {
  const colors = { Low:'#2D7D46', Medium:'#1D5F9B', High:'#B45309', Urgent:'#B91C1C' };
  const color  = colors[priority] || '#6B7280';
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;background:${color}1A;color:${color};border-radius:99px;font-size:0.82rem;font-weight:700;">${priority === 'Urgent' ? '🚨 ' : ''}${priority}</span>`;
}

function capitalise(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Forgot Password ── */
function showForgotPasswordForm() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'none';
  const forgotForm = document.getElementById('forgot-password-form');
  if (forgotForm) forgotForm.style.display = 'block';
  document.getElementById('tab-login').style.display = 'none';
  document.getElementById('tab-register').style.display = 'none';
  clearAuthMessages();
}

async function handleForgotPassword() {
  const email = document.getElementById('reset-email').value.trim();
  const errorEl = document.getElementById('reset-error');
  const successEl = document.getElementById('reset-success');
  if (errorEl) errorEl.classList.remove('show');
  if (successEl) successEl.classList.remove('show');

  if (!email) {
    if (errorEl) {
      errorEl.textContent = 'Please enter your email.';
      errorEl.classList.add('show');
    }
    return;
  }

  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send reset email.');

    if (successEl) {
      successEl.textContent = '✅ Reset link sent! Check your inbox.';
      successEl.classList.add('show');
    }
    document.getElementById('reset-email').value = '';
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.classList.add('show');
    }
  }
}

async function handleUpdatePassword() {
  const password = document.getElementById('new-password').value.trim();
  const errorEl = document.getElementById('update-error');
  const successEl = document.getElementById('update-success');
  if (errorEl) errorEl.classList.remove('show');
  if (successEl) successEl.classList.remove('show');

  if (password.length < 6) {
    if (errorEl) {
      errorEl.textContent = 'Password must be at least 6 characters.';
      errorEl.classList.add('show');
    }
    return;
  }

  try {
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw error;

    if (successEl) {
      successEl.textContent = '✅ Password updated! You can now sign in.';
      successEl.classList.add('show');
    }

    // Sign out and return to login after a delay
    setTimeout(async () => {
      await supabaseClient.auth.signOut();
      window.location.hash = '';
      const newPwdForm = document.getElementById('new-password-form');
      if (newPwdForm) newPwdForm.style.display = 'none';
      switchAuthTab('login');
      document.getElementById('auth-screen').style.display = 'flex';
    }, 2000);
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.classList.add('show');
    }
  }
}

/* ── Keyboard Shortcuts ── */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('detail-overlay').classList.remove('show');
    closeSidebar();
  }
  if (e.key === 'Enter' && document.getElementById('auth-screen').style.display !== 'none') {
    const activeTab = document.getElementById('tab-login').classList.contains('active');
    if (activeTab) handleLogin();
    else handleRegister();
  }
});

function setupRealtime() {
  const userId = AppState.user.id;
  const role = AppState.user.role;
  supabaseClient.removeAllChannels();

  let filter;
  if (role === 'technician' || role === 'admin') {
    // Listen to ALL ticket changes (no filter, or use a filter that matches everything)
    // Using 'id=neq.0' is a dummy that matches all rows – simpler: empty string to listen to whole table.
    // The Realtime API requires a filter; we can use 'id=gte.0' (since all IDs >0)
    filter = 'id=gte.0';
  } else {
    filter = `user_id=eq.${userId}`;
  }

  supabaseClient
    .channel('tickets-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tickets', filter },
      () => {
        if (AppState.currentView === 'view-dashboard') loadDashboard();
        else if (AppState.currentView === 'view-tickets') loadMyTickets();
      }
    )
    .subscribe();
}

/* ── Init ── */
(async function init() {
  // Listen for password recovery events
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      document.getElementById('auth-screen').style.display = 'flex';
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('register-form').style.display = 'none';
      const forgotForm = document.getElementById('forgot-password-form');
      if (forgotForm) forgotForm.style.display = 'none';
      const newPwdForm = document.getElementById('new-password-form');
      if (newPwdForm) newPwdForm.style.display = 'block';
      document.getElementById('tab-login').style.display = 'none';
      document.getElementById('tab-register').style.display = 'none';
      return;
    }

    if (event === 'SIGNED_OUT') {
      if (AppState.session !== null) {
        cleanupAfterLogout();
      }
    } else if (event === 'SIGNED_IN' && session) {
      bootApp();
    }
  });

  // Normal session check on page load
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    await bootApp();
  } else {
    // If we are not already in a recovery flow (event will fire later), show login
    document.getElementById('auth-screen').style.display = 'flex';
  }
})();