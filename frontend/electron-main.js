const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'build/icon.ico') // Optional: add an icon if available
    });

    // In production, load the built index.html
    // In development, you might load localhost:5173
    if (app.isPackaged) {
        mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
    } else {
        mainWindow.loadURL('http://localhost:5173');
    }

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

function startBackend() {
    // Path to the backend executable or script
    // In production (bundled), we need to run the node server
    // For simplicity in this specialized build, we will spawn the node process
    // bundled with the app or rely on a logical structure.

    // Strategy: We will bundle the backend folder into the app resources
    // avoiding the need for the user to have Node.js installed by using pkg or similar, 
    // OR simpler: electron-builder handles node modules if configured correctly, 
    // but we need to spawn it.

    const backendPath = app.isPackaged
        ? path.join(process.resourcesPath, 'backend', 'server.js')
        : path.join(__dirname, '../backend/server.js');

    console.log("Backend Path:", backendPath);

    // Note: Spawning 'node' assumes the user has node, which violates the requirement.
    // To make it standalone without user having Node, we must bundle the backend 
    // into an executable (using pkg) OR use the Electron main process to run the server logic directly (if possible)
    // OR include a node binary.

    // BETTER APPROACH FOR "NO DEPENDENCIES":
    // We will run the Express app INSIDE the Electron main process.
    // This avoids needing a separate Node.js installation on the user's machine.
    // Electron *is* Node.js + Chrome.

    try {
        // Require the backend server logic directly
        // We need to slightly modify backend/server.js to export the app/start function 
        // instead of just running it, or just require it (it runs on require).
        console.log("Starting embedded backend...");

        // We must ensure the backend working directory is correct for DB files
        const backendDir = app.isPackaged
            ? path.join(process.resourcesPath, 'backend')
            : path.join(__dirname, '../backend');

        // Force the CWD for the backend so sqlite finds the db
        // However, changing process.cwd() in Electron main process can be risky.
        // Better to adjust server.js to use absolute paths.

        // Let's require the server. 
        // We need to make sure dependencies are found.
        // In a production build, we copy backend/node_modules to resources/backend/node_modules
        require(backendPath);

    } catch (e) {
        console.error("Failed to start backend:", e);
    }
}

app.on('ready', () => {
    startBackend();
    createWindow();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});
