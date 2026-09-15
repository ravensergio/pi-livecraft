@echo off
taskkill /im livecraft.exe /T /F >nul 2>&1
if %errorlevel%==0 (echo Livecraft stopped.) else (echo Livecraft not running.)
