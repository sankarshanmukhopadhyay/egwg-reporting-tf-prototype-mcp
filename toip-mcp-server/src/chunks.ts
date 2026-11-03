import type { EmbeddedChunk, NormalizedDocument } from './types.js'

export const EMBEDDING_MODEL = 'bge-small-en-v1.5'

const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 50

export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  for (let i = 0; i < words.length; i += size - overlap) {
    chunks.push(words.slice(i, i + size).join(' '))
    if (i + size >= words.length) break
  }
  return chunks
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function isNormalizedDocument(value: unknown): value is NormalizedDocument {
  const doc = value as NormalizedDocument
  return (
    typeof doc === 'object' &&
    doc !== null &&
    doc.schema_version === 1 &&
    typeof doc.identifier === 'string' &&
    doc.identifier !== '' &&
    typeof doc.document === 'object' &&
    doc.document !== null &&
    isStringArray(doc.document.organizational_unit) &&
    typeof doc.provenance === 'object' &&
    doc.provenance !== null &&
    typeof doc.content === 'object' &&
    doc.content !== null &&
    typeof doc.content.text === 'string'
  )
}

export function toEmbeddedChunks(doc: NormalizedDocument): EmbeddedChunk[] {
  return chunkText(doc.content.text).map((text, i) => ({
    schema_version: 1,
    chunk_id: `${doc.identifier}#chunk-${String(i + 1).padStart(3, '0')}`,
    document_id: doc.identifier,
    chunk_index: i + 1,
    content_type: doc.content.content_type,
    date: doc.document.date,
    organizational_unit: doc.document.organizational_unit,
    text,
    embedding_model: EMBEDDING_MODEL,
  }))
}

export function chunkMetadata(chunk: EmbeddedChunk): Record<string, string | number> {
  return {
    schema_version: chunk.schema_version,
    chunk_id: chunk.chunk_id,
    document_id: chunk.document_id,
    chunk_index: chunk.chunk_index,
    content_type: chunk.content_type,
    date: chunk.date,
    organizational_unit: JSON.stringify(chunk.organizational_unit),
    text: chunk.text,
    embedding_model: chunk.embedding_model,
  }
}
