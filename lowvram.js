module.exports = {
  run: [
    {
      method: "input",
      params: {
        title: "Iris-3B (Low VRAM)",
        description: "Text encoder runs on CPU, the 3B model runs in BF16 and streams to the GPU block by block (~3-4 GB VRAM). Slower than the main UI.",
        form: [
          { key: "prompt", title: "Prompt", placeholder: "a red fox sleeping in fresh snow, golden hour" },
          { key: "negative", title: "Negative prompt (optional)" },
          { key: "size", title: "Size (width and height, multiple of 16)", default: "768" },
          { key: "steps", title: "Steps", default: "30" },
          { key: "cfg", title: "CFG scale", default: "3" },
          { key: "seed", title: "Seed", default: "0" }
        ]
      }
    },
    {
      method: "shell.run",
      params: {
        venv: "env",
        path: "app",
        env: {
          PYTHONUTF8: "1",
          PYTHONIOENCODING: "utf-8"
        },
        message: [
          "python ../lowvram/sample_lowvram.py --checkpoint ../models/iris-3b --offload --outdir ../outputs --prompt \"{{input.prompt}}\" --negative-prompt \"{{input.negative}}\" --width {{input.size}} --height {{input.size}} --steps {{input.steps}} --cfg-scale {{input.cfg}} --seed {{input.seed}}"
        ]
      }
    },
    {
      method: "fs.open",
      params: { path: "outputs" }
    }
  ]
}
