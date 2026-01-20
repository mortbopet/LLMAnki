// Compare reference and exported database schemas
const JSZip = require('jszip');
const fs = require('fs');
const fzstd = require('fzstd');
const initSqlJs = require('sql.js');

async function main() {
  const SQL = await initSqlJs();
  
  // Reference deck
  const refData = fs.readFileSync('src/test/test_deck.apkg');
  const refZip = await JSZip.loadAsync(refData);
  const refDb21b = await refZip.file('collection.anki21b').async('uint8array');
  const refDbData = fzstd.decompress(refDb21b);
  const refDb = new SQL.Database(refDbData);
  
  // Exported deck
  const expData = fs.readFileSync('src/test/exported_test.apkg');
  const expZip = await JSZip.loadAsync(expData);
  const expDb21b = await expZip.file('collection.anki21b').async('uint8array');
  const expDbData = fzstd.decompress(expDb21b);
  const expDb = new SQL.Database(expDbData);
  
  console.log('=== DATABASE SCHEMA COMPARISON ===');
  
  // Get tables
  const refTables = refDb.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0];
  const expTables = expDb.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0];
  
  console.log('\nReference tables:', refTables?.values.map(r => r[0]).join(', '));
  console.log('Exported tables:', expTables?.values.map(r => r[0]).join(', '));
  
  // Compare col table columns
  console.log('\n=== COL TABLE ===');
  const refColSchema = refDb.exec("PRAGMA table_info(col)")[0];
  const expColSchema = expDb.exec("PRAGMA table_info(col)")[0];
  console.log('Reference columns:', refColSchema?.values.map(r => r[1]).join(', '));
  console.log('Exported columns:', expColSchema?.values.map(r => r[1]).join(', '));
  
  // Check col values
  const refCol = refDb.exec('SELECT * FROM col')[0];
  const expCol = expDb.exec('SELECT * FROM col')[0];
  console.log('\nReference col row count:', refCol?.values.length);
  console.log('Exported col row count:', expCol?.values.length);
  
  // Compare notes
  console.log('\n=== NOTES ===');
  const refNotes = refDb.exec('SELECT COUNT(*) FROM notes')[0];
  const expNotes = expDb.exec('SELECT COUNT(*) FROM notes')[0];
  console.log('Reference count:', refNotes?.values[0][0]);
  console.log('Exported count:', expNotes?.values[0][0]);
  
  // Compare cards
  console.log('\n=== CARDS ===');
  const refCards = refDb.exec('SELECT COUNT(*) FROM cards')[0];
  const expCards = expDb.exec('SELECT COUNT(*) FROM cards')[0];
  console.log('Reference count:', refCards?.values[0][0]);
  console.log('Exported count:', expCards?.values[0][0]);
  
  // Check for graves table
  console.log('\n=== GRAVES TABLE ===');
  const refGraves = refDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='graves'")[0];
  const expGraves = expDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='graves'")[0];
  console.log('Reference has graves:', !!refGraves?.values.length);
  console.log('Exported has graves:', !!expGraves?.values.length);
  
  // Check db size
  console.log('\n=== DATABASE SIZE ===');
  console.log('Reference decompressed size:', refDbData.length);
  console.log('Exported decompressed size:', expDbData.length);
}

main().catch(console.error);
