const API_BASE = '/api';
let authToken = localStorage.getItem('seguraTechToken');
let currentRole = null;
let currentUser = null;
let convertingLeadId = null;
let naoRenovadoPolicyId = null;
let activeRenewalPolicyId = null;
let cachedPolicies = [];
const screens = ['dashboard', 'indicacoes', 'renovacao', 'novoseguro', 'seguros', 'apolice', 'emissao', 'sinistros'];
let searchTimeout = null;

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
  if (!authToken) {
    window.location.href = '/';
    return;
  }
  initApp();
});

async function initApp() {
  try {
    const profile = await apiFetch('/me');
    currentUser = profile.name;
    currentRole = profile.role;
    localStorage.setItem('seguraTechUsername', profile.username || '');
    
    document.getElementById('userLabel').textContent = `${currentUser} · ${capitalize(currentRole)}`;
    const avatarEl = document.querySelector('.topbar-user .avatar');
    if (avatarEl) {
      avatarEl.textContent = currentUser.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    }
    
    loadTheme();
    updateRoleAccess();
    toggleTipoEnvolvido();
    // Carregar vendedores primeiro, antes de qualquer outra coisa
    await loadVendedores();
    await refreshAll();
  } catch (error) {
    showErrorNotification('Falha ao inicializar. Redirecionando para login.');
    localStorage.removeItem('seguraTechToken');
    setTimeout(() => window.location.href = '/', 1500);
  }
}

// Navegação entre telas
function showScreen(name, topbarBtn, sidebarItem) {
  if (currentRole && !allowedRoles().includes(name)) {
    return;
  }
  
  screens.forEach(screen => {
    const el = document.getElementById(`screen-${screen}`);
    if (el) el.classList.remove('active');
  });
  
  const selected = document.getElementById(`screen-${name}`);
  if (selected) selected.classList.add('active');

  document.querySelectorAll('.topbar-nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(btn => btn.classList.remove('active'));
  
  if (topbarBtn) topbarBtn.classList.add('active');
  if (sidebarItem) sidebarItem.classList.add('active');
}

function allowedRoles() {
  const rolesMap = {
    vendedor: ['dashboard', 'indicacoes', 'renovacao', 'novoseguro', 'seguros', 'apolice', 'sinistros'],
    emissao: ['dashboard', 'emissao', 'apolice'],
    sinistro: ['dashboard', 'sinistros', 'apolice'],
    gestor: ['dashboard', 'indicacoes', 'renovacao', 'apolice', 'emissao', 'sinistros']
  };
  return rolesMap[currentRole] || ['dashboard'];
}

function updateRoleAccess() {
  document.querySelectorAll('[data-roles]').forEach(element => {
    const roles = element.dataset.roles?.split(',') || [];
    const hasAccess = !roles.length || roles.includes(currentRole);
    element.style.display = hasAccess ? '' : 'none';
  });

  const initial = allowedRoles()[0] || 'dashboard';
  showScreen(initial);
  
  const gestorLeads = document.getElementById('gestorLeadsCard');
  if (gestorLeads) gestorLeads.style.display = currentRole === 'gestor' ? 'block' : 'none';
}

// API e utilitários
function isAccessDeniedError(error) {
  if (!error) return false;
  return error.status === 403 || /acesso negado|forbidden/i.test(String(error.message || ''));
}

async function apiFetch(path, options = {}) {
  const headers = {};
  const isFormData = options.body instanceof FormData;
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  if (authToken) headers['x-auth-token'] = authToken;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('seguraTechToken');
        window.location.href = '/';
      }
      if (response.status === 403) {
        const accessDenied = new Error(body.message || 'Acesso negado.');
        accessDenied.status = 403;
        throw accessDenied;
      }
      throw new Error(body.message || `Erro ${response.status}`);
    }

    return body;
  } catch (error) {
    if (response && response.status === 401) {
      localStorage.removeItem('seguraTechToken');
      window.location.href = '/';
    }
    throw error;
  }
}

