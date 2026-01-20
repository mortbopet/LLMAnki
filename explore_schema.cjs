const JSZip = require('jszip');
const fs = require('fs');
const initSqlJs = require('sql.js');
const { decompress } = require('fzstd');

async function main() {
  const SQL = await initSqlJs();
  
  // Load reference deck
  const data = fs.readFileSync('src/test/test_deck.apkg');
  const zip = await JSZip.loadAsync(data);
  
  console.log('Files in reference deck:', Object.keys(zip.files));
  
  // Read collection.anki21b (zstd compressed)
  const dbCompressed = await zip.file('collection.anki21b').async('uint8array');
  console.log('\nDB compressed size:', dbCompressed.length);
  console.log('DB first bytes:', Array.from(dbCompressed.slice(0, 8)).map(b => b.toString(16).padStart(2,'0')).join(' '));
  
  // Decompress
  const dbData = decompress(dbCompressed);
  console.log('DB decompressed size:', dbData.length);
  
  // Open SQLite
  const db = new SQL.Database(dbData);
  
  // Get all tables
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log('\n=== TABLES ===');
  const tableNames = tables[0].values.map(r => r[0]);
  console.log(tableNames.join(', '));
  
  // For each table, show schema and sample data
  for (const table of tableNames) {
    console.log(`\n=== ${table} ===`);
    
    // Get schema
    const schema = db.exec(`PRAGMA table_info(${table})`);
    if (schema.length > 0) {
      const cols = schema[0].values.map(r => `${r[1]} (${r[2]})`);
      console.log('Columns:', cols.join(', '));
    }
    
    // Skip tables that need unicase collation
    if (['decks', 'notetypes', 'tags'].includes(table)) {
      console.log('(skipped due to unicase collation)');
      continue;
    }
    
    // Get row count
    const count = db.exec(`SELECT COUNT(*) FROM ${table}`);
    console.log('Row count:', count[0].values[0][0]);
    
    // Get sample data
    try {
      const sample = db.exec(`SELECT * FROM ${table} LIMIT 1`);
      if (sample.length > 0 && sample[0].values.length > 0) {
        console.log('Sample row:');
        const colNames = sample[0].columns;
        const values = sample[0].values[0];
        for (let i = 0; i < colNames.length; i++) {
          let val = values[i];
          if (val instanceof Uint8Array) {
            val = Array.from(val).join(',');
          }
          if (typeof val === 'string' && val.length > 200) {
            val = val.substring(0, 200) + '...';
          }
          console.log(`  ${colNames[i]}: ${val}`);
        }
      }
    } catch (e) {
      console.log('Error reading data:', e.message);
    }
  }
  
  db.close();
}

main().catch(console.error);
