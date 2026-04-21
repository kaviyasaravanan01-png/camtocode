import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["OPENBLAS_MAIN_FREE"] = "1"
import html as _html
import re
import ast as _ast_mod
import base64
import subprocess                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       
import tempfile
import threading
import queue
import socket
from io import BytesIO
from collections import Counter
from difflib import SequenceMatcher
from datetime import datetime

import cv2
import numpy as np
from PIL import Image
from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, emit
import pytesseract
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# eng_best.traineddata ships a much better LSTM model than the default fast data.
# We ship it alongside backend.py in the project folder and tell Tesseract to use it.
_TESSDATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)))
_BEST_DATA    = os.path.join(_TESSDATA_DIR, "eng_best.traineddata")
HAS_ENG_BEST  = os.path.isfile(_BEST_DATA)

# ---------------------------------------------------------------------------
# Optional: EasyOCR  (fully lazy — import + Reader deferred to first OCR call)
# ---------------------------------------------------------------------------
_ez_reader = None
_easyocr = None

def _check_easyocr() -> bool:
    """Return True if the easyocr package is importable (without importing it)."""
    import importlib.util
    return importlib.util.find_spec("easyocr") is not None

HAS_EASYOCR = _check_easyocr()

def _get_ez_reader():
    global _ez_reader, _easyocr
    if _ez_reader is None:
        import easyocr as _easyocr_mod
        _easyocr = _easyocr_mod
        _ez_reader = _easyocr_mod.Reader(["en"], gpu=False, verbose=False)
    return _ez_reader

# ---------------------------------------------------------------------------
# Optional: Anthropic / Claude
# ---------------------------------------------------------------------------
try:
    import anthropic as _anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

def _make_anthropic_client(api_key: str):
    """Create an Anthropic client, working around the httpx ≥0.28 breaking change.

    httpx 0.28 removed the `proxies` parameter from Client.__init__().
    Older anthropic SDK versions try to pass it, causing:
        TypeError: Client.__init__() got an unexpected keyword argument 'proxies'
    Workaround: pass a pre-built httpx.Client so the SDK skips its own init.
    """
    try:
        return _anthropic.Anthropic(api_key=api_key)
    except TypeError as e:
        if "proxies" in str(e):
            import httpx as _httpx
            return _anthropic.Anthropic(
                api_key=api_key,
                http_client=_httpx.Client(timeout=120.0),
            )
        raise

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# Set ANTHROPIC_API_KEY in your environment or a .env file — never hardcode it here
os.environ["ANTHROPIC_API_KEY"] = "..."  # REMOVED — use env var instead

PORT                = 5000
OUTPUT_FILE         = "output.txt"
MIN_SHARPNESS       = 60.0    # Screen captures need at least this to be usable
SIMILARITY_THRESH   = 0.85    # fraction; above = treat as duplicate
USE_EASYOCR         = False   # Disabled — PyTorch/OpenMP segfaults in threaded server
AUTO_CAPTURE_FRAMES   = 5       # collect 5 sharp frames before auto-stop (Vision needs only 1 good frame)
MIN_FRAMES_CONSENSUS  = 3       # require at least this many sharp frames for reliable consensus
_LINE_CONF_THRESH     = 85.0    # lines below this Tesseract confidence are sent to Claude

LLM_MODELS = {
    "haiku":  "claude-haiku-4-5-20251001",
    "sonnet": "claude-sonnet-4-6",
}
# Dedicated Vision OCR model — always Sonnet for best accuracy on screen photos.
# Independent from llm_model_key which controls the text-correction LLM.
VISION_MODEL = "claude-sonnet-4-6"

# Language → file extension map (used by Fix & Export session feature)
_EXT_MAP: dict[str, str] = {
    "python":     ".py",   "javascript": ".js",   "typescript": ".ts",
    "html":       ".html", "react":      ".tsx",  "nestjs":     ".ts",
    "nextjs":     ".tsx",  "java":       ".java", "cpp":        ".cpp",
    "go":         ".go",   "rust":       ".rs",   "swift":      ".swift",
    "kotlin":     ".kt",   "ruby":       ".rb",   "php":        ".php",
    "sql":        ".sql",  "css":        ".css",
}

# ---------------------------------------------------------------------------
# Tesseract configs  — PSM 6 (uniform block) is best for code
# Use eng_best.traineddata if present (downloaded alongside backend.py),
# otherwise fall back to the default eng.traineddata.
# ---------------------------------------------------------------------------
_TESS_BASE  = "--oem 1 -c preserve_interword_spaces=1 --user-defined-dpi 300"  # oem 1 = LSTM only
_TESS_BEST  = (f"--tessdata-dir \"{_TESSDATA_DIR}\" -l eng_best"
               if HAS_ENG_BEST else "")
_TESS_CFGS  = [
    (_TESS_BASE + (" " + _TESS_BEST if _TESS_BEST else "")).strip() + " --psm 6",
]

# ---------------------------------------------------------------------------
# App + State
# ---------------------------------------------------------------------------
app = Flask(__name__, static_folder="static")
app.config["SECRET_KEY"] = "camtocode-secret"
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    max_http_buffer_size=25 * 1024 * 1024,
    allow_upgrades=False,   # force long-polling; WebSocket+SSL+threading = segfault
)

_lock          = threading.Lock()
capturing      = False
last_saved     = ""
frame_buf:     list[str]        = []   # OCR text strings
frame_rgb_buf: list[np.ndarray] = []
ai_enabled     = True   # enabled by default — API key is set above
night_mode     = False
auto_capture   = False
auto_clear_after_export = False  # NEW: auto-clear file after session/export
# --- Auto Re-capture (NEW) ---
auto_recapture_enabled  = False  # Toggle: user wants auto re-capture
auto_recapture_interval = 5      # Seconds between captures (3, 5, 8, 10, 12, 15, 20)
auto_recapture_active   = False  # TRUE when countdown is running after a capture
current_file   = OUTPUT_FILE
llm_model_key  = "haiku"
_consec_sharp  = 0
language_hint  = ""    # user-selected language; empty = auto-detect
bulk_capture         = False
bulk_session_blocks  = 0
bulk_session_number  = 0   # increments each time bulk mode is turned ON

# Queue for passing raw frame data to the single OCR worker thread
_frame_queue: queue.Queue = queue.Queue(maxsize=4)


# ===========================================================================
# IMAGE QUALITY & GUIDANCE
# ===========================================================================

def sharpness_score(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def quality_label(score: float) -> str:
    if score >= 200:
        return "sharp"
    if score >= MIN_SHARPNESS:
        return "ok"
    return "blurry"


def detect_glare(img_np: np.ndarray) -> tuple[bool, float]:
    gray  = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    ratio = float(np.sum(gray > 245)) / gray.size
    return ratio > 0.10, round(ratio * 100, 1)


def estimate_text_height(img_np: np.ndarray) -> int:
    gray   = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    h, w   = gray.shape
    sample = gray[int(h * 0.15):int(h * 0.85), int(w * 0.05):int(w * 0.95)]
    if sample.size == 0:
        return 0
    binary = cv2.adaptiveThreshold(
        sample, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 5
    )
    proj         = np.sum(binary, axis=1) > (binary.shape[1] * 0.02)
    heights, run = [], 0
    for val in proj:
        if val:
            run += 1
        elif run > 2:
            heights.append(run)
            run = 0
    return int(np.median(heights)) if heights else 0


def zoom_guidance(char_h: int) -> tuple[str, str]:
    if char_h == 0:
        return "unknown", ""
    if char_h < 15:
        return "closer",  "Move phone closer - text is too small"
    if char_h > 40:
        return "farther", "Move phone a bit farther from screen"
    return "good", "Distance looks good"


# ===========================================================================
# PREPROCESSING
# ===========================================================================

def preprocess(img_np: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape
    long_side = max(h, w)

    # Smart upscale so Tesseract sees characters ~40-60 px tall.
    # < 1200px  → 3× (compressed video frames, small captures)
    # 1200-2499 → 2× (HD video: 1280×720, 1920×1080)
    # ≥ 2500px  → 1× (full-res phone photos: 3K+ already have large enough chars)
    if long_side < 1200:
        scale = 3
    elif long_side < 2500:
        scale = 2
    else:
        scale = 1

    if scale > 1:
        gray = cv2.resize(gray, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC)

    # Invert dark-theme IDEs so text is black on white for Tesseract
    if gray.mean() < 127:
        gray = cv2.bitwise_not(gray)

    # Gaussian blur: 5×5 for upscaled frames (smooths JPEG DCT block artifacts),
    # 9×9 for native-res phone photos (stronger moiré removal)
    blur_k = 5 if scale > 1 else 9
    gray = cv2.GaussianBlur(gray, (blur_k, blur_k), 0)

    # CLAHE: only for upscaled images — on large native-res images it amplifies
    # residual moiré into high-contrast noise Tesseract mistakes for characters
    if scale > 1:
        clip  = 5.0 if night_mode else 2.5
        clahe = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8))
        gray  = clahe.apply(gray)

    # Adaptive threshold block size must scale with the image so it covers
    # roughly one character width regardless of zoom factor:
    #   scale=3 → chars ~45 px wide → block=91
    #   scale=2 → chars ~60 px wide → block=61
    #   scale=1 large phone photo: use Otsu (global) — more robust than adaptive
    if scale == 1:
        # Otsu finds the global optimal threshold; works well on clean large images
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    else:
        block = 91 if scale == 3 else 61   # must be odd ✓
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block, 15
        )

    # Light dilation reconnects broken character strokes from compression/blur.
    # Keep kernel tiny (1×2 horizontal only) so thin code characters like
    # : ; . ( ) | ` are NOT merged — a 2×2 kernel is too aggressive for code.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 2))
    binary = cv2.dilate(binary, kernel, iterations=1)
    return binary


# ===========================================================================
# OCR
# ===========================================================================

def _tesseract_with_confidence(
    processed: np.ndarray,
    build_heatmap: bool = False,
) -> tuple[str, float, list[float], list[dict]]:
    """Run Tesseract once; return (best_text, avg_conf, per_line_avg_confs, heatmap).

    When build_heatmap=False the heatmap list is empty (live-preview speed path).
    When build_heatmap=True a flat [{w, c}] token list is built from the same
    image_to_data call — no second Tesseract invocation.
    """
    best_text       : str        = ""
    best_conf       : float      = -1.0
    best_line_confs : list[float] = []
    best_heatmap    : list[dict]  = []

    for cfg in _TESS_CFGS:
        try:
            data = pytesseract.image_to_data(
                processed, config=cfg, output_type=pytesseract.Output.DICT
            )
        except Exception:
            continue

        n = len(data["text"])
        # (blk, par, ln) -> list of words / confidences
        line_words: dict[tuple, list[str]] = {}
        line_confs: dict[tuple, list[int]] = {}
        # heatmap: (blk, par, ln) -> [(word_num, word, conf)]
        hm_lines: dict[tuple, list[tuple[int, str, int]]] = {}

        for i in range(n):
            word = str(data["text"][i])
            try:
                conf = int(data["conf"][i])
            except (ValueError, TypeError):
                conf = -1
            try:
                blk = int(data["block_num"][i])
                par = int(data["par_num"][i])
                ln  = int(data["line_num"][i])
                wn  = int(data["word_num"][i])
            except (ValueError, TypeError):
                blk, par, ln, wn = 0, 0, 0, 0
            key = (blk, par, ln)

            # ---- text reconstruction ----
            if key not in line_words:
                line_words[key] = []
                line_confs[key] = []
            if word.strip():
                line_words[key].append(word)
            if conf >= 0:
                line_confs[key].append(conf)

            # ---- heatmap (only when requested) ----
            if build_heatmap and word.strip() and conf >= 0:
                if key not in hm_lines:
                    hm_lines[key] = []
                hm_lines[key].append((wn, word.strip(), conf))

        sorted_keys   = sorted(line_words.keys())
        nonempty_keys = [k for k in sorted_keys if line_words[k]]
        lines_text    = [" ".join(line_words[k]).strip() for k in nonempty_keys]
        lc_per_line   = [
            float(np.mean(line_confs[k])) if line_confs[k] else 0.0
            for k in nonempty_keys
        ]

        text     = "\n".join(lines_text)
        avg_conf = float(np.mean(lc_per_line)) if lc_per_line else 0.0

        if avg_conf > best_conf and text:
            best_conf       = avg_conf
            best_text       = text
            best_line_confs = lc_per_line

            if build_heatmap:
                # Build flat [{w, c}] list in reading order with \n sentinels
                hm: list[dict] = []
                for key in sorted(hm_lines.keys()):
                    if hm:
                        hm.append({"w": "\n", "c": -1})
                    for _wn, w, c in sorted(hm_lines[key], key=lambda x: x[0]):
                        hm.append({"w": w, "c": c})
                best_heatmap = hm

    return best_text, max(best_conf, 0.0), best_line_confs, best_heatmap


def _easyocr_run(img_np: np.ndarray) -> str:
    results = _get_ez_reader().readtext(img_np, detail=0)
    return "\n".join(results)


