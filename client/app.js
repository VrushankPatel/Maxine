const state = {
  token: window.localStorage.getItem('maxine-token') || '',
  role: window.localStorage.getItem('maxine-role') || '',
  configCheckboxInitialized: false
};

const elements = {
  loginForm: document.getElementById('login-form'),
  username: document.getElementById('username'),
  password: document.getElementById('password'),
  loginStatus: document.getElementById('login-status'),
  sessionRole: document.getElementById('session-role'),
  signoutButton: document.getElementById('signout-button'),
  leaderState: document.getElementById('leader-state'),
  serviceCount: document.getElementById('service-count'),
  alertCount: document.getElementById('alert-count'),
  clusterDetails: document.getElementById('cluster-details'),
  healthDetails: document.getElementById('health-details'),
  prometheusOutput: document.getElementById('prometheus-output'),
  registryTable: document.getElementById('registry-table'),
  upstreamOutput: document.getElementById('upstream-output'),
  configOutput: document.getElementById('config-output'),
  configForm: document.getElementById('config-form'),
  configDiscoveryMode: document.getElementById('config-discovery-mode'),
  configSelection: document.getElementById('config-selection'),
  configHeartbeat: document.getElementById('config-heartbeat'),
  configLogAsync: document.getElementById('config-log-async'),
  configStatus: document.getElementById('config-status'),
  auditList: document.getElementById('audit-list'),
  alertsList: document.getElementById('alerts-list'),
  traceList: document.getElementById('trace-list')
};

const navLinks = Array.from(document.querySelectorAll('.nav-link'));
const panels = Array.from(document.querySelectorAll('.panel'));
const refreshButtons = Array.from(document.querySelectorAll('[data-refresh]'));

const authHeaders = () => state.token ? { Authorization: `Bearer ${state.token}` } : {};

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const setStatus = (message, kind = 'info') => {
  elements.loginStatus.textContent = message;
  elements.loginStatus.style.color = kind === 'error' ? '#f8c0ae' : kind === 'success' ? '#bce4d7' : '';
};

const persistSession = () => {
  if (state.token) {
    window.localStorage.setItem('maxine-token', state.token);
    window.localStorage.setItem('maxine-role', state.role);
    elements.sessionRole.textContent = state.role || 'Authenticated';
    elements.sessionRole.classList.remove('muted');
    return;
  }

  window.localStorage.removeItem('maxine-token');
  window.localStorage.removeItem('maxine-role');
  elements.sessionRole.textContent = 'Signed out';
  elements.sessionRole.classList.add('muted');
};

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeaders()
    }
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    if (contentType.includes('application/json')) {
      const errorPayload = await response.json();
      throw new Error(errorPayload.message || `Request failed with ${response.status}`);
    }
    throw new Error(`Request failed with ${response.status}`);
  }

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
};

const renderDefinitionList = (container, object) => {
  const rows = Object.entries(object || {}).map(([key, value]) => `
    <dt>${escapeHtml(key)}</dt>
    <dd>${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : String(value))}</dd>
  `);
  container.innerHTML = rows.join('');
};

const renderTimeline = (container, entries, titleKey) => {
  if (!entries || entries.length === 0) {
    container.innerHTML = '<div class="timeline-item"><strong>No entries yet.</strong><span class="timeline-meta">Waiting for activity.</span></div>';
    return;
  }

  container.innerHTML = entries.map((entry) => `
    <div class="timeline-item">
      <strong>${escapeHtml(entry[titleKey] || entry.type || 'Event')}</strong>
      <div>${escapeHtml(entry.message || JSON.stringify(entry.details || entry.changes || {}))}</div>
      <div class="timeline-meta">${escapeHtml(entry.timestamp || '')}</div>
    </div>
  `).join('');
};

const renderRegistryTable = (registrySnapshot) => {
  const rows = [];
  Object.entries(registrySnapshot || {}).forEach(([serviceName, serviceState]) => {
    Object.values(serviceState.nodes || {}).forEach((node) => {
      rows.push(`
        <tr>
          <td>${escapeHtml(serviceName)}</td>
          <td>${escapeHtml(node.parentNode)}</td>
          <td>${escapeHtml(node.nodeName)}</td>
          <td>${escapeHtml(node.address)}</td>
          <td>${escapeHtml(`${node.timeOut}s`)}</td>
        </tr>
      `);
    });
  });

  if (rows.length === 0) {
    elements.registryTable.innerHTML = '<p>No services registered yet.</p>';
    return;
  }

  elements.registryTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Service</th>
          <th>Parent Node</th>
          <th>Virtual Node</th>
          <th>Address</th>
          <th>TTL</th>
        </tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  `;
};

const renderTraceTable = (traces) => {
  if (!traces || traces.length === 0) {
    elements.traceList.innerHTML = '<p>No traced requests yet.</p>';
    return;
  }

  elements.traceList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Trace</th>
          <th>Method</th>
          <th>Path</th>
          <th>Status</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${traces.map((trace) => `
          <tr>
            <td>${escapeHtml(trace.traceId)}</td>
            <td>${escapeHtml(trace.method)}</td>
            <td>${escapeHtml(trace.path)}</td>
            <td>${escapeHtml(trace.status)}</td>
            <td>${escapeHtml(`${Math.round(trace.durationMs || 0)} ms`)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
};

const applyActivePanel = (panelName) => {
  navLinks.forEach((link) => {
    link.classList.toggle('active', link.dataset.panel === panelName);
  });
  panels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === `${panelName}-panel`);
  });
};

