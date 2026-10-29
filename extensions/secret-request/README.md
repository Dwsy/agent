# secret-request

Native Pi secret/environment extension backed by macOS Keychain.

## Layout

```text
~/.pi/agent/extensions/secret-request/index.ts
~/.pi/agent/secret-env/              # global profiles
  default.json
  staging.json
<project>/.pi/secret-env/            # project overrides
  default.json
  staging.json
```

Both global and project `secret-env/*.json` files are safe to inspect/copy as configuration: they contain plain environment values plus **references** to Keychain entries, never the secret values themselves.

With `scope: "auto"`, the global profile is loaded first and the project profile at `<cwd>/.pi/secret-env/<profile>.json` overrides it **per variable name**, including switching a variable between plain env and secret. This is the default for `secret_env` with `action: "exec"`.

Example profile:

```json
{
  "version": 1,
  "env": {
    "NODE_ENV": "production"
  },
  "secrets": {
    "ANTHROPIC_API_KEY": {
      "source": "macos-keychain",
      "service": "pi-secret-request",
      "account": "ANTHROPIC_API_KEY"
    }
  }
}
```

The directory is kept at mode `0700`; profile files are written at `0600`.

## TUI

Run `/secrets` for the global default profile. The syntax is `/secrets [profile] [global|project]`, for example `/secrets staging project`.

The TUI requires an explicit mutable scope on purpose: automatic merging is safe for reads/execution, but ambiguous for writes.

The manager can:

- add/update a secret with a masked Pi TUI input;
- add/update a non-secret environment value;
- remove an env/secret reference and optionally delete the Keychain value;
- inspect names, Keychain readiness, and profile location;
- switch/create profiles.

## Agent tools

There is one agent-facing tool: `secret_env`. Its discriminated `action` union keeps the two capabilities separate instead of exposing one flat bag of optional parameters:

- `secret_env({ action: "request", name, reason?, profile?, scope? })` asks for one missing secret, stores it in macOS Keychain, records only a Keychain reference, and returns only `provided` / `cancelled`.
- `secret_env({ action: "exec", command, profile?, scope?, cwd? })` loads plain env values and Keychain references, then injects resolved values only into the child process. `scope: "auto"` (default) merges global then project.

The `exec` action redacts exact secret values from stdout/stderr and caps captured output at 2 MiB per stream.

## Security boundary

The extension never writes secret values into Pi tool results, session entries, normal chat transcripts, profile JSON, or Pi's global `process.env`.

This remains an in-process Pi extension, **not** a sandbox boundary against a malicious agent running as the same macOS user. A command could transform/encode a secret before printing it, and another process with sufficient user/Keychain access may retrieve the same Keychain item. Grok Bot's stronger property — the agent process being structurally unable to access the secret store — requires a separate trusted host/sandbox process outside a normal Pi extension.

One additional macOS detail: Apple's `/usr/bin/security add-generic-password` documents non-interactive `-w <password>` as insecure because the helper receives the password as a process argument. The extension uses that short-lived helper without logging the argument; the value still never reaches the model/transcript, but this is weaker than using a native Security.framework binding.

Pi auto-discovers the extension from `~/.pi/agent/extensions/secret-request/index.ts`.

Agent guidance is deliberately embedded in the single tool description and action schemas: choose `action: "exec"` instead of `bash` when a command needs configured credentials; never ask for secrets in chat or try to print/encode them; choose `action: "request"` only when the required secret is actually missing.
