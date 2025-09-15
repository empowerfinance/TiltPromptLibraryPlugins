@echo off
echo Rider Prompt Library Plugin Builder
echo ===================================
echo.
echo Choose your Rider version:
echo 1. Rider 2025.2+ (Latest - requires JDK 21)
echo 2. Rider 2024.1-2025.1 (Legacy - requires JDK 17)
echo.
set /p choice="Enter your choice (1 or 2): "

if "%choice%"=="1" (
    echo.
    echo Building for Rider 2025.2+ with JDK 21...
    gradlew.bat buildPlugin
    echo.
    echo Build complete! Plugin zip is in build/distributions/
) else if "%choice%"=="2" (
    echo.
    echo Building for Rider 2024.1-2025.1 with JDK 17...
    gradlew.bat -b build-legacy.gradle.kts buildPlugin
    echo.
    echo Build complete! Legacy plugin zip is in build/distributions/
) else (
    echo Invalid choice. Please run the script again and choose 1 or 2.
    pause
    exit /b 1
)

echo.
echo Installation instructions:
echo 1. Open Rider
echo 2. Go to File ^> Settings ^> Plugins ^> ⚙️ ^> Install Plugin from Disk...
echo 3. Select the zip file from build/distributions/
echo 4. Restart Rider
echo.
pause