def run_ocr_frame(img_np: np.ndarray) -> tuple[str, float, list[dict]]:
    """Fast OCR for live frame preview.

    Uses image_to_string (not image_to_data) and caps input at 1200 px so
    Tesseract finishes in seconds instead of minutes.  No heatmap is built
    here — the final high-quality result comes from Vision/Tesseract in
    on_stop, not from this per-frame live preview.
    """
    if USE_EASYOCR and HAS_EASYOCR:
        return _easyocr_run(img_np), 80.0, []

    # --- Scale to EXACTLY 1200 px on the long side (upscale small frames,
    #     downscale HD frames — keeps char height in the 12-20 px range) ---
    h, w = img_np.shape[:2]
    long = max(h, w)
    scale = 1200 / long
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    interp = cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA
    gray = cv2.resize(gray, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=interp)

    # Invert dark themes
    if gray.mean() < 127:
        gray = cv2.bitwise_not(gray)

    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Lightweight Tesseract config — no DPI override, no eng_best for speed
    fast_cfg = "--oem 1 -c preserve_interword_spaces=1 --psm 6"
    try:
        text = pytesseract.image_to_string(binary, config=fast_cfg)
        return fix_code_symbols(text).strip(), 80.0, []
    except Exception:
        return "", 0.0, []


# ===========================================================================
# OPTICAL-FLOW ALIGNMENT
# ===========================================================================

def align_frames(rgb_frames: list[np.ndarray]) -> list[np.ndarray]:
    if len(rgb_frames) < 2:
        return rgb_frames
    ref_rgb = rgb_frames[0]
    ref     = cv2.cvtColor(ref_rgb, cv2.COLOR_RGB2GRAY)
    h, w    = ref.shape
    aligned = [ref_rgb]
    lk_params = dict(
        winSize=(15, 15),
        maxLevel=2,
        criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 10, 0.03),
    )
    ref_pts = cv2.goodFeaturesToTrack(
        ref, maxCorners=200, qualityLevel=0.01, minDistance=10, blockSize=3
    )
    if ref_pts is None:
        return rgb_frames
    for rgb in rgb_frames[1:]:
        try:
            frame    = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
            curr_pts, status, _ = cv2.calcOpticalFlowPyrLK(
                ref, frame, ref_pts, None, **lk_params
            )
            good_ref  = ref_pts[status == 1]
            good_curr = curr_pts[status == 1]
            if len(good_ref) < 4:
                aligned.append(rgb)
                continue
            H, _ = cv2.findHomography(good_curr, good_ref, cv2.RANSAC, 5.0)
            if H is not None:
                aligned.append(cv2.warpPerspective(rgb, H, (w, h)))
            else:
                aligned.append(rgb)
        except Exception:
            aligned.append(rgb)
    return aligned


# ===========================================================================
# PIXEL-AVERAGE FRAMES  (#8)
# ===========================================================================

def pixel_average_frames(rgb_frames: list[np.ndarray]) -> np.ndarray:
    """Align frames with optical flow then average pixels.

    Averaging N aligned frames reduces per-pixel noise by sqrt(N) — the same
    technique used in astrophotography stacking.  One clean averaged image fed
    to Tesseract beats running OCR separately on each frame and voting.
    """
    if len(rgb_frames) < 2:
        return rgb_frames[0]
    try:
        aligned = align_frames(rgb_frames)
        # Resize all to the reference frame size before averaging
        h, w = aligned[0].shape[:2]
        resized = []
        for f in aligned:
            if f.shape[:2] != (h, w):
                f = cv2.resize(f, (w, h), interpolation=cv2.INTER_LINEAR)
            resized.append(f.astype(np.float32))
        avg = np.mean(resized, axis=0)
        return np.clip(avg, 0, 255).astype(np.uint8)
    except Exception:
        return rgb_frames[0]


def _best_frame(rgb_frames: list[np.ndarray]) -> np.ndarray:
    """Return the single sharpest frame (highest Laplacian variance).

    Vision OCR works best on one crisp frame rather than a pixel-averaged
    composite, because averaging slightly-misaligned frames blurs fine
    details like special characters, symbols, and narrow-font code.
    """
    if len(rgb_frames) == 1:
        return rgb_frames[0]
    best_idx   = 0
    best_score = -1.0
    for i, frame in enumerate(rgb_frames):
        gray  = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
        score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        if score > best_score:
            best_score = score
            best_idx   = i
    return rgb_frames[best_idx]


# ===========================================================================
# JS / TS SYNTAX CHECK  (#10)
# ===========================================================================
_NODE_BIN = None   # cached path

def _find_node() -> str | None:
    global _NODE_BIN
    if _NODE_BIN is not None:
        return _NODE_BIN
    import shutil
    _NODE_BIN = shutil.which("node")
    return _NODE_BIN


