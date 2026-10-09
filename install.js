module.exports = {
  requires: {
    bundle: "ai"
  },
  run: [
    {
      method: "fs.rm",
      when: "{{exists('env/.installed')}}",
      params: { path: "env/.installed" }
    },

    // Clone the official Iris-3B repository (code + Gradio demo)
    {
      method: "shell.run",
      when: "{{!exists('app')}}",
      params: {
        message: [
          "git clone https://github.com/speridlabs/iris-3b app"
        ]
      }
    },

    // Install the iris3b package with the `ui` extra (gradio, spaces). Iris-3B needs Python >= 3.11.
    {
      method: "shell.run",
      params: {
        venv: "env",
        venv_python: "3.11",
        path: "app",
        message: [
          "uv pip install -e \".[ui]\""
        ]
      }
    },

    // Install PyTorch with appropriate CUDA support LAST to overwrite any CPU-only torch
    {
      method: "script.start",
      params: {
        uri: "torch.js",
        params: {
          venv: "env",
          path: "app"
        }
      }
    },

    // Download Iris-3B weights: text-to-image + depth/ + upscaler/ (~36 GB total)
    {
      method: "hf.download",
      params: {
        "_": ["speridlabs/iris-3b"],
        "local-dir": "models/iris-3b"
      }
    },

    // Pre-fetch the frozen Qwen3-VL-4B text encoder into the Hugging Face cache
    // (otherwise it downloads on the first launch)
    {
      method: "hf.download",
      params: {
        "_": ["Qwen/Qwen3-VL-4B-Instruct"]
      }
    },

    // Verify installation
    {
      method: "shell.run",
      params: {
        venv: "env",
        path: "app",
        message: [
          "uv pip check",
          "python -c \"import iris3b, gradio, transformers, torch; print('All imports working correctly. CUDA available:', torch.cuda.is_available())\""
        ]
      }
    },
    {
      method: "fs.write",
      params: { path: "env/.installed", text: "Installation verified" }
    }
  ]
}
