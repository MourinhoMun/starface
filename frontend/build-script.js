const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const builder = require('electron-builder');
const Platform = builder.Platform;

// FORCE SKIP SIGNING
process.env.WIN_CODE_SIGN_SKIP = 'true';

builder.build({
    targets: Platform.WINDOWS.createTarget(),
    config: {
        appId: "com.mystarface.app",
        productName: "My Star Face",
        directories: {
            output: "dist_electron"
        },
        win: {
            target: "dir", // Keep dir for now to verify file structure
            icon: "build/icon.ico",
            verifyUpdateCodeSignature: false
        },
        nsis: {
            oneClick: false,
            allowToChangeInstallationDirectory: true,
            createDesktopShortcut: true,
            createStartMenuShortcut: true
        },
        files: [
            "dist/**/*",
            "electron-main.js"
        ]
        // Removed extraResources
    }
})
    .then(() => {
        console.log("Electron build successful! Now copying backend manually...");

        const source = path.resolve(__dirname, '../backend-build');
        const dest = path.resolve(__dirname, 'dist_electron/win-unpacked/resources/backend');

        console.log(`Copying from ${source} to ${dest} ...`);

        // Create dest folder
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        // Use xcopy for robust recursive copy on Windows
        try {
            // /E = recursive, /I = assume dest is dir, /Y = overwrite, /H = hidden files
            execSync(`xcopy "${source}" "${dest}" /E /I /Y /H`, { stdio: 'inherit' });
            console.log("Backend copied successfully!");
        } catch (e) {
            console.error("Manual copy failed:", e);
            process.exit(1);
        }

        console.log("ALL DONE!");
    })
    .catch((error) => {
        console.error("Error during build:", error);
        process.exit(1);
    });