def check_js_syntax(code: str) -> tuple[bool, str | None]:
    """Use Node.js vm.Script to check JS/TS syntax.

    Returns (True, None) on success, (False, error_msg) on failure.
    TS-only constructs (type annotations, decorators) that vm.Script can't
    parse are stripped before the check so TypeScript code doesn't always
    false-fail.
    """
    node = _find_node()
    if not node:
        return True, None   # no node — skip check rather than block

    # Strip basic TS constructs that Node vm can't parse
    stripped = re.sub(r':\s*(string|number|boolean|any|void|never|unknown'
                      r'|null|undefined|object|Record<[^>]*>|Array<[^>]*>)', '', code)
    stripped = re.sub(r'<[A-Z]\w*>', '', stripped)  # generic params
    stripped = re.sub(r'^\s*@\w+.*$', '', stripped, flags=re.MULTILINE)  # decorators
    stripped = re.sub(r'\binterface\s+\w+\s*\{[^}]*\}', '', stripped, flags=re.DOTALL)
    stripped = re.sub(r'\btype\s+\w+\s*=\s*[^;]+;', '', stripped)

    check_script = (
        "const vm=require('vm');"
        "try{new vm.Script(" + __import__('json').dumps(stripped) + ");process.exit(0);}"
        "catch(e){process.stderr.write(e.message);process.exit(1);}"
    )
    try:
        result = subprocess.run(
            [node, "-e", check_script],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return True, None
        raw = result.stderr.strip() or "JS syntax error"
        # Normalise to "Line N: description" (matches Python check_python_syntax format)
        # Node.js e.message may look like: "{ was never closed (line 21)"
        m = re.search(r'\(line\s+(\d+)\)', raw, re.IGNORECASE)
        if m:
            lineno = m.group(1)
            desc   = raw[:m.start()].strip(" .\n")
            msg    = f"Line {lineno}: {desc}"
        else:
            # Take only the first non-stack-trace line
            msg = next((ln.strip() for ln in raw.splitlines()
                        if ln.strip() and not ln.strip().startswith("at ")), raw)
        return False, msg
    except Exception:
        return True, None  # timeout or error — don't block


def check_go_syntax(code: str) -> tuple[bool, str | None]:
    """Check Go syntax using gofmt -e. Gracefully skips if gofmt not installed."""
    try:
        import subprocess, tempfile
        with tempfile.NamedTemporaryFile(suffix=".go", mode="w",
                                         encoding="utf-8", delete=False) as f:
            f.write(code)
            tmp = f.name
        result = subprocess.run(
            ["gofmt", "-e", tmp],
            capture_output=True, text=True, timeout=8,
        )
        try:
            os.unlink(tmp)
        except OSError:
            pass
        if result.returncode == 0:
            return True, None
        msg = result.stderr.strip() or "Go syntax error"
        return False, msg
    except FileNotFoundError:
        return True, None   # gofmt not installed — skip
    except Exception:
        return True, None   # timeout or other error — don't block


def check_css_syntax(code: str) -> tuple[bool, str | None]:
    """Basic CSS brace-balance check (no external tool required)."""
    try:
        open_count  = code.count("{")
        close_count = code.count("}")
        if open_count != close_count:
            return False, f"CSS brace mismatch: {open_count} '{{' vs {close_count} '}}'"
        return True, None
    except Exception:
        return True, None


# ===========================================================================
# CONSENSUS
# ===========================================================================

def confidence_weighted_consensus(results: list[tuple[str, float]]) -> str:
    if len(results) == 1:
        return results[0][0]
    split   = [(t.splitlines(), c) for t, c in results]
    max_len = max(len(s) for s, _ in split)
    out     = []
    for i in range(max_len):
        tally: dict[str, float] = {}
        for lines, conf in split:
            if i < len(lines):
                tally[lines[i]] = tally.get(lines[i], 0.0) + conf
        if tally:
            out.append(max(tally, key=tally.get))
    return "\n".join(out)


def _majority_consensus(texts: list[str]) -> str:
    # B-4 FIX: Counter.most_common(1) on an empty Counter returns [] which caused
    # IndexError via [0][0].  Now guarded - empty line positions are skipped.
    if len(texts) == 1:
        return texts[0]
    split   = [t.splitlines() for t in texts]
    max_len = max((len(s) for s in split), default=0)
    result  = []
    for i in range(max_len):
        top = Counter(s[i] for s in split if i < len(s)).most_common(1)
        if top:
            result.append(top[0][0])
    return "\n".join(result)


# ===========================================================================
# INDENTATION RECONSTRUCTION
# ===========================================================================

def reconstruct_indentation(text: str, img_np: np.ndarray) -> str:
    # B-3 FIX: added early-out when band height < 5 px - at that resolution the
    # per-band pixel measurement is dominated by noise and the indentation
    # recovered would be garbage.
    lines = text.splitlines()
    if not lines:
        return text
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    if gray.mean() < 127:
        gray = cv2.bitwise_not(gray)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    h, w = binary.shape
    n    = len(lines)
    bh   = max(1, h // n)
    # B-3 FIX: too-narrow bands give unreliable results - bail out
    if bh < 5:
        return text
    mid       = binary[h // 2, :]
    runs, run = [], 0
    for px in mid:
        if px > 0:
            run += 1
        elif run > 0:
            runs.append(run)
            run = 0
    char_w  = max(4, int(np.median(runs))) if runs else 8
    first_x = []
    for i in range(n):
        band = binary[i * bh: min((i + 1) * bh, h), :]
        cols = np.where(band.sum(axis=0) > 0)[0]
        first_x.append(int(cols[0]) if len(cols) else 0)
    min_x  = min(first_x) if first_x else 0
    result = []
    for i, line in enumerate(lines):
        stripped = line.lstrip()
        if not stripped:
            result.append("")
            continue
        offset = first_x[i] - min_x if i < len(first_x) else 0
        spaces = max(0, round(offset / char_w))
        result.append(" " * spaces + stripped)
    return "\n".join(result)


# ===========================================================================
# LANGUAGE DETECTION
# ===========================================================================

_LANG_PAT: dict[str, list[str]] = {
    "python":     [r"\bdef\s+\w+\s*\(", r"\bimport\s+\w", r"\bclass\s+\w+[\s:(]",
                   r":\s*(?:#.*)?$"],
    "javascript": [r"\bconst\b", r"\blet\b", r"\bfunction\s+\w", r"=>",
                   r"console\."],
    "typescript": [r":\s*string\b", r":\s*number\b", r"\binterface\s+\w",
                   r"\btype\s+\w+="],
    "java":       [r"\bpublic\s+class\b", r"\bSystem\.out\.", r"@Override",
                   r"\bvoid\s+\w"],
    "cpp":        [r"#include\s*[<\"]", r"\bstd::", r"\bint\s+main\s*\(",
                   r"cout\s*<<"],
    "go":         [r"\bfunc\s+\w", r"\bpackage\s+\w", r":=", r"\bfmt\."],
    "rust":       [r"\bfn\s+\w", r"\blet\s+mut\b", r"\buse\s+std", r"println!"],
    "swift":      [r"\bfunc\s+\w", r"\bguard\b", r"\bvar\s+\w", r"\bSwift\b"],
    "kotlin":     [r"\bfun\s+\w", r"\bval\s+\w", r"\bdata\s+class\b",
                   r"println\("],
    "ruby":       [r"\bdef\s+\w", r"\bend\b", r"\bputs\b", r"\brequire\b"],
    "php":        [r"<\?php", r"\$\w+\s*=", r"\becho\b"],
    "sql":        [r"\bSELECT\b", r"\bFROM\b", r"\bWHERE\b", r"\bINSERT\b"],
    "css":        [r"\{[^}]*\}", r":\s*\w+;", r"#\w+\s*\{", r"\.\w+\s*\{"],
    "html":       [r"<html", r"<div", r"</\w+>", r"<!DOCTYPE"],
    "react":      [r"\buseState\b", r"\buseEffect\b", r"React\.FC\b",
                   r"<[A-Z]\w+[\s/>]", r"\bJSX\b", r"\.tsx?\b"],
    "nestjs":     [r"@Controller\(", r"@Injectable\(", r"@Module\(",
                   r"@Get\(", r"@Post\(", r"@Put\(", r"@Delete\("],
    "nextjs":     [r"\bgetServerSideProps\b", r"\bgetStaticProps\b",
                   r"\bgetStaticPaths\b", r"\bNextPage\b", r"next/router"],
}


def detect_language(text: str) -> str:
    scores = {
        lang: sum(bool(re.search(p, text, re.MULTILINE)) for p in pats)
        for lang, pats in _LANG_PAT.items()
    }
    best = max(scores.values(), default=0)
    return max(scores, key=scores.get) if best > 0 else "unknown"


def check_python_syntax(text: str) -> tuple[bool, str | None]:
    try:
        _ast_mod.parse(text)
        return True, None
    except SyntaxError as e:
        return False, f"Line {e.lineno}: {e.msg}"


# ===========================================================================
# POST-PROCESSING
# ===========================================================================

# Comprehensive OCR correction patterns for Python / JavaScript / HTML / React / NestJS / NextJS
# Tuples of (pattern, replacement) — patterns starting with r"\b" or "(?<" use re.sub
_FIXES: list[tuple[str, str]] = [
    # Unicode curly quotes / dashes Tesseract sometimes outputs
    ("\u2019", "'"), ("\u2018", "'"), ("\u201c", '"'), ("\u201d", '"'),
    ("\u2013", "-"), ("\u2014", "-"), ("\u2022", "*"), ("\u00b7", "."),
    ("\u00b4", "'"), ("\u0060", "`"),
    # Digit/letter confusion in numeric context
    (r"(?<=[0-9])O(?=[0-9])", "0"),
    (r"(?<=[0-9])l(?=[0-9])",  "1"),
    (r"(?<=[0-9])I(?=[0-9])",  "1"),
    # Punctuation artefacts
    (";;", ";"), ("..,", ","), ("--", "-"),
    # Spaced operators
    (r" = =",  " =="), (r"! =", "!="), (r"< =", "<="), (r"> =", ">="),
    (r"= >",   "=>"),  (r"- >", "->"),  (r"\+ =", "+="), (r"- =", "-="),
    (r"\* =",  "*="),  (r"/ =", "/="),
    # === Python keyword misreads ===
    (r"\bFaise\b", "False"), (r"\bfaise\b", "false"), (r"\bTirue\b", "True"),
    (r"\bNuii\b",  "None"),  (r"\bNuIl\b",  "None"),  (r"\bnuii\b", "null"),
    (r"\bNone\b",  "None"),  (r"\bnuI1\b",  "null"),
    (r"\bpnnt\b",  "print"), (r"\bprlnt\b", "print"), (r"\bprnt\b", "print"),
    (r"\bprlnt\b", "print"), (r"\bpnint\b", "print"),
    (r"\bimpprt\b","import"), (r"\bimrport\b","import"), (r"\biimport\b","import"),
    (r"\bfrom\b",  "from"),  (r"\bFrom\b",  "from"),
    (r"\bdetf\b",  "def"),   (r"\bde f\b",  "def"),   (r"\bd ef\b", "def"),
    (r"\bcllass\b","class"),  (r"\bcIass\b", "class"), (r"\bc1ass\b","class"),
    (r"\bseTf\b",  "self"),  (r"\bs elf\b",  "self"),  (r"\bselt\b", "self"),
    (r"\bretum\b", "return"), (r"\brreturn\b","return"),(r"\breturm\b","return"),
    (r"\bwith\b",  "with"),  (r"\byieid\b",  "yield"), (r"\byield\b","yield"),
    (r"\braise\b", "raise"), (r"\bexcept\b", "except"),(r"\bfinally\b","finally"),
    (r"\bLambda\b","lambda"), (r"\bglobal\b","global"), (r"\bpass\b", "pass"),
    (r"\bbreak\b", "break"), (r"\bcontinue\b","continue"),
    (r"\bdel\b",   "del"),   (r"\basse rt\b","assert"),
    (r"\bEiif\b",  "elif"),  (r"\beliif\b",  "elif"),
    (r"\beLse\b",  "else"),  (r"\be1se\b",   "else"),
    (r"\btrye\b",  "try"),
    (r"\bfor\b",   "for"),   (r"\bwhi1e\b",  "while"),
    (r"\basnc\b",  "async"), (r"\bawalt\b",  "await"),
    # === JS / TS keyword misreads ===
    (r"\bconsst\b", "const"), (r"\bcosnt\b",  "const"), (r"\bconst\b","const"),
    (r"\bfumction\b","function"),(r"\bfuncion\b","function"),(r"\bfunct1on\b","function"),
    (r"\bvar\b",   "var"),   (r"\blet\b",    "let"),
    (r"\basync\b", "async"), (r"\bawait\b",  "await"),
    (r"\bconsole\b","console"),(r"\bconso1e\b","console"),
    (r"\bexporrt\b","export"),(r"\bexoprt\b", "export"), (r"\bimprot\b","import"),
    (r"\brequire\b","require"),(r"\bnuil\b",  "null"),
    (r"\bundefined\b","undefined"),(r"\bprototype\b","prototype"),
    (r"\btypeof\b","typeof"), (r"\binstanceof\b","instanceof"),
    (r"\bthis\b",  "this"),  (r"\bnew\b",    "new"),
    (r"\bclass\b", "class"), (r"\bextends\b","extends"),(r"\bsuper\b","super"),
    (r"\bstatic\b","static"),(r"\bpublic\b", "public"), (r"\bprivate\b","private"),
    (r"\breadonly\b","readonly"),(r"\binterface\b","interface"),
    # === HTML / JSX misreads ===
    (r"</ ",  "</"),  (r"< /",  "</"),
    (r"c1assName", "className"), (r"c1ass=", "class="),
    (r"href =", "href="), (r"src =", "src="), (r"id =", "id="),
    # === NestJS decorator misreads ===
    (r"@Contr0ller", "@Controller"), (r"@lnjectable", "@Injectable"),
    (r"@Serv1ce", "@Service"), (r"@Moduie", "@Module"),
    (r"@G et\b", "@Get"), (r"@P ost\b", "@Post"),
    # === NextJS function misreads ===
    (r"\bgetServerSidePr0ps\b", "getServerSideProps"),
    (r"\bgetStaticPr0ps\b", "getStaticProps"),
    (r"\bgetStaticPaths\b", "getStaticPaths"),
    # === Additional Python keyword misreads ===
    (r"\bpnint\b",  "print"), (r"\bprin t\b", "print"),
    (r"\bprintt\b", "print"), (r"\bprintl\b", "print"),
    (r"\biimport\b","import"),(r"\bimpor t\b","import"),
    (r"\bde1\b",    "del"),   (r"\basse\b",   "assert"),
    (r"\bEIif\b",   "elif"),  (r"\bElif\b",   "elif"),
    (r"\beLif\b",   "elif"),
    (r"\bexcep t\b","except"),(r"\bfinall y\b","finally"),
    (r"\bwhi le\b", "while"), (r"\bfo r\b",   "for"),
    (r"\bTr ue\b",  "True"),  (r"\bFa lse\b", "False"),
    (r"\bNon e\b",  "None"),  (r"\bNuI1\b",   "None"),
    (r"\byie1d\b",  "yield"), (r"\byieid\b",  "yield"),
    (r"\basse rt\b","assert"),
    (r"\blambda\b", "lambda"),(r"\bLambda\b", "lambda"),
    (r"\bnot in\b", "not in"),(r"\bis not\b", "is not"),
    # === Additional JS/TS misreads ===
    (r"\bconsole\.1og\b",    "console.log"),
    (r"\bconsole\.Iog\b",    "console.log"),
    (r"\bconsole\.l0g\b",    "console.log"),
    (r"\bconsole\.err0r\b",  "console.error"),
    (r"\bconsoIe\b",         "console"),
    (r"\bfunct ion\b",       "function"),
    (r"\bprot0type\b",       "prototype"),
    (r"\bpromis e\b",        "promise"),
    (r"\bPromis e\b",        "Promise"),
    (r"\bfetch\b",           "fetch"),
    (r"\bthen\b",            "then"),
    (r"\bcatch\b",           "catch"),
    (r"\bfina11y\b",         "finally"),
    (r"\bObj ect\b",         "Object"),
    (r"\bArr ay\b",          "Array"),
    (r"\bMap\b",             "Map"),
    (r"\bSet\b",             "Set"),
    (r"\bJSON\b",            "JSON"),
    (r"\bJSON\.pars e\b",    "JSON.parse"),
    (r"\bJSON\.stringif y\b","JSON.stringify"),
    (r"\bMath\b",            "Math"),
    (r"\bdocument\b",        "document"),
    (r"\bwindow\b",          "window"),
    (r"\baddEventListener\b","addEventListener"),
    (r"\bquerySe1ector\b",   "querySelector"),
    (r"\bquerySelectorAl1\b","querySelectorAll"),
    (r"\bgetE1ementById\b",  "getElementById"),
    (r"\binnerHTMl\b",       "innerHTML"),
    (r"\binnerText\b",       "innerText"),
    (r"\btextContent\b",     "textContent"),
    # === React/hooks misreads ===
    (r"\buseState\b",        "useState"),
    (r"\buseEf fect\b",      "useEffect"),
    (r"\buseRef\b",          "useRef"),
    (r"\buseMemo\b",         "useMemo"),
    (r"\buseCallback\b",     "useCallback"),
    (r"\buseContext\b",      "useContext"),
    (r"\buseReducer\b",      "useReducer"),
    (r"\bReact\b",           "React"),
    (r"\bclassName\b",       "className"),
    (r"\bc1assName\b",       "className"),
    # === Common OCR symbol confusions in code ===
    # Spacing around → that should be -> or =>
    (r"\s+->\s+", " -> "), (r"\s+=>\s+", " => "),

    # === Java OCR fixes ===
    (r"\bpubl1c\b",                  "public"),
    (r"\bpr1vate\b",                 "private"),
    (r"\bpr0tected\b",               "protected"),
    (r"\bSt r1ng\b",                 "String"),
    (r"\bStr1ng\b",                  "String"),
    (r"\b@0verride\b",               "@Override"),
    (r"\b@0verr1de\b",               "@Override"),
    (r"\bSystem\.out\.pr1ntln\b",    "System.out.println"),
    (r"\bSystem\.out\.pr1nt\b",      "System.out.print"),
    (r"\bpubl1c\s+stat1c\b",         "public static"),
    (r"\bstat1c\b",                  "static"),
    (r"\bvo1d\b",                    "void"),
    (r"\bfina1\b",                   "final"),
    (r"\binterface\b",               "interface"),
    (r"\bimpl ements\b",             "implements"),
    (r"\bextends\b",                 "extends"),
    (r"\bthrows\b",                  "throws"),
    (r"\bnew\s+([A-Z])",             r"new \1"),
    (r"\bnu11\b",                    "null"),
    (r"\bfa1se\b",                   "false"),

    # === C++ OCR fixes ===
    (r"\bnu11ptr\b",                 "nullptr"),
    (r"\b#inc1ude\b",                "#include"),
    (r"\b#inc1ude\b",                "#include"),
    (r"\bc0ut\b",                    "cout"),
    (r"\bc1n\b",                     "cin"),
    (r"\bstd;:",                     "std::"),
    (r"\bstd ::",                    "std::"),
    (r"\bvecto r\b",                 "vector"),
    (r"\bstr1ng\b",                  "string"),
    (r"\bpr1ntf\b",                  "printf"),
    (r"\bscanf\b",                   "scanf"),
    (r"\bma1n\b",                    "main"),
    (r"\bconst\b",                   "const"),
    (r"\breturn\b",                  "return"),
    (r"\btempl ate\b",               "template"),
    (r"\bnamespace\b",               "namespace"),
    (r"\bcl ass\b",                  "class"),
    (r"\bpubl1c:",                   "public:"),
    (r"\bpr1vate:",                  "private:"),
    (r"\bvirtua1\b",                 "virtual"),
    (r"\boverr1de\b",                "override"),
    (r"\b->\s*",                     "->"),

    # === Go OCR fixes ===
    (r"\bpackaqe\b",                 "package"),
    (r"\bfmt\.Pr1ntln\b",            "fmt.Println"),
    (r"\bfmt\.Pr1ntf\b",             "fmt.Printf"),
    (r"\bfmt\.Pr1nt\b",              "fmt.Print"),
    (r"\bgorout1ne\b",               "goroutine"),
    (r"\bgorout ine\b",              "goroutine"),
    (r"\bfunc\s+ma1n\b",             "func main"),
    (r"\bvar\s+",                    "var "),
    (r"\b:=\s*",                     ":= "),
    (r"\bimpo rt\b",                 "import"),
    (r"\bstruct\s*\{",               "struct {"),  # normalize brace spacing
    (r"\binterface\b",               "interface"),
    (r"\brange\b",                   "range"),
    (r"\bdefer\b",                   "defer"),
    (r"\bse1ect\b",                  "select"),
    (r"\bchan\b",                    "chan"),
    (r"\bni1\b",                     "nil"),
    (r"\berr0r\b",                   "error"),

    # === SQL OCR fixes ===
    (r"\bVVHERE\b",                  "WHERE"),
    (r"\bWHE RE\b",                  "WHERE"),
    (r"\bFR0M\b",                    "FROM"),
    (r"\bFR OM\b",                   "FROM"),
    (r"\bJ0IN\b",                    "JOIN"),
    (r"\bJO1N\b",                    "JOIN"),
    (r"\bNU11\b",                    "NULL"),
    (r"\bNU1L\b",                    "NULL"),
    (r"\bPR1MARY\b",                 "PRIMARY"),
    (r"\bSELECT\b",                  "SELECT"),
    (r"\bINSERT\b",                  "INSERT"),
    (r"\bUPDATE\b",                  "UPDATE"),
    (r"\bDELETE\b",                  "DELETE"),
    (r"\bCREATE\b",                  "CREATE"),
    (r"\bALTER\b",                   "ALTER"),
    (r"\bDROP\b",                    "DROP"),
    (r"\bINDEX\b",                   "INDEX"),
    (r"\bGROUP\s+BY\b",              "GROUP BY"),
    (r"\bORDER\s+BY\b",              "ORDER BY"),
    (r"\bHAV1NG\b",                  "HAVING"),
    (r"\bUNI0N\b",                   "UNION"),
    (r"\bINTERSECT\b",               "INTERSECT"),
    (r"\bEXCEPT\b",                  "EXCEPT"),
    (r"\bDISTINCT\b",                "DISTINCT"),
    (r"\bCOUNT\b",                   "COUNT"),
    (r"\bSUM\b",                     "SUM"),
    (r"\bAVG\b",                     "AVG"),
    (r"\bMAX\b",                     "MAX"),
    (r"\bMIN\b",                     "MIN"),
    (r"\bVARCHAR\b",                 "VARCHAR"),
    (r"\bINTEGER\b",                 "INTEGER"),
    (r"\bB00LEAN\b",                 "BOOLEAN"),

    # === CSS OCR fixes ===
    (r"\bco1or\b",                   "color"),
    (r"\bc0lor\b",                   "color"),
    (r"\bmarg1n\b",                  "margin"),
    (r"\bpadd1ng\b",                 "padding"),
    (r"\bb0rder\b",                  "border"),
    (r"\bd1splay\b",                 "display"),
    (r"\bfont-s1ze\b",               "font-size"),
    (r"\bfont-we1ght\b",             "font-weight"),
    (r"\bbackgr0und\b",              "background"),
    (r"\bpos1tion\b",                "position"),
    (r"\bwldth\b",                   "width"),
    (r"\bhe1ght\b",                  "height"),
    (r"\bf1ex\b",                    "flex"),
    (r"\bfl ex\b",                   "flex"),
    (r"\bgr1d\b",                    "grid"),
    (r"\bover flow\b",               "overflow"),
    (r"\btransit1on\b",              "transition"),
    (r"\bopac1ty\b",                 "opacity"),
    (r"\bvisib1lity\b",              "visibility"),
    (r"\bcurs0r\b",                  "cursor"),
    (r"\bz-1ndex\b",                 "z-index"),
    (r"\btransf0rm\b",               "transform"),
    (r"\banimati0n\b",               "animation"),
    (r"\bborder-rad1us\b",           "border-radius"),
    (r"\bbox-shad0w\b",              "box-shadow"),
    (r"\btex t-align\b",             "text-align"),
    (r"\bflex-d1rection\b",          "flex-direction"),
    (r"\balign-1tems\b",             "align-items"),
    (r"\bjustify-c0ntent\b",         "justify-content"),
]


def fix_code_symbols(text: str) -> str:
    for pat, rep in _FIXES:
        try:
            if pat.startswith(r"\b") or pat.startswith("(?") or pat.startswith(r" "):
                text = re.sub(pat, rep, text)
            else:
                text = text.replace(pat, rep)
        except re.error:
            pass
    return text


# ===========================================================================
# LLM HELPERS
# ===========================================================================

def _active_model() -> str:
    return LLM_MODELS.get(llm_model_key, LLM_MODELS["haiku"])


def llm_correct_code(text: str, language: str, line_confs: list[float] | None = None) -> str:
    """Correct OCR'd code using Claude.

    #1  Uses strict production-grade prompt.
    #2  When line_confs is provided, only lines below _LINE_CONF_THRESH (and their
        2-line context) are sent to Claude — preserving high-confidence lines
        untouched and saving tokens.
    #7  Normalises tabs to 4 spaces before sending.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not (HAS_ANTHROPIC and api_key):
        return text

    # #7 — Tab normalisation
    text = text.replace("\t", "    ")
    lines = text.splitlines()
    if not lines:
        return text

    lang_hints = {
        "python": (
            "Python 3. "
            "Indentation MUST be exact multiples of 4 spaces — this is syntax, not style. "
            "Every def/class/if/elif/else/for/while/try/except/with header MUST end with `:`. "
            "Keywords: def, class, return, import, from, if, elif, else, for, while, "
            "try, except, finally, with, as, yield, lambda, pass, break, continue, "
            "raise, del, assert, and, or, not, in, is, None, True, False, global, nonlocal. "
            "Common misreads: `l`→`1` inside numbers, `O`→`0` in numeric literals, "
            "`detf`→`def`, `c1ass`/`cIass`→`class`, `pnnt`/`prlnt`→`print`, "
            "`retum`/`returm`→`return`, `se1f`/`seTf`→`self`, `e1se`→`else`, "
            "`e1if`→`elif`, `Fa1se`/`Faise`→`False`, `Nuii`/`NuIl`→`None`."
        ),
        "javascript": (
            "JavaScript ES6+. "
            "Keywords: const, let, var, function, class, return, if, else, for, while, "
            "do, switch, case, break, continue, try, catch, finally, throw, new, delete, "
            "typeof, instanceof, in, of, async, await, import, export, default, "
            "null, undefined, true, false, this, super, static, extends. "
            "Arrow functions use `=>`. Template literals use backtick `. "
            "Common misreads: `const`←`cosnt`/`conts`, `function`←`fumction`/`funct1on`, "
            "`console`←`conso1e`, `return`←`retum`, backtick ` vs quote '. "
            "Preserve semicolons exactly as shown."
        ),
        "typescript": (
            "TypeScript. Same as JavaScript plus type annotations: `: string`, `: number`, "
            "`: boolean`, `: any`, `: void`, generics `<T>`, `interface Foo {}`, `type X = ...`. "
            "Decorators: @decorator. Keep all type syntax intact."
        ),
        "html": (
            "HTML5. Attribute names lowercase. `className` for JSX, `class` for plain HTML. "
            "Self-closing: `<br />`, `<img />`. Entities: `&amp;`, `&lt;`, `&gt;`."
        ),
        "react": (
            "React JSX/TSX. Uppercase component names. Hooks: useState, useEffect, useRef, "
            "useMemo, useCallback, useContext, useReducer — preserve exactly. "
            "JSX expressions in `{...}`. className not class. Self-closing tags `<Comp />`. "
            "Arrow function components: `const Foo = () => { ... }`."
        ),
        "nestjs": (
            "NestJS TypeScript. Decorators are critical — preserve the `@` symbol and exact name: "
            "@Controller, @Injectable, @Module, @Get, @Post, @Put, @Delete, @Patch, "
            "@Body, @Param, @Query, @Headers, @UseGuards, @UsePipes. "
            "Class-based with constructor injection."
        ),
        "nextjs": (
            "Next.js React. Special exports: getServerSideProps, getStaticProps, getStaticPaths. "
            "Types: NextPage, GetServerSideProps, GetStaticProps. "
            "Hooks: useRouter from 'next/router'. Same React rules apply."
        ),
        "java": (
            "Java source code. Preserve annotations (@Override, @Autowired, @Component, @Service). "
            "Keywords: public, private, protected, static, final, void, class, interface, extends, implements, throws. "
            "Types: String (capital S), Integer, Boolean, List<>, Map<>, Optional<>. "
            "Common OCR errors: l→1 in identifiers, O→0 in numbers, null/true/false misread."
        ),
        "cpp": (
            "C++ source code. Preserve #include directives and namespace declarations. "
            "Keywords: nullptr, const, virtual, override, template, namespace, class, struct. "
            "std:: prefix is critical — never omit it. "
            "Common OCR errors: l→1, 0→O, cout/cin misread, :: read as ;: or : :."
        ),
        "go": (
            "Go (Golang) source code. Preserve package declaration and import block. "
            "Keywords: func, var, const, type, struct, interface, goroutine, chan, defer, select, range, nil, error. "
            "Short variable declaration := is critical. "
            "Common OCR errors: package→packaqe, goroutine→gorout1ne, fmt.Println misread."
        ),
        "sql": (
            "SQL query or DDL. Keywords are usually UPPERCASE: SELECT, FROM, WHERE, JOIN, GROUP BY, ORDER BY, "
            "HAVING, INSERT INTO, UPDATE, DELETE, CREATE TABLE, ALTER TABLE, DROP. "
            "Common OCR errors: WHERE→VVHERE, FROM→FR0M, JOIN→J0IN, NULL→NU11, PRIMARY→PR1MARY. "
            "Preserve quoted string literals exactly."
        ),
        "css": (
            "CSS stylesheet. Preserve selectors, property names, and values exactly. "
            "Properties: color, background, margin, padding, border, display, flex, grid, "
            "font-size, font-weight, position, width, height, overflow, transition, transform, opacity. "
            "Common OCR errors: color→co1or, margin→marg1n, border→b0rder, display→d1splay, "
            "px/em/rem values misread, # hex colors corrupted."
        ),
    }
    hint      = lang_hints.get(language, "")
    lang_line = f"Language: {language}. {hint}" if hint else f"Language: {language}."

    # #1 — Strict production-grade prompt builder
    def _prompt(snippet: str) -> str:
        return (
            "You are an expert software engineer specializing in OCR error correction.\n"
            "The following text was extracted via OCR from a code screenshot and contains errors.\n\n"
            f"{lang_line}\n\n"
            "Your job (in priority order):\n"
            "1. Fix ALL OCR character misreads: l→1 or 1→l, O→0 or 0→O, |→I or I→l, "
            "rn→m, `→', ;→:, missing dots/colons/semicolons\n"
            "2. Fix ALL syntax errors caused by the above misreads\n"
            "3. Restore proper indentation EXACTLY (Python: 4 spaces per level)\n"
            "4. Preserve EVERY line — do NOT add, remove, or reorder lines\n"
            "5. Preserve ALL variable names, function names, string contents exactly\n"
            "6. Remove stray garbage characters that are clearly OCR noise (e.g. lone `|` or `.` on a line by itself)\n"
            "7. Ensure the output is valid, executable code\n\n"
            "Strict rules:\n"
            "- Do NOT explain anything\n"
            "- Do NOT add docstrings or comments not present in the original\n"
            "- Do NOT change logic, algorithm, or structure\n"
            "- Output ONLY the corrected code — nothing else\n\n"
            f"OCR INPUT:\n{snippet}"
        )

    try:
        client = _make_anthropic_client(api_key)

        # #2 — Confidence-based line filtering
        if line_confs is not None and len(line_confs) > 0:
            # Only use filtering if line counts are close (within 20% or 3 lines)
            if abs(len(lines) - len(line_confs)) <= max(3, len(lines) // 5):
                # Pad / trim to match line count (missing lines assumed weak = 0.0)
                padded = (list(line_confs) + [0.0] * len(lines))[:len(lines)]

                # Mark each line: weak = needs Claude, strong = keep as-is
                # Expand each weak line to include 2 lines of context
                send = [False] * len(lines)
                for i, c in enumerate(padded):
                    if c < _LINE_CONF_THRESH:
                        for j in range(max(0, i - 2), min(len(lines), i + 3)):
                            send[j] = True

                n_send = sum(send)
                # If >70% of lines are weak, skip filtering and send everything
                if 0 < n_send < len(lines) * 0.70:
                    # Build contiguous chunks of lines to fix
                    chunks: list[tuple[int, int]] = []
                    i = 0
                    while i < len(lines):
                        if send[i]:
                            j = i
                            while j < len(lines) and send[j]:
                                j += 1
                            chunks.append((i, j - 1))
                            i = j
                        else:
                            i += 1

                    result = list(lines)
                    for start, end in chunks:
                        snippet  = "\n".join(lines[start : end + 1])
                        max_toks = max(256, (end - start + 1) * 50)
                        resp     = client.messages.create(
                            model=_active_model(),
                            max_tokens=max_toks,
                            messages=[{"role": "user", "content": _prompt(snippet)}],
                        )
                        fixed = resp.content[0].text.strip().splitlines()
                        result[start : end + 1] = fixed
                    return "\n".join(result)

        # Fallback: send full text to Claude
        resp = client.messages.create(
            model=_active_model(),
            max_tokens=4096,
            messages=[{"role": "user", "content": _prompt(text)}],
        )
        return resp.content[0].text.strip()

    except Exception:
        return text


def llm_repair_syntax(text: str, error_line: int, error_msg: str) -> str:
    """Targeted repair - sends only error line +/- 2 context lines (~5x cheaper)."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not (HAS_ANTHROPIC and api_key):
        return text
    lines = text.splitlines()
    if not lines or error_line < 1 or error_line > len(lines):
        return text
    ctx_start = max(0, error_line - 3)
    ctx_end   = min(len(lines), error_line + 2)
    ctx_lines = lines[ctx_start:ctx_end]
    err_idx   = error_line - 1 - ctx_start
    try:
        client = _make_anthropic_client(api_key)
        resp   = client.messages.create(
            model=_active_model(),
            max_tokens=256,
            messages=[{"role": "user", "content": (
                f"Fix the Python syntax error on line {err_idx + 1} of this snippet.\n"
                f"Syntax error: {error_msg}\n"
                f"Likely cause: misread character (l/1/I, 0/O, brackets).\n"
                f"Return ONLY the corrected snippet - same number of lines, "
                f"no markdown fences.\n\n"
                + "\n".join(ctx_lines)
            )}],
        )
        fixed  = resp.content[0].text.strip().splitlines()
        result = lines[:ctx_start] + fixed + lines[ctx_end:]
        return "\n".join(result)
    except Exception:
        return text


def llm_repair_js_syntax(text: str, error_msg: str, language: str = "javascript") -> str:
    """Second-pass Claude call to fix JS/TS syntax errors caught by Node.js vm.Script."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not (HAS_ANTHROPIC and api_key):
        return text
    lang_note = {
        "typescript": "TypeScript — keep type annotations, generics, interfaces intact.",
        "react":      "React JSX/TSX — preserve JSX tags and component syntax.",
        "nestjs":     "NestJS TypeScript — keep all decorator syntax (@Controller etc.).",
        "nextjs":     "Next.js React — keep getServerSideProps / getStaticProps etc.",
    }.get(language, "JavaScript ES6+.")
    try:
        client = _make_anthropic_client(api_key)
        resp   = client.messages.create(
            model=_active_model(),
            max_tokens=4096,
            messages=[{"role": "user", "content": (
                f"Fix the syntax error in this {language} code.\n"
                f"Language note: {lang_note}\n"
                f"Syntax error: {error_msg}\n"
                "The error is likely caused by OCR misreads (l/1/I, 0/O, |/I, rn/m, ' misread as `).\n"
                "Return ONLY the corrected code — no markdown fences, no explanation.\n\n"
                + text
            )}],
        )
        return resp.content[0].text.strip()
    except Exception:
        return text


def llm_repair_syntax_generic(text: str, error_msg: str, language: str) -> str:
    """Generic Claude syntax repair for Go, CSS, Java, C++, SQL, or any language
    that doesn't have a dedicated checker/repair function."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not (HAS_ANTHROPIC and api_key):
        return text
    try:
        client = anthropic.Anthropic(api_key=api_key)
        resp   = client.messages.create(
            model      = _active_model(),
            max_tokens = 4096,
            messages   = [{"role": "user", "content": (
                f"Fix the syntax error in this {language} code.\n"
                f"Syntax error: {error_msg}\n"
                "The error is likely caused by OCR misreads (l/1/I, 0/O, |/I, rn/m, ` misread as ').\n"
                "Return ONLY the corrected code — no markdown fences, no explanation.\n\n"
                + text
            )}],
        )
        raw = resp.content[0].text.strip()
        # Strip markdown fences if model added them
        if raw.startswith("```"):
            lines = raw.splitlines()
            raw   = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        return raw
    except Exception:
        return text


def llm_fix_full_file(content: str, lang: str, model_key: str | None = None) -> str:
    """Fix an entire bulk-session file captured across multiple OCR passes.

    Uses max_tokens=8192 to handle a full file without truncation.
    model_key: "haiku" | "sonnet" | None (None → use the global llm_model_key).
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not (HAS_ANTHROPIC and api_key):
        return content
    # Per-language extra guidance injected into the session-level fix prompt
    _lang_extra: dict[str, str] = {
        "python": (
            "Indentation: 4 spaces per level (tabs → spaces). "
            "Fix: def/class colon missing, misread keywords (def→oef, self→se1f, None→N0ne). "
            "Preserve decorators (@) exactly."
        ),
        "javascript": (
            "Preserve: const/let/var, arrow functions =>, template literals ``, "
            "destructuring {}, optional chaining ?.. "
            "Fix: console.log misreads, missing semicolons only if clearly OCR-dropped."
        ),
        "typescript": (
            "Preserve type annotations (:string, :number, :boolean, interface, type alias). "
            "Fix: generic brackets <T> misread as comparison operators. "
            "Same JS rules apply."
        ),
        "java": (
            "Preserve ALL annotations exactly: @Override, @Autowired, @Component, @Service, @Repository, "
            "@Controller, @RequestMapping, @Getter, @Setter. "
            "String type has capital S. Fix: publ1c→public, Str1ng→String, "
            "System.out.pr1ntln→System.out.println, nu11→null. "
            "Indentation: 4 spaces."
        ),
        "cpp": (
            "The std:: prefix is critical — fix ;: or : : back to ::. "
            "Fix: nu11ptr→nullptr, #inc1ude→#include, c0ut→cout, c1n→cin. "
            "Preserve template<>, operator overloads, and pointer/reference syntax (* and &). "
            "Indentation: 4 spaces."
        ),
        "go": (
            "Short variable declaration := must be preserved — do NOT change to =. "
            "Fix: packaqe→package, gorout1ne→goroutine, fmt.Pr1ntln→fmt.Println, ni1→nil, err0r→error. "
            "The package declaration must be on the first non-comment line. "
            "Import paths are double-quoted strings. "
            "Indentation: tabs (Go standard)."
        ),
        "rust": (
            "Fix: fn/let mut/use std misreads, println! macro, lifetime annotations &'a. "
            "Preserve ownership operators (& and *). "
            "Indentation: 4 spaces."
        ),
        "sql": (
            "SQL keywords should be UPPERCASE: SELECT, FROM, WHERE, JOIN, ON, GROUP BY, ORDER BY, "
            "HAVING, INSERT INTO, VALUES, UPDATE, SET, DELETE, CREATE, ALTER, DROP. "
            "Fix: VVHERE→WHERE, FR0M→FROM, J0IN→JOIN, NU11→NULL, PR1MARY→PRIMARY. "
            "Preserve quoted string literals and numeric literals exactly. "
            "Fix unmatched parentheses in subqueries."
        ),
        "css": (
            "Every rule block must have matching { and }. "
            "Property names are lowercase-hyphenated: color, background-color, font-size, "
            "margin, padding, border, display, flex, grid. "
            "Fix: co1or→color, marg1n→margin, b0rder→border, d1splay→display. "
            "Hex colors: #rrggbb or #rgb — fix digit/letter confusion. "
            "Values end with ; inside blocks."
        ),
        "html": (
            "Fix: unclosed tags, misread < as ( or >, attribute = sign missing. "
            "Preserve all class/id/data-* attribute values exactly. "
            "Do NOT reformat or reindent; preserve existing structure."
        ),
        "react": (
            "JSX rules: self-closing tags need />, className not class, "
            "event handlers camelCase (onClick, onChange). "
            "Fix: useS tate→useState, useEf fect→useEffect, c1assName→className. "
            "Same TypeScript rules apply for .tsx files."
        ),
        "nestjs": (
            "Decorators are load-bearing: @Controller, @Injectable, @Module, @Get, @Post, "
            "@Put, @Delete, @Body, @Param, @Query, @UseGuards — fix any @ corruption. "
            "Same TypeScript rules apply."
        ),
        "nextjs": (
            "Fix getServerSideProps, getStaticProps, getStaticPaths misreads. "
            "Same React/TypeScript rules apply."
        ),
    }
    _extra = _lang_extra.get(lang, f"Fix all OCR misreads typical for {lang} code.")

    try:
        client = _make_anthropic_client(api_key)
        prompt = (
            f"You are correcting a complete {lang.upper()} source file assembled from "
            "multiple OCR captures via a phone camera.\n\n"
            "The file may contain:\n"
            "  - OCR character misreads: l↔1↔I, 0↔O, rn↔m, |↔l, `↔', ;↔:\n"
            "  - Missing or extra punctuation (colons, brackets, semicolons, braces)\n"
            "  - Broken indentation from line-joining errors\n"
            "  - Minor syntax errors introduced by the camera pipeline\n\n"
            f"Language-specific guidance for {lang.upper()}:\n{_extra}\n\n"
            "Rules — follow every rule without exception:\n"
            "1. Fix ALL OCR misreads and resulting syntax/indentation errors\n"
            "2. Ensure consistent indentation throughout (language standard)\n"
            "3. Do NOT add, remove, or reorder any logical blocks or functions\n"
            "4. Do NOT add comments, docstrings, or imports not present in the original\n"
            "5. Do NOT change variable names, function names, class names, or logic\n"
            "6. Output ONLY the corrected code — no markdown fences, no explanation\n\n"
            f"SOURCE FILE:\n{content}"
        )
        _model = LLM_MODELS.get(model_key, _active_model()) if model_key else _active_model()
        resp = client.messages.create(
            model=_model,
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}],
        )
        result = resp.content[0].text.strip()
        # Strip any accidental markdown code fences
        if result.startswith("```"):
            result = "\n".join(
                ln for ln in result.splitlines()
                if not ln.strip().startswith("```")
            ).strip()
        return result if result else content
    except Exception as e:
        print(f"[llm_fix_full_file ERROR] {e}", flush=True)
        return content


# ===========================================================================
# CLAUDE VISION OCR  — bypasses Tesseract entirely for photo/stop mode
# ===========================================================================

def _encode_for_vision(img_np: np.ndarray, max_side: int = 2048) -> tuple[str, str]:
    """Scale down if needed, then return (base64_string, media_type).

    Uses PNG (lossless) so Claude Vision sees crisp character edges — JPEG
    compression artefacts on thin strokes (colons, dots, brackets) cause
    measurable misreads even at quality=92.
    """
    h, w = img_np.shape[:2]
    long = max(h, w)
    if long > max_side:
        s = max_side / long
        img_np = cv2.resize(img_np, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    buf = BytesIO()
    Image.fromarray(img_np).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode(), "image/png"


def _vision_ocr(b64_data: str, media_type: str = "image/png") -> str | None:
    """Ask Claude to transcribe code from an image. Returns None on any failure."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not (HAS_ANTHROPIC and api_key):
        return None
    try:
        client = _make_anthropic_client(api_key)

        # Build a language-specific preamble so Claude knows exactly what to expect
        if language_hint:
            _lang_detail = {
                "python": (
                    "Python 3 source code. "
                    "CRITICAL: indentation is semantic — preserve every leading space exactly. "
                    "4 spaces per indent level is standard. "
                    "Colons `:` end every def/class/if/elif/else/for/while/try/except/with header — never omit them. "
                    "Common OCR confusions to fix: `l`→`1` inside numbers, `O`→`0` in numeric context, "
                    "`rn`→`m` in identifiers, `|`→`l` or `I`, `0`→`o` when alphabetic context is clear."
                ),
                "javascript": (
                    "JavaScript (ES6+) source code. "
                    "Preserve semicolons exactly as shown. "
                    "Arrow functions use `=>` (not `=>`), template literals use backticks ` not quotes. "
                    "Destructuring: `const { a, b } = obj`, spread: `...args`. "
                    "Common OCR confusions: `l`→`1` in numbers, `O`→`0` in numeric context, "
                    "`rn`→`m`, `|`→`l` or `I`, backtick ` vs single quote `'`."
                ),
                "typescript": (
                    "TypeScript source code. "
                    "Preserve type annotations exactly: `: string`, `: number`, `: boolean`, generics `<T>`, `interface`, `type`. "
                    "Same rules as JavaScript plus type syntax. "
                    "Common OCR confusions: `l`→`1` in numbers, `O`→`0` in numeric context."
                ),
                "react": (
                    "React JSX/TSX source code. "
                    "Preserve JSX tags exactly: `<Component>`, `</Component>`, `{expression}`. "
                    "Hooks: useState, useEffect, useRef, useMemo, useCallback — preserve exactly. "
                    "className (not class) in JSX. Self-closing tags: `<Comp />`. "
                    "Common OCR confusions: `l`→`1` in numbers, `O`→`0` in numeric context."
                ),
                "nestjs": (
                    "NestJS TypeScript source code. "
                    "Decorators are critical: @Controller, @Injectable, @Module, @Get, @Post, @Put, @Delete, "
                    "@Body, @Param, @Query, @Headers — preserve exactly including the `@` symbol. "
                    "Common OCR confusions: `l`→`1` in numbers, `O`→`0` in numeric context."
                ),
                "nextjs": (
                    "Next.js React source code. "
                    "Special functions: getServerSideProps, getStaticProps, getStaticPaths, NextPage. "
                    "Same rules as React. "
                    "Common OCR confusions: `l`→`1` in numbers, `O`→`0` in numeric context."
                ),
                "java": (
                    "Java source code. "
                    "Preserve annotations exactly: @Override, @Autowired, @Component, @Service, @Repository. "
                    "String (capital S) is the type — not string. "
                    "System.out.println is the print method. "
                    "Common OCR confusions: `l`→`1`, `O`→`0`, `null`/`true`/`false` misread, "
                    "`public`→`publ1c`, `String`→`Str1ng`."
                ),
                "cpp": (
                    "C++ source code. "
                    "Preserve #include lines and namespace std:: prefix exactly — :: must not become ;: or : :. "
                    "nullptr (not NULL or null), cout, cin are standard identifiers. "
                    "Common OCR confusions: `l`→`1`, `O`→`0`, `cout`→`c0ut`, `nullptr`→`nu11ptr`, "
                    "`std::`→`std;:` or `std ::`."
                ),
                "go": (
                    "Go (Golang) source code. "
                    "First line must be `package <name>`. Import block uses double-quoted paths. "
                    "Short variable declaration `:=` is critical — do not change to `=`. "
                    "Common OCR confusions: `package`→`packaqe`, `goroutine`→`gorout1ne`, "
                    "`fmt.Println`→`fmt.Pr1ntln`, `nil`→`ni1`, `error`→`err0r`."
                ),
                "sql": (
                    "SQL query or DDL statement. "
                    "Keywords are UPPERCASE: SELECT, FROM, WHERE, JOIN, ON, GROUP BY, ORDER BY, HAVING, "
                    "INSERT INTO, VALUES, UPDATE, SET, DELETE, CREATE TABLE, ALTER TABLE, DROP TABLE. "
                    "NULL, TRUE, FALSE are SQL literals. "
                    "Common OCR confusions: `WHERE`→`VVHERE`, `FROM`→`FR0M`, `JOIN`→`J0IN`, "
                    "`NULL`→`NU11`, `PRIMARY`→`PR1MARY`."
                ),
                "css": (
                    "CSS stylesheet. "
                    "Preserve selectors (class .foo, id #bar, element, pseudo :hover/:before) exactly. "
                    "Property names are hyphenated lowercase: color, background-color, font-size, "
                    "margin, padding, border, display, flex, grid, position, width, height. "
                    "Values may include px, em, rem, %, hex #rrggbb, rgb(), hsl(). "
                    "Common OCR confusions: `color`→`co1or`, `margin`→`marg1n`, `border`→`b0rder`, "
                    "`display`→`d1splay`, hex digits corrupted."
                ),
            }.get(language_hint, f"{language_hint} source code.")
            lang_preamble = (
                f"LANGUAGE: {language_hint.upper()}\n"
                f"Context: {_lang_detail}\n\n"
            )
        else:
            lang_preamble = (
                "The code may be Python, JavaScript, TypeScript, or another language — "
                "detect from context and apply appropriate rules.\n\n"
            )

        prompt = (
            "This image shows source code on a computer monitor, photographed with a phone.\n\n"
            + lang_preamble
            + "TASK: Transcribe every visible line of code with 100% character accuracy.\n\n"
            "RULES — follow every rule without exception:\n"
            "1. OUTPUT ONLY the raw code — no markdown fences, no explanations, no preamble\n"
            "2. INDENTATION: reproduce every leading space/tab exactly as displayed\n"
            "3. ALL special characters must be preserved: \\ $ # & | > < = ! ; : , . ( ) [ ] { } ` ' \"\n"
            "4. OPERATORS: == != <= >= += -= *= /= //= **= -> => := ** // must be exact\n"
            "5. STRINGS: single-quoted 'str', double-quoted \"str\", and backtick `str` are different — do not substitute\n"
            "6. IDENTIFIERS: variable names, function names, class names — reproduce character-for-character\n"
            "7. BLANK LINES: preserve the exact number of blank lines between sections\n"
            "8. DO NOT add, remove, reorder, merge, or paraphrase any line\n"
            "9. DO NOT add comments or docstrings that are not visible in the image\n"
            "10. COMMON OCR CONFUSIONS to fix automatically:\n"
            "    - Digit 1 vs letter l/I: use context (inside numbers → 1, inside words → l/I)\n"
            "    - Digit 0 vs letter O: use context (numeric context → 0, word context → O)\n"
            "    - `rn` seen as `m`: e.g. `rn` in `return` → keep `return` not `retum`\n"
            "    - Backtick ` vs quote ': backtick is used for template literals in JS and shell commands\n"
            "    - Semicolon `;` vs colon `:`: preserve whichever is actually shown\n"
        )

        resp = client.messages.create(
            model=VISION_MODEL,
            max_tokens=8192,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": b64_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            }],
        )
        result = resp.content[0].text.strip()
        # Strip accidental markdown fences Claude sometimes adds despite instructions
        if result.startswith("```"):
            lines = result.splitlines()
            result = "\n".join(
                l for l in lines
                if not l.strip().startswith("```")
            ).strip()
        return result or None
    except Exception as e:
        # Print to terminal so the developer can see the real API error,
        # then re-raise so the caller can surface it to the user.
        print(f"[Vision API ERROR] {type(e).__name__}: {e}", flush=True)
        raise


# ===========================================================================
# HELPERS
# ===========================================================================

def decode_b64(data: str) -> np.ndarray:
    raw = base64.b64decode(data.split(",", 1)[1] if "," in data else data)
    return np.array(Image.open(BytesIO(raw)).convert("RGB"))


def text_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def safe_filename(name: str) -> str:
    name = os.path.basename(name.strip())
    name = re.sub(r"[^\w\-. ]", "-", name).strip()
    if not name:
        return "output.txt"
    if not name.endswith(".txt"):
        name += ".txt"
    return name


def list_txt_files() -> list[str]:
    try:
        files = [
            f for f in os.listdir(".")
            if f.endswith(".txt") and os.path.isfile(f)
        ]
        files.sort(key=lambda f: os.path.getmtime(f), reverse=True)
        return files if files else [current_file]
    except Exception:
        return [current_file]


# ===========================================================================
# ROUTES
# ===========================================================================

@app.route("/")
def serve_index():
    return send_from_directory("static", "index.html")


@app.route("/view")
def view_output():
    # B-7 FIX: escape HTML so code containing < > & doesn't corrupt the view.
    if not os.path.exists(current_file):
        return f"<pre>{_html.escape(current_file)} is empty.</pre>"
    try:
        with open(current_file, encoding="utf-8") as f:
            content = f.read()
        return (
            "<pre style='font-family: monospace; white-space: pre-wrap'>"
            + _html.escape(content)
            + "</pre>"
        )
    except Exception as e:
        return (
            f"<pre>Cannot read {_html.escape(current_file)}: "
            f"{_html.escape(str(e))}</pre>"
        )


# ===========================================================================
# SOCKET EVENTS
# ===========================================================================

@socketio.on("connect")
def on_connect():
    emit("init_state", {
        "ai_enabled":              ai_enabled,
        "night_mode":              night_mode,
        "auto_capture":            auto_capture,
        "auto_capture_frames":     AUTO_CAPTURE_FRAMES,
        "auto_clear_after_export": auto_clear_after_export,
        "auto_recapture_enabled":  auto_recapture_enabled,
        "auto_recapture_interval": auto_recapture_interval,
        "llm_model":               llm_model_key,
        "current_file":            current_file,
        "files":                   list_txt_files(),
        "bulk_capture":            bulk_capture,
        "bulk_session_blocks":     bulk_session_blocks,
        "bulk_session_number":     bulk_session_number,
    })


@socketio.on("set_language")
def on_set_language(data):
    """User pre-selected a language hint from the UI dropdown."""
    global language_hint
    language_hint = str(data.get("language", "")).strip().lower()
    emit("language_set", {"language": language_hint or "auto"})


@socketio.on("start")
def on_start():
    global capturing, _consec_sharp
    capturing     = True
    _consec_sharp = 0
    frame_buf.clear()
    frame_rgb_buf.clear()
    emit("status", {"capturing": True, "msg": "Capturing... hold phone steady"})


@socketio.on("stop")
def on_stop():
    global capturing, last_saved, bulk_session_blocks
    capturing = False
    save_to   = current_file   # local copy - race-safe vs on_set_file

    with _lock:
        buf     = list(frame_buf)
        rgb_buf = list(frame_rgb_buf)
        frame_buf.clear()
        frame_rgb_buf.clear()

    # Gate on rgb_buf (raw frames), NOT buf (OCR text).
    # Fast Otsu OCR may return empty on noisy screen images, leaving buf empty
    # even though we captured valid frames for Vision to use.
    if not rgb_buf:
        emit("status", {
            "capturing": False,
            "msg":       "Stopped - no sharp frames captured (hold phone steadier)",
        })
        return

    # ---- #7: Minimum frames warning (warn, but still process) --------------
    if len(rgb_buf) < MIN_FRAMES_CONSENSUS:
        emit("status", {
            "capturing": True,
            "msg": (f"⚠ Only {len(rgb_buf)} sharp frame(s) — "
                    f"{MIN_FRAMES_CONSENSUS}+ recommended. Processing anyway…"),
        })

    # ---- Step 1: OCR — Vision primary, Tesseract fallback --------------------
    results_with_conf: list[tuple[str, float]] = []
    best_line_confs:   list[float]             = []
    ai_used     = False
    text        = ""
    vision_tried = False

    # Primary: Claude Vision on the single sharpest frame (when AI enabled).
    # We use the sharpest frame — NOT a pixel average — because averaging
    # slightly-misaligned frames blurs special characters and symbols that
    # Vision needs to read precisely.
    if ai_enabled and HAS_ANTHROPIC and os.environ.get("ANTHROPIC_API_KEY"):
        vision_tried = True
        emit("status", {"capturing": True, "msg": "Reading code with Claude Vision…"})
        try:
            best_img         = _best_frame(rgb_buf)
            b64, media_type  = _encode_for_vision(best_img)
            vision_text      = _vision_ocr(b64, media_type)
            if vision_text:
                text    = vision_text
                ai_used = True
            else:
                # Vision connected but returned empty — image quality issue
                print("[Vision] Response was empty — image may be too blurry", flush=True)
                emit("status", {
                    "capturing": False,
                    "msg": "Vision returned empty — hold phone steadier and ensure code fills the frame",
                })
                return
        except Exception as e:
            # Vision failed — print real error to terminal so user can debug
            print(f"[Vision ERROR] {type(e).__name__}: {e}", flush=True)
            emit("status", {
                "capturing": False,
                "msg": (f"Vision OCR failed: {e}\n"
                        "Check the terminal for details. "
                        "Disable AI to use Tesseract fallback."),
            })
            return

    # Fallback: Tesseract pipeline (AI disabled or Vision failed)
    if not text and not (USE_EASYOCR and HAS_EASYOCR) and rgb_buf:
        try:
            avg_img = pixel_average_frames(rgb_buf)
            t_avg, c_avg, lc_avg, _ = _tesseract_with_confidence(preprocess(avg_img))
            t_avg = fix_code_symbols(t_avg).strip()
            if t_avg:
                results_with_conf.append((t_avg, c_avg))
                best_line_confs = lc_avg
        except Exception:
            pass

        # Per-frame OCR as additional evidence pool
        if len(rgb_buf) >= 2:
            try:
                aligned       = align_frames(rgb_buf)
                best_c_so_far = max((c for _, c in results_with_conf), default=-1.0)
                for rgb in aligned:
                    t, c, lc, _ = _tesseract_with_confidence(preprocess(rgb))
                    t = fix_code_symbols(t).strip()
                    if t:
                        results_with_conf.append((t, c))
                        if c > best_c_so_far:
                            best_c_so_far   = c
                            best_line_confs = lc
            except Exception:
                pass

        if results_with_conf:
            best_tess_conf = max(c for _, c in results_with_conf)
            # Confidence gate: below 35% means Tesseract is reading noise, not code.
            # (Phone-camera moiré + JPEG artifacts routinely fool Tesseract.)
            if best_tess_conf < 35:
                emit("status", {
                    "capturing": False,
                    "msg": (f"Tesseract confidence only {best_tess_conf:.0f}% — output would be garbage. "
                            "Enable AI (Claude Vision) for accurate screen OCR."),
                })
                return
            text = confidence_weighted_consensus(results_with_conf).strip()
        elif buf:
            text = fix_code_symbols(
                _majority_consensus(buf) if len(buf) > 1 else buf[0]
            ).strip()

        # Indentation reconstruction for Tesseract path
        if text and rgb_buf:
            try:
                text = reconstruct_indentation(text, rgb_buf[0])
            except Exception:
                pass

    if not text:
        emit("status", {
            "capturing": False,
            "msg": "OCR returned empty — enable AI for Vision OCR or move closer to the screen",
        })
        return

    lang = language_hint if language_hint else detect_language(text)

    # ---- Step 3: Syntax-guided targeted repair (Python, Tesseract path only)
    if (
        not ai_used
        and ai_enabled
        and HAS_ANTHROPIC
        and os.environ.get("ANTHROPIC_API_KEY")
        and lang == "python"
    ):
        try:
            ok, err = check_python_syntax(text)
            if not ok and err:
                raw_lineno = err.split(":")[0].replace("Line ", "").strip()
                if raw_lineno.isdigit():
                    repaired = llm_repair_syntax(text, int(raw_lineno), err)
                    if repaired != text:
                        text    = repaired
                        ai_used = True
        except Exception:
            pass

    # ---- Step 4: Full LLM correction (Tesseract path, no syntax repair yet)
    if (
        not ai_used
        and ai_enabled
        and HAS_ANTHROPIC
        and os.environ.get("ANTHROPIC_API_KEY")
    ):
        corrected = llm_correct_code(text, lang, best_line_confs if best_line_confs else None)
        if corrected and corrected != text:
            text    = corrected
            ai_used = True

    # ---- Step 5: Final syntax check + second-pass repair --------------------
    _JS_LANGS = {"javascript", "typescript", "react", "nestjs", "nextjs"}
    if lang == "python":
        syntax_ok, syntax_err = check_python_syntax(text)
    elif lang in _JS_LANGS:
        syntax_ok, syntax_err = check_js_syntax(text)
        # If JS/TS syntax still broken after Claude pass, ask Claude to fix
        if (not syntax_ok and syntax_err
                and ai_enabled and HAS_ANTHROPIC
                and os.environ.get("ANTHROPIC_API_KEY")):
            repaired = llm_repair_js_syntax(text, syntax_err, lang)
            if repaired and repaired != text:
                text      = repaired
                ai_used   = True
                syntax_ok, syntax_err = check_js_syntax(text)
    elif lang == "go":
        syntax_ok, syntax_err = check_go_syntax(text)
        if (not syntax_ok and syntax_err
                and ai_enabled and HAS_ANTHROPIC
                and os.environ.get("ANTHROPIC_API_KEY")):
            repaired = llm_repair_syntax_generic(text, syntax_err, "go")
            if repaired and repaired != text:
                text      = repaired
                ai_used   = True
                syntax_ok, syntax_err = check_go_syntax(text)
    elif lang == "css":
        syntax_ok, syntax_err = check_css_syntax(text)
        if (not syntax_ok and syntax_err
                and ai_enabled and HAS_ANTHROPIC
                and os.environ.get("ANTHROPIC_API_KEY")):
            repaired = llm_repair_syntax_generic(text, syntax_err, "css")
            if repaired and repaired != text:
                text      = repaired
                ai_used   = True
                syntax_ok, syntax_err = check_css_syntax(text)
    elif lang in {"java", "cpp", "sql"}:
        # No lightweight checker available — trust OCR + LLM correction
        syntax_ok, syntax_err = True, None
    else:
        syntax_ok, syntax_err = True, None

    # ---- Step 6: Duplicate check --------------------------------------------
    sim = text_similarity(last_saved, text)
    if sim > SIMILARITY_THRESH:
        emit("status", {
            "capturing": False,
            "msg": f"Duplicate block skipped ({sim:.0%} match with previous)",
        })
        return

    # ---- Save ---------------------------------------------------------------
    with open(save_to, "a", encoding="utf-8") as f:
        f.write(text + "\n\n")
    last_saved = text

    _bulk_block_num = None
    if bulk_capture:
        bulk_session_blocks += 1
        _bulk_block_num = bulk_session_blocks

    emit("result", {
        "text":       text,
        "lang":       lang,
        "ai_used":    ai_used,
        "syntax_ok":  syntax_ok,
        "syntax_err": syntax_err,
        "file":       save_to,
    })
    _status_data = {
        "capturing":    False,
        "msg":          (f"Block {_bulk_block_num} saved to {save_to}"
                         if _bulk_block_num else f"Saved to {save_to}"),
        "current_file": save_to,
        "files":        list_txt_files(),
    }
    if _bulk_block_num is not None:
        _status_data["bulk_block"] = _bulk_block_num
    emit("status", _status_data)

    # Auto-clear file after successful save (if enabled)
    if auto_clear_after_export:
        try:
            open(save_to, "w", encoding="utf-8").close()
            emit("status", {"msg": f"Auto-cleared {save_to} for next session"})
        except Exception as e:
            print(f"[Auto-clear error] {e}", flush=True)

    # --- Auto Re-capture: Start countdown if enabled ---
    if auto_recapture_enabled:
        global auto_recapture_active
        auto_recapture_active = True
        client_sid = request.sid  # Capture the client's session ID for use in thread

        def countdown_timer():
            """Run countdown in background, emit tick every second."""
            global auto_recapture_active
            print(f"[Auto Re-capture] Countdown started: {auto_recapture_interval}s", flush=True)
            for remaining in range(auto_recapture_interval, 0, -1):
                if not auto_recapture_active:
                    # Paused (auto_recapture_enabled still True) or stopped (disabled)
                    if not auto_recapture_enabled:
                        # Toggle was turned off — tell frontend to hide display
                        print(f"[Auto Re-capture] Cancelled (disabled)", flush=True)
                        socketio.emit("recapture_cancelled", {}, to=client_sid)
                    else:
                        # Paused by user — frontend already shows "Resume" button, do nothing
                        print(f"[Auto Re-capture] Paused at {remaining}s", flush=True)
                    return
                socketio.emit("recapture_countdown", {"remaining": remaining, "total": auto_recapture_interval}, to=client_sid)
                import time
                time.sleep(1)

            # Countdown finished — tell frontend to start the next capture
            if auto_recapture_active and auto_recapture_enabled:
                auto_recapture_active = False
                print(f"[Auto Re-capture] Triggering next capture", flush=True)
                # Emit countdown=0 so UI shows 0 before hiding
                socketio.emit("recapture_countdown", {"remaining": 0, "total": auto_recapture_interval}, to=client_sid)
                import time
                time.sleep(0.2)
                # Tell frontend to kick off a new capture (frontend calls startCapture)
                socketio.emit("recapture_trigger", {}, to=client_sid)

        import threading
        countdown_thread = threading.Thread(target=countdown_timer, daemon=True)
        countdown_thread.start()


# ===========================================================================
# PHOTO MODE: single high-res frame from phone camera
# Primary path: Claude Vision (when AI enabled) — far more accurate than
# Tesseract on phone-camera-to-screen images (moiré, subpixel rendering).
# Fallback: Tesseract pipeline (when AI disabled).
# ===========================================================================
@socketio.on("photo")
def on_photo(data):
    global last_saved, bulk_session_blocks
    save_to = current_file

    emit("status", {"capturing": True, "msg": "Processing photo…"})
    try:
        img_np = decode_b64(data["image"])
    except Exception as e:
        emit("status", {"capturing": False, "msg": f"Photo decode error: {e}"})
        return

    ai_used = False
    text    = ""
    lc      = []
    heatmap = []
    conf    = 0.0

    # --- Primary path: Claude Vision OCR ------------------------------------
    # Vision reads the actual photo — no preprocessing artefacts, no moiré.
    # We always go through _encode_for_vision so the image is capped at
    # 1600 px (API-safe size) regardless of original phone camera resolution.
    if ai_enabled and HAS_ANTHROPIC and os.environ.get("ANTHROPIC_API_KEY"):
        emit("status", {"capturing": True, "msg": "Reading code with Claude Vision…"})
        try:
            b64_data, media_type = _encode_for_vision(img_np)   # resize to ≤2048 px, PNG-encode
            vision_text = _vision_ocr(b64_data, media_type)
        except Exception as ve:
            vision_text = None
            emit("status", {"capturing": True, "msg": f"Vision error: {ve} — falling back to Tesseract…"})
        if vision_text:
            text    = vision_text
            ai_used = True
            conf    = 100.0
        elif not vision_text and ai_enabled:
            # Vision returned None (empty response) — tell user and fall through
            emit("status", {"capturing": True, "msg": "Vision returned empty — trying Tesseract…"})

    # --- Fallback: Tesseract OCR (AI disabled or Vision call failed) --------
    if not text:
        try:
            processed               = preprocess(img_np)
            text, conf, lc, heatmap = _tesseract_with_confidence(processed, build_heatmap=True)
            text = fix_code_symbols(text).strip()
        except Exception as e:
            emit("status", {"capturing": False, "msg": f"OCR error: {e}"})
            return

    if not text:
        emit("status", {"capturing": False, "msg": "OCR returned empty — try larger font or better focus"})
        return

    lang = language_hint if language_hint else detect_language(text)

    # --- Emit preview -------------------------------------------------------
    emit("quality", {
        "score": round(conf, 1), "label": "sharp",
        "glare": False, "glare_pct": 0,
        "zoom": "good", "zoom_msg": "",
        "frames": 1, "text": text, "language": lang,
        "conf": round(conf, 1),
        "heatmap": heatmap if heatmap else None,
    })

    # --- Extra correction only when Tesseract was used (Vision already clean)
    if not ai_used:
        try:
            text = reconstruct_indentation(text, img_np)
        except Exception:
            pass

        # Syntax-guided Python repair
        if ai_enabled and HAS_ANTHROPIC and os.environ.get("ANTHROPIC_API_KEY") and lang == "python":
            try:
                ok, err = check_python_syntax(text)
                if not ok and err:
                    raw_lineno = err.split(":")[0].replace("Line ", "").strip()
                    if raw_lineno.isdigit():
                        repaired = llm_repair_syntax(text, int(raw_lineno), err)
                        if repaired != text:
                            text    = repaired
                            ai_used = True
            except Exception:
                pass

        # Full LLM correction
        if ai_enabled and HAS_ANTHROPIC and os.environ.get("ANTHROPIC_API_KEY") and not ai_used:
            corrected = llm_correct_code(text, lang, lc if lc else None)
            if corrected and corrected != text:
                text    = corrected
                ai_used = True

    # --- Final syntax check + second-pass repair ----------------------------
    _JS_LANGS = {"javascript", "typescript", "react", "nestjs", "nextjs"}
    if lang == "python":
        syntax_ok, syntax_err = check_python_syntax(text)
    elif lang in _JS_LANGS:
        syntax_ok, syntax_err = check_js_syntax(text)
        if (not syntax_ok and syntax_err and ai_enabled
                and HAS_ANTHROPIC and os.environ.get("ANTHROPIC_API_KEY")):
            repaired = llm_repair_js_syntax(text, syntax_err, lang)
            if repaired and repaired != text:
                text = repaired
                ai_used = True
                syntax_ok, syntax_err = check_js_syntax(text)
    elif lang == "go":
        syntax_ok, syntax_err = check_go_syntax(text)
        if (not syntax_ok and syntax_err and ai_enabled
                and HAS_ANTHROPIC and os.environ.get("ANTHROPIC_API_KEY")):
            repaired = llm_repair_syntax_generic(text, syntax_err, "go")
            if repaired and repaired != text:
                text = repaired
                ai_used = True
                syntax_ok, syntax_err = check_go_syntax(text)
    elif lang == "css":
        syntax_ok, syntax_err = check_css_syntax(text)
        if (not syntax_ok and syntax_err and ai_enabled
                and HAS_ANTHROPIC and os.environ.get("ANTHROPIC_API_KEY")):
            repaired = llm_repair_syntax_generic(text, syntax_err, "css")
            if repaired and repaired != text:
                text = repaired
                ai_used = True
                syntax_ok, syntax_err = check_css_syntax(text)
    elif lang in {"java", "cpp", "sql"}:
        # No lightweight checker available — trust OCR + LLM correction
        syntax_ok, syntax_err = True, None
    else:
        syntax_ok, syntax_err = True, None

    # --- Duplicate check ----------------------------------------------------
    sim = text_similarity(last_saved, text)
    if sim > SIMILARITY_THRESH:
        emit("status", {
            "capturing": False,
            "msg": f"Duplicate photo skipped ({sim:.0%} match with previous)",
        })
        return

    # --- Save ---------------------------------------------------------------
    with open(save_to, "a", encoding="utf-8") as f:
        f.write(text + "\n\n")
    last_saved = text

    _bulk_block_num = None
    if bulk_capture:
        bulk_session_blocks += 1
        _bulk_block_num = bulk_session_blocks

    emit("result", {
        "text":       text,
        "lang":       lang,
        "ai_used":    ai_used,
        "syntax_ok":  syntax_ok,
        "syntax_err": syntax_err,
        "file":       save_to,
    })
    _status_data = {
        "capturing":    False,
        "msg":          (f"Photo — Block {_bulk_block_num} saved to {save_to}"
                         if _bulk_block_num else f"Photo saved to {save_to}"),
        "current_file": save_to,
        "files":        list_txt_files(),
    }
    if _bulk_block_num is not None:
        _status_data["bulk_block"] = _bulk_block_num
    emit("status", _status_data)

    # Auto-clear file after successful save (if enabled)
    if auto_clear_after_export:
        try:
            open(save_to, "w", encoding="utf-8").close()
            emit("status", {"msg": f"Auto-cleared {save_to} for next session"})
        except Exception as e:
            print(f"[Auto-clear error] {e}", flush=True)


@socketio.on("frame")
def on_frame(data):
    if not capturing:
        return
    # Drop frame if worker is busy (queue full) to avoid memory buildup
    try:
        _frame_queue.put_nowait((data, request.sid))
    except queue.Full:
        pass


def _frame_worker():
    """Single background thread that does all OpenCV/OCR work."""
    global _consec_sharp
    while True:
        item = _frame_queue.get()
        if item is None:   # sentinel — shutdown
            break
        data, sid = item
        if not capturing:
            continue
        try:
            img_np = decode_b64(data["image"])
        except Exception:
            continue

        gray                 = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
        score                = sharpness_score(gray)
        label                = quality_label(score)
        has_glare, glare_pct = detect_glare(img_np)
        char_h               = estimate_text_height(img_np)
        zoom_dir, zoom_msg   = zoom_guidance(char_h)

        with _lock:
            frame_count = len(frame_buf)

        if label == "blurry" or has_glare:
            with _lock:
                _consec_sharp = 0
            socketio.emit("quality", {
                "score":     round(score, 1),
                "label":     label,
                "glare":     has_glare,
                "glare_pct": glare_pct,
                "zoom":      zoom_dir,
                "zoom_msg":  zoom_msg,
                "frames":    frame_count,
            }, to=sid)
            continue

        try:
            text, conf, heatmap = run_ocr_frame(img_np)
        except Exception as e:
            print(f"[OCR error] {e}")
            continue
        text = fix_code_symbols(text).strip()

        with _lock:
            # Always collect the raw RGB frame so Vision has frames to average,
            # even when fast Otsu OCR returns empty on a noisy screen image.
            frame_rgb_buf.append(img_np)
            if text:
                frame_buf.append(text)
            frame_count   = len(frame_rgb_buf)   # count actual frames, not OCR hits
            _consec_sharp += 1
        lang = (language_hint if language_hint else detect_language(text)) if text else "unknown"

        socketio.emit("quality", {
            "score":     round(score, 1),
            "label":     label,
            "glare":     has_glare,
            "glare_pct": glare_pct,
            "zoom":      zoom_dir,
            "zoom_msg":  zoom_msg,
            "frames":    frame_count,
            "text":      text or None,
            "language":  lang if text else None,
            "conf":      round(conf, 1) if text else None,
            "heatmap":   heatmap if (text and heatmap) else None,
        }, to=sid)

        if auto_capture and _consec_sharp >= AUTO_CAPTURE_FRAMES:
            socketio.emit("auto_captured", {
                "msg":    f"Auto-captured after {AUTO_CAPTURE_FRAMES} sharp frames",
                "frames": frame_count,
            }, to=sid)


@socketio.on("set_ai")
def on_set_ai(data):
    global ai_enabled
    ai_enabled = bool(data.get("enabled", False))
    emit("status", {"msg": f"AI {'enabled' if ai_enabled else 'disabled'}"})


@socketio.on("set_night")
def on_set_night(data):
    global night_mode
    night_mode = bool(data.get("enabled", False))
    emit("status", {"msg": f"Night mode {'on' if night_mode else 'off'}"})


@socketio.on("set_auto")
def on_set_auto(data):
    global auto_capture
    auto_capture = bool(data.get("enabled", False))
    emit("status", {"msg": f"Auto-capture {'on' if auto_capture else 'off'}"})


@socketio.on("set_auto_clear")
def on_set_auto_clear(data):
    """Enable/disable auto-clear of output file after export/session."""
    global auto_clear_after_export
    auto_clear_after_export = bool(data.get("enabled", False))
    emit("status", {"msg": f"Auto-clear after export {'on' if auto_clear_after_export else 'off'}"})


@socketio.on("set_auto_recapture")
def on_set_auto_recapture(data):
    """Enable/disable auto re-capture after each capture finishes."""
    global auto_recapture_enabled, auto_recapture_active
    auto_recapture_enabled = bool(data.get("enabled", False))
    if not auto_recapture_enabled:
        auto_recapture_active = False  # Stop any active countdown
    emit("status", {"msg": f"Auto re-capture {'on' if auto_recapture_enabled else 'off'}"})
    emit("auto_recapture_state", {"enabled": auto_recapture_enabled})


@socketio.on("set_recapture_interval")
def on_set_recapture_interval(data):
    """Set the interval (in seconds) for auto re-capture countdown."""
    global auto_recapture_interval
    interval = int(data.get("interval", 5))
    # Validate: only allow 3, 5, 8, 10, 12, 15, 20
    valid_intervals = [3, 5, 8, 10, 12, 15, 20]
    if interval in valid_intervals:
        auto_recapture_interval = interval
        emit("status", {"msg": f"Auto re-capture interval: {interval}s"})
    else:
        emit("status", {"msg": f"Invalid interval. Must be one of: {valid_intervals}"})
    emit("recapture_interval_set", {"interval": auto_recapture_interval})


@socketio.on("pause_recapture")
def on_pause_recapture(data):
    """Pause the auto re-capture countdown."""
    global auto_recapture_active
    auto_recapture_active = False
    remaining = data.get("remaining", 0)
    print(f"[Auto Re-capture] Paused at {remaining}s remaining", flush=True)
    emit("status", {"msg": f"Auto re-capture paused ({remaining}s remaining)"})


@socketio.on("resume_recapture")
def on_resume_recapture(data):
    """Resume the auto re-capture countdown from where it was paused."""
    global auto_recapture_active, auto_recapture_enabled
    if auto_recapture_enabled:
        auto_recapture_active = True
        remaining = data.get("remaining", auto_recapture_interval)
        print(f"[Auto Re-capture] Resumed with {remaining}s remaining", flush=True)
        client_sid = request.sid

        def resume_countdown():
            """Resume countdown from paused state."""
            global auto_recapture_active
            print(f"[Auto Re-capture] Resume countdown: {remaining}s", flush=True)
            for sec in range(remaining, 0, -1):
                if not auto_recapture_active:
                    if not auto_recapture_enabled:
                        print(f"[Auto Re-capture] Resume cancelled (disabled)", flush=True)
                        socketio.emit("recapture_cancelled", {}, to=client_sid)
                    else:
                        print(f"[Auto Re-capture] Resume paused at {sec}s", flush=True)
                    return
                socketio.emit("recapture_countdown", {"remaining": sec, "total": auto_recapture_interval}, to=client_sid)
                import time
                time.sleep(1)

            # Countdown finished — tell frontend to start the next capture
            if auto_recapture_active and auto_recapture_enabled:
                auto_recapture_active = False
                print(f"[Auto Re-capture] Triggering next capture after resume", flush=True)
                socketio.emit("recapture_countdown", {"remaining": 0, "total": auto_recapture_interval}, to=client_sid)
                import time
                time.sleep(0.2)
                socketio.emit("recapture_trigger", {}, to=client_sid)

        import threading
        resume_thread = threading.Thread(target=resume_countdown, daemon=True)
        resume_thread.start()
        emit("status", {"msg": f"Auto re-capture resumed ({remaining}s remaining)"})


@socketio.on("set_model")
def on_set_model(data):
    global llm_model_key
    key = data.get("model", "haiku")
    if key in LLM_MODELS:
        llm_model_key = key
    emit("status", {"msg": f"LLM model: {llm_model_key}"})


@socketio.on("set_file")
def on_set_file(data):
    global current_file
    current_file = safe_filename(data.get("name", OUTPUT_FILE))
    emit("status", {
        "msg":          f"Output file: {current_file}",
        "current_file": current_file,
        "files":        list_txt_files(),
    })


@socketio.on("get_files")
def on_get_files():
    emit("files", {"files": list_txt_files(), "current_file": current_file})


@socketio.on("clear_file")
def on_clear_file():
    try:
        open(current_file, "w", encoding="utf-8").close()
        emit("status", {"msg": f"Cleared {current_file}"})
    except Exception as e:
        emit("status", {"msg": f"Error clearing file: {e}"})


@socketio.on("set_bulk")
def on_set_bulk(data):
    global bulk_capture, bulk_session_blocks, bulk_session_number
    enabled = bool(data.get("enabled", False))
    # Increment session counter only when turning ON (new session starts)
    if enabled and not bulk_capture:
        bulk_session_number += 1
    bulk_capture        = enabled
    bulk_session_blocks = 0   # always reset block count when toggling
    emit("status", {
        "msg":           (f"Bulk capture on — session {bulk_session_number} started"
                          if enabled else "Bulk capture off"),
        "bulk_block":    0,
        "bulk_session":  bulk_session_number,
    })


@socketio.on("reset_bulk_session")
def on_reset_bulk_session():
    global bulk_session_blocks
    bulk_session_blocks = 0
    emit("status", {"msg": "Bulk session reset \u2014 block count cleared", "bulk_block": 0})


@socketio.on("fix_session_file")
def on_fix_session_file(data=None):
    """Read the current output file, fix it with Claude, and save as a
    smart-named language-specific file (e.g. 20241215_143022_python_session1.py).

    Accepts optional fields in ``data``:
    - ``filename`` — the user-chosen export filename (falls back to auto-generated).
    - ``ai_fix``   — bool, whether to run Claude fix (overrides global ``ai_enabled``).
    - ``model``    — "haiku" | "sonnet", which model to use for this export only.
    """
    _d = data or {}

    # Per-export AI and model overrides (do not mutate global state)
    use_ai    = bool(_d.get("ai_fix", ai_enabled))
    use_model = str(_d.get("model", llm_model_key)).strip().lower()
    if use_model not in ("haiku", "sonnet"):
        use_model = llm_model_key

    # Guard: don't run during active capture
    if capturing:
        emit("session_fixed", {"error": "Stop the capture before exporting the session"})
        return
    if not bulk_capture:
        emit("session_fixed", {"error": "Enable Bulk Capture mode first"})
        return
    if bulk_session_blocks == 0:
        emit("session_fixed", {"error": "No blocks captured yet — capture some code first"})
        return

    # Read current session file
    try:
        with open(current_file, encoding="utf-8") as f:
            content = f.read().strip()
    except Exception as e:
        emit("session_fixed", {"error": f"Cannot read {current_file}: {e}"})
        return

    if not content:
        emit("session_fixed", {"error": f"{current_file} is empty — capture some code first"})
        return

    # Detect language of the assembled file
    lang = language_hint if language_hint else detect_language(content)
    if not lang or lang == "unknown":
        lang = "text"

    # Fix with Claude (if requested and available); otherwise export raw
    corrected = content
    if use_ai and HAS_ANTHROPIC and os.environ.get("ANTHROPIC_API_KEY"):
        n_blocks = bulk_session_blocks
        emit("status", {
            "capturing": True,
            "msg": (f"Fixing full session ({lang}, {n_blocks} block"
                    f"{'s' if n_blocks != 1 else ''}) "
                    f"with Claude {use_model.capitalize()}\u2026"),
        })
        try:
            fixed = llm_fix_full_file(content, lang, model_key=use_model)
            if fixed and fixed.strip():
                corrected = fixed
        except Exception as e:
            emit("status", {"capturing": True,
                            "msg": f"Fix warning: {e} \u2014 saving raw OCR content"})
    else:
        emit("status", {"capturing": True,
                        "msg": f"Exporting raw session ({lang})\u2026"})

    # Build filename — prefer user-supplied name, fall back to auto-generated
    user_filename = str(_d.get("filename", "")).strip()
    if user_filename:
        # Sanitize: strip path separators, limit to safe characters
        user_filename = os.path.basename(user_filename)
        user_filename = re.sub(r"[^\w\-. ()]+", "_", user_filename).strip("_. ")
    if user_filename:
        new_name = user_filename
    else:
        ext      = _EXT_MAP.get(lang, ".txt")
        now_str  = datetime.now().strftime("%Y%m%d_%H%M%S")
        new_name = f"{now_str}_{lang}_session{bulk_session_number}{ext}"

    # Save exported file
    try:
        with open(new_name, "w", encoding="utf-8") as f:
            f.write(corrected)
    except Exception as e:
        emit("session_fixed", {"error": f"Save failed: {e}"})
        return

    emit("session_fixed", {
        "text":     corrected,
        "lang":     lang,
        "filename": new_name,
        "blocks":   bulk_session_blocks,
        "session":  bulk_session_number,
    })
    emit("status", {
        "capturing": False,
        "msg":       f"Session {bulk_session_number} \u2192 {new_name}",
        "files":     list_txt_files(),
    })


# ===========================================================================
# ENTRY POINT
# ===========================================================================

if __name__ == "__main__":
    # Start single OCR worker thread before the server
    _worker_thread = threading.Thread(target=_frame_worker, daemon=True)
    _worker_thread.start()

    ip = get_local_ip()
    print(f"\nCamToCode ready!")
    print(f"  Phone: https://{ip}:{PORT}")
    print(f"  Local: https://127.0.0.1:{PORT}")
    print("  Accept the SSL warning on your phone\n")
    socketio.run(
        app,
        host="0.0.0.0",
        port=PORT,
        debug=False,
        use_reloader=False,
        ssl_context="adhoc",
    )
