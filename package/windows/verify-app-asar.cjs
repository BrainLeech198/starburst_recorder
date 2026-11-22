const path = require('node:path')
const { listPackage } = require('@electron/asar')

const archivePath = process.argv[2]
if (!archivePath) {
  console.error('Usage: node verify-app-asar.cjs <app.asar>')
  process.exit(2)
}

const prefix = '/package/windows/.desktop-assets/'
const entries = listPackage(path.resolve(archivePath)).map((entry) =>
  entry.replace(/\\/g, '/').toLowerCase(),
)
const hasEntry = (suffix) => entries.includes(prefix + suffix)
const hasBundle = entries.some((entry) => entry.startsWith(prefix + 'assets/') && /\.js$/.test(entry))

if (!hasEntry('index.html') || !hasBundle) {
  console.error('app.asar is missing package/windows/.desktop-assets/index.html or its JS bundle')
  process.exit(1)
}

console.log('Verified: app.asar contains the renderer entry and a JS bundle.')
