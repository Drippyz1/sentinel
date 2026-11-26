/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const { createHash } = require('node:crypto')
const { createReadStream } = require('node:fs')
const { copyFile, mkdir, readdir, writeFile } = require('node:fs/promises')
const { join } = require('node:path')
const { version } = require('../../package.json')

const platforms = {
  mac: ['darwin', ['dmg', 'zip']],
  win: ['win32', ['exe']],
  linux: ['linux', ['AppImage', 'deb']]
}

async function stage() {
  const [platform, arch] = process.argv.slice(2)
  if (
    !Object.hasOwn(platforms, platform) ||
    platforms[platform][0] !== process.platform ||
    !['arm64', 'x64'].includes(arch) ||
    arch !== process.arch
  ) {
    throw new Error('Candidate platform and architecture must match the native builder.')
  }
  const revision = process.env.GITHUB_SHA
  if (!/^[a-f0-9]{40}$/.test(revision ?? '') || process.env.GITHUB_REF_NAME !== `v${version}`) {
    throw new Error('Candidate requires a matching release tag and source revision.')
  }
  const entries = await readdir('dist', { withFileTypes: true })
  const names = platforms[platform][1].map((extension) => {
    const debArch = arch === 'x64' ? 'amd64' : arch
    const allowedNames = [
      `sentinel-${version}-${arch}${platform === 'win' ? '-setup' : ''}.${extension}`,
      ...(extension === 'deb'
        ? [`sentinel-${version}-${debArch}.deb`, `sentinel_${version}_${debArch}.deb`]
        : [])
    ]
    const matches = entries.filter((entry) => entry.isFile() && allowedNames.includes(entry.name))
    if (matches.length !== 1) throw new Error(`Expected one versioned .${extension} artifact.`)
    return matches[0].name
  })

  const directory = join('dist', 'release-candidate')
  await mkdir(directory)
  const hashes = []
  for (const name of names.sort()) {
    const path = join(directory, name)
    await copyFile(join('dist', name), path)
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) hash.update(chunk)
    hashes.push(`${hash.digest('hex')}  ${name}`)
  }
  const suffix = `${platform}-${arch}`
  await writeFile(join(directory, `SHA256SUMS-${suffix}.txt`), hashes.join('\n') + '\n')
  await writeFile(
    join(directory, `build-${suffix}.json`),
    JSON.stringify(
      {
        version,
        revision,
        platform,
        arch,
        node: process.version,
        files: names
      },
      null,
      2
    ) + '\n'
  )
}

void stage().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
