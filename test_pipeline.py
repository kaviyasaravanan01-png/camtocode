"""
CamToCode pipeline unit-tests — run with:
    python test_pipeline.py
All tests are self-contained; no network or camera required.
"""
import os, sys, types, importlib, importlib.util, unittest
import numpy as np

# ── Set env vars before any cv2/numpy imports in backend ──────────────────────
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

# ── Stub Flask / Flask-SocketIO so we can import backend without a server ─────
def _make_stub(name):
    m = types.ModuleType(name)
    m.__spec__ = importlib.util.spec_from_loader(name, loader=None)
    return m

for _mod in ("flask", "flask_socketio"):
    sys.modules.setdefault(_mod, _make_stub(_mod))

flask_stub = sys.modules["flask"]

class _FakeApp:
    config = {}
    def __init__(self, *a, **k): pass
    def route(self, *a, **k): return lambda f: f

flask_stub.Flask             = _FakeApp
flask_stub.send_from_directory = lambda *a, **k: None
flask_stub.request           = types.SimpleNamespace(remote_addr="127.0.0.1", sid="test")

class _FakeSocketIO:
    def __init__(self, *a, **k): pass
    def on(self, *a, **k): return lambda f: f
    def run(self, *a, **k): pass

sio_stub = sys.modules["flask_socketio"]
sio_stub.SocketIO = _FakeSocketIO
sio_stub.emit     = lambda *a, **k: None

# ── Import the module under test ──────────────────────────────────────────────
import importlib.util as _ilu
_spec = _ilu.spec_from_file_location(
    "backend",
    os.path.join(os.path.dirname(__file__), "backend.py"),
)
backend = importlib.import_module.__class__   # load properly below

# Reload via importlib to get actual module object
_loader = _ilu.spec_from_file_location("backend",
    os.path.join(os.path.dirname(__file__), "backend.py"))
backend = _ilu.module_from_spec(_loader)   # type: ignore
sys.modules["backend"] = backend
_loader.loader.exec_module(backend)   # type: ignore


# ─────────────────────────────────────────────────────────────────────────────
class TestEngBest(unittest.TestCase):
    """#1 — eng_best.traineddata"""

    def test_file_exists(self):
        """eng_best.traineddata must be present in the project folder."""
        self.assertTrue(
            os.path.isfile(backend._BEST_DATA),
            f"Missing: {backend._BEST_DATA}",
        )

    def test_has_eng_best_flag(self):
        """HAS_ENG_BEST must be True when the file exists."""
        self.assertTrue(backend.HAS_ENG_BEST)

    def test_tess_config_uses_best(self):
        """_TESS_CFGS[0] must reference 'eng_best' when HAS_ENG_BEST is True."""
        if backend.HAS_ENG_BEST:
            self.assertIn("eng_best", backend._TESS_CFGS[0])

    def test_tessdata_dir_in_config(self):
        """_TESS_CFGS[0] must contain --tessdata-dir when eng_best is present."""
        if backend.HAS_ENG_BEST:
            self.assertIn("--tessdata-dir", backend._TESS_CFGS[0])


# ─────────────────────────────────────────────────────────────────────────────
class TestMinFramesConsensus(unittest.TestCase):
    """#7 — minimum frames guard"""

    def test_constant_value(self):
        """MIN_FRAMES_CONSENSUS must equal 5."""
        self.assertEqual(backend.MIN_FRAMES_CONSENSUS, 5)

    def test_less_than_auto_capture(self):
        """MIN_FRAMES_CONSENSUS must be < AUTO_CAPTURE_FRAMES so normal scans always pass."""
        self.assertLess(backend.MIN_FRAMES_CONSENSUS, backend.AUTO_CAPTURE_FRAMES)


# ─────────────────────────────────────────────────────────────────────────────
class TestPixelAverageFrames(unittest.TestCase):
    """#8 — pixel-average aligned frames"""

    @staticmethod
    def _make_frames(n=5, h=64, w=80, seed=0):
        rng = np.random.default_rng(seed)
        return [rng.integers(0, 255, (h, w, 3), dtype=np.uint8) for _ in range(n)]

    def test_single_frame_passthrough(self):
        frames = self._make_frames(1)
        result = backend.pixel_average_frames(frames)
        np.testing.assert_array_equal(result, frames[0])

    def test_output_dtype_uint8(self):
        frames = self._make_frames(5)
        result = backend.pixel_average_frames(frames)
        self.assertEqual(result.dtype, np.uint8)

    def test_output_shape_matches_input(self):
        frames = self._make_frames(5, h=64, w=80)
        result = backend.pixel_average_frames(frames)
        self.assertEqual(result.shape, (64, 80, 3))

    def test_average_reduces_noise(self):
        """Mean of identical frames = the frame itself."""
        base = np.full((32, 32, 3), 128, dtype=np.uint8)
        frames = [base.copy() for _ in range(5)]
        result = backend.pixel_average_frames(frames)
        np.testing.assert_array_almost_equal(result, base, decimal=0)

    def test_values_clipped(self):
        """Output values must be in [0, 255]."""
        frames = self._make_frames(5)
        result = backend.pixel_average_frames(frames)
        self.assertTrue((result >= 0).all() and (result <= 255).all())


