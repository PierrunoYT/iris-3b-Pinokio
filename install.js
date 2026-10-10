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

    // Low VRAM install: remember the choice in models/.lite so update.js (which re-runs this script
    // without params) keeps skipping depth/ and upscaler/. A full install clears the marker.
    {
      method: "fs.write",
      when: "{{args && args.lite}}",
      params: { path: "models/.lite", text: "text-to-image weights only" }
    },
    {
      method: "fs.rm",
      when: "{{args && args.full && exists('models/.lite')}}",
      params: { path: "models/.lite" }
    },

    // Download Iris-3B weights: text-to-image + depth/ + upscaler/ (~36 GB total)
    {
      method: "hf.download",
      when: "{{!(args && args.lite) && !exists('models/.lite')}}",
      params: {
        "_": ["speridlabs/iris-3b"],
        "local-dir": "models/iris-3b"
      }
    },

    // Low VRAM: text-to-image weights only (~12 GB), skipping depth/ and upscaler/
    {
      method: "shell.run",
      when: "{{(args && args.lite) || exists('models/.lite')}}",
      params: {
        venv: "env",
        path: "app",
        message: [
          "hf download speridlabs/iris-3b --local-dir ../models/iris-3b --exclude \"depth/*\" \"upscaler/*\""
        ]
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
