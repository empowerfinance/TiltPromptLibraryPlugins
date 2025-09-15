#!/bin/bash

echo "Rider Prompt Library Plugin Builder"
echo "==================================="
echo
echo "Choose your Rider version:"
echo "1. Rider 2025.2+ (Latest - requires JDK 21)"
echo "2. Rider 2024.1-2025.1 (Legacy - requires JDK 17)"
echo
read -p "Enter your choice (1 or 2): " choice

case $choice in
    1)
        echo
        echo "Building for Rider 2025.2+ with JDK 21..."
        ./gradlew buildPlugin
        echo
        echo "Build complete! Plugin zip is in build/distributions/"
        ;;
    2)
        echo
        echo "Building for Rider 2024.1-2025.1 with JDK 17..."
        ./gradlew -b build-legacy.gradle.kts buildPlugin
        echo
        echo "Build complete! Legacy plugin zip is in build/distributions/"
        ;;
    *)
        echo "Invalid choice. Please run the script again and choose 1 or 2."
        exit 1
        ;;
esac

echo
echo "Installation instructions:"
echo "1. Open Rider"
echo "2. Go to File > Settings > Plugins > ⚙️ > Install Plugin from Disk..."
echo "3. Select the zip file from build/distributions/"
echo "4. Restart Rider"
echo
