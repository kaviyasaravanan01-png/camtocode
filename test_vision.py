#!/usr/bin/env python3
"""
Test Vision OCR on sampleinput.jpeg and compare to sampleoutput.txt.
Run: python test_vision.py
"""
import os, base64, difflib, sys
from io import BytesIO
from PIL import Image
import numpy as np
import cv2

MODEL     = "claude-sonnet-4-6"
IMG_PATH  = "sampleinput.jpeg"
REF_PATH  = "sampleoutput.txt"

def encode_image(path, max_side=1600):
    img_np = np.array(Image.open(path).convert("RGB"))
    h, w   = img_np.shape[:2]
    long   = max(h, w)
    print(f"  Image size: {w}x{h}  (long side: {long}px)")
    if long > max_side:
        s      = max_side / long
        img_np = cv2.resize(img_np, (int(w*s), int(h*s)), interpolation=cv2.INTER_AREA)
        print(f"  Resized to: {int(w*s)}x{int(h*s)}")
    buf = BytesIO()
    Image.fromarray(img_np).save(buf, format="JPEG", quality=92)
    b64 = base64.b64encode(buf.getvalue()).decode()
    print(f"  Base64 length: {len(b64)} chars  (~{len(b64)*3//4//1024} KB)")
    return b64

def call_vision(b64, prompt):
    import anthropic, httpx
    try:
        client = anthropic.Anthropic(api_key=API_KEY)
    except TypeError as e:
        if "proxies" in str(e):
            client = anthropic.Anthropic(api_key=API_KEY, http_client=httpx.Client(timeout=120.0))
        else:
            raise
    resp = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {
                    "type": "base64", "media_type": "image/jpeg", "data": b64
                }},
                {"type": "text", "text": prompt},
            ],
        }],
    )
    text = resp.content[0].text.strip()
    # Strip markdown fences Claude sometimes adds
    if text.startswith("```"):
        lines = text.splitlines()
        text  = "\n".join(l for l in lines if not l.strip().startswith("```")).strip()
    return text

# ── Prompts to test ──────────────────────────────────────────────────────────
PROMPTS = {
    "v1_basic": (
        "This image is a phone-camera photo of a monitor showing code.\n\n"
        "Transcribe ALL visible code text exactly as written, "
        "preserving indentation and every character.\n"
        "Return ONLY the raw code — no explanation, no markdown fences."
    ),
    "v2_shell": (
        "This is a phone-camera photo of a monitor showing a shell/bash script.\n\n"
        "Transcribe EVERY visible line exactly as shown. Rules:\n"
        "- Preserve ALL special characters: \\  $  #  &  |  >  <  =  !  ;  ( ) [ ] { }\n"
        "- Preserve ALL indentation (spaces/tabs)\n"
        "- Preserve line-continuation backslashes (\\)\n"
        "- Preserve all quoting: single quotes, double quotes, backticks\n"
        "- Do NOT escape or modify any character\n"
        "- Do NOT add or remove any lines\n"
        "- Return ONLY the raw text — no markdown fences, no explanation"
    ),
    "v3_precise": (
        "This image is a phone-camera photo of a monitor displaying source code.\n\n"
        "Transcribe EVERY visible line of code EXACTLY as shown on screen. Rules:\n"
        "- Preserve ALL characters: \\ $ # & | > < = ! ; ( ) [ ] { } ` ' \"\n"
        "- Preserve ALL variable names, brand names, and identifiers exactly "
        "(e.g. n8n, N8N, HEYGEN, NEWSAPI stay as-is — do NOT paraphrase)\n"
        "- Preserve ALL indentation (spaces/tabs) precisely\n"
        "- Preserve line-continuation backslashes at end of lines\n"
        "- Preserve shell variable syntax: ${VAR}, $VAR, $(cmd)\n"
        "- Do NOT add, remove, reorder, or modify any lines\n"
        "- Do NOT explain or comment anything\n"
        "- Return ONLY the raw code text — no markdown fences, no preamble"
    ),
}

def similarity(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio()

# ── Run ──────────────────────────────────────────────────────────────────────
print("=" * 70)
print("CamToCode Vision Test")
print("=" * 70)

print("\n[1] Encoding image...")
b64 = encode_image(IMG_PATH)

with open(REF_PATH, encoding="utf-8") as f:
    expected = f.read().strip()

print(f"\n[2] Reference: {len(expected.splitlines())} lines, {len(expected)} chars")

best_sim   = 0.0
best_label = ""
best_text  = ""

for label, prompt in PROMPTS.items():
    print(f"\n[3] Calling Vision with prompt '{label}'...")
    try:
        result = call_vision(b64, prompt)
    except Exception as e:
        print(f"  ERROR: {e}")
        continue

    sim = similarity(expected, result)
    print(f"  Similarity: {sim:.1%}  |  lines: {len(result.splitlines())}  |  chars: {len(result)}")

    if sim > best_sim:
        best_sim   = sim
        best_label = label
        best_text  = result

print("\n" + "=" * 70)
print(f"Best prompt: '{best_label}'  similarity: {best_sim:.1%}")
print("=" * 70)

print("\n[VISION OUTPUT - best]\n")
sys.stdout.buffer.write((best_text + "\n").encode("utf-8", errors="replace"))

print("\n[DIFF  expected -> vision]\n")
diff = list(difflib.unified_diff(
    expected.splitlines(keepends=True),
    best_text.splitlines(keepends=True),
    fromfile="sampleoutput.txt (expected)",
    tofile="vision_output (actual)",
    n=2,
))
if diff:
    sys.stdout.buffer.write("".join(diff).encode("utf-8", errors="replace"))
else:
    sys.stdout.buffer.write(b"PERFECT MATCH -- output identical to sampleoutput.txt\n")

# Save best result
out_path = "test_vision_output.txt"
with open(out_path, "w", encoding="utf-8") as f:
    f.write(best_text)
print(f"\nBest output saved to: {out_path}")