async function apiFetchBlob(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: authToken ? { 'x-auth-token': authToken } : {}
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Erro ${response.status}`);
  }
  return response;
}

function showToast(message, type = 'info') {
  let toastStack = document.getElementById('seguraTechToastStack');
  if (!toastStack) {
    toastStack = document.createElement('div');
    toastStack.id = 'seguraTechToastStack';
    toastStack.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    toastStack.setAttribute('aria-atomic', 'true');
    document.body.appendChild(toastStack);
  }

  const el = document.createElement('div');
  el.className = 'segura-tech-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  el.setAttribute('aria-atomic', 'true');
  const accentMap = {
    error: '#b7b9c6',
    success: '#8aa1ff',
    info: '#8aa1ff'
  };
  el.style.setProperty('--toast-accent', accentMap[type] || accentMap.info);
  el.textContent = message;
  toastStack.appendChild(el);

  setTimeout(() => {
    el.remove();
    if (!toastStack.childElementCount) {
      toastStack.remove();
    }
  }, type === 'error' ? 3500 : 2800);
}

function showErrorNotification(message) {
  showToast(message, 'error');
}

function showSuccessNotification(message) {
  showToast(message, 'success');
}

document.addEventListener('keydown', (event) => {
  const active = document.activeElement;
  if (!active || !('value' in active)) return;
  if (event.key !== 'Escape') return;

  if (active.id === 'apoliceSearch') {
    active.value = '';
    clearPolicySearch();
  }

  if (active.id === 'emissaoApoliceSearch') {
    active.value = '';
    clearEmissaoApoliceSearch();
  }
});

function setLoadingState(element, isLoading) {
  if (!element) return;
  if (isLoading) {
    element.disabled = true;
    element.style.opacity = '0.6';
  } else {
    element.disabled = false;
    element.style.opacity = '1';
  }
}

// Dados e atualizações
async function refreshAll() {
  try {
    await Promise.all([
      loadDashboard().catch(e => console.warn('Dashboard:', e)),
      loadLeads().catch(e => console.warn('Leads:', e)),
      loadPolicies().catch(e => console.warn('Policies:', e)),
      loadProposalQueue().catch(e => console.warn('Queue:', e)),
      loadSinistros().catch(e => console.warn('Sinistros:', e)),
      loadSinistroChart().catch(e => console.warn('Chart:', e)),
      loadRenovacoes().catch(e => console.warn('Renovacoes:', e)),
      loadSeguros().catch(e => console.warn('Seguros:', e))
    ]);
  } catch (error) {
    console.error('RefreshAll error:', error);
  }
}

function setSidebarBadge(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const n = Number(value) || 0;
  if (n > 0) {
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function updateSidebarBadges(data) {
  setSidebarBadge('badge-indicacoes', data.openLeads);
  setSidebarBadge('badge-renovacao', data.renewalPending);
  setSidebarBadge('badge-emissao', data.pendingProposals);
  setSidebarBadge('badge-sinistros', data.sinistrosAtivos);
}

async function loadDashboard() {
  try {
    const data = await apiFetch('/overview');
    updateSidebarBadges(data);
    if (currentRole === 'sinistro') {
      const activeSinistros = await apiFetch('/sinistros');
      const finalizedSinistros = await apiFetch('/sinistros?finalized=true');
      renderSinistroDashboard(buildSinistroDashboardData(data, activeSinistros || [], finalizedSinistros || []));
      return;
    }
    if (currentRole === 'gestor') {
      const [sinistros, proposals, leads, renovacoes] = await Promise.all([
        apiFetch('/sinistros').catch(() => []),
        apiFetch('/propostas').catch(() => []),
        apiFetch('/leads').catch(() => []),
        apiFetch('/renovacoes').catch(() => ({ pending: [], notRenewed: [] }))
      ]);
      renderGestorDashboard(data, sinistros || [], proposals || [], leads || [], renovacoes || {});
      return;
    }
    renderDefaultDashboard(data);
  } catch (error) {
    console.warn('Dashboard load failed:', error);
  }
}

function renderGestorDashboard(data, sinistros, proposals, leads, renovacoes) {
  const title = document.getElementById('dashboardTitle');
  const subtitle = document.getElementById('dashboardSubtitle');
  if (title) title.textContent = 'Painel do Gestor';
  if (subtitle) subtitle.textContent = `Visão geral de todos os setores — ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`;

  // Stats cards
  const activePolicies = data.activePolicies || 0;
  const renewalPending = (renovacoes.pending || []).length;
  const sinistrosAtivos = sinistros.filter(s => !s.isFinalizado).length;
  const proposalsQueue = proposals.filter(p => p.status === 'Aguardando emissão').length;

  setText('dashboardMetric1Label', 'Apólices ativas');
  setText('dashboardMetric2Label', 'Renovações pendentes');
  setText('dashboardMetric3Label', 'Sinistros ativos');
  setText('dashboardMetric4Label', 'Propostas na fila');
  setText('dashboardPolicies', activePolicies);
  setText('dashboardRenewal', renewalPending);
  setText('dashboardLeads', sinistrosAtivos);
  setText('dashboardProposals', proposalsQueue);

  // Painel esquerdo — setores
  setText('dashboardLeftTitle', 'Resumo por setor');
  const leftBody = document.getElementById('dashboardLeftBody');
  if (leftBody) {
    const leadsAbertos = leads.filter(l => !['Fechado', 'Não fechado'].includes(l.status)).length;
    const leadsNaoFechados = leads.filter(l => l.status === 'Não fechado').length;
    const propDevolvidas = proposals.filter(p => p.status === 'Devolvida').length;
    const propEmitidas = proposals.filter(p => p.status === 'Emitida').length;
    const sinFinalizados = sinistros.filter(s => s.isFinalizado).length;
    const sinAguardando = sinistros.filter(s => ['Aguardando vistoria', 'Aguardando documentos'].includes(s.status)).length;
    const notRenewed = (renovacoes.notRenewed || []).length;

    leftBody.className = 'card-body';
    leftBody.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:var(--surface-hover);border-radius:12px;padding:16px;border:1px solid var(--border-light);">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:12px;">Indicações</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="font-size:13px;color:var(--text-secondary);">Em aberto</span><span style="font-weight:700;color:var(--info);">${leadsAbertos}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="font-size:13px;color:var(--text-secondary);">Não fechadas</span><span style="font-weight:700;color:var(--error);">${leadsNaoFechados}</span></div>
        </div>
        <div style="background:var(--surface-hover);border-radius:12px;padding:16px;border:1px solid var(--border-light);">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:12px;">Emissão</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="font-size:13px;color:var(--text-secondary);">Na fila</span><span style="font-weight:700;color:var(--info);">${proposalsQueue}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="font-size:13px;color:var(--text-secondary);">Devolvidas</span><span style="font-weight:700;color:var(--error);">${propDevolvidas}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="font-size:13px;color:var(--text-secondary);">Emitidas</span><span style="font-weight:700;color:var(--success);">${propEmitidas}</span></div>
        </div>
        <div style="background:var(--surface-hover);border-radius:12px;padding:16px;border:1px solid var(--border-light);">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:12px;">Sinistros</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="font-size:13px;color:var(--text-secondary);">Ativos</span><span style="font-weight:700;color:var(--info);">${sinistrosAtivos}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="font-size:13px;color:var(--text-secondary);">Aguardando</span><span style="font-weight:700;color:var(--warning);">${sinAguardando}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="font-size:13px;color:var(--text-secondary);">Finalizados</span><span style="font-weight:700;color:var(--success);">${sinFinalizados}</span></div>
        </div>
        <div style="background:var(--surface-hover);border-radius:12px;padding:16px;border:1px solid var(--border-light);">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:12px;">Renovações</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="font-size:13px;color:var(--text-secondary);">Pendentes</span><span style="font-weight:700;color:var(--warning);">${renewalPending}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="font-size:13px;color:var(--text-secondary);">Não renovadas</span><span style="font-weight:700;color:var(--error);">${notRenewed}</span></div>
        </div>
      </div>
    `;
  }

  // Painel direito — atividade recente
  setText('dashboardRightTitle', 'Atividade recente');
  const rightBody = document.getElementById('dashboardRightBody');
  if (rightBody) {
    rightBody.className = 'card-body';
    const recentProposals = proposals.slice(0, 3);
    const recentSinistros = sinistros.slice(0, 3);
    rightBody.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:10px;">Propostas recentes</div>
        ${recentProposals.length ? recentProposals.map(p => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-light);">
            <div>
              <div style="font-size:13px;font-weight:600;">${escapeHtml(p.client || '-')}</div>
              <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(p.insurer || '')} · ${escapeHtml(p.type || '')}</div>
            </div>
            <span class="badge ${getBadgeClass(p.status)}" style="font-size:11px;">${escapeHtml(p.status || '')}</span>
          </div>`).join('') : '<p style="color:var(--text-muted);font-size:13px;">Nenhuma proposta.</p>'}
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:10px;">Sinistros recentes</div>
        ${recentSinistros.length ? recentSinistros.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-light);cursor:pointer;" onclick="showScreen('sinistros'); openSinistroModal(${s.id})">
            <div>
              <div style="font-size:13px;font-weight:600;">${escapeHtml(s.client || '-')}</div>
              <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(s.protocol || '')}</div>
            </div>
            <span class="badge ${getStatusBadgeClass(s.status)}" style="font-size:11px;">${escapeHtml(s.status || '')}</span>
          </div>`).join('') : '<p style="color:var(--text-muted);font-size:13px;">Nenhum sinistro.</p>'}
      </div>
    `;
  }
}

function renderDefaultDashboard(data) {
  const title = document.getElementById('dashboardTitle');
  const subtitle = document.getElementById('dashboardSubtitle');
  if (title) title.textContent = 'Dashboard';
  if (subtitle) subtitle.textContent = 'Visão geral rápida do sistema';

  setText('dashboardMetric1Label', 'Apólices ativas');
  setText('dashboardMetric2Label', 'Renovações pendentes');
  setText('dashboardMetric3Label', 'Leads disponíveis');
  setText('dashboardMetric4Label', 'Propostas na fila');

  setText('dashboardPolicies', data.activePolicies || '0');
  setText('dashboardRenewal', data.renewalPending || '0');
  setText('dashboardLeads', data.openLeads || '0');
  setText('dashboardProposals', data.pendingProposals || '0');

  setText('dashboardLeftTitle', 'Atividades em andamento');
  const leftBody = document.getElementById('dashboardLeftBody');
  if (leftBody) {
    leftBody.className = 'card-body';
    leftBody.innerHTML = `
      <div class="bar-row"><span class="bar-label">Propostas aprovadas</span><div class="bar-track"><div class="bar-fill" style="width:0%"></div></div><span class="bar-val">0%</span></div>
      <div class="bar-row"><span class="bar-label">Leads convertidos</span><div class="bar-track"><div class="bar-fill" style="width:0%"></div></div><span class="bar-val">0%</span></div>
      <div class="bar-row"><span class="bar-label">Sinistros em análise</span><div class="bar-track"><div class="bar-fill" style="width:0%"></div></div><span class="bar-val">0%</span></div>
    `;
  }

  setText('dashboardRightTitle', 'Resumo rápido');
  const rightBody = document.getElementById('dashboardRightBody');
  if (rightBody) {
    rightBody.className = 'card-body status-mini';
    rightBody.innerHTML = `
      <div class="status-mini-card"><div class="status-mini-label">Emissão</div><div class="status-mini-val" style="color: var(--blue)">${data.pendingProposals || 0}</div></div>
      <div class="status-mini-card"><div class="status-mini-label">Sinistros</div><div class="status-mini-val" style="color: var(--amber)">${data.sinistrosAtivos || 0}</div></div>
      <div class="status-mini-card"><div class="status-mini-label">Leads</div><div class="status-mini-val" style="color: var(--green)">${data.openLeads || 0}</div></div>
    `;
  }
}

function renderSinistroDashboard(data) {
  const title = document.getElementById('dashboardTitle');
  const subtitle = document.getElementById('dashboardSubtitle');
  if (title) title.textContent = 'Dashboard de sinistros';
  if (subtitle) subtitle.textContent = 'Acompanhamento dos processos, pendências e casos recentes.';

  setText('dashboardMetric1Label', 'Sinistros ativos');
  setText('dashboardMetric2Label', 'Aguardando vistoria');
  setText('dashboardMetric3Label', 'Aguardando documentos');
  setText('dashboardMetric4Label', 'Finalizados');

  setText('dashboardPolicies', data.sinistrosAtivos || '0');
  setText('dashboardRenewal', data.aguardandoVistoria || '0');
  setText('dashboardLeads', data.aguardandoDocumentos || '0');
  setText('dashboardProposals', data.sinistrosFinalizados || '0');

  const activeTotal = Math.max(Number(data.sinistrosAtivos || 0), 1);
  const pct = value => Math.round((Number(value || 0) / activeTotal) * 100);

  setText('dashboardLeftTitle', 'Distribuição dos casos ativos');
  const leftBody = document.getElementById('dashboardLeftBody');
  if (leftBody) {
    leftBody.className = 'card-body';
    leftBody.innerHTML = `
      <div class="bar-row"><span class="bar-label">Em análise</span><div class="bar-track"><div class="bar-fill" style="width:${pct(data.emAnalise)}%"></div></div><span class="bar-val">${data.emAnalise || 0}</span></div>
      <div class="bar-row"><span class="bar-label">Em reparo</span><div class="bar-track"><div class="bar-fill" style="width:${pct(data.emReparo)}%"></div></div><span class="bar-val">${data.emReparo || 0}</span></div>
      <div class="bar-row"><span class="bar-label">Aguardando vistoria</span><div class="bar-track"><div class="bar-fill" style="width:${pct(data.aguardandoVistoria)}%"></div></div><span class="bar-val">${data.aguardandoVistoria || 0}</span></div>
      <div class="bar-row"><span class="bar-label">Aguardando documentos</span><div class="bar-track"><div class="bar-fill" style="width:${pct(data.aguardandoDocumentos)}%"></div></div><span class="bar-val">${data.aguardandoDocumentos || 0}</span></div>
    `;
  }

  setText('dashboardRightTitle', 'Sinistros recentes');
  const rightBody = document.getElementById('dashboardRightBody');
  if (rightBody) {
    rightBody.className = 'card-body';
    const recent = data.sinistrosRecentes || [];
    rightBody.innerHTML = recent.length ? recent.map(item => `
      <div class="status-mini-card" style="margin-bottom:10px;cursor:pointer;" onclick="showScreen('sinistros'); openSinistroModal(${item.id})">
        <div class="status-mini-label">${escapeHtml(item.client || '-')}</div>
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:6px;">
          <span class="badge ${getStatusBadgeClass(item.status)}">${escapeHtml(item.status || '-')}</span>
          <span style="font-size:12px;color:var(--text-muted);">${escapeHtml(item.protocol || '')}</span>
        </div>
      </div>
    `).join('') : '<p style="color:var(--text-muted);">Nenhum sinistro cadastrado.</p>';
  }
}

function buildSinistroDashboardData(overview, activeSinistros, finalizedSinistros) {
  const active = activeSinistros || [];
  const finalized = finalizedSinistros || [];
  const countStatus = status => active.filter(item => item.status === status).length;

  return {
    ...overview,
    sinistrosAtivos: active.length,
    sinistrosFinalizados: finalized.length,
    aguardandoVistoria: countStatus('Aguardando vistoria'),
    aguardandoDocumentos: countStatus('Aguardando documentos'),
    emReparo: countStatus('Em reparo'),
    emAnalise: countStatus('Em análise'),
    sinistrosRecentes: [...active, ...finalized].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 6)
  };
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

async function loadDashboardLegacy() {
  try {
    const data = await apiFetch('/overview');
    if (document.getElementById('dashboardPolicies')) {
      document.getElementById('dashboardPolicies').textContent = data.activePolicies || '0';
      document.getElementById('dashboardRenewal').textContent = data.renewalPending || '0';
      document.getElementById('dashboardLeads').textContent = data.openLeads || '0';
      document.getElementById('dashboardProposals').textContent = data.pendingProposals || '0';
    }
  } catch (error) {
    console.warn('Dashboard load failed:', error);
  }
}

async function loadLeads() {
  try {
    const leads = await apiFetch('/leads');
    window.cachedLeads = leads || [];
    const tbody = document.querySelector('#leadsTable tbody');
    const notClosedTbody = document.querySelector('#leadsNotClosedTable tbody');
    if (!tbody || !notClosedTbody) return;

    const titleEl = document.getElementById('leadsTableTitle');
    if (titleEl) titleEl.textContent = currentRole === 'gestor' ? 'Indicações enviadas' : 'Indicações recebidas';

    const actionsHeader = document.getElementById('leadsTableActionsHeader');
    if (actionsHeader) actionsHeader.style.display = currentRole === 'gestor' ? 'none' : '';

    // Garantir que o select de vendedores nas indicações esteja populado
    if (currentRole === 'gestor' && !(window.cachedSellers && window.cachedSellers.length)) {
      await loadVendedores();
    }

    const displayStatuses = ['Novo', 'Em contato', 'Aguardando resposta', 'Em proposta'];
    const statusOptions = [
        { value: 'Novo', label: 'Novo' },
        { value: 'Em contato', label: 'Em contato' },
        { value: 'Aguardando resposta', label: 'Aguardando resposta' },
        { value: 'Em proposta', label: 'Em proposta' },
        { value: 'nao-fechado', label: 'Não fechado' }
      ];
    const username = localStorage.getItem('seguraTechUsername') || '';

    const visibleLeads = (leads || []).filter(item => displayStatuses.includes(item.status || ''));
    tbody.innerHTML = visibleLeads.length ? visibleLeads.map(lead => {
      const canEditThis = currentRole === 'gestor' || (currentRole === 'vendedor' && lead.owner === username);
      const actions = [];
      if (currentRole === 'vendedor' && lead.owner === username) {
        actions.push(`<select onchange="updateLeadStatus(${lead.id}, this.value)" style="font-size:12px;padding:4px 8px;">${statusOptions.map(s => `<option value=\"${s.value}\" ${(s.value === lead.status || (s.value === 'nao-fechado' && lead.status === 'Não fechado')) ? 'selected' : ''}>${s.label}</option>`).join('')}</select>`);
        actions.push(`<button class=\"btn secondary\" style=\"padding:4px 10px;font-size:12px; margin-top:6px;\" onclick=\"openProposalFromLeadModal(${lead.id})\">Criar proposta</button>`);
      }

      return `
      <tr>
        <td>${escapeHtml(lead.client || '')}</td>
        <td>${escapeHtml(lead.phone || '-')}</td>
        <td style="max-width:180px;white-space:normal;font-size:13px;">${escapeHtml(lead.notes || '-')}</td>
        <td>${escapeHtml(lead.source || '')}</td>
        <td><span class="badge ${getLeadBadgeClass(lead.status)}">${escapeHtml(lead.status || '')}</span></td>
        <td>${escapeHtml(lead.createdBy || '-')}</td>
        <td>${escapeHtml(lead.createdAt || '-')}</td>
        ${currentRole !== 'gestor' ? `<td style="display:flex;flex-direction:column;gap:6px;">${actions.join(' ') || '-'}</td>` : ''}
      </tr>`;
    }).join('') : `<tr><td colspan="${currentRole === 'gestor' ? 7 : 8}" style="text-align:center;color:var(--text-muted);">Nenhuma indicação encontrada.</td></tr>`;

    const notClosed = (leads || []).filter(lead => lead.status === 'Não fechado');
    notClosedTbody.innerHTML = notClosed.length ? notClosed.map(lead => `
      <tr>
        <td>${escapeHtml(lead.client || '')}</td>
        <td>${escapeHtml(lead.phone || '-')}</td>
        <td style="max-width:180px;white-space:normal;font-size:13px;">${escapeHtml(lead.notes || '-')}</td>
        <td>${escapeHtml(lead.source || '')}</td>
        <td><span class="badge ${getLeadBadgeClass(lead.status)}">${escapeHtml(lead.status || '')}</span></td>
        <td>${escapeHtml(lead.createdBy || '-')}</td>
        <td>${escapeHtml(lead.createdAt || '-')}</td>
        <td>${currentRole === 'vendedor' && lead.owner === username ? `<button class="btn secondary" style="padding:4px 10px;font-size:12px;" onclick="openProposalFromLeadModal(${lead.id})">Criar proposta</button>` : '-'}</td>
      </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Nenhuma indicação não fechada.</td></tr>';

    const closedLeads = (leads || []).filter(lead => lead.status === 'Fechado');
    const closedTbody = document.querySelector('#leadsClosedTable tbody');
    if (closedTbody) {
      closedTbody.innerHTML = closedLeads.length ? closedLeads.map(lead => {
        return `
      <tr>
        <td>${escapeHtml(lead.client || '')}</td>
        <td>${escapeHtml(lead.phone || '-')}</td>
        <td>${escapeHtml(lead.source || '')}</td>
        <td><span class="badge ${getLeadBadgeClass(lead.status)}">${escapeHtml(lead.status || '')}</span></td>
        <td>${escapeHtml(lead.createdBy || '-')}</td>
        <td>${escapeHtml(lead.createdAt || '-')}</td>
        <td style="max-width:220px;white-space:normal;font-size:13px;">${escapeHtml(lead.notes || '-')}</td>
      </tr>`;
      }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Nenhuma indicação fechada.</td></tr>';
    }
  } catch (error) {
    console.warn('Leads load failed:', error);
  }
}

async function createLead(event) {
  event.preventDefault();
  const client = document.getElementById('leadClient')?.value.trim() || '';
  const phone = document.getElementById('leadPhone')?.value.trim() || '';
  const owner = document.getElementById('leadOwner')?.value || 'vendedor';
  const source = document.getElementById('leadSource')?.value.trim() || 'Indicação do gestor';
  const notes = document.getElementById('leadNotes')?.value.trim() || '';

  if (!client || !phone || !notes) {
    showErrorNotification('Preencha nome, telefone e descrição.');
    return;
  }

  try {
    await apiFetch('/leads', {
      method: 'POST',
      body: JSON.stringify({ client, phone, owner, source, notes })
    });
    document.getElementById('leadClient').value = '';
    document.getElementById('leadPhone').value = '';
    document.getElementById('leadNotes').value = '';
    showSuccessNotification('Indicação enviada ao vendedor.');
    await loadLeads();
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

let naoFechadoLeadId = null;

async function updateLeadStatus(leadId, status) {
  if (status === 'nao-fechado') {
    naoFechadoLeadId = leadId;
    document.getElementById('naoFechadoMotivo').value = '';
    document.getElementById('naoFechadoModal').style.display = 'flex';
    return;
  }
  try {
    await apiFetch(`/leads/${leadId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    showSuccessNotification('Status da indicação atualizado.');
    await loadLeads();
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

function cancelNaoFechado() {
  naoFechadoLeadId = null;
  document.getElementById('naoFechadoModal').style.display = 'none';
  loadLeads(); // reseta o select de volta
}

async function confirmNaoFechado() {
  const reason = document.getElementById('naoFechadoMotivo').value.trim();
  if (!reason) {
    showErrorNotification('Informe o motivo.');
    return;
  }
  try {
    await apiFetch(`/leads/${naoFechadoLeadId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'Não fechado', notes: `Motivo não fechado: ${reason}` })
    });
    showSuccessNotification('Indicação marcada como não fechada.');
    document.getElementById('naoFechadoModal').style.display = 'none';
    naoFechadoLeadId = null;
    await loadLeads();
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

function getDueDateIndicator(firstDueDate) {
  if (!firstDueDate) return { label: '-', className: '' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(firstDueDate + 'T00:00:00');
  const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return { label: `Vencida há ${days} dia${days > 1 ? 's' : ''}`, className: 'due-overdue' };
  }
  if (diffDays === 0) return { label: 'Vence hoje', className: 'due-today' };
  if (diffDays === 1) return { label: 'Vence amanhã', className: 'due-soon' };
  if (diffDays <= 10) return { label: `Vence em ${diffDays} dias`, className: 'due-ok' };
  return { label: firstDueDate, className: '' };
}

async function openProposalFromLeadModal(leadId) {
  const lead = (window.cachedLeads || []).find(item => item.id === leadId);
  if (!lead) {
    showErrorNotification('Indicação não encontrada. Recarregue a página.');
    return;
  }

  convertingLeadId = leadId;
  document.getElementById('saleClient').value = lead.client || '';
  document.getElementById('saleCpf').value = '';
  document.getElementById('saleInsurer').value = '';
  document.getElementById('saleType').value = 'Automóvel';
  document.getElementById('saleNotes').value = `Origem: ${lead.source || 'Indicação'}\n${lead.notes || ''}`;
  document.getElementById('saleFirstDue').value = '';
  document.getElementById('saleStart').value = '';
  document.getElementById('saleEnd').value = '';
  document.getElementById('salePdf').value = '';
  document.getElementById('createProposalFromLeadModal').style.display = 'flex';
}

function closeCreateProposalModal() {
  document.getElementById('createProposalFromLeadModal').style.display = 'none';
}

async function openRenewalProposalModal(policyId) {
  try {
    const policy = await apiFetch(`/apolices/${policyId}`);
    document.getElementById('renewSaleClient').value = policy.client || '';
    document.getElementById('renewSaleCpf').value = policy.cpf || '';
    document.getElementById('renewSaleInsurer').value = policy.insurer || '';
    document.getElementById('renewSaleType').value = policy.type || 'Automóvel';
    document.getElementById('renewSaleNotes').value = `Renovação da apólice ${policy.number || ''}`;
    document.getElementById('renewSaleFirstDue').value = '';
    document.getElementById('renewSaleStart').value = policy.end || '';
    document.getElementById('renewSaleEnd').value = computeRenewalEnd(policy.end);
    const pdfInput = document.getElementById('renewSalePdf');
    if (pdfInput) pdfInput.value = '';
    const card = document.getElementById('renewalProposalCard');
    if (card) card.style.display = 'block';
    activeRenewalPolicyId = policyId;
    showSuccessNotification('Formulário de renovação preenchido. Anexe o PDF da proposta.');
  } catch (error) {
    showErrorNotification('Erro ao buscar dados da apólice.');
  }
}

function computeRenewalEnd(startDate) {
  if (!startDate) return '';
  const date = new Date(startDate);
  if (Number.isNaN(date.getTime())) return '';
  date.setFullYear(date.getFullYear() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function sendRenewalToVendor(policyId, phone, endDate) {
  if (!confirm('Enviar esta renovação para o vendedor?')) return;
  try {
    await apiFetch(`/apolices/${policyId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'Renovação solicitada', phone, end: endDate })
    });
    showSuccessNotification('Renovação criada e enviada para o vendedor.');
    await Promise.all([loadRenovacoes(), loadDashboard(), loadPolicies()]);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

function clearRenewalProposalCard() {
  ['renewSaleClient', 'renewSaleCpf', 'renewSaleInsurer', 'renewSaleType', 'renewSaleFirstDue', 'renewSaleStart', 'renewSaleEnd', 'renewSaleNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const pdfInput = document.getElementById('renewSalePdf');
  if (pdfInput) pdfInput.value = '';
  const card = document.getElementById('renewalProposalCard');
  if (card) card.style.display = 'none';
  activeRenewalPolicyId = null;
}

function cancelRenewalProposal() {
  clearRenewalProposalCard();
}

async function createRenewalProposal(event) {
  if (event && event.preventDefault) event.preventDefault();
  const client = document.getElementById('renewSaleClient')?.value.trim() || '';
  const cpf = document.getElementById('renewSaleCpf')?.value.trim() || '';
  const insurer = document.getElementById('renewSaleInsurer')?.value || '';
  const type = document.getElementById('renewSaleType')?.value || '';
  const notes = document.getElementById('renewSaleNotes')?.value.trim() || '';
  const firstDue = document.getElementById('renewSaleFirstDue')?.value || '';
  const start = document.getElementById('renewSaleStart')?.value || '';
  const end = document.getElementById('renewSaleEnd')?.value || '';
  const pdfFile = document.getElementById('renewSalePdf')?.files?.[0];

  if (!client || !cpf || !insurer || !type) {
    showErrorNotification('Preencha cliente, CPF, seguradora e tipo.');
    return;
  }
  if (!pdfFile) {
    showErrorNotification('Anexe o PDF da proposta.');
    return;
  }

  try {
    const formData = new FormData();
    formData.append('client', client);
    formData.append('cpf', cpf);
    formData.append('insurer', insurer);
    formData.append('type', type);
    formData.append('notes', notes);
    if (firstDue) formData.append('firstDueDate', firstDue);
    if (start) formData.append('start', start);
    if (end) formData.append('end', end);
    formData.append('pdf', pdfFile);

    const prop = await apiFetch('/propostas', { method: 'POST', body: formData });
    if (prop?.id) {
      await apiFetch(`/propostas/${prop.id}/send`, { method: 'POST', body: JSON.stringify({}) });
      if (activeRenewalPolicyId) {
        await apiFetch(`/apolices/${activeRenewalPolicyId}/status`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'Fechado' })
        });
      }
    }
    showSuccessNotification('Proposta criada e enviada para emissão. Renovação movida para seguros fechados.');
    clearRenewalProposalCard();
    await Promise.all([loadRenovacoes(), loadDashboard(), loadProposalQueue(), loadProposals(), loadSeguros()]);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}


function populateRenewalSellerSelect(users) {
  const select = document.getElementById('renewalSeller');
  if (!select) return;
  // Limpar apenas options que não sejam o placeholder
  Array.from(select.options).forEach(o => { if (o.value !== '') o.remove(); });
  (users || []).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.username;
    opt.textContent = u.name || u.username;
    select.appendChild(opt);
  });
  select.disabled = (users || []).length === 0;
}

