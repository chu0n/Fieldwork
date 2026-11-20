# Fieldwork

Fieldwork turns a reusable template and a list of records into reviewable files. It supports Lightning Autofill exports, CSV, plain text, JSON, and JavaScript templates. It runs in the browser and processes imported data locally.

**[Open Fieldwork](https://chu0n.github.io/Fieldwork/)**

1. Open a template and select the parts you want to fill.
2. Enter values directly or import a CSV, TSV, or JSON batch.
3. Review the changes. Export one file or a ZIP for the batch.

Use the included [sample template](examples/lightning-demo.txt) and the [quick start guide](docs/QUICKSTART.md) to try it with fictitious data. See [data handling and recovery](docs/SESSION-RESTORE.md) before using a shared browser.

## Develop and build

Use Node.js 24.22.1 or newer within the 24.x series and pnpm 12.15.0. Check the versions in your terminal before installing. Portable releases are available from [Node.js](https://nodejs.org/dist/v24.22.1/) and [pnpm](https://github.com/pnpm/pnpm/releases/tag/v12.15.0). Verify their published checksums.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run dev
pnpm run build
```

On Windows, use an NTFS checkout for dependency installation and builds. If your source lives on an exFAT drive, copy the source and build configuration to NTFS first. Keep local records and existing dependency folders out of that copy.

Open `release/Fieldwork.html` for offline use. To open a local build from an iPhone on the same Wi-Fi, follow the [iPhone guide](docs/IPHONE.md). The [Pages workflow](.github/workflows/pages.yml) builds from `main` and publishes only the standalone app.

See [maintenance notes](docs/MAINTENANCE.md) for validation, storage limits, and the checks to run when changing imports or exports.

## Maintenance

Dependabot opens security fixes as advisories are published and groups routine updates monthly. Review its pull requests and merge once the build and dependency review pass. GitHub Pages publishes from main after the build succeeds.

If a deployment breaks, revert the offending change through a pull request. For a security alert without a fix PR, check the advisory and decide whether to replace or remove the affected package.
