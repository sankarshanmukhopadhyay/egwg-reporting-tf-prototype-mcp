import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessConsistency } from '../src/consistency.js'
import { hash } from '@huggingface/blake3-jit'
const unsigned = {
  schema_version: 1, identifier: 'urn:said:Edoc',
  document: { project: 'example', organizational_unit: ['Group'], title: 'Example', date: '2026-01-01' },
  provenance: { artifact_id: 'sha256:abc', source_system: 'Zoom',
    source_identifier: 'id', source_url: '', collected_at: '2026-01-01T00:00:00Z' },
  content: { content_type: 'Transcript', text: 'example content' },
}
const placeholder = 'urn:said:' + '#'.repeat(44)
const serialized = JSON.stringify({ ...unsigned, identifier: placeholder })
const digest = hash(Buffer.from(serialized, 'utf8'))
const identifier = 'urn:said:E' + Buffer.from(new Uint8Array([0, ...digest])).toString('base64url').slice(1)
const doc = { ...unsigned, identifier }
const chunk = (id = `${doc.identifier}#chunk-001`, parent = doc.identifier) => ({
  id, metadata: { schema_version: 1, document_id: parent, chunk_id: id,
    chunk_index: 1, text: 'example content', embedding_model: 'bge-small-en-v1.5' },
})
const curated = [{ filename: 'doc.json', parsed: doc }]
test('healthy handoff has no findings', () => {
  const report = assessConsistency([chunk()], curated)
  assert.equal(report.status, 'consistent')
  assert.deepEqual(report.findings, [])
})
test('orphaned index reference is visible, not treated as success', () => {
  const report = assessConsistency([chunk('urn:said:Eold#chunk-001', 'urn:said:Eold')], curated)
  assert.ok(report.findings.some(f => f.code === 'missing_parent_document'))
  assert.ok(report.findings.some(f => f.code === 'missing_indexed_document'))
})
test('malformed inputs and duplicate chunk identity are reported', () => {
  const report = assessConsistency([
    chunk(), chunk(), { id: 'bad', metadata: { document_id: '', chunk_id: '' } },
  ], [...curated, { filename: 'invalid.json', parsed: { schema_version: 1 } }])
  for (const code of ['invalid_curated_document', 'duplicate_chunk_identifier',
    'missing_document_reference']) assert.ok(report.findings.some(f => f.code === code), code)
})
test('mismatched chunk parent is detected', () => {
  const report = assessConsistency([chunk('urn:said:Eother#chunk-001')], curated)
  assert.ok(report.findings.some(f => f.code === 'invalid_chunk_identifier'))
})
test('unindexed and duplicate normalized documents are distinct findings', () => {
  const report = assessConsistency([], [...curated, { filename: 'dup.json', parsed: doc }])
  assert.ok(report.findings.some(f => f.code === 'missing_indexed_document'))
  assert.ok(report.findings.some(f => f.code === 'duplicate_document_identifier'))
})

test('empty normalized text requires no indexed chunks', () => {
  const emptyUnsigned = { ...doc, content: { ...doc.content, text: '' } }
  const encoded = JSON.stringify({ ...emptyUnsigned, identifier: placeholder })
  const digest = hash(Buffer.from(encoded, 'utf8'))
  const emptyId = 'urn:said:E' + Buffer.from(new Uint8Array([0, ...digest])).toString('base64url').slice(1)
  const report = assessConsistency([], [{ filename: 'empty.json', parsed: { ...emptyUnsigned, identifier: emptyId } }])
  assert.equal(report.status, 'consistent')
})

test('modified normalized document retaining its SAID is not consistent', () => {
  const altered = { ...doc, document: { ...doc.document, title: 'altered' } }
  const report = assessConsistency([chunk()], [{ filename: 'altered.json', parsed: altered }])
  assert.ok(report.findings.some(f => f.code === 'invalid_curated_document'))
  assert.equal(report.status, 'findings')
})

test('missing parent is summarized once for multiple chunks', () => {
  const missing = 'urn:said:Eabsent'
  const report = assessConsistency([
    chunk(`${missing}#chunk-001`, missing),
    chunk(`${missing}#chunk-002`, missing),
  ], curated)
  const findings = report.findings.filter(f => f.code === 'missing_parent_document')
  assert.equal(findings.length, 1)
  assert.equal(findings[0].subject, missing)
  assert.match(findings[0].detail, /2 indexed chunk/)
})
