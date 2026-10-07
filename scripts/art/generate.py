"""Keeps Z-Image Turbo loaded and renders every job of a JSONL queue (re-read after each image).

usage: .venv-art/bin/python scripts/art/generate.py [jobs.jsonl] [outdir]
       (defaults: .cache/art/jobs.jsonl -> .cache/art/gen)

A job is {"id", "seed", "prompt", "w"?, "h"?, "steps"?}; sizes default to 640x640 at 8 steps and
must be multiples of 16. A job whose <id>.png already exists is skipped, so the queue can be
rewritten (scripts/art/prompts.py) while this runs: new jobs are picked up after the current image.
Progress goes to <outdir>/_gen.log. Weights come from the local Hugging Face cache only.
"""
import json
import os
import sys
import time

os.environ.setdefault('HF_HUB_OFFLINE', '1')  # never download: the q4 weights are already cached

from mflux.models.z_image.cli.z_image_turbo_generate import ZImageTurboCommand, build_parser  # noqa: E402

MODEL = 'mflux-community/z-image-turbo-mflux-q4'
jobs_path = sys.argv[1] if len(sys.argv) > 1 else '.cache/art/jobs.jsonl'
outdir = sys.argv[2] if len(sys.argv) > 2 else '.cache/art/gen'
os.makedirs(outdir, exist_ok=True)

sys.argv = [sys.argv[0], '--model', MODEL, '--base-model', 'z-image-turbo',
            '--prompt', 'x', '--steps', '8', '--width', '640', '--height', '640']
args = build_parser().parse_args()
model = ZImageTurboCommand.load(args)
log = open(os.path.join(outdir, '_gen.log'), 'a')
print(f"{time.strftime('%H:%M:%S')} model loaded", file=log, flush=True)


def out_path(job):
    return os.path.join(outdir, job['id'] + '.png')


done, t0 = 0, time.time()
while True:
    jobs = [json.loads(line) for line in open(jobs_path) if line.strip()]
    todo = [j for j in jobs if not os.path.exists(out_path(j))]
    if not todo:
        break
    j = todo[0]
    args.width, args.height, args.steps = int(j.get('w', 640)), int(j.get('h', 640)), int(j.get('steps', 8))
    t = time.time()
    try:
        img = ZImageTurboCommand.generate(model, args, int(j['seed']), j['prompt'])
        img.save(path=out_path(j), export_json_metadata=False)
        msg = f"{time.strftime('%H:%M:%S')} {j['id']} {args.width}x{args.height} {time.time() - t:.0f}s ({len(todo) - 1} left)"
    except Exception as e:  # keep going on a bad job; an empty file marks it as failed
        open(out_path(j), 'wb').close()
        msg = f"{time.strftime('%H:%M:%S')} {j['id']} FAILED {e!r}"
    done += 1
    print(msg, file=log, flush=True)
print(f"{time.strftime('%H:%M:%S')} ALL DONE {done} images in {(time.time() - t0) / 60:.1f} min", file=log, flush=True)