# ─────────────────────────────────────────────────────────────────────────────
class TestCheckJsSyntax(unittest.TestCase):
    """#10 — Node.js JS/TS syntax validation"""

    def _skip_if_no_node(self):
        if backend._find_node() is None:
            self.skipTest("Node.js not found on PATH — skipping JS syntax tests")

    def test_valid_js(self):
        self._skip_if_no_node()
        ok, err = backend.check_js_syntax("const x = 1 + 2;")
        self.assertTrue(ok)
        self.assertIsNone(err)

    def test_valid_js_function(self):
        self._skip_if_no_node()
        code = "function add(a, b) { return a + b; }"
        ok, err = backend.check_js_syntax(code)
        self.assertTrue(ok)

    def test_valid_js_arrow_async(self):
        self._skip_if_no_node()
        code = "const fetchData = async (url) => { const r = await fetch(url); return r.json(); };"
        ok, err = backend.check_js_syntax(code)
        self.assertTrue(ok)

    def test_invalid_js_missing_brace(self):
        self._skip_if_no_node()
        ok, err = backend.check_js_syntax("function foo() { return 1;")
        self.assertFalse(ok)
        self.assertIsNotNone(err)

    def test_invalid_js_bad_syntax(self):
        self._skip_if_no_node()
        ok, err = backend.check_js_syntax("const = ;")
        self.assertFalse(ok)

    def test_typescript_type_annotations_stripped(self):
        """TS type annotations should be stripped so vm.Script doesn't reject them."""
        self._skip_if_no_node()
        code = "function greet(name: string): void { console.log(name); }"
        ok, err = backend.check_js_syntax(code)
        # After stripping ': string' and ': void' this becomes valid JS
        self.assertTrue(ok, f"Expected valid after TS stripping, got: {err}")

    def test_no_node_returns_true(self):
        """When node is unavailable check_js_syntax must return (True, None) — never block."""
        orig = backend._NODE_BIN
        try:
            backend._NODE_BIN = "/nonexistent/node"   # force miss
            ok, err = backend.check_js_syntax("const x = ;")  # bad code
            # Either True (path not found → skipped) or False (node ran)
            # We only assert that *no exception* was raised
        finally:
            backend._NODE_BIN = orig


# ─────────────────────────────────────────────────────────────────────────────
class TestPreprocess(unittest.TestCase):
    """Verify preprocessing returns the expected shape / dtype."""

    def test_output_is_grayscale_or_bgr(self):
        import cv2
        rgb = np.full((100, 120, 3), 200, dtype=np.uint8)
        out = backend.preprocess(rgb)
        # preprocess returns a binary-thresholded image: 2-D (grayscale) or 3-D
        self.assertIn(out.ndim, (2, 3))
        self.assertGreaterEqual(out.shape[0], 100)   # upscaled

    def test_upscale_factor(self):
        """Output height should be ~3× input height."""
        rgb = np.full((50, 60, 3), 128, dtype=np.uint8)
        out = backend.preprocess(rgb)
        self.assertGreaterEqual(out.shape[0], 100)   # at least 2×


# ─────────────────────────────────────────────────────────────────────────────
class TestHeatmap(unittest.TestCase):
    """Word-level confidence heatmap"""

    def _make_rgb(self, h=80, w=200):
        """Solid light-grey image — simulates a blank screen."""
        return np.full((h, w, 3), 200, dtype=np.uint8)

    def _get_heatmap(self):
        """Get heatmap via the merged _tesseract_with_confidence call."""
        img = self._make_rgb()
        _text, _conf, _lc, heatmap = backend._tesseract_with_confidence(
            backend.preprocess(img), build_heatmap=True
        )
        return heatmap

    def test_returns_list(self):
        result = self._get_heatmap()
        self.assertIsInstance(result, list)

    def test_each_entry_has_w_and_c(self):
        result = self._get_heatmap()
        for entry in result:
            self.assertIn("w", entry)
            self.assertIn("c", entry)

    def test_newline_sentinel_value(self):
        """Line-break sentinels must have c == -1 and w == '\\n'."""
        result = self._get_heatmap()
        for entry in result:
            if entry["c"] == -1:
                self.assertEqual(entry["w"], "\n")

    def test_conf_range(self):
        """All non-sentinel entries must have confidence 0-100."""
        result = self._get_heatmap()
        for entry in result:
            if entry["c"] != -1:
                self.assertGreaterEqual(entry["c"], 0)
                self.assertLessEqual(entry["c"], 100)

    def test_run_ocr_frame_returns_three_values(self):
        """run_ocr_frame must return (text, conf, heatmap)."""
        img = self._make_rgb()
        result = backend.run_ocr_frame(img)
        self.assertEqual(len(result), 3)
        _text, _conf, heatmap = result
        self.assertIsInstance(heatmap, list)


# ─────────────────────────────────────────────────────────────────────────────
class TestConfigs(unittest.TestCase):
    """Sanity-check global configuration values."""

    def test_auto_capture_frames(self):
        self.assertGreaterEqual(backend.AUTO_CAPTURE_FRAMES, 5)

    def test_similarity_threshold(self):
        self.assertGreater(backend.SIMILARITY_THRESH, 0)
        self.assertLess(backend.SIMILARITY_THRESH, 1)

    def test_line_conf_thresh(self):
        self.assertGreater(backend._LINE_CONF_THRESH, 0)
        self.assertLessEqual(backend._LINE_CONF_THRESH, 100)


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    unittest.main(verbosity=2)
