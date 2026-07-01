@echo off
echo.
echo ========================================
echo   SeguraTech - Iniciando Servidor
echo ========================================
echo.
echo [INFO] Verificando Python...
python --version
if errorlevel 1 (
    echo [ERRO] Python nao encontrado!
    pause
    exit /b 1
)

echo.
echo [INFO] Iniciando servidor na porta 3000...
echo [INFO] Acesse: http://localhost:3000
echo.
echo Credenciais de teste:
echo   vendedor  / vendas123
echo   emissao   / emissao123
echo   sinistro  / sinistro123
echo   gestor    / gestor123
echo.
echo Pressione Ctrl+C para parar o servidor
echo.

python server.py

pause
