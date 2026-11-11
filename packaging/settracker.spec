# PyInstaller-Bauanleitung:  pyinstaller packaging/settracker.spec
# Ergebnis: dist/SetTracker/ (Windows, Linux) bzw. dist/SetTracker.app (macOS)
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = Path(SPECPATH).parent
datas = [(str(ROOT / "settracker" / "static"), "settracker/static")]
binaries, hidden = [], []
# librosa lädt seine Untermodule über Stub-Dateien (.pyi) nach – das ganze Paket samt Daten mitnehmen.
# pywebview: eigenes Programmfenster (WebKit auf dem Mac, WebView2 unter Windows).
for package in ("librosa", "soundfile", "soxr", "audioread", "lazy_loader", "webview"):
    d, b, h = collect_all(package)
    datas += d
    binaries += b
    hidden += h
hidden += collect_submodules("uvicorn") + ["sklearn.utils._typedefs", "sklearn.neighbors._partition_nodes"]

a = Analysis(
    [str(ROOT / "packaging" / "launcher.py")],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden,
    excludes=["tkinter", "matplotlib", "pytest", "IPython", "pandas", "PIL", "PyInstaller"],
    noarchive=False,
)
pyz = PYZ(a.pure)
icon = str(ROOT / "packaging" / ("icon.icns" if sys.platform == "darwin" else "icon.ico"))
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="SetTracker", console=False, icon=icon, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, name="SetTracker", upx=False)

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="SetTracker.app",
        icon=icon,
        bundle_identifier="io.github.dconair.settracker",
        version="0.2.0",
        info_plist={
            "CFBundleDisplayName": "SetTracker",
            "NSHighResolutionCapable": True,
        },
    )
