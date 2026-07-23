@echo off
title Iniciando Sistema...
color 0A

echo.
echo ==========================================
echo            INICIANDO SISTEMA
echo ==========================================
echo.

:: Animação
setlocal EnableDelayedExpansion
set "barra="

for %%i in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20) do (
    set "barra=!barra!█"
    cls
    echo.
    echo ==========================================
    echo            INICIANDO SISTEMA
    echo ==========================================
    echo.
    echo Carregando...
    echo.
    echo [!barra!]
    ping localhost -n 1 -w 120 >nul
)

cls
echo.
echo ==========================================
echo        SISTEMA INICIADO COM SUCESSO!
echo ==========================================
echo.

:: FRONTEND
start "Frontend" cmd /k "cd /d D:\Documentos\Marcus\extteste\frontend && npm run dev"

:: Aguarda 2 segundos
timeout /t 2 >nul

:: BACKEND
start "Backend" cmd /k "cd /d D:\Documentos\Marcus\extteste\backend && npm run dev"

echo Frontend iniciado.
echo Backend iniciado.
echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul