"""
CamToCode — Multi-User Production Backend
Hosted on Railway · Auth via Supabase JWT · Storage via Supabase Storage
"""

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
import threading
import queue
import json
from io import BytesIO
from collections import Counter
from difflib import SequenceMatcher
from datetime import datetime, timezone

import cv2
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import pytesseract
import httpx

# ---------------------------------------------------------------------------
# Config from environment
# ---------------------------------------------------------------------------
SUPABASE_URL        = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")   # service_role key
SUPABASE_JWT_SECRET  = os.environ.get("SUPABASE_JWT_SECRET", "")    # JWT secret from dashboard
FRONTEND_URL         = os.environ.get("FRONTEND_URL", "http://localhost:3000")
PORT                 = int(os.environ.get("PORT", 5000))

# Tesseract: on Railway it's installed system-wide via Dockerfile/nixpacks
# On Windows dev machine override with env var TESSERACT_CMD
_tess_cmd = os.environ.get("TESSERACT_CMD", "")
if _tess_cmd:
    pytesseract.pytesseract.tesseract_cmd = _tess_cmd

_TESSDATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)))
_BEST_DATA    = os.path.join(_TESSDATA_DIR, "eng_best.traineddata")
HAS_ENG_BEST  = os.path.isfile(_BEST_DATA)

# ---------------------------------------------------------------------------
# Optional: Anthropic / Claude
# ---------------------------------------------------------------------------
try:
    import anthropic as _anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

def _make_anthropic_client(api_key: str):
    try:
        return _anthropic.Anthropic(api_key=api_key)
    except TypeError as e:
        if "proxies" in str(e):
            return _anthropic.Anthropic(
                api_key=api_key,
                http_client=httpx.Client(timeout=120.0),
            )
        raise

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MIN_SHARPNESS       = 60.0
SIMILARITY_THRESH   = 0.85
AUTO_CAPTURE_FRAMES = 5
MIN_FRAMES_CONSENSUS = 3
_LINE_CONF_THRESH   = 85.0

LLM_MODELS = {
    "haiku":  "claude-haiku-4-5-20251001",
    "sonnet": "claude-sonnet-4-6",
}
VISION_MODEL = "claude-sonnet-4-6"

_EXT_MAP: dict[str, str] = {
    "python":     ".py",   "javascript": ".js",   "typescript": ".ts",
    "html":       ".html", "react":      ".tsx",  "nestjs":     ".ts",
    "nextjs":     ".tsx",  "java":       ".java", "cpp":        ".cpp",
    "go":         ".go",   "rust":       ".rs",   "swift":      ".swift",
    "kotlin":     ".kt",   "ruby":       ".rb",   "php":        ".php",
    "sql":        ".sql",  "css":        ".css",
}

_TESS_BASE  = "--oem 1 -c preserve_interword_spaces=1 --user-defined-dpi 300"
_TESS_BEST  = (f"--tessdata-dir \"{_TESSDATA_DIR}\" -l eng_best"
               if HAS_ENG_BEST else "")
_TESS_CFGS  = [
    (_TESS_BASE + (" " + _TESS_BEST if _TESS_BEST else "")).strip() + " --psm 6",
]

# ---------------------------------------------------------------------------
# Flask / SocketIO
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "camtocode-prod-secret")
_cors_origins = [o for o in [FRONTEND_URL, "http://localhost:3000", "http://localhost:3001"] if o]
CORS(app, origins="*")

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    max_http_buffer_size=25 * 1024 * 1024,
    allow_upgrades=False,
)

# ---------------------------------------------------------------------------
# Per-user session state — replaces all globals
# ---------------------------------------------------------------------------
class UserSession:
    def __init__(self, sid: str):
        self.sid                   = sid
        self.user_id               = ""         # Supabase user UUID
        self.user_email            = ""
        self.capturing             = False
        self.last_saved            = ""
        self.frame_buf: list[str]                = []
        self.frame_rgb_buf: list[np.ndarray]     = []
        self.ai_enabled            = True
        self.night_mode            = False
        self.auto_capture          = False
        self.auto_clear_after_export = False
        self.language_hint         = ""
        self.llm_model_key         = "haiku"
        self.bulk_capture          = False
        self.bulk_session_blocks   = 0
        self.bulk_session_number   = 0
        self.consec_sharp          = 0
        self.current_session_path  = ""         # Supabase Storage path for live buffer
        self._lock                 = threading.Lock()

    def active_model(self) -> str:
        return LLM_MODELS.get(self.llm_model_key, LLM_MODELS["haiku"])

_sessions: dict[str, UserSession] = {}
_sessions_lock = threading.Lock()

def get_session(sid: str) -> UserSession:
    with _sessions_lock:
        if sid not in _sessions:
            _sessions[sid] = UserSession(sid)
        return _sessions[sid]

def remove_session(sid: str):
    with _sessions_lock:
        _sessions.pop(sid, None)

# ---------------------------------------------------------------------------
# Frame worker queue — one queue, dispatcher uses sid to route
# ---------------------------------------------------------------------------
_frame_queue: queue.Queue = queue.Queue(maxsize=32)

# ---------------------------------------------------------------------------
# Supabase Storage helpers
# ---------------------------------------------------------------------------
def _sb_headers() -> dict:
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "apikey":        SUPABASE_SERVICE_KEY,
        "Content-Type":  "application/octet-stream",
    }

def _sb_json_headers() -> dict:
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "apikey":        SUPABASE_SERVICE_KEY,
        "Content-Type":  "application/json",
    }

def _sb_storage_path(user_id: str) -> str:
    """Storage path for the live output buffer per user."""
    return f"{user_id}/live_buffer.txt"

def _sb_export_path(user_id: str, filename: str) -> str:
    """Storage path for a completed session export."""
    return f"{user_id}/exports/{filename}"

def supabase_read_text(path: str) -> str:
    """Download a text file from Supabase Storage. Returns '' if not found."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return ""
    url = f"{SUPABASE_URL}/storage/v1/object/camtocode/{path}"
    try:
        resp = httpx.get(url, headers=_sb_headers(), timeout=15)
        if resp.status_code == 200:
            return resp.text
        return ""
    except Exception:
        return ""

def supabase_write_text(path: str, content: str) -> bool:
    """Upload (overwrite) a text file to Supabase Storage."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return False
    url = f"{SUPABASE_URL}/storage/v1/object/camtocode/{path}"
    try:
        resp = httpx.put(
            url,
            content=content.encode("utf-8"),
            headers={**_sb_headers(), "x-upsert": "true"},
            timeout=20,
        )
        return resp.status_code in (200, 201)
    except Exception:
        return False

def supabase_append_text(path: str, new_content: str) -> bool:
    """Append to a file in Supabase Storage (download + append + reupload)."""
    existing = supabase_read_text(path)
    return supabase_write_text(path, existing + new_content)

def supabase_signed_url(path: str, expires_in: int = 3600) -> str:
    """Generate a signed download URL for a file in Supabase Storage."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return ""
    url = f"{SUPABASE_URL}/storage/v1/object/sign/camtocode/{path}"
    try:
        resp = httpx.post(
            url,
            json={"expiresIn": expires_in},
            headers=_sb_json_headers(),
            timeout=10,
        )
        if resp.status_code == 200:
            signed = resp.json().get("signedURL", "")
            # signedURL is a relative path — prepend Supabase URL
            if signed:
                return f"{SUPABASE_URL}{signed}" if signed.startswith("/") else signed
        return ""
    except Exception:
        return ""

def supabase_list_exports(user_id: str) -> list[dict]:
    """List all exported files for a user."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return []
    url = f"{SUPABASE_URL}/storage/v1/object/list/camtocode"
    try:
        resp = httpx.post(
            url,
            json={"prefix": f"{user_id}/exports/", "limit": 100, "sortBy": {"column": "created_at", "order": "desc"}},
            headers=_sb_json_headers(),
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json()
        print(f"[supabase_list_exports] status={resp.status_code} body={resp.text[:200]}", flush=True)
        return []
    except Exception as e:
        print(f"[supabase_list_exports] error: {e}", flush=True)
        return []

def supabase_ensure_bucket() -> bool:
    """Create the 'camtocode' bucket if it doesn't exist. Called at startup."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return False
    # Check if bucket exists
    url = f"{SUPABASE_URL}/storage/v1/bucket/camtocode"
    try:
        resp = httpx.get(url, headers=_sb_json_headers(), timeout=10)
        if resp.status_code == 200:
            print("[startup] Supabase bucket 'camtocode' exists.", flush=True)
            return True
        # Try to create it
        create_url = f"{SUPABASE_URL}/storage/v1/bucket"
        resp2 = httpx.post(
            create_url,
            json={"id": "camtocode", "name": "camtocode", "public": False},
            headers=_sb_json_headers(),
            timeout=10,
        )
        if resp2.status_code in (200, 201):
            print("[startup] Supabase bucket 'camtocode' created.", flush=True)
            return True
        print(f"[startup] Bucket create status={resp2.status_code}: {resp2.text[:200]}", flush=True)
        return False
    except Exception as e:
        print(f"[startup] supabase_ensure_bucket error: {e}", flush=True)
        return False


def supabase_log_capture(user_id: str, filename: str, lang: str, blocks: int):
    """Insert a row into the captures table via Supabase REST API."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return
    url = f"{SUPABASE_URL}/rest/v1/captures"
    try:
        httpx.post(
            url,
            json={
                "user_id": user_id,
                "filename": filename,
                "language": lang,
                "blocks": blocks,
                "storage_path": _sb_export_path(user_id, filename),
            },
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type":  "application/json",
                "apikey":        SUPABASE_SERVICE_KEY,
                "Prefer":        "return=minimal",
            },
            timeout=10,
        )
    except Exception:
        pass

# ---------------------------------------------------------------------------
# JWT verification
# ---------------------------------------------------------------------------
def verify_supabase_token(token: str) -> dict | None:
    """Verify a Supabase JWT. Tries HS256 first, then falls back to REST API
    for ES256 tokens (new Supabase key format sb_publishable_*)."""
    if not token:
        return None

    # 1. Try legacy HS256 JWT secret
    if SUPABASE_JWT_SECRET:
        try:
            import jwt as pyjwt
            payload = pyjwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
            return payload
        except Exception:
            pass  # Fall through to REST API verification

    # 2. Verify via Supabase REST API (handles ES256 tokens)
    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        try:
            resp = httpx.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": SUPABASE_SERVICE_KEY,
                },
                timeout=5.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "sub":   data.get("id", ""),
                    "email": data.get("email", ""),
                    "aud":   "authenticated",
                }
        except Exception:
            pass

    return None

# ---------------------------------------------------------------------------
# Image quality helpers (unchanged from original)
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------
def preprocess(img_np: np.ndarray, night_mode: bool = False) -> np.ndarray:
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape
    long_side = max(h, w)
    if long_side < 1200:
        scale = 3
    elif long_side < 2500:
        scale = 2
    else:
        scale = 1
    if scale > 1:
        gray = cv2.resize(gray, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC)
    if gray.mean() < 127:
        gray = cv2.bitwise_not(gray)
    blur_k = 5 if scale > 1 else 9
    gray = cv2.GaussianBlur(gray, (blur_k, blur_k), 0)
    if scale > 1:
        clip  = 5.0 if night_mode else 2.5
        clahe = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8))
        gray  = clahe.apply(gray)
    if scale == 1:
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    else:
        block = 91 if scale == 3 else 61
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block, 15
        )
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 2))
    binary = cv2.dilate(binary, kernel, iterations=1)
    return binary

# ---------------------------------------------------------------------------
# OCR
# ---------------------------------------------------------------------------
def _tesseract_with_confidence(
    processed: np.ndarray,
    build_heatmap: bool = False,
) -> tuple[str, float, list[float], list[dict]]:
    best_text: str = ""
    best_conf: float = -1.0
    best_line_confs: list[float] = []
    best_heatmap: list[dict] = []

    for cfg in _TESS_CFGS:
        try:
            data = pytesseract.image_to_data(
                processed, config=cfg, output_type=pytesseract.Output.DICT
            )
        except Exception:
            continue

        n = len(data["text"])
        line_words: dict = {}
        line_confs: dict = {}
        hm_lines: dict = {}

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

            if key not in line_words:
                line_words[key] = []
                line_confs[key] = []
            if word.strip():
                line_words[key].append(word)
            if conf >= 0:
                line_confs[key].append(conf)

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
                hm: list[dict] = []
                for key in sorted(hm_lines.keys()):
                    if hm:
                        hm.append({"w": "\n", "c": -1})
                    for _wn, w, c in sorted(hm_lines[key], key=lambda x: x[0]):
                        hm.append({"w": w, "c": c})
                best_heatmap = hm

    return best_text, max(best_conf, 0.0), best_line_confs, best_heatmap


def run_ocr_frame(img_np: np.ndarray) -> tuple[str, float, list[dict]]:
    h, w = img_np.shape[:2]
    long = max(h, w)
    scale = 1200 / long
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    interp = cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA
    gray = cv2.resize(gray, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=interp)
    if gray.mean() < 127:
        gray = cv2.bitwise_not(gray)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    fast_cfg = "--oem 1 -c preserve_interword_spaces=1 --psm 6"
    try:
        text = pytesseract.image_to_string(binary, config=fast_cfg)
        return fix_code_symbols(text).strip(), 80.0, []
    except Exception:
        return "", 0.0, []

# ---------------------------------------------------------------------------
# Frame alignment + pixel averaging
# ---------------------------------------------------------------------------
def align_frames(rgb_frames: list[np.ndarray]) -> list[np.ndarray]:
    if len(rgb_frames) < 2:
        return rgb_frames
    ref_rgb = rgb_frames[0]
    ref     = cv2.cvtColor(ref_rgb, cv2.COLOR_RGB2GRAY)
    h, w    = ref.shape
    aligned = [ref_rgb]
    lk_params = dict(
        winSize=(15, 15), maxLevel=2,
        criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 10, 0.03),
    )
    ref_pts = cv2.goodFeaturesToTrack(ref, maxCorners=200, qualityLevel=0.01, minDistance=10, blockSize=3)
    if ref_pts is None:
        return rgb_frames
    for rgb in rgb_frames[1:]:
        try:
            frame    = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
            curr_pts, status, _ = cv2.calcOpticalFlowPyrLK(ref, frame, ref_pts, None, **lk_params)
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


def pixel_average_frames(rgb_frames: list[np.ndarray]) -> np.ndarray:
    if len(rgb_frames) < 2:
        return rgb_frames[0]
    try:
        aligned = align_frames(rgb_frames)
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
    if len(rgb_frames) == 1:
        return rgb_frames[0]
    best_idx, best_score = 0, -1.0
    for i, frame in enumerate(rgb_frames):
        gray  = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
        score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        if score > best_score:
            best_score = score
            best_idx   = i
    return rgb_frames[best_idx]

# ---------------------------------------------------------------------------
# Syntax checkers
# ---------------------------------------------------------------------------
_NODE_BIN = None

