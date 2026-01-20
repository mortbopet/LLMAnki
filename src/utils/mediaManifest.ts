/**
 * Media manifest serializers for APKG export.
 * 
 * Anki supports two formats for the media manifest:
 * 1. Legacy JSON format: {"0": "file1.jpg", "1": "file2.png", ...}
 *    - Compatible with all Anki versions
 *    - Simple and human-readable
 * 
 * 2. Protobuf format (Anki 23+): MediaEntries message
 *    - More compact for large collections
 *    - Includes file size and SHA1 hash
 *    - Requires meta file with VERSION_LATEST and collection.anki21b database
 */

import * as protobuf from 'protobufjs';
import { anki } from '../proto/anki.js';

// ============================================================================
// Types
// ============================================================================

export type MediaManifestFormat = 'legacy' | 'modern';

export interface MediaManifestEntry {
  index: number;
  filename: string;
  size?: number;
  sha1?: Uint8Array;
}

export interface MediaManifestSerializer {
  readonly format: MediaManifestFormat;
  readonly description: string;
  serialize(entries: MediaManifestEntry[]): Uint8Array;
}

// ============================================================================
// PackageMetadata Protobuf (for meta file)
// ============================================================================

/**
 * Version enum from Anki's import_export.proto
 */
export const PackageVersion = {
  VERSION_UNKNOWN: 0,
  VERSION_LEGACY_1: 1,  // collection.anki2
  VERSION_LEGACY_2: 2,  // collection.anki21
  VERSION_LATEST: 3,    // collection.anki21b with zstd compression
} as const;

// Define PackageMetadata protobuf schema
const PackageMetadataProtoType = new protobuf.Type("PackageMetadata")
  .add(new protobuf.Field("version", 1, "int32"));

const metaProtoRoot = new protobuf.Root().add(PackageMetadataProtoType);
const PackageMetadataMessage = metaProtoRoot.lookupType("PackageMetadata");

/**
 * Creates a PackageMetadata protobuf message for the meta file.
 */
export function createPackageMetadata(version: number): Uint8Array {
  const message = PackageMetadataMessage.create({ version });
  return PackageMetadataMessage.encode(message).finish();
}

// ============================================================================
// Legacy JSON Format Serializer
// ============================================================================

/**
 * Serializes media manifest as JSON hashmap.
 * Format: {"0": "filename1.jpg", "1": "filename2.png", ...}
 * 
 * This is the legacy format that works with all Anki versions.
 */
export class LegacyMediaManifestSerializer implements MediaManifestSerializer {
  readonly format: MediaManifestFormat = 'legacy';
  readonly description = 'JSON format (compatible with all Anki versions)';

  serialize(entries: MediaManifestEntry[]): Uint8Array {
    const mediaJson: Record<string, string> = {};
    
    for (const entry of entries) {
      mediaJson[entry.index.toString()] = entry.filename;
    }
    
    const jsonString = JSON.stringify(mediaJson);
    return new TextEncoder().encode(jsonString);
  }
}

/**
 * Serializes media manifest as Protocol Buffers.
 * 
 * This is the modern format used by Anki 23+ (VERSION_LATEST).
 * More compact and includes file metadata.
 */
export class ProtobufMediaManifestSerializer implements MediaManifestSerializer {
  readonly format: MediaManifestFormat = 'modern';
  readonly description = 'Protobuf format (Anki 23+, more compact)';

  serialize(entries: MediaManifestEntry[]): Uint8Array {
    const protoEntries = entries.map(entry => ({
      name: entry.filename,
      size: entry.size ?? 0,
      sha1: entry.sha1 ?? new Uint8Array(0),
      legacyZipFilename: entry.index,
    }));

    const message = anki.MediaEntries.create({ entries: protoEntries });
    return anki.MediaEntries.encode(message).finish();
  }
}

// ============================================================================
// Factory and Utilities
// ============================================================================

const serializers: Record<MediaManifestFormat, MediaManifestSerializer> = {
  legacy: new LegacyMediaManifestSerializer(),
  modern: new ProtobufMediaManifestSerializer(),
};

/**
 * Get a media manifest serializer for the specified format.
 */
export function getMediaManifestSerializer(format: MediaManifestFormat): MediaManifestSerializer {
  return serializers[format];
}

/**
 * Get all available serializers.
 */
export function getAvailableSerializers(): MediaManifestSerializer[] {
  return Object.values(serializers);
}

/**
 * Create media manifest entries from a filename->blob map.
 * Optionally computes file sizes.
 */
export function createMediaManifestEntries(
  media: Map<string, Blob>,
  includeSize: boolean = false
): MediaManifestEntry[] {
  const entries: MediaManifestEntry[] = [];
  let index = 0;
  
  for (const [filename, blob] of media) {
    entries.push({
      index,
      filename,
      size: includeSize ? blob.size : undefined,
    });
    index++;
  }
  
  return entries;
}
