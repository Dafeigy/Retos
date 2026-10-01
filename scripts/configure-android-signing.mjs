import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const buildFile = resolve(
  process.argv[2] ?? "src-tauri/gen/android/app/build.gradle.kts",
)

let source = readFileSync(buildFile, "utf8")

if (source.includes('System.getenv("ANDROID_KEYSTORE_FILE")')) {
  console.log(`Android release signing is already configured in ${buildFile}`)
  process.exit(0)
}

function replaceOnce(marker, replacement) {
  const first = source.indexOf(marker)
  const last = source.lastIndexOf(marker)

  if (first === -1) {
    throw new Error(`Unable to configure Android signing: marker not found: ${marker}`)
  }
  if (first !== last) {
    throw new Error(`Unable to configure Android signing: marker is ambiguous: ${marker}`)
  }

  source = `${source.slice(0, first)}${replacement}${source.slice(first + marker.length)}`
}

replaceOnce(
  "    buildTypes {",
  `    signingConfigs {
        create("release") {
            val keystoreFile = System.getenv("ANDROID_KEYSTORE_FILE")
                ?: error("ANDROID_KEYSTORE_FILE is required for release builds")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                ?: error("ANDROID_KEY_ALIAS is required for release builds")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
                ?: error("ANDROID_KEY_PASSWORD is required for release builds")
            storeFile = file(keystoreFile)
            storePassword = System.getenv("ANDROID_KEY_PASSWORD")
                ?: error("ANDROID_KEY_PASSWORD is required for release builds")
        }
    }
    buildTypes {`,
)

replaceOnce(
  '        getByName("release") {',
  `        getByName("release") {
            signingConfig = signingConfigs.getByName("release")`,
)

writeFileSync(buildFile, source)
console.log(`Configured Android release signing in ${buildFile}`)
