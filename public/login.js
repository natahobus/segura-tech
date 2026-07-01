const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

// Validadores simples
function validateCredentials(username, password) {
  if (!username || username.trim().length === 0) return 'Informe seu usuário.';
  if (!password || password.length === 0) return 'Informe sua senha.';
  if (username.trim().length < 3) return 'Usuário deve ter pelo menos 3 caracteres.';
  if (password.length < 6) return 'Senha deve ter pelo menos 6 caracteres.';
  return null;
}

function showError(message) {
  if (loginError) {
    loginError.textContent = message;
    loginError.style.animation = 'slideIn 0.3s ease';
  }
}

function clearError() {
  if (loginError) {
    loginError.textContent = '';
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

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

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
    
    // Feedback visual de sucesso
    if (loginError) {
      loginError.textContent = 'Login bem-sucedido! Redirecionando...';
      loginError.style.color = '#22863A';
    }
    
    setTimeout(() => {
      window.location.href = '/app';
    }, 500);
  } catch (error) {
    console.error('Login error:', error);
    showError('Erro de rede. Verifique sua conexão e tente novamente.');
    setLoading(false);
  }
});

// Melhorias UX
document.getElementById('username').addEventListener('focus', () => clearError());
document.getElementById('password').addEventListener('focus', () => clearError());

// Enter em qualquer campo envia o formulário
document.getElementById('password').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') loginForm.dispatchEvent(new Event('submit'));
});

// Teste rápido - pressione 'v', 'e', 's', 'g' para preencher
const testUsers = {
  'v': { user: 'vendedor', pass: 'vendas123' },
  'e': { user: 'emissao', pass: 'emissao123' },
  's': { user: 'sinistro', pass: 'sinistro123' },
  'g': { user: 'gestor', pass: 'gestor123' }
};

document.addEventListener('keydown', (e) => {
  if (testUsers[e.key.toLowerCase()]) {
    const { user, pass } = testUsers[e.key.toLowerCase()];
    document.getElementById('username').value = user;
    document.getElementById('password').value = pass;
  }
});

