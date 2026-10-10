"""Low-VRAM text-to-image sampling (target: ~8 GB GPUs).

Differences from the upstream scripts/sample.py:
  * the Qwen3-VL text encoder runs on CPU, and is freed before the DiT touches the GPU
  * the DiT is loaded in bf16 (6 GB) instead of fp32 (12 GB), built straight onto the GPU
  * optional --offload keeps the DiT on CPU and streams each block to the GPU on demand

Run from the upstream repo folder (the Pinokio launcher runs it from `app/`) with iris3b installed:
    python ../lowvram/sample_lowvram.py --checkpoint ../models/iris-3b --prompt "a red fox" --height 768 --width 768
"""

import argparse
import gc
import re
from pathlib import Path

import torch

from iris3b.config import inference_config
from iris3b.models.dit import IrisDiT
from iris3b.registry import TEXT_ENCODERS
from iris3b.sampling import generate, load_for_inference


def slugify(text: str, max_len: int = 60) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len].rstrip("-") or "prompt"


def read_prompts(args, cfg) -> list[str]:
    if args.prompt:
        return list(args.prompt)
    if args.txt_file:
        lines = Path(args.txt_file).read_text(encoding="utf-8").splitlines()
        return [line.strip() for line in lines if line.strip()]
    return list(cfg.train.validation_prompts)


class CachedEncoder:
    """Replays embeddings precomputed on CPU so `generate` never needs the real encoder."""

    def __init__(self, enc, null):
        self.enc, self.null_enc = enc, null

    def encode(self, prompts):
        return self.enc

    def null(self, negative_prompt=""):
        return self.null_enc


def enable_block_offload(model: torch.nn.Module, device: torch.device) -> None:
    """Keep weights on CPU; move each top-level block to the GPU only while it runs."""
    def load(m, _args):
        m.to(device)

    def unload(m, _args, _out):
        m.to("cpu")

    for module in model.modules():
        if isinstance(module, torch.nn.ModuleList):
            for block in module:
                block.register_forward_pre_hook(load)
                block.register_forward_hook(unload)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--checkpoint", required=True)
    p.add_argument("--set", action="append", default=[], metavar="KEY=VALUE")
    p.add_argument("--prompt", action="append", default=[])
    p.add_argument("--txt-file", default=None)
    p.add_argument("--height", type=int, default=768)
    p.add_argument("--width", type=int, default=768)
    p.add_argument("--steps", type=int, default=None)
    p.add_argument("--order", type=int, default=None)
    p.add_argument("--cfg-scale", type=float, default=None)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--negative-prompt", default=None)
    p.add_argument("--shift", type=float, default=None)
    p.add_argument("--outdir", default="output/samples")
    p.add_argument("--offload", action="store_true", help="stream DiT blocks CPU->GPU (slower, least VRAM)")
    args = p.parse_args()

    raw, weights = load_for_inference(args.checkpoint)
    cfg = inference_config(raw, args.set)
    steps = args.steps or cfg.sample.steps
    order = args.order or cfg.sample.order
    cfg_scale = args.cfg_scale if args.cfg_scale is not None else cfg.sample.cfg_scale
    negative = args.negative_prompt if args.negative_prompt is not None else cfg.sample.negative_prompt
    shift = args.shift if args.shift is not None else cfg.flow.shift
    prompts = read_prompts(args, cfg)
    if not prompts:
        p.error("no prompts given")
    device = torch.device("cuda")

    # 1) text encoding on CPU, then free it
    import iris3b.text  # noqa: F401

    encoder = TEXT_ENCODERS.build(cfg.text_encoder.name, cfg.text_encoder, device="cpu")
    enc = encoder.encode(prompts)
    null = encoder.null(negative) if cfg_scale != 1.0 else None
    del encoder
    gc.collect()

    # 2) DiT in bf16
    weights = {k: v.to(torch.bfloat16) if v.is_floating_point() else v for k, v in weights.items()}
    with torch.device("meta"):
        model = IrisDiT(cfg.model)
    model.load_state_dict(weights, strict=True, assign=True)
    del weights
    model = model.eval().to(dtype=torch.bfloat16)
    if args.offload:
        enable_block_offload(model, device)
        # non-block params (embedders, heads) are small: keep them on the GPU
        block_params = {id(q) for m in model.modules() if isinstance(m, torch.nn.ModuleList) for q in m.parameters()}
        for prm in model.parameters():
            if id(prm) not in block_params:
                prm.data = prm.data.to(device)
    else:
        model = model.to(device)

    cached = CachedEncoder(
        type(enc)(enc.embeddings.to(device), enc.mask.to(device)),
        type(null)(null.embeddings.to(device), null.mask.to(device)) if null is not None else None,
    )
    generator = torch.Generator(device=device).manual_seed(args.seed)
    with torch.autocast("cuda", dtype=torch.bfloat16):
        images = generate(
            model, cached, prompts,
            height=args.height, width=args.width, steps=steps, order=order,
            cfg_scale=cfg_scale, cfg_interval=tuple(cfg.sample.cfg_interval), shift=shift,
            negative_prompt=negative, generator=generator, device=device,
            num_train_timesteps=cfg.flow.num_train_timesteps, prediction=cfg.flow.prediction,
        )
    print(f"peak VRAM: {torch.cuda.max_memory_allocated() / 2**30:.2f} GiB")

    from torchvision.utils import save_image

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    for i, (image, prompt) in enumerate(zip(images, prompts, strict=True)):
        path = outdir / f"{i:03d}_{slugify(prompt)}.jpg"
        save_image(image, str(path), normalize=True, value_range=(-1, 1))
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
