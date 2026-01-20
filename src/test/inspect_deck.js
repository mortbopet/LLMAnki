import fs from 'fs';
import JSZip from 'jszip';
import { decompress } from 'fzstd';
import initSqlJs from 'sql.js';

(async () => {
  const data = fs.readFileSync('./test_deck.apkg');
  const zip = await JSZip.loadAsync(data);
  console.log('Files:', Object.keys(zip.files));
  
  // Check meta
  const meta = await zip.file('meta')?.async('uint8array');
  console.log('Meta bytes:', Array.from(meta).map(b => b.toString(16).padStart(2, '0')).join(' '));
  
  const SQL = await initSqlJs();
  
  // Check collection.anki2 (uncompressed reference)
  console.log('\n=== collection.anki2 (uncompressed) ===');
  let dbData = await zip.file('collection.anki2')?.async('uint8array');
  console.log('Size:', dbData.length);
  console.log('Header:', new TextDecoder('ascii').decode(dbData.slice(0, 16)));
  
  let db2 = new SQL.Database(dbData);
  let tables2 = db2.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log('Tables:', tables2[0]?.values.map(v => v[0]));
  
  // Check col table content
  let col = db2.exec('SELECT * FROM col');
  if (col.length > 0) {
    console.log('Col columns:', col[0].columns);
    console.log('Col row:', col[0].values[0]);
  }
  
  // Check notes
  let notes2 = db2.exec('SELECT id, flds FROM notes');
  console.log('Notes count:', notes2[0]?.values.length || 0);
  
  db2.close();
  
  // Also check anki21b 
  console.log('\n=== collection.anki21b (compressed) ===');
  let db21b = await zip.file('collection.anki21b')?.async('uint8array');
  console.log('Size:', db21b.length);
  console.log('Magic:', Array.from(db21b.slice(0,4)).map(b => b.toString(16).padStart(2, '0')).join(' '));
  
  // Decompress and parse
  const decompressed = decompress(db21b);
  console.log('Decompressed size:', decompressed.length);
  
  const db = new SQL.Database(decompressed);
  
  // Get tables
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log('Tables:', tables[0].values.map(v => v[0]));
  
  // Get notes
  const notes = db.exec('SELECT id, flds FROM notes LIMIT 1');
  if (notes.length > 0) {
    console.log('First note ID:', notes[0].values[0][0]);
    console.log('First note fields (truncated):', String(notes[0].values[0][1]).substring(0, 100));
  }
  
  db.close();
})();
