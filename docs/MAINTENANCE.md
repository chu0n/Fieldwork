# Maintenance notes

- Keep input, output, and recovery checks in sync. A recovery snapshot is validated before replacing the saved copy. Opening an unchanged session must leave its saved revision alone.
- Keep field identity exact across template bindings and batch input. Quoted identifiers preserve leading zeroes and precision. CSV exports preserve unchanged cells and source text where possible. Template scripts remain text.
- Limits protect browser memory and keep saved files reopenable. The workspace supports 20 tabs and a 32 MB recovery snapshot. A configuration file is limited to 12 MB. Undo uses a separate 32 MB budget per document.
- Keep candidate files, credentials, exports, and build artifacts out of Git. Use the synthetic examples for regression tests. The offline bundle uses a hash-based script policy and prohibits network connections.
- Use the locked dependencies and pinned toolchain. The package policy blocks install scripts and requires explicit build commands. Run the tests before shipping changes. Check import, export, and reload in a browser when changing those flows.
- Check behavior in the Lightning Autofill extension and on real iOS Safari before claiming compatibility with those environments.
