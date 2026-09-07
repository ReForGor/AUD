@echo off
echo ========================================================
echo Starting SSO Project Lab with Docker Compose...
echo ========================================================
docker compose up -d --build
echo.
echo ========================================================
echo Containers started!
echo Open your browser at: http://localhost/lab
echo ========================================================
pause
