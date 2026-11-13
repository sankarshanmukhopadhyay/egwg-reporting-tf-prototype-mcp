"""Opt-in schema v2 is identity-bound and rejects missing acquisition evidence."""

import hashlib
import io
import json
from contextlib import redirect_stdout
from pathlib import Path

from src import curate
from src.py_saidify import py_verify_urn
from tests.fixtures import CacheFixture


class NormalizedV2Tests(CacheFixture):
    def setUp(self):
        super().setUp()
        self.write_zoom(self.raw / "zoom" / "example" / "example_community_call")
        self.ingest()
        self.catalog = self.tmp / "catalog"
        self.catalog.mkdir()
        for key, entry in self.registry().items():
            digest = entry["file_hash"]
            (self.catalog / f"{digest}.json").write_text(
                json.dumps({
                    "schema_version": 1,
                    "artifact_id": f"sha256:{digest}",
                    "observations": [{"registry_path": key}],
                }), encoding="utf-8"
            )
        self.curated_v2 = self.tmp / "curated-v2"

    def produce(self):
        args = [
            "--processed", str(self.processed),
            "--curated", str(self.curated_v2),
            "--registry", str(self.registry_file),
            "--artifact-catalog", str(self.catalog),
            "--schema-version", "2", "--quiet",
        ]
        with redirect_stdout(io.StringIO()):
            self.assertEqual(curate.main(args), 0)
        docs = [json.loads(path.read_text(encoding="utf-8"))
                for path in self.curated_v2.glob("*.json")]
        self.assertEqual(len(docs), 1)
        return docs[0]

    def test_v2_said_and_repeatability(self):
        doc = self.produce()
        self.assertEqual(doc["schema_version"], 2)
        self.assertEqual(list(doc["provenance"]), ["artifact_ids"])
        self.assertTrue(py_verify_urn(doc, doc["identifier"], label="identifier"))
        self.assertEqual(self.produce()["identifier"], doc["identifier"])
        modified = dict(doc, provenance={"artifact_ids": ["sha256:" + "f" * 64]})
        self.assertFalse(py_verify_urn(modified, doc["identifier"], label="identifier"))

    def test_does_not_invent_collection_time(self):
        doc = self.produce()
        self.assertNotIn("collected_at", doc["provenance"])
        self.assertNotIn("source_system", doc["provenance"])

    def test_unresolved_artifact_catalog_fails_closed(self):
        for path in self.catalog.glob("*.json"):
            path.unlink()
        with self.assertRaisesRegex(SystemExit, "source evidence unavailable"):
            self.produce()
