import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function collectDirectoryFiles(absDir, relPrefix, entries) {
  if (!fs.existsSync(absDir)) return;
  const items = fs.readdirSync(absDir, { withFileTypes: true });
  for (const item of items) {
    if (item.name.startsWith('.DS_Store')) continue;
    const fullPath = path.join(absDir, item.name);
    const zipRelPath = `${relPrefix}/${item.name}`.replace(/\\/g, '/');
    if (item.isDirectory()) {
      collectDirectoryFiles(fullPath, zipRelPath, entries);
    } else if (item.isFile()) {
      entries.push({
        name: zipRelPath,
        data: fs.readFileSync(fullPath)
      });
    }
  }
}

function buildCleanPackageJsonBuffer() {
  const cleanPkg = {
    name: 'taskflow',
    version: '1.0.0',
    description: 'TaskFlow — Personal Task & Productivity Management System (HTML5, CSS3, Vanilla JS, Express, SQLite)',
    type: 'module',
    main: 'server.js',
    scripts: {
      start: 'node server.js',
      dev: 'node --watch server.js',
      test: 'node --test tests/api.test.js'
    },
    dependencies: {
      'better-sqlite3': '^11.8.1',
      dotenv: '^17.2.3',
      express: '^4.21.2'
    }
  };
  return Buffer.from(`${JSON.stringify(cleanPkg, null, 2)}\n`, 'utf8');
}

function toDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

function createZipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = toDosDateTime(new Date());

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const uncompressed = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const compressed = zlib.deflateRawSync(uncompressed, { level: 6 });
    const crc = zlib.crc32(uncompressed) >>> 0;

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4);         // Version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // General purpose bit flag (UTF-8)
    localHeader.writeUInt16LE(8, 8);          // Compression method (8 = Deflate)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);         // Extra field length

    localParts.push(localHeader, nameBuf, compressed);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4);         // Version made by
    centralHeader.writeUInt16LE(20, 6);         // Version needed
    centralHeader.writeUInt16LE(0x0800, 8);     // UTF-8 flag
    centralHeader.writeUInt16LE(8, 10);         // Deflate
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);         // Extra length
    centralHeader.writeUInt16LE(0, 32);         // Comment length
    centralHeader.writeUInt16LE(0, 34);         // Disk number start
    centralHeader.writeUInt16LE(0, 36);         // Internal file attributes
    centralHeader.writeUInt32LE(0, 38);         // External file attributes
    centralHeader.writeUInt32LE(offset, 42);    // Relative offset of local header

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirBuffer = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);               // End of central dir signature
  endRecord.writeUInt16LE(0, 4);                        // Disk number
  endRecord.writeUInt16LE(0, 6);                        // Start disk
  endRecord.writeUInt16LE(files.length, 8);             // Entries on this disk
  endRecord.writeUInt16LE(files.length, 10);            // Total entries
  endRecord.writeUInt32LE(centralDirBuffer.length, 12); // Central directory size
  endRecord.writeUInt32LE(offset, 16);                  // Central directory offset
  endRecord.writeUInt16LE(0, 20);                       // Comment length

  return Buffer.concat([...localParts, centralDirBuffer, endRecord]);
}

export function buildSourceCodeZip() {
  const entries = [];
  const rootPrefix = 'taskflow';

  collectDirectoryFiles(path.join(PROJECT_ROOT, 'public'), `${rootPrefix}/public`, entries);
  collectDirectoryFiles(path.join(PROJECT_ROOT, 'src'), `${rootPrefix}/src`, entries);
  collectDirectoryFiles(path.join(PROJECT_ROOT, 'tests'), `${rootPrefix}/tests`, entries);

  const rootFiles = ['server.js', 'README.md', '.gitignore', '.env.example'];
  for (const filename of rootFiles) {
    const absFile = path.join(PROJECT_ROOT, filename);
    if (fs.existsSync(absFile)) {
      entries.push({
        name: `${rootPrefix}/${filename}`,
        data: fs.readFileSync(absFile)
      });
    }
  }

  entries.push({
    name: `${rootPrefix}/package.json`,
    data: buildCleanPackageJsonBuffer()
  });

  entries.push({
    name: `${rootPrefix}/database/.gitkeep`,
    data: Buffer.from('', 'utf8')
  });

  return createZipBuffer(entries);
}
