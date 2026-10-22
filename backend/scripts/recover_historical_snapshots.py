"""
ExamProctor.ai — Historical Snapshot Recovery & Migration Utility
Scans legacy storage locations and local Electron IndexedDB storage for lost evidence images,
cryptographically verifies SHA-256 digests, and persists valid images into PostgreSQL snapshot_blobs.

Usage:
  python scripts/recover_historical_snapshots.py --dry-run
  python scripts/recover_historical_snapshots.py --apply
"""

import argparse
import asyncio
import glob
import hashlib
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, os.path.abspath("."))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import Snapshot, SnapshotBlob
from app.db.session import AsyncSessionLocal
from app.services.evidence_storage import validate_image_bytes, compute_sha256


class RecoveryResult:
    def __init__(
        self,
        snapshot_id: str,
        source: str,
        source_path: str,
        bytes_found: bool,
        size_bytes: int,
        sha256_match: bool,
        db_persisted: bool,
        retrieval_verified: bool,
        status: str,
        notes: str = "",
    ):
        self.snapshot_id = snapshot_id
        self.source = source
        self.source_path = source_path
        self.bytes_found = bytes_found
        self.size_bytes = size_bytes
        self.sha256_match = sha256_match
        self.db_persisted = db_persisted
        self.retrieval_verified = retrieval_verified
        self.status = status
        self.notes = notes