function populateLeadOwnerSelect(users) {
  const select = document.getElementById('leadOwner');
  if (!select) return;
  Array.from(select.options).forEach(o => { if (o.value !== '') o.remove(); });
  (users || []).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.username;
    opt.textContent = u.name || u.username;
    select.appendChild(opt);
  });
}

async function loadVendedores() {
  try {
    const sellers = await apiFetch('/vendedores');
    window.cachedSellers = sellers || [];
    populateRenewalSellerSelect(window.cachedSellers);
    populateLeadOwnerSelect(window.cachedSellers);
  } catch (error) {
    console.warn('Vendedores load failed:', error);
  }
}

function clearRenewalForm() {
  // Não limpar renewalSeller — as options são populadas por loadVendedores e não devem ser zeradas
  ['renewalPhone', 'renewalClient', 'renewalCpf', 'renewalInsurer', 'renewalStart', 'renewalEnd'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}


async function sendRenewalRequest(event) {
  if (event && event.preventDefault) event.preventDefault();
  const phone = document.getElementById('renewalPhone').value.trim();
  const startDate = document.getElementById('renewalStart').value.trim();
  const endDate = document.getElementById('renewalEnd').value.trim();
  const pdfFile = document.getElementById('renewalPolicyPdf')?.files?.[0];
  const seller = document.getElementById('renewalSeller')?.value || '';
  const client = document.getElementById('renewalClient')?.value?.trim() || '';
  const cpf = document.getElementById('renewalCpf')?.value?.trim() || '';
  const insurer = document.getElementById('renewalInsurer')?.value?.trim() || '';
  const ptype = document.getElementById('renewalType')?.value?.trim() || '';

  if (!client) { showErrorNotification('Informe o nome do cliente.'); return; }
  if (!cpf) { showErrorNotification('Informe o CPF do cliente.'); return; }
  if (!insurer) { showErrorNotification('Informe a seguradora.'); return; }
  if (!ptype) { showErrorNotification('Selecione o ramo.'); return; }
  if (!phone) { showErrorNotification('Informe o telefone do cliente.'); return; }
  if (!startDate) { showErrorNotification('Informe o início da vigência.'); return; }
  if (!endDate) { showErrorNotification('Informe o final da vigência.'); return; }
  if (!seller) { showErrorNotification('Selecione o vendedor.'); return; }
  if (!pdfFile) { showErrorNotification('Anexe o PDF da apólice.'); return; }

  const formData = new FormData();
  formData.append('pdf', pdfFile);
  formData.append('phone', phone);
  formData.append('start', startDate);
  formData.append('end', endDate);
  formData.append('seller', seller);
  formData.append('client', client);
  formData.append('cpf', cpf);
  formData.append('insurer', insurer);
  formData.append('type', ptype);

  try {
    await apiFetch('/renovacoes', { method: 'POST', body: formData });
    showSuccessNotification('Renovação enviada ao vendedor.');
    document.getElementById('renewalPolicyPdf').value = '';
    document.getElementById('renewalClient').value = '';
    document.getElementById('renewalCpf').value = '';
    document.getElementById('renewalInsurer').value = '';
    document.getElementById('renewalType').value = '';
    document.getElementById('renewalPhone').value = '';
    document.getElementById('renewalEnd').value = '';
    await Promise.all([loadRenovacoes(), loadDashboard(), loadPolicies()]);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function markPolicyNotRenewed(policyId) {
  if (!confirm('Marcar esta apólice como não renovada?')) return;
  try {
    await apiFetch(`/apolices/${policyId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'Não renovada' })
    });
    showSuccessNotification('Apólice marcada como não renovada.');
    await loadRenovacoes();
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function loadRenovacoes() {
  try {
    const data = await apiFetch('/renovacoes');
    const pending = (data.pending || []).filter(p => p.status !== 'Não renovada');
    const notRenewed = data.notRenewed || [];
    const closedPolicies = currentRole === 'gestor' ? await apiFetch('/apolices') : [];
    const tbody = document.querySelector('#renovacoesTable tbody');
    const closedTbody = document.querySelector('#renewalClosedPoliciesTable tbody');
    const notRenewedTbody = document.querySelector('#notRenewedTable tbody');
    if (!tbody || !notRenewedTbody || !closedTbody) return;

    const managerRenewalCard = document.getElementById('gestorRenewalCard');
    if (managerRenewalCard) {
      managerRenewalCard.style.display = currentRole === 'gestor' ? 'block' : 'none';
    }
    if (currentRole === 'gestor') {
      await loadVendedores();
    }

    tbody.innerHTML = pending.length ? pending.map(p => {
      const pdfBtn = p.pdfFilename ? `<button class="btn secondary" style="padding:4px 10px;font-size:12px;" onclick="viewPolicyPdf(${p.id})">PDF</button>` : '-';
      const statusOptions = [
        { value: 'Fechado', label: 'Fechado' },
        { value: 'Em contato', label: 'Em contato' },
        { value: 'nao-renovada', label: 'Não renovada' }
      ];
      const statusSelect = currentRole === 'vendedor' ? `
        <select onchange="updateRenewalStatus(${p.id}, this.value)" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text-primary);">
          ${statusOptions.map(s => `<option value="${s.value}" ${s.value === p.status || (s.value === 'nao-renovada' && p.status === 'Não renovada') ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      ` : '-';
      const createProposalBtn = currentRole === 'vendedor' && ['Renovar', 'Renovação solicitada'].includes(p.status)
        ? `<button class="btn secondary" style="padding:4px 10px;font-size:12px; margin-top:6px;" onclick="openRenewalProposalModal(${p.id})">Criar proposta</button>`
        : '';
      const actionsCell = currentRole === 'vendedor'
        ? `<div style="display:flex;flex-direction:column;gap:8px;">${statusSelect}${createProposalBtn}</div>`
        : statusSelect;
      return `
      <tr>
        <td>${escapeHtml(p.client || '')}</td>
        <td>${escapeHtml(p.cpf || '-')}</td>
        <td>${escapeHtml(p.phone || '-')}</td>
        <td>${escapeHtml(p.number || '')}</td>
        <td>${escapeHtml(p.insurer || '')}</td>
        <td>${escapeHtml(p.type || '')}</td>
        <td>${escapeHtml(p.end || '-')}</td>
        <td>${pdfBtn}</td>
        <td><span class="badge ${getBadgeClass(p.status)}">${escapeHtml(p.status || '')}</span></td>
        <td>${actionsCell}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);">Nenhuma renovação encontrada.</td></tr>';

      if (closedPolicies && closedPolicies.length) {
        const closedList = (closedPolicies || []).filter(p => ['Fechado', 'Emitida', 'Finalizado'].includes(p.status));
        closedTbody.innerHTML = closedList.length ? closedList.map(p => `
          <tr>
            <td>${escapeHtml(p.number || '')}</td>
            <td>${escapeHtml(p.client || '')}</td>
            <td>${escapeHtml(p.cpf || '-')}</td>
            <td>${escapeHtml(p.insurer || '')}</td>
            <td>${escapeHtml(p.type || '')}</td>
            <td><span class="badge ${getBadgeClass(p.status)}">${escapeHtml(p.status || '')}</span></td>
            <td>${p.pdfFilename ? `<button class="btn secondary" style="padding:6px 12px;font-size:12px;" onclick="viewPolicyPdf(${p.id})">Ver PDF</button>` : '<span style="color:var(--text-muted);">Sem PDF</span>'}</td>
          </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma renovação fechada encontrada.</td></tr>';
      } else {
        closedTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma renovação fechada encontrada.</td></tr>';
      }
      notRenewedTbody.innerHTML = notRenewed.length ? notRenewed.map(p => `
      <tr>
        <td>${escapeHtml(p.client || '')}</td>
        <td>${escapeHtml(p.cpf || '-')}</td>
        <td>${escapeHtml(p.number || '')}</td>
        <td>${escapeHtml(p.insurer || '')}</td>
        <td>${escapeHtml(p.type || '')}</td>
        <td>${escapeHtml(p.end || '-')}</td>
        <td><span class="badge ${getBadgeClass(p.status)}">${escapeHtml(p.status || '')}</span></td>
        <td style="max-width:240px;white-space:normal;font-size:13px;">${escapeHtml(p.notes || '-')}</td>
      </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Nenhuma apólice marcada como não renovada.</td></tr>';
  } catch (error) {
    console.warn('Renovacoes load failed:', error);
  }
}

async function updateRenewalStatus(policyId, status) {
  if (status === 'nao-renovada') {
    naoRenovadoPolicyId = policyId;
    document.getElementById('naoRenovadoMotivo').value = '';
    document.getElementById('naoRenovadoModal').style.display = 'flex';
    return;
  }

  try {
    await apiFetch(`/apolices/${policyId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    showSuccessNotification('Status da renovação atualizado.');
    await loadRenovacoes();
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

function cancelNaoRenovado() {
  naoRenovadoPolicyId = null;
  document.getElementById('naoRenovadoModal').style.display = 'none';
  loadRenovacoes();
}

async function confirmNaoRenovado() {
  const reason = document.getElementById('naoRenovadoMotivo').value.trim();
  if (!reason) {
    showErrorNotification('Informe o motivo.');
    return;
  }

  try {
    await apiFetch(`/apolices/${naoRenovadoPolicyId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'Não renovada', notes: reason })
    });
    showSuccessNotification('Renovação marcada como não renovada.');
    document.getElementById('naoRenovadoModal').style.display = 'none';
    naoRenovadoPolicyId = null;
    await loadRenovacoes();
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function loadSeguros() {
  try {
    const proposals = await apiFetch('/propostas');
    const allPolicies = await apiFetch('/apolices');
    const closedStatuses = ['Fechado', 'Emitida', 'Finalizado'];
    const closedPolicies = (allPolicies || []).filter(p => closedStatuses.includes(p.status));
    const closedTbody = document.querySelector('#closedPoliciesTable tbody');
    const openTbody = document.querySelector('#openPoliciesTable tbody');

    if (closedTbody) {
      closedTbody.innerHTML = closedPolicies.length ? closedPolicies.map(p => `
        <tr>
          <td>${escapeHtml(p.number || '')}</td>
          <td>${escapeHtml(p.client || '')}</td>
          <td>${escapeHtml(p.cpf || '-')}</td>
          <td>${escapeHtml(p.insurer || '')}</td>
          <td>${escapeHtml(p.type || '')}</td>
          <td><span class="badge ${getBadgeClass(p.status)}">${escapeHtml(p.status || '')}</span></td>
          <td>${p.pdfFilename ? `<button class="btn secondary" style="padding:6px 12px;font-size:12px;" onclick="viewPolicyPdf(${p.id})">Ver PDF</button>` : '<span style="color:var(--text-muted);">Sem PDF</span>'}</td>
        </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma apólice fechada encontrada.</td></tr>';
    }

    if (openTbody) {
      const openProposals = (proposals || []).filter(p => p.status !== 'Emitida');
      openTbody.innerHTML = openProposals.length ? openProposals.map(p => `
        <tr>
          <td>${escapeHtml(p.policyNumber || '')}</td>
          <td>${escapeHtml(p.client || '')}</td>
          <td>${escapeHtml(p.cpf || '-')}</td>
          <td>${escapeHtml(p.insurer || '')}</td>
          <td>${escapeHtml(p.type || '')}</td>
          <td><span class="badge ${getBadgeClass(p.status)}">${escapeHtml(p.status || '')}</span></td>
          <td style="max-width:220px;white-space:normal;font-size:13px;">${escapeHtml(p.notes || '-')}</td>
          <td>${p.status === 'Devolvida' ? `<button class="btn secondary" style="padding:6px 12px;font-size:12px;" onclick="openEditProposalModal(${p.id})">Corrigir e reenviar</button>` : '-'}</td>
        </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma proposta aberta encontrada.</td></tr>';
    }
  } catch (error) {
    console.warn('Seguros load failed:', error);
  }
}

async function loadPolicies() {
  try {
    const policies = await apiFetch('/apolices');
    cachedPolicies = policies || [];
    renderPolicyTable(cachedPolicies);
  } catch (error) {
    console.warn('Policies load failed:', error);
  }
}

async function attachPolicyPdfInline(policyId, input) {
  const pdfFile = input?.files?.[0];
  if (!pdfFile) return;
  try {
    const formData = new FormData();
    formData.append('pdf', pdfFile);
    await apiFetch(`/apolices/${policyId}/upload`, { method: 'POST', body: formData });
    showSuccessNotification('PDF da apólice anexado com sucesso.');
    await loadPolicies();
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function loadProposals() {
  // Alias: mantém compatibilidade com chamadas antigas que esperavam
  // atualizar a lista de propostas/seguros do vendedor.
  await loadSeguros();
}

async function loadProposalQueue() {
  try {
    const proposals = await apiFetch('/propostas');
    const list = document.getElementById('proposalList');
    if (!list) return;

    const queue = (proposals || []).filter(p => p.status === 'Aguardando emissão');

    list.innerHTML = queue.length ? queue.map(p => {
      const due = getDueDateIndicator(p.firstDueDate);
      return `
      <div class="card proposal-card" style="margin-bottom:14px;cursor:pointer;" onclick="selectProposal(${p.id})">
        <div class="card-body" style="padding:16px;">
          <strong>${escapeHtml(p.client || '')}</strong>
          <div style="margin:6px 0;color:var(--text-muted);font-size:13px;">CPF: ${escapeHtml(p.cpf || '-')}</div>
          <div style="margin:10px 0 8px;color:var(--text-muted);">${escapeHtml(p.insurer || '')} · ${escapeHtml(p.type || '')}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            <span class="badge ${getBadgeClass(p.status)}">${escapeHtml(p.status || '')}</span>
            <span class="due-badge ${due.className}">${escapeHtml(due.label)}</span>
          </div>
        </div>
      </div>`;
    }).join('') : '<p style="color:var(--text-muted);padding:16px;">Nenhuma proposta aguardando emissão.</p>';
  } catch (error) {
    console.warn('Queue load failed:', error);
  }
}

let selectedProposalId = null;
let editingProposalId = null;
let selectedRejectProposalId = null;

async function selectProposal(proposalId) {
  selectedProposalId = proposalId;
  try {
    const proposal = await apiFetch(`/propostas/${proposalId}`);
    const details = document.getElementById('proposalDetails');
    if (!proposal || !details) return;

    const canEmit = (currentRole === 'emissao' || currentRole === 'gestor') && proposal.status === 'Aguardando emissão';
    const notes = proposal.notes ? escapeHtml(proposal.notes) : 'Sem observações registradas.';
    const due = getDueDateIndicator(proposal.firstDueDate);
    const historyHtml = (proposal.history || []).length
      ? `<div style="margin-top:16px;"><div class="info-label">Histórico</div>${(proposal.history || []).map(h => `
          <div style="font-size:13px;padding:8px 0;border-bottom:1px solid var(--border);">
            <strong>${escapeHtml(h.event)}</strong><br>
            <span style="color:var(--text-muted);">${escapeHtml(h.actor)} · ${escapeHtml(h.date)}</span>
          </div>`).join('')}</div>` : '';

    const pdfSection = proposal.pdfFilename ? `
      <div style="margin-top:12px;">
        <button class="btn secondary" onclick="viewProposalPdf(${proposal.id})">Abrir PDF da proposta</button>
      </div>` : '<p style="color:var(--text-muted);margin-top:8px;">PDF da proposta não anexado.</p>';

    details.innerHTML = `
      <div class="info-grid">
        <div><div class="info-label">Cliente</div><div class="info-value">${escapeHtml(proposal.client || '-')}</div></div>
        <div><div class="info-label">CPF</div><div class="info-value">${escapeHtml(proposal.cpf || '-')}</div></div>
        <div><div class="info-label">Seguradora</div><div class="info-value">${escapeHtml(proposal.insurer || '-')}</div></div>
        <div><div class="info-label">Tipo</div><div class="info-value">${escapeHtml(proposal.type || '-')}</div></div>
        <div><div class="info-label">Vendedor</div><div class="info-value">${escapeHtml(proposal.seller || '-')}</div></div>
        <div><div class="info-label">Status</div><div class="info-value"><span class="badge ${getBadgeClass(proposal.status)}">${escapeHtml(proposal.status || '-')}</span></div></div>
        <div><div class="info-label">1ª parcela</div><div class="info-value"><span class="due-badge ${due.className}">${escapeHtml(due.label)}</span></div></div>
        <div><div class="info-label">Data criação</div><div class="info-value">${escapeHtml(proposal.createdAt || '-')}</div></div>
        <div style="grid-column:1/-1;"><div class="info-label">Observações</div><div class="info-value">${notes}</div></div>
      </div>
      ${pdfSection}
      ${historyHtml}
      ${canEmit ? `
        <div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--border);">
          <h4 style="margin-bottom:12px;font-size:14px;">Concluir emissão</h4>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Emita no portal da seguradora, baixe o PDF da apólice e anexe abaixo.</p>
          <div class="field"><label>Número da apólice *</label><input id="emitPolicyNumber" placeholder="Ex: 0009821-4"></div>
          <div class="field"><label>PDF da apólice *</label><input type="file" id="emitPolicyPdf" accept=".pdf,application/pdf"></div>
          <div class="form-footer" style="gap:10px;display:flex;flex-wrap:wrap;">
            <button class="btn primary" onclick="emitProposal(${proposal.id})">Anexar apólice e concluir</button>
            <button class="btn secondary" onclick="openRejectProposalModal(${proposal.id})">Devolver ao vendedor</button>
          </div>
        </div>
      ` : ''}
    `;
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

// ─────────────────────────────────────────────
// Lista de sinistros com abas por perfil
// ─────────────────────────────────────────────
let sinistroTab = null;
let sinistroEnvolvido = 'segurado'; // só no Acompanhar do agente: 'segurado' ou 'terceiro'
let sinistroMode = 'adicionar'; // só para o agente: 'adicionar' ou 'acompanhar'
let sinistrosCache = [];

function sinistroTabsForRole() {
  if (currentRole === 'vendedor') {
    return [
      { id: 'devolvidos', label: 'Devolvidos pelo agente', attn: true,
        hint: 'O agente pediu ajustes ou documentos. Corrija, anexe o que faltar e reenvie.',
        empty: 'Nenhum sinistro devolvido. Tudo certo por aqui.',
        match: s => s.status === 'Aguardando documentos' },
      { id: 'rascunhos', label: 'Rascunhos',
        hint: 'Salvos, mas ainda não enviados ao agente de sinistro.',
        empty: 'Nenhum rascunho.',
        match: s => s.status === 'Rascunho' },
      { id: 'enviados', label: 'Enviados',
        hint: 'Já estão com o agente de sinistro.',
        empty: 'Nenhum sinistro enviado em andamento.',
        match: () => true },
      { id: 'finalizados', label: 'Finalizados', hint: 'Sinistros encerrados.', empty: 'Nenhum sinistro finalizado.' }
    ];
  }
  return [
    { id: 'acomunicar', mode: 'adicionar', label: 'Recebidos para adicionar', attn: true,
      hint: 'Enviados pelos vendedores e ainda não comunicados. Assuma, confira os documentos, comunique no site da seguradora e registre o número.',
      empty: 'Nenhum sinistro recebido para adicionar.',
      match: s => !['Rascunho', 'Aguardando documentos'].includes(s.status) && !s.comunicadoAt && !s.numeroSinistro },
    { id: 'aguardando', mode: 'acompanhar', label: 'Aguardando documentos',
      hint: 'Devolvidos ao vendedor ou pendentes do cliente.',
      empty: 'Nenhum sinistro aguardando documentos.',
      match: s => s.status === 'Aguardando documentos' },
    { id: 'andamento', mode: 'acompanhar', label: 'Em andamento',
      hint: 'Já comunicados à seguradora e em acompanhamento.',
      empty: 'Nenhum sinistro em andamento.',
      match: () => true },
    { id: 'finalizados', mode: 'acompanhar', label: 'Finalizados', hint: 'Sinistros encerrados.', empty: 'Nenhum sinistro finalizado.' }
  ];
}

function classifySinistro(item, tabs) {
  if (item.isFinalizado) return 'finalizados';
  const tab = tabs.find(t => t.match && t.match(item));
  return tab ? tab.id : tabs[0].id;
}

async function loadSinistros() {
  try {
    const [active, finalized] = await Promise.all([
      apiFetch('/sinistros'),
      apiFetch('/sinistros?finalized=true')
    ]);
    sinistrosCache = [...(active || []), ...(finalized || [])];
    renderSinistros();
  } catch (error) {
    if (isAccessDeniedError(error)) return;
    console.warn('Sinistros load failed:', error);
  }
}

function selectSinistroMode(mode) {
  sinistroMode = mode;
  sinistroTab = null;
  renderSinistros();
}

function selectSinistroEnvolvido(tipo) {
  sinistroEnvolvido = tipo;
  renderSinistros();
}

function selectSinistroTab(tabId) {
  sinistroTab = tabId;
  renderSinistros();
}

function sinistroOrigemLabel(item) {
  if (currentRole === 'vendedor') {
    return item.origem === 'vendedor' ? 'Criado por você' : 'Aberto pelo agente';
  }
  return item.origem === 'vendedor' ? `Vendedor${item.seller ? ' (' + item.seller + ')' : ''}` : 'Agente';
}

function renderSinistros() {
  const tbody = document.querySelector('#sinistrosTable tbody');
  const tabsEl = document.getElementById('sinistroTabs');
  if (!tbody || !tabsEl) return;

  const allTabs = sinistroTabsForRole();
  const groups = {};
  allTabs.forEach(t => { groups[t.id] = []; });
  sinistrosCache.forEach(item => {
    const id = classifySinistro(item, allTabs);
    (groups[id] || groups[allTabs[0].id]).push(item);
  });

  // Agente: duas visões. "Adicionar" (recebidos + cadastro) e "Acompanhar" (já comunicados).
  const isAgent = currentRole === 'sinistro';
  const tabs = isAgent ? allTabs.filter(t => t.mode === sinistroMode) : allTabs;

  const modesEl = document.getElementById('sinistroModes');
  if (modesEl) {
    if (isAgent) {
      const nAdd = groups.acomunicar.length;
      const nAcomp = allTabs.filter(t => t.mode === 'acompanhar' && t.id !== 'finalizados')
        .reduce((sum, t) => sum + groups[t.id].length, 0);
      modesEl.style.display = 'flex';
      modesEl.innerHTML = `
        <button type="button" class="sin-mode ${sinistroMode === 'adicionar' ? 'active' : ''}${nAdd > 0 ? ' attn' : ''}" onclick="selectSinistroMode('adicionar')">Adicionar sinistro<span class="sin-count">${nAdd}</span></button>
        <button type="button" class="sin-mode ${sinistroMode === 'acompanhar' ? 'active' : ''}" onclick="selectSinistroMode('acompanhar')">Acompanhar sinistro<span class="sin-count">${nAcomp}</span></button>`;
    } else {
      modesEl.style.display = 'none';
    }
  }
  const formGrid = document.getElementById('sinistroFormGrid');
  if (formGrid && isAgent) formGrid.style.display = sinistroMode === 'adicionar' ? '' : 'none';

  if (!sinistroTab || !groups[sinistroTab]) {
    const firstWithItems = tabs.find(t => t.id !== 'finalizados' && groups[t.id].length > 0);
    sinistroTab = (firstWithItems || tabs[0]).id;
  }

  tabsEl.style.display = tabs.length > 1 ? '' : 'none';
  tabsEl.innerHTML = tabs.map(t => {
    const n = groups[t.id].length;
    const classes = ['sin-tab'];
    if (t.id === sinistroTab) classes.push('active');
    if (t.attn && n > 0) classes.push('attn');
    return `<button type="button" class="${classes.join(' ')}" onclick="selectSinistroTab('${t.id}')">${escapeHtml(t.label)}<span class="sin-count">${n}</span></button>`;
  }).join('');

  const current = tabs.find(t => t.id === sinistroTab);
  const titleEl = document.getElementById('sinistrosTableTitle');
  if (titleEl) titleEl.textContent = current.label;
  const hintEl = document.getElementById('sinistrosTableHint');
  if (hintEl) hintEl.textContent = current.hint || '';

  let rows = groups[sinistroTab];

  // Agente, em Acompanhar: separa sinistro de segurado e de terceiro
  const envBar = document.getElementById('sinistroEnvolvidoBar');
  const splitByEnvolvido = isAgent && sinistroMode === 'acompanhar';
  if (splitByEnvolvido) {
    const isTerc = item => item.tipoEnvolvido === 'terceiro';
    const nSeg = rows.filter(item => !isTerc(item)).length;
    const nTerc = rows.length - nSeg;
    rows = rows.filter(item => (sinistroEnvolvido === 'terceiro') === isTerc(item));
    if (envBar) {
      envBar.style.display = 'flex';
      envBar.innerHTML = `
        <button type="button" class="sin-pill ${sinistroEnvolvido === 'segurado' ? 'active' : ''}" onclick="selectSinistroEnvolvido('segurado')">Segurado<span class="sin-count">${nSeg}</span></button>
        <button type="button" class="sin-pill ${sinistroEnvolvido === 'terceiro' ? 'active' : ''}" onclick="selectSinistroEnvolvido('terceiro')">Terceiro<span class="sin-count">${nTerc}</span></button>`;
    }
  } else if (envBar) {
    envBar.style.display = 'none';
  }

  const showReason = currentRole === 'vendedor' && sinistroTab === 'devolvidos';
  tbody.innerHTML = rows.length ? rows.map(item => `
    <tr>
      <td>
        ${escapeHtml(item.client || '')}
        ${showReason && item.motivoPendencia ? `<div class="sin-reason">${escapeHtml(item.motivoPendencia)}</div>` : ''}
      </td>
      <td>${escapeHtml(item.numeroSinistro || item.protocol || '-')}</td>
      <td>${escapeHtml(item.tipoEnvolvido === 'terceiro' ? 'Terceiro' : (item.type || '-'))}</td>
      <td>${escapeHtml(sinistroOrigemLabel(item))}</td>
      <td><span class="badge ${getStatusBadgeClass(item.status)}">${escapeHtml(item.status || '')}</span></td>
      <td><button class="btn secondary" style="padding:6px 14px;font-size:13px;" onclick="openSinistroModal(${item.id})">Ver detalhes</button></td>
    </tr>
  `).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">${escapeHtml(current.empty || 'Nada por aqui.')}</td></tr>`;
}

function getStatusBadgeClass(status) {
  const statusMap = {
    'Em andamento': 'blue',
    'Aguardando vistoria': 'amber',
    'Aguardando documentos': 'amber',
    'Rascunho': 'gray',
    'Aguardando agente': 'amber',
    'Comunicado à seguradora': 'blue',
    'Em análise': 'blue',
    'Aguardando peças': 'amber',
    'Em reparo': 'blue',
    'Reparo concluído': 'green',
    'Finalizado': 'green',
    'Concluído': 'green'
  };
  return statusMap[status] || 'blue';
}

async function loadSinistroChart() {
  try {
    const months = await apiFetch('/chart/sinistros');
    const chart = document.getElementById('sinistroChart');
    if (!chart) return;
    
    const maxValue = Math.max(...(months || []).map(m => m.value || 0), 1);
    chart.innerHTML = (months || []).map(item => `
      <div class="bar-row">
        <span class="bar-label">${item.month}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round((item.value / maxValue) * 100)}%"></div></div>
        <span class="bar-val">${item.value}</span>
      </div>
    `).join('');
  } catch (error) {
    if (isAccessDeniedError(error)) return;
    console.warn('Chart load failed:', error);
  }
}

function renderPolicyTable(policies) {
  const tbody = document.querySelector('#policiesTable tbody');
  if (!tbody) return;

  const canAttach = currentRole === 'emissao' || currentRole === 'gestor';

  tbody.innerHTML = (policies || []).length ? (policies || []).map(p => `
    <tr>
      <td>${escapeHtml(p.number || '')}</td>
      <td>${escapeHtml(p.client || '')}</td>
      <td>${escapeHtml(p.cpf || '-')}</td>
      <td>${escapeHtml(p.insurer || '')}</td>
      <td>${escapeHtml(p.type || '')}</td>
      <td><span class="badge ${getBadgeClass(p.status)}">${escapeHtml(p.status || '')}</span></td>
      <td style="white-space:nowrap;display:flex;gap:6px;flex-wrap:wrap;">
        ${p.pdfFilename ? `<button class="btn secondary" style="padding:6px 12px;font-size:12px;" onclick="viewPolicyPdf(${p.id})">Ver PDF</button>` : ''}
        ${p.pdfFilename ? `<button class="btn secondary" style="padding:6px 12px;font-size:12px;" onclick="downloadPolicyPdf(${p.id}, '${escapeAttribute(p.number || 'apolice')}')">Baixar</button>` : ''}
        ${canAttach && !p.pdfFilename ? `<label class="btn secondary" style="padding:6px 12px;font-size:12px;cursor:pointer;">Anexar PDF<input type="file" accept=".pdf,application/pdf" style="display:none;" onchange="attachPolicyPdfInline(${p.id}, this)"></label>` : ''}
        ${!p.pdfFilename && !canAttach ? '<span style="color:var(--text-muted);font-size:13px;">Sem PDF</span>' : ''}
      </td>
    </tr>
  `).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px;">Nenhuma apólice encontrada. Use a busca acima.</td></tr>';
}

async function searchPolicies() {
  clearTimeout(searchTimeout);
  const query = document.getElementById('apoliceSearch')?.value.trim() || '';
  searchTimeout = setTimeout(async () => {
    try {
      const policies = await apiFetch(`/apolices?search=${encodeURIComponent(query)}`);
      renderPolicyTable(policies || []);
    } catch (error) {
      if (isAccessDeniedError(error)) return;
      showErrorNotification('Erro ao buscar apólices');
    }
  }, 300);
}

function clearPolicySearch() {
  const input = document.getElementById('apoliceSearch');
  if (input) input.value = '';
  loadPolicies();
}

let emissaoSearchTimeout = null;

async function searchEmissaoApolices() {
  clearTimeout(emissaoSearchTimeout);
  const query = document.getElementById('emissaoApoliceSearch')?.value.trim() || '';
  if (!query) {
    const tbody = document.querySelector('#emissaoApolicesTable tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">Digite para buscar apólices.</td></tr>';
    return;
  }
  emissaoSearchTimeout = setTimeout(async () => {
    try {
      const policies = await apiFetch(`/apolices?search=${encodeURIComponent(query)}`);
      renderEmissaoApolicesTable(policies || []);
    } catch (error) {
      if (isAccessDeniedError(error)) return;
      showErrorNotification('Erro ao buscar apólices.');
    }
  }, 300);
}

function clearEmissaoApoliceSearch() {
  const input = document.getElementById('emissaoApoliceSearch');
  if (input) input.value = '';
  const tbody = document.querySelector('#emissaoApolicesTable tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">Digite para buscar apólices.</td></tr>';
}

function renderEmissaoApolicesTable(policies) {
  const tbody = document.querySelector('#emissaoApolicesTable tbody');
  if (!tbody) return;
  tbody.innerHTML = policies.length ? policies.map(p => `
    <tr>
      <td>${escapeHtml(p.number || '')}</td>
      <td>${escapeHtml(p.client || '')}</td>
      <td>${escapeHtml(p.cpf || '-')}</td>
      <td>${escapeHtml(p.insurer || '')}</td>
      <td>${escapeHtml(p.type || '')}</td>
      <td><span class="badge ${getBadgeClass(p.status)}">${escapeHtml(p.status || '')}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        ${p.pdfFilename ? `<button class="btn secondary" style="padding:5px 10px;font-size:12px;" onclick="viewPolicyPdf(${p.id})">Ver PDF</button>` : ''}
        ${p.pdfFilename ? `<button class="btn secondary" style="padding:5px 10px;font-size:12px;" onclick="downloadPolicyPdf(${p.id}, '${escapeAttribute(p.number || 'apolice')}')">Baixar</button>` : ''}
        ${!p.pdfFilename ? `<label class="btn secondary" style="padding:5px 10px;font-size:12px;cursor:pointer;">Anexar PDF<input type="file" accept=".pdf,application/pdf" style="display:none;" onchange="attachPolicyPdfInline(${p.id}, this)"></label>` : ''}
      </td>
    </tr>
  `).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma apólice encontrada.</td></tr>';
}

// Formulários
async function createProposal(event, sendToEmissao = true) {
  event.preventDefault();
  const btn = event.target;

  const client = document.getElementById('saleClient')?.value.trim() || '';
  const cpf = document.getElementById('saleCpf')?.value.trim() || '';
  const insurer = document.getElementById('saleInsurer')?.value || '';
  const type = document.getElementById('saleType')?.value || '';
  const notes = document.getElementById('saleNotes')?.value.trim() || '';
  const firstDue = document.getElementById('saleFirstDue')?.value || '';
  const start = document.getElementById('saleStart')?.value || '';
  const end = document.getElementById('saleEnd')?.value || '';
  const pdfFile = document.getElementById('salePdf')?.files[0];

  if (!client || !cpf || !insurer || !type) {
    showErrorNotification('Preencha cliente, CPF, seguradora e tipo.');
    return;
  }

  setLoadingState(btn, true);

  try {
    const formData = new FormData();
    formData.append('client', client);
    formData.append('cpf', cpf);
    formData.append('insurer', insurer);
    formData.append('type', type);
    formData.append('notes', notes);
    if (firstDue) formData.append('firstDueDate', firstDue);
    if (start) formData.append('start', start);
    if (end) formData.append('end', end);
    if (pdfFile) formData.append('pdf', pdfFile);

    const prop = await apiFetch('/propostas', { method: 'POST', body: formData });

    if (convertingLeadId && prop.id) {
      try {
        await apiFetch(`/leads/${convertingLeadId}/status`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'Fechado', notes: `Proposta criada: ${prop.policyNumber || ''}`.trim() })
        });
      } catch (error) {
        console.warn('Não conseguiu atualizar status da indicação:', error);
      }
      convertingLeadId = null;
    }

    if (sendToEmissao && prop.id) {
      await apiFetch(`/propostas/${prop.id}/send`, { method: 'POST', body: JSON.stringify({}) });
    }

    document.getElementById('saleClient').value = '';
    document.getElementById('saleCpf').value = '';
    document.getElementById('saleNotes').value = '';
    document.getElementById('saleFirstDue').value = '';
    document.getElementById('saleStart').value = '';
    document.getElementById('saleEnd').value = '';
    document.getElementById('salePdf').value = '';

    showSuccessNotification(sendToEmissao ? 'Proposta criada e enviada para emissão.' : 'Proposta criada em elaboração.');
    closeCreateProposalModal();
    await Promise.all([loadLeads(), loadDashboard(), loadProposalQueue(), loadRenovacoes()]);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  } finally {
    setLoadingState(btn, false);
  }
}

// Seguro novo: vendedor cria proposta sem indicação/renovação e manda direto para a emissão
async function createNovoSeguro(event, sendToEmissao) {
  event.preventDefault();
  const btn = event.target;
  const val = id => document.getElementById(id)?.value.trim() || '';
  const client = val('nsClient');
  const cpf = val('nsCpf');
  const insurer = val('nsInsurer');
  const type = val('nsType');

  if (!client || !cpf || !insurer || !type) {
    showErrorNotification('Preencha cliente, CPF, seguradora e tipo de seguro.');
    return;
  }
  if (onlyDigits(cpf).length !== 11) {
    showErrorNotification('CPF inválido: informe os 11 números.');
    return;
  }

  setLoadingState(btn, true);
  try {
    const formData = new FormData();
    formData.append('client', client);
    formData.append('cpf', cpf);
    formData.append('insurer', insurer);
    formData.append('type', type);
    formData.append('notes', val('nsNotes'));
    ['nsFirstDue:firstDueDate', 'nsStart:start', 'nsEnd:end'].forEach(pair => {
      const [id, field] = pair.split(':');
      const v = val(id);
      if (v) formData.append(field, v);
    });
    const pdfFile = document.getElementById('nsPdf')?.files[0];
    if (pdfFile) formData.append('pdf', pdfFile);

    const prop = await apiFetch('/propostas', { method: 'POST', body: formData });
    if (sendToEmissao && prop.id) {
      await apiFetch(`/propostas/${prop.id}/send`, { method: 'POST', body: JSON.stringify({}) });
    }

    ['nsClient', 'nsCpf', 'nsNotes', 'nsFirstDue', 'nsStart', 'nsEnd', 'nsPdf'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('nsInsurer').value = '';

    showSuccessNotification(sendToEmissao ? 'Proposta enviada para a fila de emissão.' : 'Proposta salva em elaboração. Envie depois em Seguros.');
    await Promise.all([loadDashboard(), loadProposalQueue(), loadSeguros()]);
    showScreen('seguros');
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  } finally {
    setLoadingState(btn, false);
  }
}

async function sendProposal(proposalId) {
  try {
    await apiFetch(`/propostas/${proposalId}/send`, { method: 'POST', body: JSON.stringify({}) });
    showSuccessNotification('Proposta enviada para emissão.');
    await Promise.all([loadProposals(), loadProposalQueue(), loadDashboard()]);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function emitProposal(proposalId) {
  const policyNumber = document.getElementById('emitPolicyNumber')?.value.trim() || '';
  const pdfFile = document.getElementById('emitPolicyPdf')?.files[0];

  if (!policyNumber || !pdfFile) {
    showErrorNotification('Informe o número da apólice e anexe o PDF.');
    return;
  }

  try {
    const formData = new FormData();
    formData.append('policyNumber', policyNumber);
    formData.append('pdf', pdfFile);

    await apiFetch(`/propostas/${proposalId}/emit`, { method: 'POST', body: formData });
    showSuccessNotification('Apólice anexada. Proposta concluída como Emitida.');
    document.getElementById('proposalDetails').innerHTML = '<p style="color: var(--text-muted);">Selecione uma proposta para ver os detalhes.</p>';
    await Promise.all([loadProposalQueue(), loadProposals(), loadPolicies(), loadDashboard()]);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

function openRejectProposalModal(proposalId) {
  selectedRejectProposalId = proposalId;
  const modal = document.getElementById('rejectProposalModal');
  if (!modal) return;
  document.getElementById('rejectProposalReason').value = '';
  document.getElementById('rejectProposalNotes').value = '';
  modal.style.display = 'flex';
}

function closeRejectProposalModal() {
  selectedRejectProposalId = null;
  const modal = document.getElementById('rejectProposalModal');
  if (modal) modal.style.display = 'none';
}

async function confirmRejectProposal() {
  const reason = document.getElementById('rejectProposalReason').value.trim();
  const notes = document.getElementById('rejectProposalNotes').value.trim();

  if (!reason) {
    showErrorNotification('Selecione um motivo para a devolução.');
    return;
  }
  if (!selectedRejectProposalId) {
    showErrorNotification('Não foi possível identificar a proposta. Recarregue a página.');
    return;
  }

  try {
    await apiFetch(`/propostas/${selectedRejectProposalId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason, notes })
    });
    showSuccessNotification('Proposta devolvida ao vendedor.');
    closeRejectProposalModal();
    document.getElementById('proposalDetails').innerHTML = '<p style="color: var(--text-muted);">Selecione uma proposta para ver os detalhes.</p>';
    await Promise.all([loadProposalQueue(), loadProposals(), loadDashboard()]);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function viewProposalPdf(proposalId) {
  try {
    const response = await apiFetchBlob(`/propostas/${proposalId}/pdf`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function viewPolicyPdf(policyId) {
  try {
    const response = await apiFetchBlob(`/apolices/${policyId}/pdf`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function openEditProposalModal(proposalId) {
  editingProposalId = proposalId;
  try {
    const prop = await apiFetch(`/propostas/${proposalId}`);
    document.getElementById('editProposalReason').textContent = `Motivo da devolução: ${prop.notes || 'Não informado'}`;
    document.getElementById('editPropClient').value = prop.client || '';
    document.getElementById('editPropCpf').value = prop.cpf || '';
    document.getElementById('editPropInsurer').value = prop.insurer || 'Porto Seguro';
    document.getElementById('editPropType').value = prop.type || 'Automóvel';
    document.getElementById('editPropFirstDue').value = prop.firstDueDate || '';
    document.getElementById('editPropStart').value = prop.start || '';
    document.getElementById('editPropEnd').value = prop.end || '';
    document.getElementById('editPropNotes').value = prop.notes || '';
    document.getElementById('editPropPdf').value = '';
    document.getElementById('editProposalModal').style.display = 'flex';
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

function closeEditProposalModal() {
  editingProposalId = null;
  document.getElementById('editProposalModal').style.display = 'none';
}

async function saveAndResubmitProposal() {
  if (!editingProposalId) return;

  const formData = new FormData();
  formData.append('client', document.getElementById('editPropClient').value.trim());
  formData.append('cpf', document.getElementById('editPropCpf').value.trim());
  formData.append('insurer', document.getElementById('editPropInsurer').value);
  formData.append('type', document.getElementById('editPropType').value);
  formData.append('notes', document.getElementById('editPropNotes').value.trim());
  const firstDue = document.getElementById('editPropFirstDue').value;
  const start = document.getElementById('editPropStart').value;
  const end = document.getElementById('editPropEnd').value;
  if (firstDue) formData.append('firstDueDate', firstDue);
  if (start) formData.append('start', start);
  if (end) formData.append('end', end);
  const pdf = document.getElementById('editPropPdf').files[0];
  if (pdf) formData.append('pdf', pdf);

  try {
    await apiFetch(`/propostas/${editingProposalId}`, { method: 'PUT', body: formData });
    await apiFetch(`/propostas/${editingProposalId}/send`, { method: 'POST', body: JSON.stringify({}) });
    showSuccessNotification('Proposta corrigida e reenviada.');
    closeEditProposalModal();
    await Promise.all([loadProposals(), loadProposalQueue(), loadDashboard()]);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function downloadPolicyPdf(policyId, policyNumber) {
  try {
    const response = await apiFetchBlob(`/apolices/${policyId}/pdf`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${policyNumber || 'apolice'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function createClaim(event) {
  event.preventDefault();
  const btn = event.target.closest('.card-body')?.querySelector('.form-footer button') || event.target;
  
  const tipoEnvolvido = document.getElementById('claimTipoEnvolvido')?.value || 'segurado';
  const isTerceiro = tipoEnvolvido === 'terceiro';
  const policyNumber = isTerceiro ? 'TERCEIRO' : (document.getElementById('claimPolicy')?.value.trim() || '');
  const insurer = isTerceiro ? 'Não informado' : (document.getElementById('claimInsurer')?.value.trim() || '');
  const type = isTerceiro ? 'Terceiro' : (document.getElementById('claimType')?.value.trim() || '');
  const description = isTerceiro ? 'Sinistro envolvendo terceiro.' : (document.getElementById('claimDescription')?.value.trim() || '');
  const sinistroDate = isTerceiro ? '' : (document.getElementById('claimSinistroDate')?.value || '');
  const avisoDate = isTerceiro ? '' : (document.getElementById('claimAvisoDate')?.value || '');
  const status = isTerceiro ? 'Em andamento' : (document.getElementById('claimStatus')?.value || 'Em andamento');
  const requiredDocs = [
    { key: 'B.O.', input: document.getElementById('claimDocBo') },
    { key: 'CNH', input: document.getElementById('claimDocCnh') },
    { key: 'CRLV', input: document.getElementById('claimDocCrlv') }
  ];
  const missingDocs = requiredDocs.filter(doc => !doc.input || !doc.input.files || doc.input.files.length === 0);
  
  if (missingDocs.length) {
    showErrorNotification(`Anexe a documentação obrigatória antes de registrar: ${missingDocs.map(doc => doc.key).join(', ')}.`);
    return;
  }
  
  const prefix = isTerceiro ? 'claimTerceiro' : 'claimSegurado';
  const client = document.getElementById(`${prefix}Nome`)?.value.trim() || '';
  const cpf = document.getElementById(`${prefix}Cpf`)?.value.trim() || '';
  const oficina = document.getElementById(`${prefix}Oficina`)?.value.trim() || '';
  const numeroSinistro = document.getElementById(`${prefix}NumeroSinistro`)?.value.trim() || '';
  const veiculoModelo = document.getElementById(`${prefix}VeiculoModelo`)?.value.trim() || '';
  const veiculoPlaca = document.getElementById(`${prefix}VeiculoPlaca`)?.value.trim() || '';
  
  const missingSeguradoData = !isTerceiro && (!policyNumber || !insurer || !type);
  const missingPersonData = !client || !cpf || !veiculoModelo || !veiculoPlaca;

  if (missingSeguradoData || missingPersonData) {
    showErrorNotification('Preencha todos os campos obrigatórios (*).');
    return;
  }
  
  setLoadingState(btn, true);
  
  try {
    const createdClaim = await apiFetch('/sinistros', {
      method: 'POST',
      body: JSON.stringify({ 
        policyNumber,
        client,
        cpf,
        insurer,
        type,
        description,
        sinistroDate,
        avisoDate,
        oficina,
        numeroSinistro,
        veiculoModelo,
        veiculoPlaca,
        tipoEnvolvido,
        status,
        documentacao: requiredDocs.map(doc => doc.key)
      })
    });

    const claimId = createdClaim?.id || createdClaim?.sinistroId || createdClaim?.idSinistro;
    if (claimId) {
      for (const doc of requiredDocs) {
        const file = doc.input?.files?.[0];
        if (!file) continue;
        await uploadSinistroDocument(claimId, file, doc.key);
      }
    }
    
    [
      'claimPolicy', 'claimInsurer', 'claimType', 'claimDescription',
      'claimSinistroDate', 'claimAvisoDate',
      'claimSeguradoNome', 'claimSeguradoCpf', 'claimSeguradoVeiculoModelo',
      'claimSeguradoVeiculoPlaca', 'claimSeguradoOficina', 'claimSeguradoNumeroSinistro',
      'claimTerceiroNome', 'claimTerceiroCpf', 'claimTerceiroVeiculoModelo',
      'claimTerceiroVeiculoPlaca', 'claimTerceiroOficina', 'claimTerceiroNumeroSinistro',
      'claimDocBo', 'claimDocCnh', 'claimDocCrlv'
    ].forEach(id => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });
    document.getElementById('claimStatus').value = 'Em andamento';
    document.getElementById('claimTipoEnvolvido').value = 'segurado';
    toggleTipoEnvolvido();
    
    showSuccessNotification('Sinistro registrado com sucesso.');
    await Promise.all([loadSinistros(false), loadSinistroChart()]);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  } finally {
    setLoadingState(btn, false);
  }
}

function toggleTipoEnvolvido() {
  const tipo = document.getElementById('claimTipoEnvolvido')?.value || 'segurado';
  const seguradoMainFields = document.getElementById('seguradoMainFields');
  const seguradoOnlyFields = document.getElementById('claimSeguradoOnlyFields');
  const seguradoFields = document.getElementById('seguradoFields');
  const terceiroFields = document.getElementById('terceiroFields');

  if (seguradoMainFields) seguradoMainFields.style.display = tipo === 'segurado' ? 'block' : 'none';
  if (seguradoOnlyFields) seguradoOnlyFields.style.display = tipo === 'segurado' ? 'block' : 'none';
  if (seguradoFields) seguradoFields.style.display = tipo === 'segurado' ? 'block' : 'none';
  if (terceiroFields) terceiroFields.style.display = tipo === 'terceiro' ? 'block' : 'none';
}

function toggleTerceiroFields() {
  toggleTipoEnvolvido();
}

// Utilitários
function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttribute(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getBadgeClass(status) {
  const statusMap = {
    'Emitida': 'green',
    'Aprovada': 'green',
    'Concluído': 'green',
    'Fechado': 'green',
    'Rejeitada': 'red',
    'Devolvida': 'red',
    'Não fechado': 'red',
    'Renovar': 'amber',
    'Em elaboração': 'amber',
    'Aguardando emissão': 'blue',
    'Pendente': 'amber',
    'Enviada': 'blue',
    'Em análise': 'amber',
    'Aguardando documentos': 'blue',
    'Novo': 'blue',
    'Em contato': 'amber',
    'Aguardando resposta': 'blue'
  };
  return statusMap[status] || 'blue';
}

function getLeadBadgeClass(status) {
  return getBadgeClass(status);
}

// Tema
function renderThemeToggle(isDark) {
  const toggle = document.querySelector('.theme-toggle');
  if (!toggle) return;

  const icon = isDark ? `
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.7"/>
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6l-1.6-1.6M7 7L5.4 5.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
    </svg>
  ` : `
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 14.2A7.2 7.2 0 0 1 9.8 4a7.5 7.5 0 1 0 10.2 10.2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
    </svg>
  `;

  toggle.innerHTML = `${icon}<span>${isDark ? 'Claro' : 'Escuro'}</span>`;
}

function loadTheme() {
  const theme = localStorage.getItem('seguraTechTheme') || 'dark';
  document.body.classList.toggle('dark', theme === 'dark');
  renderThemeToggle(theme === 'dark');
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('seguraTechTheme', isDark ? 'dark' : 'light');
  renderThemeToggle(isDark);
}

// Logout
async function logout() {
  try { await apiFetch('/logout', { method: 'GET' }); } catch (e) {}
  finally {
    localStorage.removeItem('seguraTechToken');
    seguHistorico = [];
    window.location.href = '/';
  }
}

// ============================================
// FUNÇÕES DO MODAL DE SINISTRO
// ============================================

let currentSinistroId = null;
let currentSinistroData = null;

function sinistroSummaryText(data) {
  const docs = (data.attachments || []).map(a => a.fileType || a.originalName).filter(Boolean);
  const linhas = [
    `SINISTRO ${data.protocol || ''}`.trim(),
    `Segurado: ${data.client || '-'}  |  CPF: ${data.cpf || '-'}`,
    `Apólice: ${data.policyNumber || '-'}  |  Seguradora: ${data.insurer || '-'}`,
    `Tipo de sinistro: ${data.type || '-'}`,
    `Data do ocorrido: ${data.sinistroDate || '-'}`,
    `Veículo: ${[data.veiculoModelo, data.veiculoPlaca].filter(Boolean).join(' - ') || '-'}`,
    `Descrição: ${data.description || '-'}`
  ];
  if (data.observacoesVendedor) linhas.push(`Observações do vendedor: ${data.observacoesVendedor}`);
  linhas.push(`Documentos anexados: ${docs.length ? docs.join(', ') : 'nenhum'}`);
  return linhas.join('\n');
}

async function copySinistroSummary() {
  const area = document.getElementById('sinistroSummary');
  if (!area) return;
  try {
    await navigator.clipboard.writeText(area.value);
  } catch (e) {
    area.select();
    document.execCommand('copy');
  }
  showSuccessNotification('Resumo copiado. Cole no site da seguradora.');
}

function renderSinistroWorkflowActions(data) {
  const container = document.getElementById('sinistroWorkflowActions');
  if (!container) return;

  const status = String(data.status || '');
  const currentUsername = localStorage.getItem('seguraTechUsername') || '';
  const isSellerOwner = currentRole === 'vendedor' && String(data.seller || '') === currentUsername;
  const isAgent = currentRole === 'sinistro';
  let html = '';

  if (data.isFinalizado) {
    html = '';
  } else if (isSellerOwner) {
    if (status === 'Rascunho') {
      html = `
        <div class="sin-flow">
          <p class="sin-flow-text">Este sinistro ainda é um rascunho. Confira os dados, anexe os documentos e envie ao agente de sinistro, que faz a comunicação na seguradora.</p>
          <button class="btn primary" type="button" onclick="sendSinistroToAgent()">Enviar ao agente de sinistro</button>
        </div>`;
    } else if (status === 'Aguardando documentos') {
      html = `
        <div class="sin-flow">
          <div class="sin-alert">
            <strong>O agente devolveu este sinistro.</strong>
            <div>${escapeHtml(data.motivoPendencia || 'Verifique os documentos e os dados.')}</div>
          </div>
          <p class="sin-flow-text">Use Editar e Selecionar arquivo para corrigir ou anexar o que faltou, depois reenvie.</p>
          <button class="btn primary" type="button" onclick="sendSinistroToAgent()">Reenviar ao agente</button>
        </div>`;
    } else if (status === 'Aguardando agente') {
      html = `<p class="sin-flow-text">Enviado ao agente${data.enviadoAt ? ' em ' + escapeHtml(formatDateTime(data.enviadoAt)) : ''}. Aguardando ele assumir.</p>`;
    } else {
      html = `<p class="sin-flow-text">O agente de sinistro está cuidando deste sinistro.${data.numeroSinistro ? ' Número na seguradora: <strong>' + escapeHtml(data.numeroSinistro) + '</strong>.' : ''}</p>`;
    }
  } else if (isAgent) {
    const summary = `
      <div class="field">
        <label>Resumo para a seguradora</label>
        <textarea id="sinistroSummary" rows="8" readonly>${escapeHtml(sinistroSummaryText(data))}</textarea>
        <button class="btn secondary" type="button" onclick="copySinistroSummary()" style="margin-top:8px;">Copiar resumo</button>
      </div>`;

    if (status === 'Aguardando agente') {
      html = `
        <div class="sin-flow">
          <p class="sin-flow-text">Enviado pelo vendedor ${escapeHtml(data.sellerName || data.seller || '')}${data.enviadoAt ? ' em ' + escapeHtml(formatDateTime(data.enviadoAt)) : ''}. Assuma para conferir os documentos e comunicar.</p>
          <button class="btn primary" type="button" onclick="assumirSinistro()">Assumir sinistro</button>
        </div>`;
    } else if (status === 'Aguardando documentos') {
      html = `
        <div class="sin-flow">
          <div class="sin-alert">
            <strong>Aguardando documentos.</strong>
            <div>${escapeHtml(data.motivoPendencia || 'Sem motivo registrado.')}</div>
          </div>
          <p class="sin-flow-text">Quando o vendedor reenviar, o sinistro volta para "A comunicar".</p>
        </div>`;
    } else if (!data.comunicadoAt) {
      html = `
        <div class="sin-flow">
          ${summary}
          <div class="field">
            <label>Número do sinistro na seguradora</label>
            <input id="sinistroNumeroSeguradora" value="${escapeAttribute(data.numeroSinistro || '')}" placeholder="Ex: SIN-2026-000123" />
            <button class="btn primary" type="button" onclick="comunicarSinistro()" style="margin-top:8px;">Registrar comunicação à seguradora</button>
          </div>
          <div class="field">
            <label>Faltou algo? Devolver ao vendedor</label>
            <textarea id="sinistroPendenciaMotivo" rows="2" placeholder="Ex: Falta o B.O. e a CNH do segurado."></textarea>
            <button class="btn secondary" type="button" onclick="pendenciaSinistro()" style="margin-top:8px;">Devolver ao vendedor</button>
          </div>
        </div>`;
    } else {
      html = `
        <div class="sin-flow">
          <p class="sin-flow-text">Comunicado à seguradora${data.comunicadoAt ? ' em ' + escapeHtml(formatDateTime(data.comunicadoAt)) : ''}. Número: <strong>${escapeHtml(data.numeroSinistro || '-')}</strong>.</p>
          ${summary}
        </div>`;
    }
  }

  container.style.display = html ? 'block' : 'none';
  container.innerHTML = html;
}

function applySinistroModalPermissions(data) {
  const isSeller = currentRole === 'vendedor';
  const final = Boolean(data.isFinalizado);
  const status = String(data.status || '');
  const sellerEditable = isSeller && !final && ['Rascunho', 'Aguardando documentos'].includes(status);
  const show = (id, on) => {
    const el = document.getElementById(id);
    if (el) el.style.display = on ? '' : 'none';
  };
  show('btnEditarSinistro', isSeller ? sellerEditable : true);
  show('btnExcluirSinistro', !isSeller);
  show('btnFinalizarSinistro', !isSeller && !final && !['Rascunho', 'Aguardando agente'].includes(status));
  show('sinistroStatusCard', !isSeller && !final && !['Rascunho', 'Aguardando agente'].includes(status));
  show('historyAddField', !isSeller);
  show('attachUploadField', isSeller ? sellerEditable : true);
}

async function openSinistroModal(sinistroId) {
  currentSinistroId = sinistroId;
  const modal = document.getElementById('sinistroModal');
  
  try {
    const data = await apiFetch(`/sinistros/${sinistroId}`);
    currentSinistroData = data;
    
    // Preencher informações gerais
    document.getElementById('modalProtocol').textContent = data.protocol || '-';
    document.getElementById('modalStatus').innerHTML = `<span class="badge ${getStatusBadgeClass(data.status)}">${escapeHtml(data.status || '-')}</span>`;
    document.getElementById('modalTipoEnvolvido').textContent = data.tipoEnvolvido === 'terceiro' ? 'Terceiro' : 'Segurado';
    document.getElementById('modalNome').textContent = data.client || '-';
    document.getElementById('modalCpf').textContent = data.cpf || '-';
    document.getElementById('modalSeller').textContent = data.sellerName || '-';
    document.getElementById('modalPolicy').textContent = data.policyNumber || '-';
    document.getElementById('modalInsurer').textContent = data.insurer || '-';
    document.getElementById('modalType').textContent = data.type || '-';
    document.getElementById('modalNumeroSinistro').textContent = data.numeroSinistro || '-';
    document.getElementById('modalOpenedAt').textContent = data.openedAt || '-';
    document.getElementById('modalSinistroDate').textContent = data.sinistroDate || '-';
    document.getElementById('modalAvisoDate').textContent = data.avisoDate || '-';
    document.getElementById('modalVeiculoModelo').textContent = data.veiculoModelo || '-';
    document.getElementById('modalVeiculoPlaca').textContent = data.veiculoPlaca || '-';
    document.getElementById('modalOficina').textContent = data.oficina || '-';
    document.getElementById('modalDescription').textContent = data.description || '-';
    
    // O cadastro usa um envolvido por sinistro. O card extra fica oculto para evitar duplicidade.
    const terceiroCard = document.getElementById('terceiroCard');
    if (terceiroCard) terceiroCard.style.display = 'none';
    
    // Renderizar histórico
    renderHistory(data.history || []);
    
    // Renderizar anexos
    renderAttachments(data.attachments || []);
    
    // Workflow de negócio por papel
    renderSinistroWorkflowActions(data);
    
    // Atualizar select de status
    const statusSelect = document.getElementById('sinistroStatusSelect');
    if (statusSelect) {
      statusSelect.value = data.status || 'Em andamento';
    }
    
    // Mostrar/ocultar botão finalizar
    const btnFinalizar = document.getElementById('btnFinalizarSinistro');
    if (btnFinalizar) {
      btnFinalizar.style.display = data.status === 'Finalizado' ? 'none' : 'inline-block';
    }
    
    applySinistroModalPermissions(data);
    modal.style.display = 'flex';
  } catch (error) {
    showErrorNotification('Erro ao carregar detalhes do sinistro.');
  }
}

async function sendSinistroToAgent() {
  if (!currentSinistroId) return;

  try {
    await apiFetch(`/sinistros/${currentSinistroId}/enviar`, { method: 'POST', body: JSON.stringify({}) });
    showSuccessNotification('Sinistro enviado ao agente do sinistro.');
    await openSinistroModal(currentSinistroId);
    await loadSinistros(false);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function assumirSinistro() {
  if (!currentSinistroId) return;

  try {
    await apiFetch(`/sinistros/${currentSinistroId}/assumir`, { method: 'POST', body: JSON.stringify({}) });
    showSuccessNotification('Sinistro assumido pela equipe de sinistros.');
    await openSinistroModal(currentSinistroId);
    await loadSinistros(false);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function pendenciaSinistro() {
  if (!currentSinistroId) return;

  const motivo = document.getElementById('sinistroPendenciaMotivo')?.value.trim() || '';
  if (!motivo) {
    showErrorNotification('Informe o motivo da pendência antes de registrar.');
    return;
  }

  try {
    await apiFetch(`/sinistros/${currentSinistroId}/pendencia`, {
      method: 'POST',
      body: JSON.stringify({ motivo })
    });
    showSuccessNotification('Pendência registrada com sucesso.');
    document.getElementById('sinistroPendenciaMotivo').value = '';
    await openSinistroModal(currentSinistroId);
    await loadSinistros(false);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function comunicarSinistro() {
  if (!currentSinistroId) return;

  const numeroSinistro = document.getElementById('sinistroNumeroSeguradora')?.value.trim() || '';
  if (!numeroSinistro) {
    showErrorNotification('Informe o número do sinistro na seguradora.');
    return;
  }

  try {
    await apiFetch(`/sinistros/${currentSinistroId}/comunicar`, {
      method: 'POST',
      body: JSON.stringify({ numeroSinistro })
    });
    showSuccessNotification('Sinistro comunicado à seguradora. Ele agora está em Acompanhar sinistro.');
    sinistroMode = 'acompanhar';
    sinistroTab = 'andamento';
    await openSinistroModal(currentSinistroId);
    await loadSinistros(false);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

// Formulário do vendedor: cria rascunho (e, se pedir, já envia ao agente)
async function createClaimVendedor(event, enviar) {
  event.preventDefault();
  const buttons = Array.from(document.querySelectorAll('#claimCardVendedor .form-footer button'));
  const val = id => (document.getElementById(id)?.value || '').trim();

  const client = val('vClaimNome');
  const cpf = val('vClaimCpf');
  const description = val('vClaimDescription');
  const sinistroDate = val('vClaimDate');
  if (!client || !cpf) {
    showErrorNotification('Informe o nome e o CPF do cliente.');
    return;
  }

  const docInputs = [
    ['vDocBo', 'B.O.'], ['vDocCnh', 'CNH'], ['vDocCrlv', 'CRLV'],
    ['vDocFotos', 'Fotos'], ['vDocOutros', 'Outros']
  ];
  const files = [];
  docInputs.forEach(([id, label]) => {
    Array.from(document.getElementById(id)?.files || []).forEach(file => files.push({ file, label }));
  });
  const tooBig = files.find(item => item.file.size > 10 * 1024 * 1024);
  if (tooBig) {
    showErrorNotification(`O arquivo "${tooBig.file.name}" passa de 10 MB.`);
    return;
  }
  if (enviar) {
    if (!description || !sinistroDate) {
      showErrorNotification('Para enviar ao agente, preencha a data do ocorrido e a descrição.');
      return;
    }
    if (!files.length) {
      showErrorNotification('Anexe ao menos um documento antes de enviar ao agente.');
      return;
    }
  }

  const phone = val('vClaimPhone');
  const obs = [phone ? `Telefone do cliente: ${phone}` : '', val('vClaimObs')].filter(Boolean).join('\n');

  buttons.forEach(b => setLoadingState(b, true));
  let createdId = null;
  try {
    const created = await apiFetch('/sinistros', {
      method: 'POST',
      body: JSON.stringify({
        policyNumber: val('vClaimPolicy'),
        client,
        cpf,
        type: val('vClaimType'),
        description,
        sinistroDate,
        veiculoModelo: val('vClaimVeiculoModelo'),
        veiculoPlaca: val('vClaimVeiculoPlaca'),
        observacoesVendedor: obs
      })
    });
    createdId = created?.id;
    for (const item of files) {
      await uploadSinistroDocument(createdId, item.file, item.label);
    }
    if (enviar) {
      await apiFetch(`/sinistros/${createdId}/enviar`, { method: 'POST', body: JSON.stringify({}) });
    }

    [
      'vClaimNome', 'vClaimCpf', 'vClaimPhone', 'vClaimPolicy', 'vClaimType', 'vClaimDate',
      'vClaimVeiculoModelo', 'vClaimVeiculoPlaca', 'vClaimDescription', 'vClaimObs',
      'vDocBo', 'vDocCnh', 'vDocCrlv', 'vDocFotos', 'vDocOutros'
    ].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    sinistroTab = enviar ? 'enviados' : 'rascunhos';
    showSuccessNotification(enviar ? 'Sinistro enviado ao agente de sinistro.' : 'Rascunho salvo.');
    await Promise.all([loadSinistros(), loadSinistroChart()]);
  } catch (error) {
    if (createdId) {
      sinistroTab = 'rascunhos';
      showErrorNotification(`O rascunho foi salvo, mas houve um problema: ${error.message} Abra-o em Rascunhos para concluir.`);
      await loadSinistros();
    } else {
      showErrorNotification(`Erro: ${error.message}`);
    }
  } finally {
    buttons.forEach(b => setLoadingState(b, false));
  }
}

function closeSinistroModal() {
  const modal = document.getElementById('sinistroModal');
  modal.style.display = 'none';
  currentSinistroId = null;
  currentSinistroData = null;
  document.getElementById('newHistoryEvent').value = '';
}

function openEditSinistroModal() {
  if (!currentSinistroData) return;

  document.getElementById('editSinistroClient').value = currentSinistroData.client || '';
  document.getElementById('editSinistroCpf').value = currentSinistroData.cpf || '';
  document.getElementById('editSinistroNumero').value = currentSinistroData.numeroSinistro || '';
  document.getElementById('editSinistroType').value = currentSinistroData.type || '';
  document.getElementById('editSinistroVeiculoModelo').value = currentSinistroData.veiculoModelo || '';
  document.getElementById('editSinistroVeiculoPlaca').value = currentSinistroData.veiculoPlaca || '';
  document.getElementById('editSinistroOficina').value = currentSinistroData.oficina || '';
  document.getElementById('editSinistroDate').value = currentSinistroData.sinistroDate || '';
  document.getElementById('editAvisoDate').value = currentSinistroData.avisoDate || '';
  document.getElementById('editSinistroDescription').value = currentSinistroData.description || '';
  const numeroField = document.getElementById('editSinistroNumeroField');
  if (numeroField) numeroField.style.display = currentRole === 'vendedor' ? 'none' : '';
  document.getElementById('editSinistroModal').style.display = 'flex';
}

function closeEditSinistroModal() {
  document.getElementById('editSinistroModal').style.display = 'none';
}

async function saveSinistroEdit() {
  if (!currentSinistroId) return;

  const payload = {
    client: document.getElementById('editSinistroClient').value.trim(),
    cpf: document.getElementById('editSinistroCpf').value.trim(),
    numeroSinistro: document.getElementById('editSinistroNumero').value.trim(),
    type: document.getElementById('editSinistroType').value.trim(),
    veiculoModelo: document.getElementById('editSinistroVeiculoModelo').value.trim(),
    veiculoPlaca: document.getElementById('editSinistroVeiculoPlaca').value.trim(),
    oficina: document.getElementById('editSinistroOficina').value.trim(),
    sinistroDate: document.getElementById('editSinistroDate').value,
    avisoDate: document.getElementById('editAvisoDate').value,
    description: document.getElementById('editSinistroDescription').value.trim()
  };

  if (!payload.client) {
    showErrorNotification('Informe o nome do cliente.');
    return;
  }

  try {
    await apiFetch(`/sinistros/${currentSinistroId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showSuccessNotification('Sinistro atualizado com sucesso.');
    closeEditSinistroModal();
    await openSinistroModal(currentSinistroId);
    await loadSinistros(false);
    await loadDashboard();
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function deleteSinistro() {
  if (!currentSinistroId || !currentSinistroData) return;

  const label = currentSinistroData.numeroSinistro || currentSinistroData.protocol || currentSinistroData.client || 'este sinistro';
  if (!confirm(`Deseja realmente excluir ${label}? Esta ação não pode ser desfeita.`)) return;

  try {
    await apiFetch(`/sinistros/${currentSinistroId}`, { method: 'DELETE' });
    showSuccessNotification('Sinistro excluído com sucesso.');
    closeEditSinistroModal();
    closeSinistroModal();
    await loadSinistros(false);
    await loadSinistroChart();
    await loadDashboard();
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

function renderHistory(history) {
  const container = document.getElementById('historyTimeline');
  
  if (!history || history.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px 0;">Nenhum andamento registrado ainda.</p>';
    return;
  }
  
  container.innerHTML = history.map(item => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-date">${formatDateTime(item.date)}</div>
        <div class="timeline-event">${escapeHtml(item.event)}</div>
        <div class="timeline-actor">Por: ${escapeHtml(item.actor)}</div>
      </div>
    </div>
  `).join('');
}

function renderAttachments(attachments) {
  const container = document.getElementById('attachmentsList');
  
  if (!attachments || attachments.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:12px 0;font-size:13px;">Nenhum documento anexado ainda.</p>';
    return;
  }
  
  container.innerHTML = attachments.map(item => `
    <div class="attachment-item">
      <div class="attachment-info">
        <div class="attachment-icon">📄</div>
        <div class="attachment-details">
          <div class="attachment-name">${escapeHtml(item.fileType || 'Documento anexo')}</div>
          <div class="attachment-meta">${escapeHtml(item.originalName)} · Enviado em ${formatDateTime(item.uploadedAt)} por ${escapeHtml(item.uploadedBy)}</div>
        </div>
      </div>
      <div class="attachment-actions">
        <button class="btn secondary" style="padding:6px 12px;font-size:12px;" onclick="downloadAttachment(${item.id})">Download</button>
      </div>
    </div>
  `).join('');
}

async function addHistoryEvent() {
  if (!currentSinistroId) return;
  
  const textarea = document.getElementById('newHistoryEvent');
  const event = textarea.value.trim();
  
  if (!event) {
    showErrorNotification('Digite o andamento antes de adicionar.');
    return;
  }
  
  try {
    await apiFetch(`/sinistros/${currentSinistroId}/history`, {
      method: 'POST',
      body: JSON.stringify({ event })
    });
    
    textarea.value = '';
    showSuccessNotification('Andamento adicionado com sucesso.');
    
    // Recarregar detalhes
    const data = await apiFetch(`/sinistros/${currentSinistroId}`);
    renderHistory(data.history || []);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function uploadSinistroDocument(sinistroId, file, docLabel) {
  const formData = new FormData();
  formData.append('file', file);
  if (docLabel) formData.append('documentType', docLabel);

  const headers = {};
  if (authToken) headers['x-auth-token'] = authToken;

  const response = await fetch(`${API_BASE}/sinistros/${sinistroId}/attachments`, {
    method: 'POST',
    headers,
    body: formData
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Erro ao enviar ${docLabel || 'arquivo'}`);
  }
}

async function uploadAttachment() {
  if (!currentSinistroId) return;
  
  const fileInput = document.getElementById('attachmentFile');
  const file = fileInput.files[0];
  
  if (!file) return;
  
  try {
    await uploadSinistroDocument(currentSinistroId, file, 'Anexo');
    fileInput.value = '';
    showSuccessNotification('Arquivo anexado com sucesso.');
    
    const data = await apiFetch(`/sinistros/${currentSinistroId}`);
    renderAttachments(data.attachments || []);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function downloadAttachment(attachmentId) {
  if (!currentSinistroId) return;
  
  try {
    const response = await fetch(`${API_BASE}/sinistros/${currentSinistroId}/attachments/${attachmentId}/download`, {
      headers: authToken ? { 'x-auth-token': authToken } : {}
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || 'Erro ao baixar arquivo');
    }

    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match ? match[1] : 'documento-anexo';
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} às ${hours}:${minutes}`;
}

async function updateSinistroStatus() {
  if (!currentSinistroId) return;
  
  const statusSelect = document.getElementById('sinistroStatusSelect');
  const newStatus = statusSelect.value;
  
  try {
    await apiFetch(`/sinistros/${currentSinistroId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    
    showSuccessNotification('Status atualizado com sucesso.');
    
    // Recarregar detalhes
    const data = await apiFetch(`/sinistros/${currentSinistroId}`);
    document.getElementById('modalStatus').innerHTML = `<span class="badge ${getStatusBadgeClass(newStatus)}">${escapeHtml(newStatus)}</span>`;
    renderHistory(data.history || []);
    
    // Atualizar tabela
    await loadSinistros(false);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

async function finalizarSinistro() {
  if (!currentSinistroId) return;
  
  if (!confirm('Deseja realmente finalizar este sinistro? Esta ação não pode ser desfeita.')) {
    return;
  }
  
  try {
    await apiFetch(`/sinistros/${currentSinistroId}/finalize`, {
      method: 'PUT'
    });
    
    showSuccessNotification('Sinistro finalizado com sucesso.');
    
    // Fechar modal e atualizar listagem
    closeSinistroModal();
    await loadSinistros(false);
  } catch (error) {
    showErrorNotification(`Erro: ${error.message}`);
  }
}

// ============================================
// SEGU WIDGET
// ============================================

let seguHistorico = [];
let seguAberto = false;

function seguNovaConversa() {
  seguHistorico = [];
  const container = document.getElementById('seguMessages');
  if (container) container.innerHTML = '';
  seguAdicionarMensagem('bot', 'Nova conversa iniciada. Pode perguntar sobre seguros.');
}

function toggleSegu() {
  const panel = document.getElementById('seguPanel');
  seguAberto = !seguAberto;
  panel.style.display = seguAberto ? 'flex' : 'none';
  if (seguAberto && seguHistorico.length === 0) {
    seguAdicionarMensagem('bot', 'Assistente interno. Pode perguntar sobre seguros.');
  }
  if (seguAberto) {
    setTimeout(() => document.getElementById('seguPergunta')?.focus(), 100);
  }
}

function seguAdicionarMensagem(tipo, texto) {
  const container = document.getElementById('seguMessages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `segu-msg ${tipo}`;
  div.textContent = texto;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function seguAtualizarContador() {
  const input = document.getElementById('seguPergunta');
  const counter = document.getElementById('seguCharCount');
  if (counter && input) counter.textContent = input.value.length + '/800';
}

function seguKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    seguEnviar();
  }
}

async function seguEnviar() {
  const input = document.getElementById('seguPergunta');
  const btn = document.getElementById('seguEnviarBtn');
  const pergunta = input?.value.trim() || '';

  if (!pergunta || pergunta.length < 2) return;
  if (pergunta.length > 800) {
    seguAdicionarMensagem('bot', 'Limite de 800 caracteres por pergunta.');
    return;
  }

  input.value = '';
  seguAtualizarContador();
  btn.disabled = true;
  seguAdicionarMensagem('user', pergunta);
  const loading = seguAdicionarMensagem('loading', 'Consultando...');

  try {
    const data = await apiFetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ pergunta, historico: seguHistorico })
    });
    loading?.remove();

    seguHistorico.push({ role: 'user', content: pergunta });
    seguHistorico.push({ role: 'assistant', content: data.resposta });
    if (seguHistorico.length > 20) seguHistorico = seguHistorico.slice(-20);

    seguAdicionarMensagem('bot', data.resposta);
  } catch (err) {
    loading?.remove();
    seguAdicionarMensagem('bot', err.message || 'Erro de conexão com o servidor.');
  } finally {
    btn.disabled = false;
    input?.focus();
  }
}
// ─────────────────────────────────────────────
// Máscaras (CPF, telefone) e vigência automática
// ─────────────────────────────────────────────
function onlyDigits(v) { return String(v || '').replace(/\D/g, ''); }

function formatCpf(v) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

// (53) 99999-9999, ou +55 (53) 99999-9999 quando digitado com DDI
function formatPhone(v) {
  let d = onlyDigits(v).slice(0, 13);
  let prefix = '';
  if (d.length >= 12 && d.startsWith('55')) { prefix = '+55 '; d = d.slice(2); }
  if (d.length === 0) return '';
  if (d.length <= 2) return `${prefix}(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `${prefix}(${ddd}) ${rest}`;
  if (d.length <= 10) return `${prefix}(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `${prefix}(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
}

function isCpfField(el) { return el && el.tagName === 'INPUT' && /cpf/i.test(el.id || ''); }
function isPhoneField(el) { return el && el.tagName === 'INPUT' && /phone/i.test(el.id || ''); }

document.addEventListener('focusin', event => {
  const el = event.target;
  if (isCpfField(el)) { el.maxLength = 14; el.inputMode = 'numeric'; el.autocomplete = 'off'; }
  if (isPhoneField(el)) { el.maxLength = 19; el.inputMode = 'tel'; }
});

document.addEventListener('input', event => {
  const el = event.target;
  if (isCpfField(el)) el.value = formatCpf(el.value);
  else if (isPhoneField(el)) el.value = formatPhone(el.value);
  else if (el && el.dataset && el.dataset.vigenciaEnd === undefined && VIGENCIA_END_IDS.has(el.id)) {
    el.dataset.manual = '1'; // o usuário mexeu no fim da vigência: não sobrescrever
  }
});

// Início da vigência -> fim automático (+1 ano, mesmo dia/mês)
const VIGENCIA_PAIRS = {
  renewalStart: 'renewalEnd',
  renewSaleStart: 'renewSaleEnd',
  nsStart: 'nsEnd',
  saleStart: 'saleEnd',
  editPropStart: 'editPropEnd'
};
const VIGENCIA_END_IDS = new Set(Object.values(VIGENCIA_PAIRS));

function addOneYear(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '');
  if (!m) return '';
  const year = Number(m[1]) + 1;
  let month = m[2];
  let day = m[3];
  if (month === '02' && day === '29') day = '28'; // ano seguinte não é bissexto
  return `${year}-${month}-${day}`;
}

document.addEventListener('change', event => {
  const el = event.target;
  const endId = VIGENCIA_PAIRS[el && el.id];
  if (!endId) return;
  const endEl = document.getElementById(endId);
  if (!endEl) return;
  const next = addOneYear(el.value);
  if (!next) return;
  if (!endEl.value || endEl.dataset.manual !== '1') {
    endEl.value = next;
    delete endEl.dataset.manual;
  }
});