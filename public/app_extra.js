// Função para alternar entre campos de segurado e terceiro
function toggleTipoEnvolvido() {
  const tipo = document.getElementById('claimTipoEnvolvido')?.value;
  const seguradoFields = document.getElementById('seguradoFields');
  const terceiroFields = document.getElementById('terceiroFields');
  
  if (tipo === 'segurado') {
    if (seguradoFields) seguradoFields.style.display = 'block';
    if (terceiroFields) terceiroFields.style.display = 'none';
  } else {
    if (seguradoFields) seguradoFields.style.display = 'none';
    if (terceiroFields) terceiroFields.style.display = 'block';
  }
}

// Chamada automática ao carregar
window.addEventListener('DOMContentLoaded', function() {
  setTimeout(() => {
    if (document.getElementById('claimTipoEnvolvido')) {
      toggleTipoEnvolvido();
    }
  }, 500);
});
