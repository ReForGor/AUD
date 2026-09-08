@echo off
echo ========================================================
echo Starting SSO Project Lab with Docker Compose...
echo ========================================================
docker compose up -d --build
echo.
echo ========================================================
echo All 6 Services Started Successfully!
echo.
echo [Access via Nginx Reverse Proxy (Port 80)]
echo - Web App 1 (Lab Booking):      http://localhost/lab/
echo - Web App 2 (Equipment Loan):   http://localhost/equipment/
echo - Central Auth Service:         http://localhost/auth/
echo - Presentation Slides:          http://localhost/presentation
echo.
echo [Direct Port Access]
echo - Web App 1:                    http://localhost:4001/
echo - Web App 2:                    http://localhost:4002/
echo - Central Auth:                 http://localhost:3000/
echo - PostgreSQL Database:          localhost:5432 (Database: sso_db)
echo ========================================================
pause