const loadOverview = async () => {
  const metrics = await request('/api/actuator/metrics');
  renderDefinitionList(elements.healthDetails, metrics);

  if (!state.token) {
    renderDefinitionList(elements.clusterDetails, {
      status: 'Authentication required',
      note: 'Sign in to inspect leadership, registry, probes, and Prometheus details.'
    });
    elements.prometheusOutput.textContent = 'Sign in to inspect the Prometheus export.';
    elements.leaderState.textContent = 'Sign in';
    elements.serviceCount.textContent = '-';
    elements.alertCount.textContent = '-';
    return;
  }

  const [cluster, prometheus, upstreams, registry] = await Promise.all([
    request('/api/actuator/cluster'),
    request('/api/actuator/prometheus'),
    request('/api/actuator/upstreams'),
    request('/api/maxine/serviceops/servers')
  ]);

  renderDefinitionList(elements.clusterDetails, cluster);
  renderDefinitionList(elements.healthDetails, {
    ...metrics,
    unhealthyUpstreams: upstreams.unhealthyNodes
  });
  elements.prometheusOutput.textContent = prometheus;
  elements.leaderState.textContent = cluster.isLeader ? 'Leader' : (cluster.hasLeader ? `Follower of ${cluster.leaderInstanceId}` : 'No Leader');
  elements.serviceCount.textContent = Object.keys(registry || {}).length;
};

const loadRegistry = async () => {
  const [registry, upstreams] = await Promise.all([
    request('/api/maxine/serviceops/servers'),
    request('/api/actuator/upstreams')
  ]);

  renderRegistryTable(registry);
  elements.upstreamOutput.textContent = JSON.stringify(upstreams, null, 2);
};

const loadConfig = async () => {
  const config = await request('/api/maxine/control/config');
  elements.configOutput.textContent = JSON.stringify(config, null, 2);

  if (!state.configCheckboxInitialized) {
    elements.configLogAsync.checked = Boolean(config.logAsync);
    state.configCheckboxInitialized = true;
  }

  elements.configDiscoveryMode.value = config.discoveryMode && config.discoveryMode.name ? config.discoveryMode.name : '';
  elements.configSelection.value = config.serverSelectionStrategy && config.serverSelectionStrategy.name
    ? config.serverSelectionStrategy.name
    : '';
};

const loadOps = async () => {
  const [audit, alerts, traces] = await Promise.all([
    request('/api/actuator/audit'),
    request('/api/actuator/alerts'),
    request('/api/actuator/traces')
  ]);

  renderTimeline(elements.auditList, audit.events, 'type');
  renderTimeline(elements.alertsList, alerts.alerts, 'type');
  renderTraceTable(traces.traces);
  elements.alertCount.textContent = alerts.alerts.length;
};

const refreshPanel = async (panelName) => {
  if (!state.token && panelName !== 'overview') {
    setStatus('Sign in to load protected data.', 'error');
    return;
  }

  if (panelName === 'overview') {
    await loadOverview();
    return;
  }

  if (panelName === 'registry') {
    await loadRegistry();
    return;
  }

  if (panelName === 'config') {
    await loadConfig();
    return;
  }

  if (panelName === 'ops') {
    await loadOps();
  }
};

const refreshAll = async () => {
  try {
    await loadOverview();
    if (state.token) {
      await Promise.all([loadRegistry(), loadConfig(), loadOps()]);
    }
  } catch (error) {
    setStatus(error.message, 'error');
  }
};

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const response = await request('/api/maxine/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userName: elements.username.value,
        password: elements.password.value
      })
    });

    state.token = response.accessToken;
    state.role = response.role || '';
    persistSession();
    setStatus(`Signed in as ${response.role}.`, 'success');
    await refreshAll();
  } catch (error) {
    state.token = '';
    state.role = '';
    persistSession();
    setStatus(error.message, 'error');
  }
});

elements.signoutButton.addEventListener('click', () => {
  state.token = '';
  state.role = '';
  persistSession();
  setStatus('Signed out.', 'info');
  refreshAll();
});

elements.configForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.token) {
    elements.configStatus.textContent = 'Sign in first.';
    return;
  }

  const payload = {};
  if (elements.configDiscoveryMode.value) {
    payload.discoveryMode = elements.configDiscoveryMode.value;
  }
  if (elements.configSelection.value) {
    payload.serverSelectionStrategy = elements.configSelection.value;
  }
  if (elements.configHeartbeat.value) {
    payload.heartBeatTimeout = Number(elements.configHeartbeat.value);
  }
  payload.logAsync = Boolean(elements.configLogAsync.checked);

  try {
    const response = await request('/api/maxine/control/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    elements.configStatus.textContent = `Applied: ${JSON.stringify(response)}`;
    await loadConfig();
  } catch (error) {
    elements.configStatus.textContent = error.message;
  }
});

navLinks.forEach((link) => {
  link.addEventListener('click', async () => {
    applyActivePanel(link.dataset.panel);
    try {
      await refreshPanel(link.dataset.panel);
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });
});

refreshButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    try {
      await refreshPanel(button.dataset.refresh);
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });
});

persistSession();
applyActivePanel('overview');
refreshAll();
