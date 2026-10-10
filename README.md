# Iris-3B (Pinokio)

1-click [Pinokio](https://pinokio.computer) launcher for [Iris-3B](https://github.com/speridlabs/iris-3b) by Speridlabs: a 3B-parameter diffusion transformer that generates every pixel directly (no VAE, no latent space). The same pixel-space prior, fine-tuned, also does monocular depth estimation and 4x image restoration/upscaling.

- Code: https://github.com/speridlabs/iris-3b
- Weights: https://huggingface.co/speridlabs/iris-3b
- Online demo: https://huggingface.co/spaces/speridlabs/iris-3b
- Paper: https://arxiv.org/abs/2610.09450

## What it does

The launcher runs the official Gradio demo (`demo/app.py`) locally, with three tabs:

- **Generate**: text-to-image, about one megapixel, native aspect ratios (768x1344 to 1344x768).
- **Depth**: photo to relative (affine-invariant) depth, with an interactive point cloud.
- **Upscale**: image restoration and 4x upscaling with a before/after slider.

## Requirements

- An **NVIDIA GPU with CUDA**. Upstream targets CUDA only; other hardware falls back to CPU, which is impractical for a 3B model.
- About **~36 GB of disk** for the Iris-3B weights (text-to-image, `depth/`, `upscaler/`, ~12 GB each) plus ~9 GB for the Qwen3-VL-4B text encoder.
- Lots of system RAM: with offloading enabled (the default here) all three models stay in CPU memory (~45 GB) and only the one in use is moved to the GPU (~20 GB VRAM peak).

## Low VRAM

This launcher runs upstream's demo as-is, in its offload mode (`IRIS_OFFLOAD=1`). Estimated from upstream's README and `demo/app.py`, not measured:

- **Text-to-image peaks at roughly 20 GB of VRAM.** The demo keeps the 3B model in FP32 (about 12 GB) and moves it to the GPU together with the Qwen3-VL-4B text encoder (about 8 GB). A 24 GB card (RTX 3090, 4090, A5000, ...) should work. 8, 12 and 16 GB cards will most likely run out of memory on the Generate tab; use **Generate (Low VRAM)** below instead.
- **Depth and Upscale** each move only their own model (about 12 GB), so they should fit on a 16 GB card.
- Offload mode keeps all three models in system RAM (about 45 GB), so low VRAM still needs plenty of RAM.

**Generate (Low VRAM)** menu entry (`lowvram.js` + `lowvram/sample_lowvram.py`): text-to-image only, for ~8 GB GPUs.

- The Qwen3-VL text encoder runs on the CPU and is freed before the 3B model is loaded, so the two never share the GPU.
- The 3B model is cast to BF16 (about 6 GB instead of 12 GB) and kept in system RAM; each transformer block is moved to the GPU only while it runs (block offload).
- Measured on an RTX 4090 with the process capped at 8 GB (`torch.cuda.set_per_process_memory_fraction`): 768x768, 20 steps, peak **3.26 GiB VRAM**, clean output. Without offload, BF16 on the GPU ran out of memory at that cap. Not tested on a physical 8 GB card, and speed was not measured: expect it to be noticeably slower than the main UI, since blocks are copied to the GPU every step.
- Needs roughly 8 GB of free system RAM for the text encoder, plus ~6 GB for the BF16 model. Lower the size or steps for faster runs; images are written to `outputs/`.
- **Install (Low VRAM)** downloads only the text-to-image weights (~12 GB instead of ~36 GB) by excluding `depth/` and `upscaler/`, and records the choice in `models/.lite` so **Update** keeps skipping them. In that mode the stock Start button needs the missing weights for the Depth and Upscale tabs, so **Generate (Low VRAM)** becomes the default action. Run **Install (Full)** later to fetch everything.
- Upstream's `app/` clone is not modified. The depth and upscale tabs still use the stock demo.

## How to use (Pinokio)

1. Open this project in Pinokio and run **Install (Full)** once (or **Install (Low VRAM)**, see below). It will:
   - clone `speridlabs/iris-3b` into `app/`,
   - create a Python 3.11 venv in `app/env/` and `uv pip install -e ".[ui]"`,
   - install PyTorch 2.7.1 (CUDA 12.8 on NVIDIA, ROCm 6.3 on Linux AMD, CPU elsewhere) via `torch.js`,
   - download `speridlabs/iris-3b` into `models/iris-3b/` and `Qwen/Qwen3-VL-4B-Instruct` into the Hugging Face cache,
   - verify imports and write `env/.installed`.
2. Run **Start**. Loading all three models takes a while; when Gradio prints its URL, Pinokio shows **Open Web UI**.
3. **Update** pulls this launcher and `app/`, then reruns the install flow.
4. **Reset** removes `env/` (install marker), `app/` (including its venv) and `models/`.
5. **Save Disk Space** (`link.js`) deduplicates library files in the venv.

`start.js` sets these environment variables:

| Variable | Value | Purpose |
| --- | --- | --- |
| `GRADIO_SERVER_NAME` / `GRADIO_SERVER_PORT` | `127.0.0.1` / free port | local-only server |
| `IRIS_MODEL_REPO` | `../models/iris-3b` | use the weights downloaded by Install |
| `PYTHONUTF8` | `1` | the demo reads `presets.json` without an encoding; on Windows that garbles `×` and makes Generate fail with `Value: 1024Ã—1024 is not in the list of choices` |
| `IRIS_OFFLOAD` | `1` | keep models on CPU, move one at a time to the GPU. Set to `0` in `start.js` if you have ~45 GB of VRAM. |

## API (programmatic access)

The Gradio endpoints are named after the handler functions in `demo/app.py`: `/run` (text-to-image), `/run_depth` and `/run_upscale`. Replace the port with the one shown in Pinokio.

`/run` takes: `prompt`, `negative` (negative prompt), `size` (one of `"768×1344"`, `"832×1280"`, `"896×1152"`, `"1024×1024"`, `"1152×896"`, `"1280×832"`, `"1344×768"`, width × height). The separator is the multiplication sign `×` (U+00D7), not the letter `x`. The examples below write it as the escape `\u00d7`, which is plain ASCII and safe in any Windows terminal or script, `steps`, `cfg_scale`, `seed`, `randomize` (random seed). It returns `(image, seed, info_html)`.

### Python (`gradio_client`)

```python
from gradio_client import Client, handle_file

client = Client("http://127.0.0.1:<port>")  # replace with your URL

# Text-to-image
image_path, seed, info = client.predict(
    "a red fox sleeping in fresh snow, golden hour",  # prompt
    "",                                                # negative prompt
    "1024\u00d71024",                                  # size (U+00D7 multiplication sign)
    50,                                                # steps
    3.0,                                               # cfg_scale
    0,                                                 # seed
    False,                                             # randomize seed
    api_name="/run",
)

# Depth (returns HTML for the slider, point cloud and info panel)
depth_html, cloud_html, depth_info = client.predict(handle_file("photo.jpg"), api_name="/run_depth")

# 4x restoration / upscaling (returns HTML for the slider and info panel)
slider_html, up_info = client.predict(handle_file("lowres.png"), api_name="/run_upscale")
```

### JavaScript

```javascript
import { Client } from "@gradio/client";

const client = await Client.connect("http://127.0.0.1:7860"); // replace port
const result = await client.predict("/run", [
  "a red fox sleeping in fresh snow, golden hour", "", "1024\u00d71024", 50, 3.0, 0, false
]);
console.log(result.data); // [image file metadata, seed, info html]
```

### curl

```sh
curl -X POST http://127.0.0.1:7860/gradio_api/call/run \
  -H 'Content-Type: application/json' \
  -d '{"data":["a red fox sleeping in fresh snow, golden hour","","1024\u00d71024",50,3.0,0,false]}'

# Replace EVENT_ID with event_id from the previous response.
curl -N http://127.0.0.1:7860/gradio_api/call/run/EVENT_ID
```

The running app's **View API** page shows the exact signatures for the installed Gradio version. The depth and upscale endpoints return HTML for the viewers rather than raw files; for raw outputs (`.npy` depth, upscaled PNG) use the upstream CLI scripts from the Pinokio terminal (inside `app/env`, from `app/`):

```text
python scripts/sample.py --checkpoint ../models/iris-3b --prompt "a red fox sleeping in fresh snow, golden hour"
python scripts/depth.py photo.jpg --out depth_out
python scripts/upscale.py photo.jpg --out upscaled
```

## Notes

- The demo's depth is affine-invariant, not metric. Restoration downscales large inputs to a budget (512 px short side / 1024 px long side) before 4x upscaling.
- Iris-3B code and weights are Apache-2.0. The Qwen3-VL-4B-Instruct text encoder is downloaded from its publisher and keeps its own license (Apache-2.0).

## Layout

- Launcher scripts: `install.js`, `start.js`, `update.js`, `reset.js`, `link.js`, `torch.js`, `lowvram.js` (+ `lowvram/sample_lowvram.py`), `pinokio.js`, `pinokio.json`
- Cloned at install time (git-ignored): `app/` (upstream repo, with the venv in `app/env/`), `env/.installed` (install marker), `models/` (weights), `outputs/` (low-VRAM images)