def _find_node() -> str | None:
    global _NODE_BIN
    if _NODE_BIN is not None:
        return _NODE_BIN
    import shutil
    _NODE_BIN = shutil.which("node")
    return _NODE_BIN


def check_python_syntax(text: str) -> tuple[bool, str | None]:
    try:
        _ast_mod.parse(text)
        return True, None
    except SyntaxError as e:
        return False, f"Line {e.lineno}: {e.msg}"


def check_js_syntax(code: str) -> tuple[bool, str | None]:
    node = _find_node()
    if not node:
        return True, None
    stripped = re.sub(r':\s*(string|number|boolean|any|void|never|unknown'
                      r'|null|undefined|object|Record<[^>]*>|Array<[^>]*>)', '', code)
    stripped = re.sub(r'<[A-Z]\w*>', '', stripped)
    stripped = re.sub(r'^\s*@\w+.*$', '', stripped, flags=re.MULTILINE)
    stripped = re.sub(r'\binterface\s+\w+\s*\{[^}]*\}', '', stripped, flags=re.DOTALL)
    stripped = re.sub(r'\btype\s+\w+\s*=\s*[^;]+;', '', stripped)
    check_script = (
        "const vm=require('vm');"
        "try{new vm.Script(" + __import__('json').dumps(stripped) + ");process.exit(0);}"
        "catch(e){process.stderr.write(e.message);process.exit(1);}"
    )
    try:
        result = subprocess.run([node, "-e", check_script], capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            return True, None
        raw = result.stderr.strip() or "JS syntax error"
        m = re.search(r'\(line\s+(\d+)\)', raw, re.IGNORECASE)
        if m:
            prefix = raw[:m.start()].strip(' .\n')
            msg = f"Line {m.group(1)}: {prefix}"
        else:
            msg = next((ln.strip() for ln in raw.splitlines()
                        if ln.strip() and not ln.strip().startswith("at ")), raw)
        return False, msg
    except Exception:
        return True, None


def check_go_syntax(code: str) -> tuple[bool, str | None]:
    try:
        with __import__('tempfile').NamedTemporaryFile(suffix=".go", mode="w", encoding="utf-8", delete=False) as f:
            f.write(code)
            tmp = f.name
        result = subprocess.run(["gofmt", "-e", tmp], capture_output=True, text=True, timeout=8)
        try:
            os.unlink(tmp)
        except OSError:
            pass
        if result.returncode == 0:
            return True, None
        return False, result.stderr.strip() or "Go syntax error"
    except FileNotFoundError:
        return True, None
    except Exception:
        return True, None


def check_css_syntax(code: str) -> tuple[bool, str | None]:
    try:
        oc = code.count("{")
        cc = code.count("}")
        if oc != cc:
            return False, f"CSS brace mismatch: {oc} '{{' vs {cc} '}}'"
        return True, None
    except Exception:
        return True, None

# ---------------------------------------------------------------------------
# Consensus
# ---------------------------------------------------------------------------
def character_level_consensus(texts: list[str]) -> str:
    if len(texts) == 1:
        return texts[0]
    lines_per_text = [t.splitlines() for t in texts]
    max_lines = max((len(lines) for lines in lines_per_text), default=0)
    result_lines = []
    for line_idx in range(max_lines):
        line_versions = [lines[line_idx] for lines in lines_per_text if line_idx < len(lines)]
        if not line_versions:
            continue
        if len(set(line_versions)) == 1:
            result_lines.append(line_versions[0])
            continue
        max_chars = max(len(line) for line in line_versions)
        consensus_line = []
        for char_idx in range(max_chars):
            char_votes = [lv[char_idx] for lv in line_versions if char_idx < len(lv)]
            if not char_votes:
                continue
            best_char, _ = Counter(char_votes).most_common(1)[0]
            consensus_line.append(best_char)
        if consensus_line:
            result_lines.append("".join(consensus_line))
    return "\n".join(result_lines)


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

# ---------------------------------------------------------------------------
# OCR fix patterns
# ---------------------------------------------------------------------------
_FIXES: list[tuple[str, str]] = [
    ("\u2019", "'"), ("\u2018", "'"), ("\u201c", '"'), ("\u201d", '"'),
    ("\u2013", "-"), ("\u2014", "-"), ("\u2022", "*"), ("\u00b7", "."),
    (r"(?<=[0-9])O(?=[0-9])", "0"), (r"(?<=[0-9])l(?=[0-9])", "1"),
    (r"(?<=[0-9])I(?=[0-9])", "1"), (";;", ";"), ("--", "-"),
    (r" = =", " =="), (r"! =", "!="), (r"< =", "<="), (r"> =", ">="),
    (r"= >", "=>"), (r"- >", "->"), (r"\+ =", "+="), (r"- =", "-="),
    (r"\bFaise\b", "False"), (r"\bTirue\b", "True"), (r"\bNuii\b", "None"),
    (r"\bpnnt\b", "print"), (r"\bprlnt\b", "print"), (r"\bpnint\b", "print"),
    (r"\bimpprt\b", "import"), (r"\bdetf\b", "def"), (r"\bde f\b", "def"),
    (r"\bcllass\b", "class"), (r"\bcIass\b", "class"), (r"\bc1ass\b", "class"),
    (r"\bseTf\b", "self"), (r"\bs elf\b", "self"), (r"\bselt\b", "self"),
    (r"\bretum\b", "return"), (r"\brreturn\b", "return"), (r"\breturm\b", "return"),
    (r"\bEiif\b", "elif"), (r"\beliif\b", "elif"), (r"\be1se\b", "else"),
    (r"\bconsst\b", "const"), (r"\bcosnt\b", "const"),
    (r"\bfumction\b", "function"), (r"\bfunct1on\b", "function"),
    (r"\bconsole\.1og\b", "console.log"), (r"\bconsole\.Iog\b", "console.log"),
    (r"\bconsole\.l0g\b", "console.log"), (r"\bconsoIe\b", "console"),
    (r"\buseState\b", "useState"), (r"\buseEf fect\b", "useEffect"),
    (r"\buseRef\b", "useRef"), (r"\buseMemo\b", "useMemo"),
    (r"\buseCallback\b", "useCallback"), (r"\buseContext\b", "useContext"),
    (r"\bc1assName\b", "className"), (r"c1assName", "className"),
    (r"\bquerySe1ector\b", "querySelector"), (r"\bgetE1ementById\b", "getElementById"),
    (r"@Contr0ller", "@Controller"), (r"@lnjectable", "@Injectable"),
    (r"\bgetServerSidePr0ps\b", "getServerSideProps"),
    (r"\bgetStaticPr0ps\b", "getStaticProps"),
    (r"\bnu11ptr\b", "nullptr"), (r"\b#inc1ude\b", "#include"),
    (r"\bstd;:", "std::"), (r"\bstd ::", "std::"),
    (r"\bpackaqe\b", "package"), (r"\bgorout1ne\b", "goroutine"),
    (r"\bni1\b", "nil"), (r"\berr0r\b", "error"),
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

# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------
_LANG_PAT: dict[str, list[str]] = {
    "python":     [r"\bdef\s+\w+\s*\(", r"\bimport\s+\w", r"\bclass\s+\w+[\s:(]", r":\s*(?:#.*)?$"],
    "javascript": [r"\bconst\b", r"\blet\b", r"\bfunction\s+\w", r"=>", r"console\."],
    "typescript": [r":\s*string\b", r":\s*number\b", r"\binterface\s+\w", r"\btype\s+\w+="],
    "java":       [r"\bpublic\s+class\b", r"\bSystem\.out\.", r"@Override"],
    "cpp":        [r"#include\s*[<\"]", r"\bstd::", r"\bint\s+main\s*\(", r"cout\s*<<"],
    "go":         [r"\bfunc\s+\w", r"\bpackage\s+\w", r":=", r"\bfmt\."],
    "rust":       [r"\bfn\s+\w", r"\blet\s+mut\b", r"\buse\s+std", r"println!"],
    "html":       [r"<html", r"<div", r"</\w+>", r"<!DOCTYPE"],
    "react":      [r"\buseState\b", r"\buseEffect\b", r"React\.FC\b", r"<[A-Z]\w+[\s/>]"],
    "nestjs":     [r"@Controller\(", r"@Injectable\(", r"@Module\("],
    "nextjs":     [r"\bgetServerSideProps\b", r"\bgetStaticProps\b", r"\bNextPage\b"],
    "sql":        [r"\bSELECT\b", r"\bFROM\b", r"\bWHERE\b"],
    "css":        [r"\{[^}]*\}", r":\s*\w+;", r"#\w+\s*\{"],
}


def detect_language(text: str) -> str:
    scores = {
        lang: sum(bool(re.search(p, text, re.MULTILINE)) for p in pats)
        for lang, pats in _LANG_PAT.items()
    }
    best = max(scores.values(), default=0)
    return max(scores, key=scores.get) if best > 0 else "unknown"

# ---------------------------------------------------------------------------
# Indentation reconstruction
# ---------------------------------------------------------------------------
def reconstruct_indentation(text: str, img_np: np.ndarray) -> str:
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
    if bh < 5:
        return text
    mid  = binary[h // 2, :]
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

# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------
def llm_correct_code(text: str, language: str, line_confs: list[float] | None = None,
                     session: UserSession | None = None) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not (HAS_ANTHROPIC and api_key):
        return text
    active_model = session.active_model() if session else LLM_MODELS["haiku"]
    text = text.replace("\t", "    ")
    lines = text.splitlines()
    if not lines:
        return text

    lang_hints = {
        "python": (
            "Python 3. Indentation MUST be exact multiples of 4 spaces. "
            "Every def/class/if/elif/else/for/while/try/except/with header MUST end with `:`. "
            "Fix misreads: l->1 inside numbers, O->0 in numerics, detf->def, c1ass->class, "
            "pnnt->print, retum->return, se1f->self, e1se->else, Nuii->None."
        ),
        "javascript": (
            "JavaScript ES6+. Fix: cosnt->const, fumction->function, conso1e->console. "
            "Arrow functions: =>. Template literals: backtick. Preserve semicolons."
        ),
        "typescript": (
            "TypeScript. Same as JavaScript plus type annotations: : string, : number, generics <T>, "
            "interface, type alias. Keep all type syntax intact."
        ),
        "react": (
            "React JSX/TSX. Hooks: useState, useEffect, useRef — preserve exactly. "
            "className not class. Self-closing tags <Comp />."
        ),
        "nestjs": (
            "NestJS TypeScript. Decorators critical: @Controller, @Injectable, @Module, "
            "@Get, @Post, @Put, @Delete, @Body, @Param — preserve exactly."
        ),
        "nextjs": (
            "Next.js React. getServerSideProps, getStaticProps, getStaticPaths, NextPage. "
            "Same React rules apply."
        ),
    }
    hint      = lang_hints.get(language, "")
    lang_line = f"Language: {language}. {hint}" if hint else f"Language: {language}."

    def _prompt(snippet: str) -> str:
        return (
            "You are an expert software engineer specializing in OCR error correction.\n"
            "Fix ALL OCR character misreads in the code below.\n\n"
            f"{lang_line}\n\n"
            "Rules:\n"
            "1. Fix ALL misreads: l->1 or 1->l, O->0 or 0->O, |->I, rn->m, missing colons/semicolons\n"
            "2. Fix ALL syntax errors caused by misreads\n"
            "3. Restore proper indentation (Python: 4 spaces per level)\n"
            "4. Do NOT add, remove, or reorder lines\n"
            "5. Do NOT add docstrings or comments\n"
            "6. Output ONLY the corrected code — nothing else\n\n"
            f"OCR INPUT:\n{snippet}"
        )

    try:
        client = _make_anthropic_client(api_key)
        if line_confs is not None and len(line_confs) > 0:
            if abs(len(lines) - len(line_confs)) <= max(3, len(lines) // 5):
                padded = (list(line_confs) + [0.0] * len(lines))[:len(lines)]
                send = [False] * len(lines)
                for i, c in enumerate(padded):
                    if c < _LINE_CONF_THRESH:
                        for j in range(max(0, i - 2), min(len(lines), i + 3)):
                            send[j] = True
                n_send = sum(send)
                if 0 < n_send < len(lines) * 0.70:
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
                            model=active_model, max_tokens=max_toks,
                            messages=[{"role": "user", "content": _prompt(snippet)}],
                        )
                        fixed = resp.content[0].text.strip().splitlines()
                        result[start : end + 1] = fixed
                    return "\n".join(result)
        resp = client.messages.create(
            model=active_model, max_tokens=4096,
            messages=[{"role": "user", "content": _prompt(text)}],
        )
        return resp.content[0].text.strip()
    except Exception:
        return text


def llm_repair_syntax(text: str, error_line: int, error_msg: str,
                      session: UserSession | None = None) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not (HAS_ANTHROPIC and api_key):
        return text
    active_model = session.active_model() if session else LLM_MODELS["haiku"]
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
            model=active_model, max_tokens=256,
            messages=[{"role": "user", "content": (
                f"Fix the Python syntax error on line {err_idx + 1} of this snippet.\n"
                f"Syntax error: {error_msg}\n"
                "Return ONLY the corrected snippet - same number of lines, no markdown fences.\n\n"
                + "\n".join(ctx_lines)
            )}],
        )
        fixed  = resp.content[0].text.strip().splitlines()
        result = lines[:ctx_start] + fixed + lines[ctx_end:]
        return "\n".join(result)
    except Exception:
        return text


def llm_repair_js_syntax(text: str, error_msg: str, language: str = "javascript",
                         session: UserSession | None = None) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not (HAS_ANTHROPIC and api_key):
        return text
    active_model = session.active_model() if session else LLM_MODELS["haiku"]
    lang_note = {
        "typescript": "TypeScript — keep type annotations, generics, interfaces intact.",
        "react":      "React JSX/TSX — preserve JSX tags and component syntax.",
        "nestjs":     "NestJS TypeScript — keep all decorator syntax (@Controller etc.).",
        "nextjs":     "Next.js React — keep getServerSideProps / getStaticProps etc.",
    }.get(language, "JavaScript ES6+.")
    try:
        client = _make_anthropic_client(api_key)
        resp   = client.messages.create(
            model=active_model, max_tokens=4096,
            messages=[{"role": "user", "content": (
                f"Fix the syntax error in this {language} code.\n"
                f"Language note: {lang_note}\n"
                f"Syntax error: {error_msg}\n"
                "Return ONLY the corrected code — no markdown fences, no explanation.\n\n"
                + text
            )}],
        )
        return resp.content[0].text.strip()
    except Exception:
        return text


def llm_repair_syntax_generic(text: str, error_msg: str, language: str,
                               session: UserSession | None = None) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not (HAS_ANTHROPIC and api_key):
        return text
    active_model = session.active_model() if session else LLM_MODELS["haiku"]
    try:
        client = _make_anthropic_client(api_key)
        resp   = client.messages.create(
            model=active_model, max_tokens=4096,
            messages=[{"role": "user", "content": (
                f"Fix the syntax error in this {language} code.\n"
                f"Syntax error: {error_msg}\n"
                "Return ONLY the corrected code — no markdown fences, no explanation.\n\n"
                + text
            )}],
        )
        return resp.content[0].text.strip()
    except Exception:
        return text


def llm_fix_full_file(content: str, lang: str, model_key: str | None = None,
                      session: UserSession | None = None) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not (HAS_ANTHROPIC and api_key):
        return content
    if session and model_key:
        _model = LLM_MODELS.get(model_key, session.active_model())
    elif session:
        _model = session.active_model()
    else:
        _model = LLM_MODELS.get(model_key or "haiku", LLM_MODELS["haiku"])

    try:
        client = _make_anthropic_client(api_key)
        prompt = (
            f"You are correcting a complete {lang.upper()} source file assembled from multiple OCR captures.\n\n"
            "Fix ALL OCR misreads: l<->1, 0<->O, rn->m, |->l, `<->', ;->:.\n"
            "Fix missing/extra punctuation, broken indentation.\n"
            "Do NOT add, remove, or reorder logical blocks.\n"
            "Do NOT add comments, docstrings, or imports not in the original.\n"
            "Do NOT change variable/function/class names or logic.\n"
            "Output ONLY the corrected code — no markdown fences, no explanation.\n\n"
            f"SOURCE FILE:\n{content}"
        )
        resp = client.messages.create(
            model=_model, max_tokens=8192,
            messages=[{"role": "user", "content": prompt}],
        )
        result = resp.content[0].text.strip()
        if result.startswith("```"):
            result = "\n".join(
                ln for ln in result.splitlines()
                if not ln.strip().startswith("```")
            ).strip()
        return result if result else content
    except Exception as e:
        print(f"[llm_fix_full_file ERROR] {e}", flush=True)
        return content

# ---------------------------------------------------------------------------
# Vision OCR
# ---------------------------------------------------------------------------
def _encode_for_vision(img_np: np.ndarray, max_side: int = 2048) -> tuple[str, str]:
    h, w = img_np.shape[:2]
    long = max(h, w)
    if long > max_side:
        s = max_side / long
        img_np = cv2.resize(img_np, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    buf = BytesIO()
    Image.fromarray(img_np).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode(), "image/png"


def _vision_ocr(b64_data: str, media_type: str = "image/png",
                language_hint: str = "") -> str | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not (HAS_ANTHROPIC and api_key):
        return None
    try:
        client = _make_anthropic_client(api_key)
        if language_hint:
            lang_preamble = f"LANGUAGE: {language_hint.upper()}\n\n"
        else:
            lang_preamble = "Detect the programming language from context.\n\n"

        prompt = (
            "This image shows source code on a computer monitor, photographed with a phone.\n\n"
            + lang_preamble
            + "TASK: Transcribe every visible line of code with 100% character accuracy.\n\n"
            "RULES:\n"
            "1. OUTPUT ONLY the raw code — no markdown fences, no explanations\n"
            "2. INDENTATION: reproduce every leading space/tab exactly as displayed\n"
            "3. ALL special characters must be preserved: \\ $ # & | > < = ! ; : , . ( ) [ ] { } ` ' \"\n"
            "4. OPERATORS: == != <= >= += -= *= /= -> => := ** // must be exact\n"
            "5. DO NOT add, remove, reorder, merge, or paraphrase any line\n"
            "6. DO NOT add comments or docstrings not visible in the image\n"
            "7. Fix obvious OCR confusions: l/1/I context, 0/O context, rn->m, backtick vs quote\n"
        )
        resp = client.messages.create(
            model=VISION_MODEL, max_tokens=8192,
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64_data}},
                {"type": "text", "text": prompt},
            ]}],
        )
        result = resp.content[0].text.strip()
        if result.startswith("```"):
            result = "\n".join(l for l in result.splitlines()
                               if not l.strip().startswith("```")).strip()
        return result or None
    except Exception as e:
        print(f"[Vision API ERROR] {type(e).__name__}: {e}", flush=True)
        raise

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def decode_b64(data: str) -> np.ndarray:
    raw = base64.b64decode(data.split(",", 1)[1] if "," in data else data)
    return np.array(Image.open(BytesIO(raw)).convert("RGB"))


