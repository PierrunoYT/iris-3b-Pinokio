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

- **Text-to-image peaks at roughly 20 GB of VRAM.** The demo keeps the 3B model in FP32 (about 12 GB) and moves it to the GPU together with the Qwen3-VL-4B text encoder (about 8 GB). A 24 GB card (RTX 3090, 4090, A5000, ...) should work. 8, 12 and 16 GB cards will most likely run out of memory on the Generate tab.
- **Depth and Upscale** each move only their own model (about 12 GB), so they should fit on a 16 GB card.
- Offload mode keeps all three models in system RAM (about 45 GB), so low VRAM still needs plenty of RAM.

Possible ways to lower the requirement (not implemented in this launcher):

- Hold the model in BF16 instead of FP32, which halves its weights from about 12 GB to about 6 GB.
- Run the text encoder first, move it back to the CPU, then move the model to the GPU, so the two never share the GPU. That would bring text-to-image weight memory down to roughly 6-8 GB.
- Add a tiled or CPU fallback for the upscaler.

These would need a replacement `app.py` in the launcher root, since the upstream clone in `app/` should stay untouched. Activations at 1024x1024 in pixel space could still need several GB, and the BF16 cast may change output quality slightly. Both are untested, so 12-16 GB looks plausible and 8 GB is a long shot.

## How to use (Pinokio)

1. Open this project in Pinokio and run **Install** once. It will:
   - clone `speridlabs/iris-3b` into `app/`,
   - create a Python 3.11 venv in `env/` and `uv pip install -e ".[ui]"`,
   - install PyTorch 2.7.1 (CUDA 12.8 on NVIDIA, ROCm 6.3 on Linux AMD, CPU elsewhere) via `torch.js`,
   - download `speridlabs/iris-3b` into `models/iris-3b/` and `Qwen/Qwen3-VL-4B-Instruct` into the Hugging Face cache,
   - verify imports and write `env/.installed`.
2. Run **Start**. Loading all three models takes a while; when Gradio prints its URL, Pinokio shows **Open Web UI**.
3. **Update** pulls this launcher and `app/`, then reruns the install flow.
4. **Reset** removes `env/`, `app/` and `models/`.
5. **Save Disk Space** (`link.js`) deduplicates library files in the venv.

`start.js` sets these environment variables:

| Variable | Value | Purpose |
| --- | --- | --- |
| `GRADIO_SERVER_NAME` / `GRADIO_SERVER_PORT` | `127.0.0.1` / free port | local-only server |
| `IRIS_MODEL_REPO` | `../models/iris-3b` | use the weights downloaded by Install |
| `IRIS_OFFLOAD` | `1` | keep models on CPU, move one at a time to the GPU. Set to `0` in `start.js` if you have ~45 GB of VRAM. |

## API (programmatic access)

The Gradio endpoints are named after the handler functions in `demo/app.py`: `/run` (text-to-image), `/run_depth` and `/run_upscale`. Replace the port with the one shown in Pinokio.

`/run` takes: `prompt`, `negative` (negative prompt), `size` (one of `"768×1344"`, `"832×1280"`, `"896×1152"`, `"1024×1024"`, `"1152×896"`, `"1280×832"`, `"1344×768"`; note the `×` character, width × height), `steps`, `cfg_scale`, `seed`, `randomize` (random seed). It returns `(image, seed, info_html)`.

### Python (`gradio_client`)

```python
from gradio_client import Client, handle_file

client = Client("http://127.0.0.1:<port>")  # replace with your URL

# Text-to-image
image_path, seed, info = client.predict(
    "a red fox sleeping in fresh snow, golden hour",  # prompt
    "",                                                # negative prompt
    "1024×1024",                                       # size
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
  "a red fox sleeping in fresh snow, golden hour", "", "1024×1024", 50, 3.0, 0, false
]);
console.log(result.data); // [image file metadata, seed, info html]
```

### curl

```sh
curl -X POST http://127.0.0.1:7860/gradio_api/call/run \
  -H 'Content-Type: application/json' \
  -d '{"data":["a red fox sleeping in fresh snow, golden hour","","1024×1024",50,3.0,0,false]}'

# Replace EVENT_ID with event_id from the previous response.
curl -N http://127.0.0.1:7860/gradio_api/call/run/EVENT_ID
```

The running app's **View API** page shows the exact signatures for the installed Gradio version. The depth and upscale endpoints return HTML for the viewers rather than raw files; for raw outputs (`.npy` depth, upscaled PNG) use the upstream CLI scripts from the Pinokio terminal (inside `env`, from `app/`):

```text
python scripts/sample.py --checkpoint ../models/iris-3b --prompt "a red fox sleeping in fresh snow, golden hour"
python scripts/depth.py photo.jpg --out depth_out
python scripts/upscale.py photo.jpg --out upscaled
```

## Notes

- The demo's depth is affine-invariant, not metric. Restoration downscales large inputs to a budget (512 px short side / 1024 px long side) before 4x upscaling.
- Iris-3B code and weights are Apache-2.0. The Qwen3-VL-4B-Instruct text encoder is downloaded from its publisher and keeps its own license (Apache-2.0).

## Layout

- Launcher scripts: `install.js`, `start.js`, `update.js`, `reset.js`, `link.js`, `torch.js`, `pinokio.js`, `pinokio.json`
- Cloned at install time (git-ignored): `app/` (upstream repo), `env/` (venv), `models/` (weights)
