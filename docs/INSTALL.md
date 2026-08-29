# Installation

Add this GitHub repository as an OMP marketplace, then install its plugin:

```sh
omp plugin marketplace add YOUR_GITHUB_USERNAME/mamak-omp-router
omp plugin install mamak-router@mamak-omp-router
```

Export key pools in the shell that launches OMP:

```sh
export DEEPSEEK_KEYS='key-1,key-2,key-3'
omp
```

Restart the OMP session after installation or upgrade. Extension modules are initialized when the session starts.

For project-only installation, append `--scope project` to `omp plugin install`; user scope is the default.