def text_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()

# ---------------------------------------------------------------------------
# HTTP routes
# ---------------------------------------------------------------------------
@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/exports/<user_id>")
def list_user_exports(user_id: str):
    """List all exports for a user (called from frontend history page)."""
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    payload = verify_supabase_token(token)
    if not payload or payload.get("sub") != user_id:
        return jsonify({"error": "Unauthorized"}), 401
    files = supabase_list_exports(user_id)
    result = []
    for f in files:
        full_path    = f.get("name", "")          # e.g. "user_id/exports/file.py"
        display_name = full_path.split("/")[-1]   # just "file.py"
        signed = supabase_signed_url(full_path)
        result.append({
            "name":         display_name,
            "created_at":   f.get("created_at", ""),
            "size":         f.get("metadata", {}).get("size", 0),
            "download_url": signed,
        })
    return jsonify({"files": result})

# ---------------------------------------------------------------------------
# Socket events
# ---------------------------------------------------------------------------
@socketio.on("connect")
def on_connect():
    sid  = request.sid
    sess = get_session(sid)
    token = request.args.get("token", "")
    if token:
        payload = verify_supabase_token(token)
        if payload:
            sess.user_id    = payload.get("sub", "")
            sess.user_email = payload.get("email", "")
            print(f"[connect] user={sess.user_email} sid={sid}", flush=True)

    emit("init_state", {
        "ai_enabled":              sess.ai_enabled,
        "night_mode":              sess.night_mode,
        "auto_capture":            sess.auto_capture,
        "auto_capture_frames":     AUTO_CAPTURE_FRAMES,
        "auto_clear_after_export": sess.auto_clear_after_export,
        "llm_model":               sess.llm_model_key,
        "bulk_capture":            sess.bulk_capture,
        "bulk_session_blocks":     sess.bulk_session_blocks,
        "bulk_session_number":     sess.bulk_session_number,
        "user_id":                 sess.user_id,
        "user_email":              sess.user_email,
    })


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    remove_session(sid)
    print(f"[disconnect] sid={sid}", flush=True)


