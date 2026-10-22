# ExamProctor.ai — Student Desktop Application

Secure Electron desktop application for students taking proctored examinations.

## Architecture

- **Main Process (`main.js`)**: Single-instance lock, secure sandbox, camera permission handling, navigation restrictions, native fullscreen management, and window blur detection.
- **Preload Script (`preload.js`)**: Exposes a secure, limited `window.electronAPI` interface via `contextBridge`.
- **Renderer**: Uses the existing React 19 + Vite frontend application, connecting to the Render backend (`/api/v1`).
- **Storage & Models**: MediaPipe FaceLandmarker, EfficientDet Lite0, and MobileNetV3 ONNX run locally inside the Chromium runtime, persisting data through Dexie IndexedDB.

## Development

```bash
# From d:\ExamProctor.ai\desktop-app
npm install
npm run dev
```

Ensure the Vite development server is running in `frontend/` (`npm run dev`).

## Production Packaging

```bash
# Build the frontend and compile Windows NSIS installer
npm run dist
```

Outputs the installer executable to `desktop-app/dist/`.
