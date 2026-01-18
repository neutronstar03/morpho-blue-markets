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

- `v1.1.12` (2026-01-17): blacklists from Morpho warnings, Pendle expiry filter, optimizer chunking.
- `v1.1.11` (2026-01-15): automatic allocation size detector for optimizer.
- `v1.1.10` (2026-01-12): fix small markets skewing average APY.

## Live Version

A live version of this project is automatically built and deployed via GitHub Actions. You can access it on GitHub Pages:

[https://neutronstar03.github.io/morpho-blue-markets/](https://neutronstar03.github.io/morpho-blue-markets/)
