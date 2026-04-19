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

_TESSDATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)))
_BEST_DATA    = os.path.join(_TESSDATA_DIR, "eng_best.traineddata")
HAS_ENG_BEST  = os.path.isfile(_BEST_DATA)

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

try:
    import anthropic as _anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

MIN_SHARPNESS = 50

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
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return 0
    heights = [cv2.boundingRect(c)[3] for c in contours]
    return int(np.median(heights)) if heights else 0