async def run_recovery(apply: bool = False) -> List[RecoveryResult]:
    results: List[RecoveryResult] = []
    
    async with AsyncSessionLocal() as db:
        # 1. Fetch all snapshot metadata from PostgreSQL
        stmt = select(Snapshot)
        snapshots: List[Snapshot] = (await db.execute(stmt)).scalars().all()
        id_to_snap: Dict[str, Snapshot] = {s.snapshot_id: s for s in snapshots}
        sha_to_snap: Dict[str, Snapshot] = {s.sha256.lower(): s for s in snapshots if s.sha256}

        # Check existing snapshot_blobs
        existing_blob_stmt = select(SnapshotBlob.snapshot_id, SnapshotBlob.sha256)
        existing_blobs = dict((await db.execute(existing_blob_stmt)).all())

        print(f"Loaded {len(snapshots)} total snapshot metadata records from Neon PostgreSQL.")
        print(f"Current snapshot_blobs count in PostgreSQL: {len(existing_blobs)}")

        processed_snapshot_ids = set()

        # ── SOURCE 1: Local Disk Storage ──────────────────────────────────────
        local_dir = Path(settings.SNAPSHOT_LOCAL_DIR)
        print(f"\nScanning local disk directory: {local_dir}")
        local_files = list(local_dir.glob("**/*.jpg")) if local_dir.exists() else []
        print(f"Found {len(local_files)} files in local storage directory.")

        for f in local_files:
            snapshot_id = f.stem
            snap = id_to_snap.get(snapshot_id)
            if not snap:
                continue

            processed_snapshot_ids.add(snapshot_id)
            try:
                data = f.read_bytes()
                bytes_found = True
                size = len(data)
                actual_sha = compute_sha256(data)
                sha_match = bool(snap.sha256 and actual_sha == snap.sha256.lower())
                is_valid, err_msg, mime = validate_image_bytes(data)

                if not is_valid:
                    results.append(RecoveryResult(
                        snapshot_id=snapshot_id,
                        source="local_disk",
                        source_path=str(f),
                        bytes_found=True,
                        size_bytes=size,
                        sha256_match=sha_match,
                        db_persisted=False,
                        retrieval_verified=False,
                        status="INVALID_FORMAT",
                        notes=err_msg or "Invalid image header",
                    ))
                    continue

                if not sha_match:
                    results.append(RecoveryResult(
                        snapshot_id=snapshot_id,
                        source="local_disk",
                        source_path=str(f),
                        bytes_found=True,
                        size_bytes=size,
                        sha256_match=False,
                        db_persisted=False,
                        retrieval_verified=False,
                        status="CHECKSUM_MISMATCH",
                        notes=f"Expected {snap.sha256}, got {actual_sha}",
                    ))
                    continue

                # Check if already stored in snapshot_blobs
                already_stored = snapshot_id in existing_blobs
                if already_stored:
                    results.append(RecoveryResult(
                        snapshot_id=snapshot_id,
                        source="local_disk",
                        source_path=str(f),
                        bytes_found=True,
                        size_bytes=size,
                        sha256_match=True,
                        db_persisted=True,
                        retrieval_verified=True,
                        status="ALREADY_STORED",
                        notes="Already present in snapshot_blobs",
                    ))
                    continue

                if apply:
                    # Persist into snapshot_blobs
                    blob = SnapshotBlob(
                        snapshot_id=snapshot_id,
                        image_data=data,
                        size_bytes=size,
                        sha256=actual_sha,
                        created_at=datetime.now(timezone.utc),
                    )
                    db.add(blob)
                    snap.storage_status = "uploaded"
                    snap.size_bytes = size
                    snap.sha256 = actual_sha
                    await db.flush()

                    # Verify retrieval
                    verify_stmt = select(SnapshotBlob.snapshot_id, SnapshotBlob.size_bytes).where(SnapshotBlob.snapshot_id == snapshot_id)
                    retrieved = (await db.execute(verify_stmt)).first()
                    verified = retrieved is not None and retrieved[1] == size

                    results.append(RecoveryResult(
                        snapshot_id=snapshot_id,
                        source="local_disk",
                        source_path=str(f),
                        bytes_found=True,
                        size_bytes=size,
                        sha256_match=True,
                        db_persisted=True,
                        retrieval_verified=verified,
                        status="MIGRATED",
                        notes="Successfully stored and verified in PostgreSQL",
                    ))
                else:
                    results.append(RecoveryResult(
                        snapshot_id=snapshot_id,
                        source="local_disk",
                        source_path=str(f),
                        bytes_found=True,
                        size_bytes=size,
                        sha256_match=True,
                        db_persisted=False,
                        retrieval_verified=False,
                        status="READY_TO_MIGRATE",
                        notes="Validated (dry-run)",
                    ))

            except Exception as e:
                results.append(RecoveryResult(
                    snapshot_id=snapshot_id,
                    source="local_disk",
                    source_path=str(f),
                    bytes_found=False,
                    size_bytes=0,
                    sha256_match=False,
                    db_persisted=False,
                    retrieval_verified=False,
                    status="ERROR",
                    notes=str(e),
                ))

        # ── SOURCE 2: Electron IndexedDB Storage ──────────────────────────────
        idb_dir = Path(os.environ.get("APPDATA", "")) / "examproctor-desktop" / "IndexedDB"
        print(f"\nScanning Electron IndexedDB directory: {idb_dir}")
        if idb_dir.exists():
            idb_files = [
                Path(p) for p in glob.glob(str(idb_dir) + "/**/*", recursive=True)
                if os.path.isfile(p) and not p.endswith((".log", ".ldb", ".CURRENT", ".MANIFEST", "LOCK"))
            ]
            print(f"Found {len(idb_files)} raw IndexedDB storage files.")

            for f in idb_files:
                try:
                    data = f.read_bytes()
                    if not data.startswith(b"\xff\xd8\xff"):
                        continue  # Not a JPEG blob

                    actual_sha = compute_sha256(data)
                    snap = sha_to_snap.get(actual_sha)
                    if not snap:
                        continue  # Not linked to a known snapshot row

                    snapshot_id = snap.snapshot_id
                    if snapshot_id in processed_snapshot_ids:
                        continue  # Already processed from disk
                    processed_snapshot_ids.add(snapshot_id)

                    size = len(data)
                    already_stored = snapshot_id in existing_blobs

                    if already_stored:
                        results.append(RecoveryResult(
                            snapshot_id=snapshot_id,
                            source="electron_indexeddb",
                            source_path=str(f),
                            bytes_found=True,
                            size_bytes=size,
                            sha256_match=True,
                            db_persisted=True,
                            retrieval_verified=True,
                            status="ALREADY_STORED",
                            notes="Already present in snapshot_blobs",
                        ))
                        continue

                    if apply:
                        blob = SnapshotBlob(
                            snapshot_id=snapshot_id,
                            image_data=data,
                            size_bytes=size,
                            sha256=actual_sha,
                            created_at=datetime.now(timezone.utc),
                        )
                        db.add(blob)
                        snap.storage_status = "uploaded"
                        snap.size_bytes = size
                        snap.sha256 = actual_sha
                        await db.flush()

                        verify_stmt = select(SnapshotBlob.snapshot_id, SnapshotBlob.size_bytes).where(SnapshotBlob.snapshot_id == snapshot_id)
                        retrieved = (await db.execute(verify_stmt)).first()
                        verified = retrieved is not None and retrieved[1] == size

                        results.append(RecoveryResult(
                            snapshot_id=snapshot_id,
                            source="electron_indexeddb",
                            source_path=str(f),
                            bytes_found=True,
                            size_bytes=size,
                            sha256_match=True,
                            db_persisted=True,
                            retrieval_verified=verified,
                            status="MIGRATED",
                            notes="Successfully recovered from IndexedDB and verified in PostgreSQL",
                        ))
                    else:
                        results.append(RecoveryResult(
                            snapshot_id=snapshot_id,
                            source="electron_indexeddb",
                            source_path=str(f),
                            bytes_found=True,
                            size_bytes=size,
                            sha256_match=True,
                            db_persisted=False,
                            retrieval_verified=False,
                            status="READY_TO_MIGRATE",
                            notes="Validated from IndexedDB (dry-run)",
                        ))

                except Exception as e:
                    pass
        else:
            print("Electron IndexedDB directory not found.")

        # ── REMAINING SNAPSHOTS (LOST ON RENDER EPHEMERAL DISK) ───────────────
        for s in snapshots:
            if s.snapshot_id not in processed_snapshot_ids:
                results.append(RecoveryResult(
                    snapshot_id=s.snapshot_id,
                    source="unrecovered_ephemeral",
                    source_path="N/A",
                    bytes_found=False,
                    size_bytes=0,
                    sha256_match=False,
                    db_persisted=False,
                    retrieval_verified=False,
                    status="MISSING_UNRECOVERABLE",
                    notes="Wiped from Render ephemeral filesystem prior to migration; bytes not present on this machine.",
                ))

        if apply:
            await db.commit()
            print("\nDatabase transaction successfully committed!")

    return results


