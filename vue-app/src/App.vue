<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute()

const navItems = [
  { label: 'Pilot Home', to: '/' },
  { label: 'Wallet Spike', to: '/wallet-spike' },
]

const activePath = computed(() => route.path)
</script>

<template>
  <div class="app-shell">
    <div class="ambient ambient-left" />
    <div class="ambient ambient-right" />

    <header class="topbar">
      <div>
        <p class="eyebrow">
          Vue 3 pilot
        </p>
        <h1 class="title">
          Morpho Blue Markets
        </h1>
      </div>

      <nav class="nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ 'is-active': activePath === item.to }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
    </header>

    <main class="content-shell">
      <RouterView />
    </main>
  </div>
</template>
