# tests/test_normalized_document.py

"""Curation emits the Normalized Document from issue #8, and keeps it stable.

The server indexes curated documents, so their shape is the contract between
Knowledge Normalization and Knowledge Indexing. The same contract is pinned on
the consumer side by toip-mcp-server/test/handoff.test.ts, which reads
normalized_document.example.json from this directory.
"""

import io
import json
from contextlib import redirect_stdout
from pathlib import Path

from src import curate
from src.py_saidify import py_verify_urn
from tests.fixtures import CacheFixture

EXAMPLE = Path(__file__).with_name("normalized_document.example.json")


def shape(value):
    if isinstance(value, dict):
        return {key: shape(item) for key, item in value.items()}
    if isinstance(value, list):
        return [shape(value[0])] if value else []
    return type(value).__name__


class CuratedDocumentsFollowTheContract(CacheFixture):
    def setUp(self) -> None:
        super().setUp()

        self.curated = self.tmp / "out" / "curated"
        self.write_zoom(self.raw / "zoom" / "example" / "example_community_call")
        self.ingest()

    def curate(self, *extra: str) -> list[dict]:
        argv = [
            "--processed",
            str(self.processed),
            "--curated",
            str(self.curated),
            "--registry",
            str(self.registry_file),
            "--quiet",
            *extra,
        ]

        with redirect_stdout(io.StringIO()):
            self.assertEqual(curate.main(argv), 0)

        return [
            json.loads(path.read_text(encoding="utf-8"))
            for path in sorted(self.curated.glob("*.json"))
        ]

    def test_the_document_has_the_shape_of_the_shared_example(self) -> None:
        (document,) = self.curate()
        example = json.loads(EXAMPLE.read_text(encoding="utf-8"))

        self.assertEqual(shape(document), shape(example))
        self.assertEqual(list(document), list(example))

    def test_the_shared_example_is_itself_a_valid_document(self) -> None:
        example = json.loads(EXAMPLE.read_text(encoding="utf-8"))

        self.assertTrue(py_verify_urn(example, example["identifier"], label="identifier"))

    def test_the_identifier_is_a_urn_said_over_the_whole_document(self) -> None:
        (document,) = self.curate()

        self.assertTrue(document["identifier"].startswith("urn:said:E"))
        self.assertTrue(py_verify_urn(document, document["identifier"], label="identifier"))

        tampered = dict(document, content=dict(document["content"], text="edited"))
        self.assertFalse(py_verify_urn(tampered, document["identifier"], label="identifier"))

    def test_fields_land_in_their_sections(self) -> None:
        (document,) = self.curate()

        self.assertEqual(document["schema_version"], 1)
        self.assertEqual(document["document"]["project"], "Example Project")
        self.assertEqual(document["document"]["organizational_unit"], ["Example Working Group"])
        self.assertEqual(document["document"]["date"], "2026-02-11")
        self.assertEqual(document["provenance"]["source_system"], "Zoom")
        self.assertEqual(
            document["provenance"]["source_url"], "https://example.invalid/meetings/example"
        )
        self.assertEqual(document["content"]["content_type"], "Transcript")
        self.assertIn("draft governance framework", document["content"]["text"])

        for flat in ("id", "identifier_type", "asset_type", "collected_at", "title"):
            self.assertNotIn(flat, document)

    def test_the_artifact_id_is_the_content_hash_of_the_source_file(self) -> None:
        (document,) = self.curate()
        (entry,) = self.registry().values()

        self.assertEqual(document["provenance"]["artifact_id"], f"sha256:{entry['file_hash']}")
        self.assertEqual(document["provenance"]["collected_at"], entry["processed_at"])

    def test_the_file_is_named_by_the_readable_id(self) -> None:
        self.curate()

        (path,) = self.curated.glob("*.json")
        self.assertTrue(path.name.startswith("zoom-example-project-transcript-"))

    def test_identifiers_hold_across_repeated_and_forced_runs(self) -> None:
        first = [document["identifier"] for document in self.curate()]

        self.assertEqual([document["identifier"] for document in self.curate()], first)

        self.ingest("--force")
        self.assertEqual([document["identifier"] for document in self.curate()], first)
