const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const DEMO_USERS = {
  v: { username: 'vendedor', password: 'vendas123' },
  e: { username: 'emissao', password: 'emissao123' },
  s: { username: 'sinistro', password: 'sinistro123' },
  g: { username: 'gestor', password: 'gestor123' }
};

// Validadores simples
function validateCredentials(username, password) {
  if (!username || username.trim().length === 0) return 'Informe seu usuário.';
  if (!password || password.length === 0) return 'Informe sua senha.';
  if (username.trim().length < 3) return 'Usuário deve ter pelo menos 3 caracteres.';
  if (password.length < 6) return 'Senha deve ter pelo menos 6 caracteres.';
  return null;
}

function showError(message) {
  document.body.classList.remove('login-transitioning');

  if (loginError) {
    loginError.textContent = message;
    loginError.style.animation = 'slideIn 0.3s ease';
  }
}

function clearError() {
  if (loginError) {
    loginError.textContent = '';
    loginError.classList.remove('login-success');
  }
}

function setLoading(isLoading) {
  const btn = loginForm.querySelector('button[type="submit"]');
  if (btn) {
    btn.disabled = isLoading;
    btn.style.opacity = isLoading ? '0.6' : '1';
    btn.style.cursor = isLoading ? 'not-allowed' : 'pointer';
    btn.textContent = isLoading ? 'Carregando...' : 'Entrar';
  }
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
      showError(result.message || 'Falha ao autenticar.');
      setLoading(false);
      return;
    }

    localStorage.setItem('seguraTechToken', result.token);

    if (loginError) {
      loginError.textContent = 'Login bem-sucedido. Redirecionando...';
      loginError.style.color = '';
      loginError.style.borderLeftColor = '';
      loginError.classList.add('login-success');
    }

    triggerRedirectTransition();
    setTimeout(() => {
      window.location.href = '/app';
    }, 300);
  } catch (error) {
    console.error('Login error:', error);
    showError('Erro de rede. Verifique sua conexão e tente novamente.');
    setLoading(false);
  }
}

function fillDemoCredentials(agentKey) {
  const user = DEMO_USERS[agentKey];
  if (!user) return;

  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');

  if (!usernameInput || !passwordInput) return;

  usernameInput.value = user.username;
  passwordInput.value = user.password;
  clearError();
}

document.querySelectorAll('.login-shortcut').forEach((button) => {
  button.addEventListener('click', () => {
    fillDemoCredentials(button.dataset.demo);
  });
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  await submitLogin(username, password);
});

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  const target = event.target;

  if (!DEMO_USERS[key] || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const isTyping = target && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );

  if (isTyping && target && target.id !== 'username' && target.id !== 'password') {
    return;
  }

  event.preventDefault();
  fillDemoCredentials(key);
});

document.getElementById('username').addEventListener('focus', () => clearError());
document.getElementById('password').addEventListener('focus', () => clearError());

