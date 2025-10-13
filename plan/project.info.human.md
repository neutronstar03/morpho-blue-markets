This project is to make a alternative frontend for morpho-blue DEFI protocol. 
REF: https://docs.morpho.org/tools/onchain/

Technical details:
runtime: bun 1.3.0
frontend project made with React + Vite + React Router 7.x + TYPESCRIPT (that's a must)

Aim of the project is to:
- list all non-whitelisted markets in Base and Ethereum blockchain. That could be done with a backend script with Bun.
- Filter the markets generated before, and compile an "interesting" list, they should have non zero TVL, they should offer an attractive "lending" side of the market, using some type of stablecoin
- Be able to enter those markets (DIRECTLY, not using vaults) using classic wallet calls, or using morpho SDK

Directives:
- This is a MVP/hobby project/internal tool, it should work reliably but UI design is not priority.
- We should be able to compile this in files just js/html/css, no backends of sorts. If needed it can be packaged with a dynamic JSON to be read (for example the "interesting" markets)

Many open questions:
- Which library to connect to wallet should we use in frontend? I care to find a library that is well known by LLM machines.
- Styling the frontend should be decided with which library to be used. We need some classic web3 modal to track transactions, also input fields for token amounts that doesn't break with stupid Math rounding.


MVP:
Single react page that asks for a Morpho "marketId" and goes to that View - then display some info about the market, and Asks the user to deposit or withdraw.  
Other pages will be made later.
