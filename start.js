module.exports = async (kernel) => {
  const port = await kernel.port()
  return {
    daemon: true,
    run: [
      {
        method: "shell.run",
        params: {
          venv: "env",
          path: "app",
          env: {
            GRADIO_SERVER_NAME: "127.0.0.1",
            GRADIO_SERVER_PORT: port.toString(),
            GRADIO_ANALYTICS_ENABLED: "False",
            // The demo reads examples/presets.json with read_text() (no encoding), which uses cp1252 on Windows
            // and turns "×" into "Ã—". UTF-8 mode makes Python default to UTF-8 everywhere.
            PYTHONUTF8: "1",
            PYTHONIOENCODING: "utf-8",
            // Use the weights downloaded by install.js (relative to `app`)
            IRIS_MODEL_REPO: "../models/iris-3b",
            // Keep the 3 models on the CPU and move only the one in use to the GPU (~20 GB VRAM peak instead of ~45 GB).
            // Set to "0" on a GPU with enough memory to hold all three models.
            IRIS_OFFLOAD: "1"
          },
          message: [
            "python demo/app.py"
          ],
          on: [{
            event: "/(http:\\/\\/127\\.0\\.0\\.1:[0-9]+)/",
            done: true
          }]
        }
      },
      {
        method: "local.set",
        params: {
          url: "{{input.event[1]}}"
        }
      }
    ]
  }
}