@socketio.on("auth")
def on_auth(data):
    """Re-authenticate with a JWT token (called after connect if token wasn't in query)."""
    sid   = request.sid
    sess  = get_session(sid)
    token = data.get("token", "")
    payload = verify_supabase_token(token)
    if payload:
        sess.user_id    = payload.get("sub", "")
        sess.user_email = payload.get("email", "")
        emit("auth_ok", {"user_id": sess.user_id, "user_email": sess.user_email})
    else:
        emit("auth_error", {"error": "Invalid token"})


@socketio.on("set_language")
def on_set_language(data):
    sess = get_session(request.sid)
    sess.language_hint = str(data.get("language", "")).strip().lower()
    emit("language_set", {"language": sess.language_hint or "auto"})


@socketio.on("start")
def on_start():
    sess = get_session(request.sid)
    sess.capturing    = True
    sess.consec_sharp = 0
    sess.frame_buf.clear()
    sess.frame_rgb_buf.clear()
    # Create/reset the live buffer in Supabase Storage
    if sess.user_id:
        sess.current_session_path = _sb_storage_path(sess.user_id)
        supabase_write_text(sess.current_session_path, "")
    emit("status", {"capturing": True, "msg": "Capturing... hold phone steady"})


@socketio.on("stop")
def on_stop():
    sid  = request.sid
    sess = get_session(sid)
    sess.capturing = False

    with sess._lock:
        buf     = list(sess.frame_buf)
        rgb_buf = list(sess.frame_rgb_buf)
        sess.frame_buf.clear()
        sess.frame_rgb_buf.clear()

    if not rgb_buf:
        emit("status", {"capturing": False, "msg": "Stopped - no sharp frames captured"})
        return

    if len(rgb_buf) < MIN_FRAMES_CONSENSUS:
        emit("status", {"capturing": True, "msg": f"Only {len(rgb_buf)} frame(s) — processing anyway..."})

    results_with_conf: list[tuple[str, float]] = []
    best_line_confs: list[float] = []
    ai_used      = False
    text         = ""
    vision_tried = False
    api_key      = os.environ.get("ANTHROPIC_API_KEY", "")

    # Primary: Claude Vision
    if sess.ai_enabled and HAS_ANTHROPIC and api_key:
        vision_tried = True
        emit("status", {"capturing": True, "msg": "Reading code with Claude Vision..."})
        try:
            best_img        = _best_frame(rgb_buf)
            b64, media_type = _encode_for_vision(best_img)
            vision_text     = _vision_ocr(b64, media_type, sess.language_hint)
            if vision_text:
                text    = vision_text
                ai_used = True
            else:
                emit("status", {"capturing": False, "msg": "Vision returned empty — hold phone steadier"})
                return
        except Exception as e:
            emit("status", {"capturing": False, "msg": f"Vision OCR failed: {e}. Disable AI to use Tesseract."})
            return

    # Fallback: Tesseract
    if not text and rgb_buf:
        try:
            avg_img = pixel_average_frames(rgb_buf)
            t_avg, c_avg, lc_avg, _ = _tesseract_with_confidence(preprocess(avg_img, sess.night_mode))
            t_avg = fix_code_symbols(t_avg).strip()
            if t_avg:
                results_with_conf.append((t_avg, c_avg))
                best_line_confs = lc_avg
        except Exception:
            pass

        if len(rgb_buf) >= 2:
            try:
                aligned = align_frames(rgb_buf)
                for rgb in aligned:
                    t, c, lc, _ = _tesseract_with_confidence(preprocess(rgb, sess.night_mode))
                    t = fix_code_symbols(t).strip()
                    if t:
                        results_with_conf.append((t, c))
                        if c > max((x for _, x in results_with_conf[:-1]), default=-1):
                            best_line_confs = lc
            except Exception:
                pass

        if results_with_conf:
            best_tess_conf = max(c for _, c in results_with_conf)
            if best_tess_conf < 35:
                emit("status", {"capturing": False, "msg": f"Tesseract confidence only {best_tess_conf:.0f}% — enable AI for better results"})
                return
            text = confidence_weighted_consensus(results_with_conf).strip()
        elif buf:
            text = fix_code_symbols(character_level_consensus(buf) if len(buf) > 1 else buf[0]).strip()

        if text and rgb_buf:
            try:
                text = reconstruct_indentation(text, rgb_buf[0])
            except Exception:
                pass

    if not text:
        emit("status", {"capturing": False, "msg": "OCR returned empty — enable AI or move closer"})
        return

    lang = sess.language_hint if sess.language_hint else detect_language(text)

    # Syntax-guided repair
    if not ai_used and sess.ai_enabled and HAS_ANTHROPIC and api_key and lang == "python":
        try:
            ok, err = check_python_syntax(text)
            if not ok and err:
                raw_lineno = err.split(":")[0].replace("Line ", "").strip()
                if raw_lineno.isdigit():
                    repaired = llm_repair_syntax(text, int(raw_lineno), err, sess)
                    if repaired != text:
                        text = repaired
                        ai_used = True
        except Exception:
            pass

    # Full LLM correction
    if not ai_used and sess.ai_enabled and HAS_ANTHROPIC and api_key:
        corrected = llm_correct_code(text, lang, best_line_confs if best_line_confs else None, sess)
        if corrected and corrected != text:
            text = corrected
            ai_used = True

    # Final syntax check + second-pass repair
    _JS_LANGS = {"javascript", "typescript", "react", "nestjs", "nextjs"}
    if lang == "python":
        syntax_ok, syntax_err = check_python_syntax(text)
    elif lang in _JS_LANGS:
        syntax_ok, syntax_err = check_js_syntax(text)
        if not syntax_ok and syntax_err and sess.ai_enabled and HAS_ANTHROPIC and api_key:
            repaired = llm_repair_js_syntax(text, syntax_err, lang, sess)
            if repaired and repaired != text:
                text = repaired
                ai_used = True
                syntax_ok, syntax_err = check_js_syntax(text)
    elif lang == "go":
        syntax_ok, syntax_err = check_go_syntax(text)
        if not syntax_ok and syntax_err and sess.ai_enabled and HAS_ANTHROPIC and api_key:
            repaired = llm_repair_syntax_generic(text, syntax_err, "go", sess)
            if repaired and repaired != text:
                text = repaired
                ai_used = True
                syntax_ok, syntax_err = check_go_syntax(text)
    elif lang == "css":
        syntax_ok, syntax_err = check_css_syntax(text)
        if not syntax_ok and syntax_err and sess.ai_enabled and HAS_ANTHROPIC and api_key:
            repaired = llm_repair_syntax_generic(text, syntax_err, "css", sess)
            if repaired and repaired != text:
                text = repaired
                ai_used = True
                syntax_ok, syntax_err = check_css_syntax(text)
    else:
        syntax_ok, syntax_err = True, None

    # Duplicate check
    sim = text_similarity(sess.last_saved, text)
    if sim > SIMILARITY_THRESH:
        emit("status", {"capturing": False, "msg": f"Duplicate block skipped ({sim:.0%} match)"})
        return

    sess.last_saved = text

    # Save to Supabase Storage (per user) or local fallback
    if sess.user_id and SUPABASE_URL:
        supabase_append_text(_sb_storage_path(sess.user_id), text + "\n\n")
    else:
        # Fallback: local file for dev/testing
        try:
            with open(f"output_{sid}.txt", "a", encoding="utf-8") as f:
                f.write(text + "\n\n")
        except Exception:
            pass

    _bulk_block_num = None
    if sess.bulk_capture:
        sess.bulk_session_blocks += 1
        _bulk_block_num = sess.bulk_session_blocks

    emit("result", {
        "text": text, "lang": lang, "ai_used": ai_used,
        "syntax_ok": syntax_ok, "syntax_err": syntax_err,
    })
    _status_data: dict = {
        "capturing": False,
        "msg": (f"Block {_bulk_block_num} saved" if _bulk_block_num else "Saved"),
    }
    if _bulk_block_num is not None:
        _status_data["bulk_block"] = _bulk_block_num
    emit("status", _status_data)

    if sess.auto_clear_after_export and sess.user_id and SUPABASE_URL:
        supabase_write_text(_sb_storage_path(sess.user_id), "")
        emit("status", {"msg": "Auto-cleared for next session"})


