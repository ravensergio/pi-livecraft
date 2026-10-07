import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { delimiter, dirname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const piPackage = '@earendil-works/pi-coding-agent'

export interface PiLauncherInvocation {
  command: string
  argsPrefix: string[]
}

interface PiPackageJson {
  bin?: { pi?: unknown }
}

/**
 * Resolves Pi without executing npm's Windows command shim. On Windows npm installs
 * pi.cmd, but invoking its package CLI with Node keeps every RPC argument out of cmd.exe.
 */
export function resolvePiLauncher(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  pathDelimiter = delimiter,
): PiLauncherInvocation {
  if (platform !== 'win32') return { command: 'pi', argsPrefix: [] }

  const path = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1]
  if (!path) throw new Error('Cannot find pi.cmd because PATH is empty')

  for (const directory of path.split(pathDelimiter)) {
    if (!directory) continue
    const piCmdPath = resolve(directory, 'pi.cmd')
    if (!existsSync(piCmdPath)) continue

    for (const packageJsonPath of candidatePackageJsonPaths(piCmdPath)) {
      const invocation = invocationFromPackageJson(packageJsonPath)
      if (invocation) return invocation
    }
  }

  throw new Error(`Cannot find ${piPackage} from a pi.cmd entry on PATH`)
}

/**
 * package.json locations for a pi.cmd entry: the npm global layout (a node_modules
 * tree above pi.cmd) and the managed install layout (a sibling pi-launcher.js plus
 * install/current-version pointing at a release directory).
 */
function candidatePackageJsonPaths(piCmdPath: string): string[] {
  const paths: string[] = []
  try {
    const fromSearch = findPackageJSON(piPackage, pathToFileURL(piCmdPath))
    if (fromSearch) paths.push(fromSearch)
  } catch {
    // A broken package.json on the search path must not hide the managed install.
  }

  const agentDir = dirname(piCmdPath)
  const currentVersionFile = resolve(agentDir, '..', 'install', 'current-version')
  if (existsSync(resolve(agentDir, 'pi-launcher.js')) && existsSync(currentVersionFile)) {
    const version = readFileSync(currentVersionFile, 'utf8').trim()
    if (version && version !== '.' && version !== '..' && /^[0-9A-Za-z._+-]+$/.test(version)) {
      paths.push(
        resolve(
          agentDir,
          '..',
          'install',
          'releases',
          version,
          'node_modules',
          ...piPackage.split('/'),
          'package.json',
        ),
      )
    }
  }
  return paths
}

function invocationFromPackageJson(packageJsonPath: string): PiLauncherInvocation | undefined {
  try {
    if (!existsSync(packageJsonPath)) return undefined
    const packageRoot = realpathSync(dirname(packageJsonPath))
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PiPackageJson
    const bin = packageJson.bin?.pi
    if (typeof bin !== 'string' || !bin) return undefined
    const cliPath = realpathSync(resolve(packageRoot, bin))
    if (!isPathInside(packageRoot, cliPath)) return undefined
    return { command: process.execPath, argsPrefix: [cliPath] }
  } catch {
    return undefined
  }
}

function isPathInside(root: string, path: string): boolean {
  const pathFromRoot = relative(root, path)
  return Boolean(pathFromRoot) && pathFromRoot !== '..' && !pathFromRoot.startsWith('../')
    && !pathFromRoot.startsWith('..\\') && !isAbsolute(pathFromRoot)
}
