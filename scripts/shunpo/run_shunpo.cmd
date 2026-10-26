@echo off
rem Shunpo draft maker (called every morning by Windows Task Scheduler). Makes drafts only when a new period arrives. Never posts.
rem Details: scripts/shunpo/makeShunpo.ts and docs/HANDOFF.md
cd /d "%~dp0..\.."
if not exist "%USERPROFILE%\genka-demo" mkdir "%USERPROFILE%\genka-demo"
"C:\nvm4w\nodejs\node.exe" --experimental-strip-types --no-warnings --env-file=.env.local scripts\shunpo\makeShunpo.ts > "%USERPROFILE%\genka-demo\shunpo-last-run.txt" 2>&1
exit /b %ERRORLEVEL%
