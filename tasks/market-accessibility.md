# Market controls and risk accessibility (#6)

Goal: expose control names, selected modes, feedback and risk meaning without relying on color.

- [x] Visible risk markers and shared decision reason/provenance (c983ff5).
- [x] Name search, chain/filter/sort controls and APY threshold quantity/units across desktop/mobile.
- [x] Associate the optimizer asset label; expose strategy pressed state and supply units.
- [x] Implement named Supply/Withdraw tablist, selected state, panel relations, arrows/Home/End and disabled-supply recovery.
- [x] Announce optimizer start/completion/failure without progress-percentage chatter or focus movement.
- [x] Name tables and make horizontal scroll regions keyboard focusable.
- [x] Regression verification: 115 offline tests; 44 UI tests (2 existing skips); types/lint/build pass.
- [x] Browser verification: isolated shared Chromium context, no wallet, desktop 1440px and 38 rendered rows; mobile 390px filter keyboard activation; all columns reachable by repeated ArrowRight (scrollLeft 423 = 795-372).
- [x] Content zoom emulation at 200%: all columns reachable (client 319px, scroll 1066px, right edge reached); no page errors.

Layout was visually inspected from screenshots. The zoom check uses CSS content zoom,
not an assertion of physical-device/native-browser-zoom or screen-reader certification.
Only a local dev server and isolated browser context were used; no production deployment,
real wallet, transaction or unrelated browser tab was touched.
