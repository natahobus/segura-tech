const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const DEMO_USERS = {
  v: { username: 'vendedor', password: 'vendas123' },
  e: { username: 'emissao', password: 'emissao123' },
  s: { username: 'sinistro', password: 'sinistro123' },
  g: { username: 'gestor', password: 'gestor123' }
};

function getLoginInputs() {
  return {
    username: document.getElementById('username'),
    password: document.getElementById('password')
  };
}

function validateCredentials(username, password) {
  if (!username || username.trim().length === 0) return 'Informe seu usuário.';
  if (!password || password.length === 0) return 'Informe sua senha.';
  if (username.trim().length < 3) return 'Usuário deve ter pelo menos 3 caracteres.';
  if (password.length < 6) return 'Senha deve ter pelo menos 6 caracteres.';
  return null;
}

function showError(message, isSuccess = false) {
  document.body.classList.remove('login-transitioning');

  if (!loginError) return;

  loginError.textContent = message;
  loginError.classList.toggle('login-success', isSuccess);
  loginError.setAttribute('data-state', isSuccess ? 'success' : 'error');
  loginError.style.animation = 'slideIn 0.3s ease';
}

function clearError() {
  if (!loginError) return;

  loginError.textContent = '';
  loginError.classList.remove('login-success');
  loginError.setAttribute('data-state', 'idle');
  loginError.style.animation = '';
}

function setDemoState(activeKey) {
  document.querySelectorAll('.login-shortcut').forEach((button) => {
    const isActive = button.dataset.demo === activeKey;
    button.setAttribute('aria-pressed', String(isActive));
    button.classList.toggle('is-selected', isActive);
  });
}

function setLoading(isLoading) {
  const btn = loginForm ? loginForm.querySelector('button[type="submit"]') : null;
  if (!btn) return;

  btn.disabled = isLoading;
  btn.style.opacity = isLoading ? '0.6' : '1';
  btn.style.cursor = isLoading ? 'not-allowed' : 'pointer';
  btn.textContent = isLoading ? 'Carregando...' : 'Entrar';
}

function triggerRedirectTransition() {
  document.body.classList.add('login-transitioning');
  setLoading(true);
}

async function submitLogin(username, password) {
  const error = validateCredentials(username, password);
  if (error) {
    showError(error);
    return;
  }

  setLoading(true);

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password })
    });

    const result = await response.json();

    if (!response.ok) {
      setDemoState('');
      showError(result.message || 'Falha ao autenticar.');
      setLoading(false);
      return;
    }

    localStorage.setItem('seguraTechToken', result.token);
    clearError();
    triggerRedirectTransition();
    setTimeout(() => {
      window.location.href = '/app';
    }, 300);
  } catch (error) {
    console.error('Login error:', error);
    setDemoState('');
    showError('Erro de rede. Verifique sua conexão e tente novamente.');
    setLoading(false);
  }
}

function fillDemoCredentials(agentKey) {
  const user = DEMO_USERS[agentKey];
  if (!user) return;

  const { username, password } = getLoginInputs();
  if (!username || !password) return;

  username.value = user.username;
  password.value = user.password;
  setDemoState(agentKey);
  clearError();
}

document.querySelectorAll('.login-shortcut').forEach((button) => {
  button.addEventListener('click', () => {
    fillDemoCredentials(button.dataset.demo);
  });
});

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const { username, password } = getLoginInputs();
    if (!username || !password) return;

    await submitLogin(username.value, password.value);
  });
}

const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
if (usernameInput) {
  usernameInput.addEventListener('focus', () => clearError());
}
if (passwordInput) {
  passwordInput.addEventListener('focus', () => clearError());
}

