# Railway Nixpacks Configuration Fix

## Problem

Railway switched from Railpack to Nixpacks, and the build failed with:
```
error: undefined variable 'npm'
at /app/.nixpacks/nixpkgs-ffeebf0acf3ae8b29f8c7049cd911b9636efd7e7.nix:19:19:
    18|         '')
    19|         nodejs_20 npm
    20|                   ^
```

## Root Cause

In Nix/Nixpacks, `npm` is **not a separate package**. It comes bundled with `nodejs_20`. When we specified both `nodejs_20` and `npm` in `nixPkgs`, Nix couldn't find a package named `npm` and failed.

## Solution

Removed `npm` from the `nixPkgs` list in `nixpacks.toml`:

**Before** (incorrect):
```toml
[phases.setup]
nixPkgs = ["nodejs_20", "npm"]  # ❌ npm doesn't exist as separate package
```

**After** (correct):
```toml
[phases.setup]
nixPkgs = ["nodejs_20"]  # ✅ npm comes bundled with nodejs_20
```

## Why This Works

- `nodejs_20` includes Node.js runtime AND npm package manager
- Nixpacks automatically makes npm available when nodejs_20 is installed
- No need to specify npm separately

## Verification

After this fix:
1. ✅ Nixpacks will install `nodejs_20` (which includes npm)
2. ✅ `npm install` command will work (npm is available)
3. ✅ `npm start` command will work (npm is available)
4. ✅ Build should succeed

## Next Steps

1. Push this change to GitHub
2. Railway will automatically rebuild with Nixpacks
3. Build should succeed now

## Note

This is a different issue from the JWT_SECRET problem. The JWT_SECRET obfuscation fix is still in place and working. This was purely a Nixpacks configuration issue.

