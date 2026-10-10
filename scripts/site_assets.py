"""Copy declared, versioned site inputs; never recover inputs from a previous dist."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def prepare_assets(*, preserve_generated=False):
    for source_root, destination_root in (
        (ROOT / 'content/public', ROOT / 'dist'),
        (ROOT / 'content/assets', ROOT / 'dist/assets'),
    ):
        if not source_root.is_dir():
            raise FileNotFoundError(f'Missing source inputs: {source_root}')
        for source in sorted(source_root.rglob('*')):
            if source.is_symlink():
                raise ValueError(f'Symlink is not a versioned asset: {source}')
            if source.is_file():
                destination = destination_root / source.relative_to(source_root)
                destination.parent.mkdir(parents=True, exist_ok=True)
                if preserve_generated and source_root.name == 'public' and destination.is_file():
                    continue
                if not destination.is_file() or destination.read_bytes() != source.read_bytes():
                    shutil.copy2(source, destination)


if __name__ == '__main__':
    prepare_assets()