@socketio.on("photo")
def on_photo(data):
    sid  = request.sid
    sess = get_session(sid)
    emit("status", {"capturing": True, "msg": "Processing photo..."})
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
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")

    if sess.ai_enabled and HAS_ANTHROPIC and api_key:
        emit("status", {"capturing": True, "msg": "Reading code with Claude Vision..."})
        try:
            b64_data, media_type = _encode_for_vision(img_np)
            vision_text = _vision_ocr(b64_data, media_type, sess.language_hint)
        except Exception as ve:
            vision_text = None
            emit("status", {"capturing": True, "msg": f"Vision error: {ve} — falling back..."})
        if vision_text:
            text    = vision_text
            ai_used = True
            conf    = 100.0

    if not text:
        try:
            processed               = preprocess(img_np, sess.night_mode)
            text, conf, lc, heatmap = _tesseract_with_confidence(processed, build_heatmap=True)
            text = fix_code_symbols(text).strip()
        except Exception as e:
            emit("status", {"capturing": False, "msg": f"OCR error: {e}"})
            return

    if not text:
        emit("status", {"capturing": False, "msg": "OCR returned empty — try larger font or better focus"})
        return

    lang = sess.language_hint if sess.language_hint else detect_language(text)

    emit("quality", {
        "score": round(conf, 1), "label": "sharp",
        "glare": False, "glare_pct": 0,
        "zoom": "good", "zoom_msg": "",
        "frames": 1, "text": text, "language": lang,
        "conf": round(conf, 1),
        "heatmap": heatmap if heatmap else None,
    })

    if not ai_used:
        try:
            text = reconstruct_indentation(text, img_np)
        except Exception:
            pass
        if sess.ai_enabled and HAS_ANTHROPIC and api_key and lang == "python":
            try:
                ok, err = check_python_syntax(text)
                if not ok and err:
                    raw_lineno = err.split(":")[0].replace("Line ", "").strip()
                    if raw_lineno.isdigit():
                        repaired = llm_repair_syntax(text, int(raw_lineno), err, sess)
                        if repaired != text:
                            text = repaired
                            ai_used = True
            except Exception:
                pass
        if sess.ai_enabled and HAS_ANTHROPIC and api_key and not ai_used:
            corrected = llm_correct_code(text, lang, lc if lc else None, sess)
            if corrected and corrected != text:
                text = corrected
                ai_used = True

    _JS_LANGS = {"javascript", "typescript", "react", "nestjs", "nextjs"}
    if lang == "python":
        syntax_ok, syntax_err = check_python_syntax(text)
    elif lang in _JS_LANGS:
        syntax_ok, syntax_err = check_js_syntax(text)
        if not syntax_ok and syntax_err and sess.ai_enabled and HAS_ANTHROPIC and api_key:
            repaired = llm_repair_js_syntax(text, syntax_err, lang, sess)
            if repaired and repaired != text:
                text = repaired
                ai_used = True
                syntax_ok, syntax_err = check_js_syntax(text)
    elif lang == "go":
        syntax_ok, syntax_err = check_go_syntax(text)
    elif lang == "css":
        syntax_ok, syntax_err = check_css_syntax(text)
    else:
        syntax_ok, syntax_err = True, None

    sim = text_similarity(sess.last_saved, text)
    if sim > SIMILARITY_THRESH:
        emit("status", {"capturing": False, "msg": f"Duplicate photo skipped ({sim:.0%} match)"})
        return

    sess.last_saved = text

    if sess.user_id and SUPABASE_URL:
        supabase_append_text(_sb_storage_path(sess.user_id), text + "\n\n")
    else:
        try:
            with open(f"output_{sid}.txt", "a", encoding="utf-8") as f:
                f.write(text + "\n\n")
        except Exception:
            pass

    _bulk_block_num = None
    if sess.bulk_capture:
        sess.bulk_session_blocks += 1
        _bulk_block_num = sess.bulk_session_blocks

    emit("result", {
        "text": text, "lang": lang, "ai_used": ai_used,
        "syntax_ok": syntax_ok, "syntax_err": syntax_err,
    })
    _status_data = {
        "capturing": False,
        "msg": (f"Photo — Block {_bulk_block_num} saved" if _bulk_block_num else "Photo saved"),
    }
    if _bulk_block_num is not None:
        _status_data["bulk_block"] = _bulk_block_num
    emit("status", _status_data)

    if sess.auto_clear_after_export and sess.user_id and SUPABASE_URL:
        supabase_write_text(_sb_storage_path(sess.user_id), "")
        emit("status", {"msg": "Auto-cleared for next session"})


