import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isNormalizedDocument, toEmbeddedChunks, chunkMetadata } from '../src/chunks.js'
import { loadDocuments, toSearchResult } from '../src/documents.js'
import { verifyNormalizedSaid } from '../src/said.js'
import type { NormalizedDocument } from '../src/types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.join(here, '..', '..', 'mcp_data_generation', 'tests',
                          'normalized_document.example.json')

async function example(): Promise<NormalizedDocument> {
  const parsed: unknown = JSON.parse(await fs.readFile(fixture, 'utf8'))
  assert.ok(isNormalizedDocument(parsed))
  return parsed
}

test('Python-generated canonical SAID is independently verified by the consumer', async () => {
  const doc = await example()
  assert.equal(verifyNormalizedSaid(doc), true)
  assert.equal(verifyNormalizedSaid({ ...doc, identifier: 'urn:said:E' + 'A'.repeat(43) }), false)
})

test('metadata, content and provenance mutation cannot be laundered as resolved retrieval', async () => {
  const original = await example()
  const [chunk] = toEmbeddedChunks(original)
  const metadata = chunkMetadata(chunk)
  const variants: NormalizedDocument[] = [
    { ...original, document: { ...original.document, title: 'Forged title' } },
    { ...original, provenance: { ...original.provenance, source_url: 'https://attacker.invalid' } },
    { ...original, content: { ...original.content, text: 'forged transcript' } },
    { ...original, document: {
      ...original.document, organizational_unit: [...original.document.organizational_unit, 'Forged WG']
    } },
  ]
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'toip-said-integrity-'))
  try {
    for (const [n, candidate] of variants.entries()) {
      assert.equal(verifyNormalizedSaid(candidate), false)
      await fs.writeFile(path.join(dir, `candidate-${n}.json`), JSON.stringify(candidate))
    }
    const loaded = await loadDocuments(dir)
    assert.equal(loaded.size, 0)
    const joined = toSearchResult(metadata, 0.8, loaded.get(original.identifier))
    assert.equal(joined.status, 'unresolved')
    assert.equal(joined.status === 'unresolved' && joined.reason, 'missing_document')
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('valid full document passes and is reduced to safe retrieval metadata', async () => {
  const doc = await example()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'toip-valid-said-'))
  try {
    await fs.writeFile(path.join(dir, 'good.json'), JSON.stringify(doc))
    const found = await loadDocuments(dir)
    const [chunk] = toEmbeddedChunks(doc)
    const resolution = toSearchResult(chunkMetadata(chunk), 0.5, found.get(doc.identifier))
    assert.equal(resolution.status, 'resolved')
    assert.equal(resolution.status === 'resolved' && resolution.result.title, doc.document.title)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