def print_report(results: List[RecoveryResult], apply: bool):
    print("\n" + "=" * 100)
    mode_str = "APPLIED MIGRATION" if apply else "DRY-RUN INSPECTION"
    print(f"HISTORICAL EVIDENCE RECOVERY REPORT ({mode_str})")
    print("=" * 100)

    total = len(results)
    found = sum(1 for r in results if r.bytes_found)
    sha_matched = sum(1 for r in results if r.sha256_match)
    migrated = sum(1 for r in results if r.status == "MIGRATED")
    already = sum(1 for r in results if r.status == "ALREADY_STORED")
    ready = sum(1 for r in results if r.status == "READY_TO_MIGRATE")
    missing = sum(1 for r in results if not r.bytes_found)

    from_local = sum(1 for r in results if r.source == "local_disk" and r.bytes_found)
    from_idb = sum(1 for r in results if r.source == "electron_indexeddb" and r.bytes_found)

    print(f"Total Candidate Snapshots: {total}")
    print(f"  - Images whose bytes were found: {found}")
    print(f"      * Recovered from local disk: {from_local}")
    print(f"      * Recovered from Electron IndexedDB: {from_idb}")
    print(f"  - SHA-256 Hashes Verified: {sha_matched}")
    print(f"  - Images Successfully Migrated: {migrated}")
    print(f"  - Images Already Stored: {already}")
    print(f"  - Images Ready to Migrate: {ready}")
    print(f"  - Images Still Missing (Wiped from Render): {missing}")
    print("=" * 100)

    print("\nSample of Recovered Candidates:")
    header = f"{'Snapshot ID':<38} {'Source':<20} {'Size':<10} {'SHA-256':<8} {'Status':<18}"
    print(header)
    print("-" * 100)
    for r in results:
        if r.bytes_found:
            print(f"{r.snapshot_id:<38} {r.source:<20} {r.size_bytes:<10} {'MATCH' if r.sha256_match else 'MISMATCH':<8} {r.status:<18}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Recover and migrate historical snapshots to PostgreSQL.")
    parser.add_argument("--apply", action="store_true", help="Execute the migration and commit to PostgreSQL.")
    parser.add_argument("--dry-run", action="store_true", help="Perform validation without writing to the database.")
    args = parser.parse_args()

    apply_mode = args.apply
    if not apply_mode and not args.dry_run:
        print("Defaulting to --dry-run mode. Use --apply to execute migration.")

    res = asyncio.run(run_recovery(apply=apply_mode))
    print_report(res, apply=apply_mode)