@socketio.on("frame")
def on_frame(data):
    sess = get_session(request.sid)
    if not sess.capturing:
        return
    try:
        _frame_queue.put_nowait((data, request.sid))
    except queue.Full:
        pass


def _frame_worker():
    while True:
        item = _frame_queue.get()
        if item is None:
            break
        data, sid = item
        sess = get_session(sid)
        if not sess.capturing:
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

        with sess._lock:
            frame_count = len(sess.frame_buf)

        if label == "blurry" or has_glare:
            with sess._lock:
                sess.consec_sharp = 0
            socketio.emit("quality", {
                "score": round(score, 1), "label": label,
                "glare": has_glare, "glare_pct": glare_pct,
                "zoom": zoom_dir, "zoom_msg": zoom_msg,
                "frames": frame_count,
            }, to=sid)
            continue

        try:
            text, conf, heatmap = run_ocr_frame(img_np)
        except Exception as e:
            print(f"[OCR error] {e}")
            continue
        text = fix_code_symbols(text).strip()

        with sess._lock:
            sess.frame_rgb_buf.append(img_np)
            if text:
                sess.frame_buf.append(text)
            frame_count = len(sess.frame_rgb_buf)
            sess.consec_sharp += 1
        lang = (sess.language_hint if sess.language_hint else detect_language(text)) if text else "unknown"

        socketio.emit("quality", {
            "score": round(score, 1), "label": label,
            "glare": has_glare, "glare_pct": glare_pct,
            "zoom": zoom_dir, "zoom_msg": zoom_msg,
            "frames": frame_count,
            "text": text or None, "language": lang if text else None,
            "conf": round(conf, 1) if text else None,
            "heatmap": heatmap if (text and heatmap) else None,
        }, to=sid)

        if sess.auto_capture and sess.consec_sharp >= AUTO_CAPTURE_FRAMES:
            socketio.emit("auto_captured", {
                "msg": f"Auto-captured after {AUTO_CAPTURE_FRAMES} sharp frames",
                "frames": frame_count,
            }, to=sid)


@socketio.on("set_ai")
def on_set_ai(data):
    sess = get_session(request.sid)
    sess.ai_enabled = bool(data.get("enabled", False))
    emit("status", {"msg": f"AI {'enabled' if sess.ai_enabled else 'disabled'}"})


@socketio.on("set_night")
def on_set_night(data):
    sess = get_session(request.sid)
    sess.night_mode = bool(data.get("enabled", False))
    emit("status", {"msg": f"Night mode {'on' if sess.night_mode else 'off'}"})


@socketio.on("set_auto")
def on_set_auto(data):
    sess = get_session(request.sid)
    sess.auto_capture = bool(data.get("enabled", False))
    emit("status", {"msg": f"Auto-capture {'on' if sess.auto_capture else 'off'}"})


@socketio.on("set_auto_clear")
def on_set_auto_clear(data):
    sess = get_session(request.sid)
    sess.auto_clear_after_export = bool(data.get("enabled", False))
    emit("status", {"msg": f"Auto-clear after export {'on' if sess.auto_clear_after_export else 'off'}"})


@socketio.on("set_model")
def on_set_model(data):
    sess = get_session(request.sid)
    key = data.get("model", "haiku")
    if key in LLM_MODELS:
        sess.llm_model_key = key
    emit("status", {"msg": f"LLM model: {sess.llm_model_key}"})


