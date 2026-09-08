"""Back up an existing SQLite database, including committed WAL data, without stopping it."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
import shutil
import sqlite3
import tempfile
import time
import uuid


def backup(source, directory):
    source = Path(source).resolve(strict=True)
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = Path(tempfile.mkdtemp(prefix='.partial-', dir=directory))
    destination = directory / ('attendance-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex + '.sqlite')
    deadline = time.monotonic() + 60

    def progress(status, remaining, total):
        if time.monotonic() > deadline:
            raise TimeoutError('Backup exceeded 60 seconds; no completed snapshot published.')

    try:
        with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True, timeout=5)) as original:
            with closing(sqlite3.connect(temporary / 'snapshot.sqlite')) as snapshot:
                original.backup(snapshot, pages=100, progress=progress, sleep=0.05)
                if snapshot.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
                    raise RuntimeError('Snapshot failed SQLite integrity check.')
                if snapshot.execute('PRAGMA foreign_key_check').fetchone() is not None:
                    raise RuntimeError('Snapshot failed foreign key check.')
        (temporary / 'snapshot.sqlite').chmod(0o600)
        (temporary / 'snapshot.sqlite').rename(destination)
        return destination
    finally:
        shutil.rmtree(temporary)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database')
    parser.add_argument('directory')
    args = parser.parse_args()
    print(backup(args.database, args.directory))
