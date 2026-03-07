<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="panel hero-panel hero-grid">
    <div class="stack">
      <p class="eyebrow">
        Milestone 0
      </p>
      <h2 class="section-title">
        Wallet stack spike before any real parity work
      </h2>
      <p class="lede">
        This pilot isolates the Vue runtime, provider setup, and wallet/network state first. If this feels stable,
        the next steps can port route shells and business logic with less risk.
      </p>

      <div class="pill-row">
        <span class="pill">Vue 3 + Vite</span>
        <span class="pill">Pinia</span>
        <span class="pill">Vue Query</span>
        <span class="pill">wagmi core</span>
      </div>
    </div>

    <div class="card-stack">
      <h3 class="card-title">
        What this spike proves
      </h3>
      <div class="detail-grid">
        <div>
          <p class="mini-copy">
            Connect and disconnect
          </p>
          <p class="muted">
            Minimal wallet controls without RainbowKit.
          </p>
        </div>
        <div>
          <p class="mini-copy">
            Required network state
          </p>
          <p class="muted">
            Vue store drives the same wrong-network shape the React app uses.
          </p>
        </div>
        <div>
          <p class="mini-copy">
            Switch chain flow
          </p>
          <p class="muted">
            The UI can request a move to the selected required chain.
          </p>
        </div>
      </div>
      <RouterLink class="button" to="/wallet-spike">
        Open wallet spike
      </RouterLink>
    </div>
  </section>
</template>