@socketio.on("set_bulk")
def on_set_bulk(data):
    sess = get_session(request.sid)
    enabled = bool(data.get("enabled", False))
    if enabled and not sess.bulk_capture:
        sess.bulk_session_number += 1
    sess.bulk_capture        = enabled
    sess.bulk_session_blocks = 0
    emit("status", {
        "msg":          (f"Bulk capture on — session {sess.bulk_session_number}" if enabled else "Bulk capture off"),
        "bulk_block":   0,
        "bulk_session": sess.bulk_session_number,
    })


@socketio.on("reset_bulk_session")
def on_reset_bulk_session():
    sess = get_session(request.sid)
    sess.bulk_session_blocks = 0
    emit("status", {"msg": "Bulk session reset", "bulk_block": 0})


@socketio.on("fix_session_file")
def on_fix_session_file(data=None):
    sess = get_session(request.sid)
    _d = data or {}

    use_ai    = bool(_d.get("ai_fix", sess.ai_enabled))
    use_model = str(_d.get("model", sess.llm_model_key)).strip().lower()
    if use_model not in ("haiku", "sonnet"):
        use_model = sess.llm_model_key

    if sess.capturing:
        emit("session_fixed", {"error": "Stop the capture before exporting"})
        return
    if not sess.bulk_capture:
        emit("session_fixed", {"error": "Enable Bulk Capture mode first"})
        return
    if sess.bulk_session_blocks == 0:
        emit("session_fixed", {"error": "No blocks captured yet"})
        return

    # Read current buffer from Supabase or local fallback
    if sess.user_id and SUPABASE_URL:
        content = supabase_read_text(_sb_storage_path(sess.user_id)).strip()
    else:
        try:
            with open(f"output_{sess.sid}.txt", encoding="utf-8") as f:
                content = f.read().strip()
        except Exception:
            content = ""

    if not content:
        emit("session_fixed", {"error": "No content captured yet"})
        return

    lang = sess.language_hint if sess.language_hint else detect_language(content)
    if not lang or lang == "unknown":
        lang = "text"

    corrected = content
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if use_ai and HAS_ANTHROPIC and api_key:
        n_blocks = sess.bulk_session_blocks
        emit("status", {
            "capturing": True,
            "msg": f"Fixing full session ({lang}, {n_blocks} block{'s' if n_blocks != 1 else ''}) with Claude {use_model.capitalize()}...",
        })
        try:
            fixed = llm_fix_full_file(content, lang, model_key=use_model, session=sess)
            if fixed and fixed.strip():
                corrected = fixed
        except Exception as e:
            emit("status", {"capturing": True, "msg": f"Fix warning: {e} — saving raw OCR"})
    else:
        emit("status", {"capturing": True, "msg": f"Exporting raw session ({lang})..."})

    # Build filename
    user_filename = str(_d.get("filename", "")).strip()
    if user_filename:
        user_filename = os.path.basename(user_filename)
        user_filename = re.sub(r"[^\w\-. ()]+", "_", user_filename).strip("_. ")
    if user_filename:
        new_name = user_filename
    else:
        ext     = _EXT_MAP.get(lang, ".txt")
        now_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        new_name = f"{now_str}_{lang}_session{sess.bulk_session_number}{ext}"

    # Save export to Supabase Storage
    download_url = ""
    if sess.user_id and SUPABASE_URL:
        export_path = _sb_export_path(sess.user_id, new_name)
        supabase_write_text(export_path, corrected)
        download_url = supabase_signed_url(export_path, expires_in=86400)
        # Log to captures table
        supabase_log_capture(sess.user_id, new_name, lang, sess.bulk_session_blocks)
    else:
        try:
            with open(new_name, "w", encoding="utf-8") as f:
                f.write(corrected)
        except Exception as e:
            emit("session_fixed", {"error": f"Save failed: {e}"})
            return

    emit("session_fixed", {
        "text":         corrected,
        "lang":         lang,
        "filename":     new_name,
        "blocks":       sess.bulk_session_blocks,
        "session":      sess.bulk_session_number,
        "download_url": download_url,
    })
    emit("status", {
        "capturing": False,
        "msg": f"Session {sess.bulk_session_number} exported as {new_name}",
    })


@socketio.on("save_result")
def on_save_result(data=None):
    """Save accumulated scans to Supabase Storage exports folder."""
    sess = get_session(request.sid)
    _d = data or {}

    # Always read from live_buffer first (all accumulated scans), fall back to last scan
    if sess.user_id and SUPABASE_URL:
        text = supabase_read_text(_sb_storage_path(sess.user_id)).strip()
    else:
        try:
            with open(f"output_{sess.sid}.txt", encoding="utf-8") as f:
                text = f.read().strip()
        except Exception:
            text = ""
    if not text:
        text = sess.last_saved.strip()
    if not text:
        emit("result_saved", {"error": "No content to save"})
        return

    use_ai    = bool(_d.get("ai_fix", False))
    use_model = str(_d.get("model", sess.llm_model_key)).strip().lower()
    if use_model not in ("haiku", "sonnet"):
        use_model = sess.llm_model_key

    lang = str(_d.get("lang", "")).strip()
    if not lang or lang == "unknown":
        lang = detect_language(text)
    if not lang or lang == "unknown":
        lang = "text"

    corrected = text
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if use_ai and HAS_ANTHROPIC and api_key:
        emit("status", {"capturing": False, "msg": f"Fixing with Claude {use_model.capitalize()}..."})
        try:
            fixed = llm_fix_full_file(text, lang, model_key=use_model, session=sess)
            if fixed and fixed.strip():
                corrected = fixed
        except Exception as e:
            emit("status", {"capturing": False, "msg": f"Fix warning: {e} — saving raw OCR"})

    user_filename = str(_d.get("filename", "")).strip()
    if user_filename:
        user_filename = os.path.basename(user_filename)
        user_filename = re.sub(r"[^\w\-. ()]+", "_", user_filename).strip("_. ")
    if user_filename:
        new_name = user_filename
    else:
        ext     = _EXT_MAP.get(lang, ".txt")
        now_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        new_name = f"{now_str}_{lang}{ext}"

    download_url = ""
    n_blocks = len([b for b in text.split("\n\n") if b.strip()])
    if sess.user_id and SUPABASE_URL:
        export_path = _sb_export_path(sess.user_id, new_name)
        ok = supabase_write_text(export_path, corrected)
        if not ok:
            emit("result_saved", {"error": "Failed to save to Supabase Storage — check bucket 'camtocode' exists and SUPABASE_SERVICE_KEY is correct"})
            return
        download_url = supabase_signed_url(export_path, expires_in=86400)
        supabase_log_capture(sess.user_id, new_name, lang, n_blocks)
    else:
        try:
            with open(new_name, "w", encoding="utf-8") as f:
                f.write(corrected)
        except Exception as e:
            emit("result_saved", {"error": f"Save failed: {e}"})
            return

    emit("result_saved", {
        "text":         corrected,
        "lang":         lang,
        "filename":     new_name,
        "download_url": download_url,
    })
    emit("status", {"capturing": False, "msg": f"Saved as {new_name}"})
    # Clear the live buffer so next set of scans starts fresh
    if sess.user_id and SUPABASE_URL:
        supabase_write_text(_sb_storage_path(sess.user_id), "")
    sess.last_saved = ""


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
# Start frame worker thread at module level so it runs under gunicorn too
_worker_thread = threading.Thread(target=_frame_worker, daemon=True)
_worker_thread.start()
print("[startup] Frame worker thread started", flush=True)
supabase_ensure_bucket()

if __name__ == "__main__":
    print(f"\nCamToCode (multi-user) ready on port {PORT}\n", flush=True)
    socketio.run(app, host="0.0.0.0", port=PORT, debug=False, use_reloader=False)
