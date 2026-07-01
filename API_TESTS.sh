#!/bin/bash
# EXEMPLOS DE TESTE DA API - SeguraTech

API="http://localhost:3000/api"

echo "🔧 Exemplos de teste da API SeguraTech"
echo "========================================"
echo ""
echo "⚠️  Execute o servidor primeiro: npm start"
echo ""

# 1. LOGIN
echo "1️⃣  LOGIN (Vendedor)"
echo "curl -X POST $API/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"username\":\"vendedor\",\"password\":\"vendas123\"}'"
echo ""
echo "Resultado esperado: token, name, role"
echo ""

# 2. GET PROFILE
echo "2️⃣  OBTER PERFIL"
echo "curl -X GET $API/me \\"
echo "  -H 'x-auth-token: [TOKEN_DO_LOGIN]'"
echo ""
echo "Resultado esperado: name, role, username"
echo ""

# 3. GET OVERVIEW
echo "3️⃣  DASHBOARD OVERVIEW"
echo "curl -X GET $API/overview \\"
echo "  -H 'x-auth-token: [TOKEN_DO_LOGIN]'"
echo ""
echo "Resultado esperado: activePolicies, renewalPending, openLeads, pendingProposals"
echo ""

# 4. GET LEADS
echo "4️⃣  LISTAR LEADS"
echo "curl -X GET $API/leads \\"
echo "  -H 'x-auth-token: [TOKEN_DO_LOGIN]'"
echo ""
echo "Resultado esperado: array de leads com client, source, status"
echo ""

# 5. CREATE PROPOSAL
echo "5️⃣  CRIAR PROPOSTA (vendedor)"
echo "curl -X POST $API/propostas \\"
echo "  -H 'x-auth-token: [TOKEN_VENDEDOR]' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{"
echo "    \"client\": \"João Silva\","
echo "    \"insurer\": \"Porto Seguro\","
echo "    \"type\": \"Automóvel\","
echo "    \"notes\": \"Cliente premium\""
echo "  }'"
echo ""
echo "Resultado esperado: id, policyNumber, status: 'Pendente'"
echo ""

# 6. GET PROPOSALS
echo "6️⃣  LISTAR PROPOSTAS"
echo "curl -X GET $API/propostas \\"
echo "  -H 'x-auth-token: [TOKEN_DO_LOGIN]'"
echo ""
echo "Resultado esperado: array de propostas com detalhes"
echo ""

# 7. APPROVE PROPOSAL
echo "7️⃣  APROVAR PROPOSTA (emissao)"
echo "curl -X POST $API/propostas/1/approve \\"
echo "  -H 'x-auth-token: [TOKEN_EMISSAO]' \\"
echo "  -H 'Content-Type: application/json'"
echo ""
echo "Resultado esperado: proposta com status: 'Aprovada' + nova apólice criada"
echo ""

# 8. SEARCH POLICIES
echo "8️⃣  BUSCAR APÓLICES"
echo "curl -X GET '$API/apolices?search=João' \\"
echo "  -H 'x-auth-token: [TOKEN_DO_LOGIN]'"
echo ""
echo "Resultado esperado: array de apólices que correspondem a 'João'"
echo ""

# 9. CREATE CLAIM
echo "9️⃣  REGISTRAR SINISTRO (sinistro)"
echo "curl -X POST $API/sinistros \\"
echo "  -H 'x-auth-token: [TOKEN_SINISTRO]' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{"
echo "    \"policyNumber\": \"0009821-4\","
echo "    \"client\": \"João Ferreira\","
echo "    \"insurer\": \"Porto Seguro\","
echo "    \"type\": \"Colisão\","
echo "    \"description\": \"Batida traseira na avenida\""
echo "  }'"
echo ""
echo "Resultado esperado: id, status: 'Em análise', protocol gerado"
echo ""

# 10. GET SINISTROS
echo "🔟  LISTAR SINISTROS"
echo "curl -X GET $API/sinistros \\"
echo "  -H 'x-auth-token: [TOKEN_DO_LOGIN]'"
echo ""
echo "Resultado esperado: array de sinistros com histórico"
echo ""

# 11. GET CHART
echo "1️⃣1️⃣  GRÁFICO DE SINISTROS"
echo "curl -X GET $API/chart/sinistros \\"
echo "  -H 'x-auth-token: [TOKEN_DO_LOGIN]'"
echo ""
echo "Resultado esperado: array de meses com contagem de sinistros"
echo ""

# 12. LOGOUT
echo "1️⃣2️⃣  LOGOUT"
echo "curl -X GET $API/logout \\"
echo "  -H 'x-auth-token: [TOKEN_DO_LOGIN]'"
echo ""
echo "Resultado esperado: success: true, token removido do banco"
echo ""

echo "========================================"
echo "🎯 Dicas:"
echo "   • Use 'jq' para formatar JSON: ... | jq"
echo "   • Guarde o token após login"
echo "   • Teste com diferentes roles"
echo "   • Verifique logs do servidor"
echo ""
