#!/usr/bin/env node
/**
 * Copy only the required node_modules for the Vercel serverless function.
 * Handles pnpm's nested node_modules structure where transitive deps
 * live inside .pnpm/<pkg>@<version>/node_modules/<dep>.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const FUNC_DIR = ".vercel/output/functions/api.func";
const NODE_MODULES = "node_modules";
const PNPM_DIR = path.join(NODE_MODULES, ".pnpm");

// Top-level packages imported by the compiled function
const REQUIRED = [
  "dotenv",
  "bcryptjs",
  "express",
  "superjson",
  "resend",
  "jose",
  "@trpc/server",
  "drizzle-orm",
  "cookie",
  "zod",
  "mysql2",
  "nanoid",
  "@aws-sdk/client-s3",
  "@aws-sdk/s3-request-presigner",
  "pdf-lib",
  "svix",
];

const copied = new Set();

/**
 * Find a package directory, checking:
 * 1. Top-level node_modules/<pkg> (symlink to .pnpm)
 * 2. Inside the parent package's .pnpm node_modules
 * 3. Global search in .pnpm
 */
function findPackageDir(pkgName, parentPnpmDir) {
  // 1. Check top-level node_modules (pnpm symlink)
  const topLevel = path.join(NODE_MODULES, pkgName);
  try {
    const real = fs.realpathSync(topLevel);
    if (fs.existsSync(real)) return real;
  } catch {}

  // 2. Check parent's .pnpm node_modules directory
  if (parentPnpmDir) {
    const inParent = path.join(parentPnpmDir, pkgName);
    try {
      const real = fs.realpathSync(inParent);
      if (fs.existsSync(real)) return real;
    } catch {}
  }

  // 3. Search in .pnpm directory
  try {
    const safeName = pkgName.replace("/", "+");
    const entries = fs.readdirSync(PNPM_DIR).filter(e => e.startsWith(safeName + "@"));
    if (entries.length > 0) {
      const pnpmPkgDir = path.join(PNPM_DIR, entries[0], "node_modules", pkgName);
      if (fs.existsSync(pnpmPkgDir)) return fs.realpathSync(pnpmPkgDir);
    }
  } catch {}

  return null;
}

function copyPackage(pkgName, parentPnpmDir) {
  if (copied.has(pkgName)) return;
  copied.add(pkgName);

  const srcDir = findPackageDir(pkgName, parentPnpmDir);
  if (!srcDir) {
    console.warn(`  [WARN] Package not found: ${pkgName}`);
    return;
  }

  const destDir = path.join(FUNC_DIR, NODE_MODULES, pkgName);
  if (fs.existsSync(destDir)) return;

  // Create parent directory for scoped packages
  fs.mkdirSync(path.dirname(destDir), { recursive: true });

  // Copy with dereferenced symlinks
  try {
    execSync(`cp -rL "${srcDir}" "${destDir}"`, { stdio: "pipe" });
  } catch (e) {
    console.warn(`  [WARN] Failed to copy ${pkgName}: ${e.message}`);
    return;
  }

  // Find the .pnpm node_modules for this package's deps
  // e.g., node_modules/.pnpm/express@4.21.2/node_modules/
  let thisPnpmDir = null;
  try {
    // srcDir is like: node_modules/.pnpm/express@4.21.2/node_modules/express
    // We want: node_modules/.pnpm/express@4.21.2/node_modules/
    thisPnpmDir = path.dirname(srcDir);
  } catch {}

  // Recursively copy dependencies
  const pkgJsonPath = path.join(destDir, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      const deps = Object.keys(pkgJson.dependencies || {});
      for (const dep of deps) {
        copyPackage(dep, thisPnpmDir);
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
}

console.log(`Copying ${REQUIRED.length} required packages + transitive deps...`);

// Create the target node_modules directory
fs.mkdirSync(path.join(FUNC_DIR, NODE_MODULES), { recursive: true });

for (const pkg of REQUIRED) {
  console.log(`  Copying: ${pkg}`);
  copyPackage(pkg, null);
}

// Report size
const result = execSync(`du -sh "${path.join(FUNC_DIR, NODE_MODULES)}"`, { encoding: "utf-8" });
console.log(`\nTotal node_modules size: ${result.trim().split("\t")[0]}`);
console.log(`Packages copied: ${copied.size}`);
