// Debug script to compare reference deck with our export
import JSZip from 'jszip';
import fs from 'fs';
import { decompress } from 'fzstd';

async function main() {
  // Read reference deck
  const refData = fs.readFileSync('src/test/test_deck.apkg');
  const refZip = await JSZip.loadAsync(refData);
  
  console.log('=== REFERENCE DECK ===');
  console.log('Files:', Object.keys(refZip.files));
  
  // Check meta
  const refMeta = await refZip.file('meta')?.async('uint8array');
  console.log('Meta bytes:', Array.from(refMeta).map(b => b.toString(16).padStart(2, '0')).join(' '));
  
  // Check collection.anki21b
  const refDb21b = await refZip.file('collection.anki21b')?.async('uint8array');
  console.log('collection.anki21b size:', refDb21b.length);
  console.log('collection.anki21b header:', Array.from(refDb21b.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
  
  // Decompress and check SQLite header
  const refDbDecomp = decompress(refDb21b);
  console.log('Decompressed size:', refDbDecomp.length);
  console.log('SQLite header:', Buffer.from(refDbDecomp.slice(0, 16)).toString('ascii'));
  
  // Check collection.anki2
  const refDb2 = await refZip.file('collection.anki2')?.async('uint8array');
  console.log('collection.anki2 size:', refDb2?.length);
  console.log('collection.anki2 header:', Buffer.from(refDb2?.slice(0, 16) || []).toString('ascii'));
  
  // Check media manifest
  const refMedia = await refZip.file('media')?.async('uint8array');
  console.log('media size:', refMedia.length);
  console.log('media header:', Array.from(refMedia.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' '));
  
  // Decompress media
  const refMediaDecomp = decompress(refMedia);
  console.log('media decompressed size:', refMediaDecomp.length);
  console.log('media decompressed:', Array.from(refMediaDecomp).map(b => b.toString(16).padStart(2, '0')).join(' '));
  
  // Check media file 0
  const refMedia0 = await refZip.file('0')?.async('uint8array');
  console.log('media file 0 size:', refMedia0.length);
  console.log('media file 0 header:', Array.from(refMedia0.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' '));
  
  // Decompress media file 0
  const refMedia0Decomp = decompress(refMedia0);
  console.log('media file 0 decompressed size:', refMedia0Decomp.length);
  
  // Check if exported file exists
  if (fs.existsSync('exported_test.apkg')) {
    console.log('\n=== EXPORTED DECK ===');
    const expData = fs.readFileSync('exported_test.apkg');
    const expZip = await JSZip.loadAsync(expData);
    
    console.log('Files:', Object.keys(expZip.files));
    
    const expMeta = await expZip.file('meta')?.async('uint8array');
    console.log('Meta bytes:', Array.from(expMeta).map(b => b.toString(16).padStart(2, '0')).join(' '));
    
    const expDb21b = await expZip.file('collection.anki21b')?.async('uint8array');
    console.log('collection.anki21b size:', expDb21b.length);
    console.log('collection.anki21b header:', Array.from(expDb21b.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
    
    try {
      const expDbDecomp = decompress(expDb21b);
      console.log('Decompressed size:', expDbDecomp.length);
      console.log('SQLite header:', Buffer.from(expDbDecomp.slice(0, 16)).toString('ascii'));
    } catch (e) {
      console.log('DECOMPRESSION FAILED:', e.message);
    }
  }
}

main().catch(console.error);
