# morpho-blue-markets

An alternative frontend for the [Morpho Blue](https://docs.morpho.org/tools/onchain/) DEFI protocol.

This project aims to provide a simple and direct way to interact with non-whitelisted Morpho Blue markets.

## Development

To run this project locally, follow these steps:

1.  **Install dependencies:**

    ```bash
    bun install
    ```

2.  **Start the development server:**
    ```bash
    bun dev
    ```
    The application will be available at `http://localhost:5173`.

## Changelog

See `CHANGELOG.md` for the full release history. Recent updates:

- `v1.1.27` (2026-02-24): reduced magic optimizer cooldown to 30 minutes and added a periodic 60-second eligibility check so rescans can restart automatically after cooldown.
- `v1.1.26` (2026-02-24): background "magic optimizer" scan, opportunity cards, and short-lived precomputed optimizer results for faster click-to-optimize flows.
- `v1.1.25` (2026-02-24): moved shady/manual blacklist context from market list to asset list and documented policy in `AGENTS.md`.
- `v1.1.23` (2026-02-22): optimizer now shows a proper loading spinner while reading market data.

## Live Version

A live version of this project is automatically built and deployed via GitHub Actions. You can access it on GitHub Pages:

[https://neutronstar03.github.io/morpho-blue-markets/](https://neutronstar03.github.io/morpho-blue-markets/)
