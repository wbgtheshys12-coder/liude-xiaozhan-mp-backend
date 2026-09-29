"""Fetch pinned Argos model archives into the build image, with SHA-256 verification."""
import hashlib
import pathlib
import shutil
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / ".offline-models"
MODELS = {
    "zh-en": (
        "https://argos-net.com/v1/translate-zh_en-1_9.argosmodel",
        "62E7AF5A3A48B530E47B7B3E5C78C2DE79073ECD815750D2BF3AB35B4A67DA2D",
    ),
    "en-de": (
        "https://argos-net.com/v1/translate-en_de-1_3.argosmodel",
        "6CD847F0C06C9C66013E6B0932E07FD54A6D90894659C02BF6C5247B72FB25B1",
    ),
}


def extract_checked(archive: pathlib.Path, target: pathlib.Path) -> None:
    target_resolved = target.resolve()
    with zipfile.ZipFile(archive) as package:
        for member in package.infolist():
            destination = (target / member.filename).resolve()
            if destination != target_resolved and target_resolved not in destination.parents:
                raise RuntimeError("Model archive contains an unsafe path")
        package.extractall(target)
    if not list(target.rglob("model.bin")) or not list(target.rglob("sentencepiece.model")):
        raise RuntimeError("Model archive is incomplete")


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for key, (url, expected) in MODELS.items():
        target = DEST / key
        archive = DEST / f"{key}.argosmodel"
        if target.exists():
            shutil.rmtree(target)
        digest = hashlib.sha256()
        request = urllib.request.Request(url, headers={"User-Agent": "LiudeXiaozhan-build/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response, archive.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest().upper() != expected:
            archive.unlink(missing_ok=True)
            raise RuntimeError(f"SHA-256 validation failed for pinned {key} model")
        extract_checked(archive, target)
        archive.unlink()
    print("Pinned offline translation models installed and verified.")


if __name__ == "__main__":
    main()
