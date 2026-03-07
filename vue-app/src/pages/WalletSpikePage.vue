<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useWallet } from '../composables/useWallet'
import { getSupportedChainName } from '../lib/wagmi'
import { useNetworkStore } from '../stores/network'

const networkStore = useNetworkStore()
const { requiredChainId } = storeToRefs(networkStore)

const {
  address,
  availableConnectors,
  chainId,
  connect,
  connectError,
  disconnect,
  disconnectError,
  isConnected,
  isConnecting,
  isDisconnecting,
  isSwitchingChain,
  supportedChains,
  switchChain,
  switchChainError,
} = useWallet()

const isWrongNetwork = computed(() => {
  return Boolean(isConnected.value && requiredChainId.value && chainId.value !== requiredChainId.value)
})

const requiredChainLabel = computed(() => getSupportedChainName(requiredChainId.value))

const currentChainLabel = computed(() => getSupportedChainName(chainId.value))

function onRequiredChainInput(event: Event) {
  const target = event.target as HTMLSelectElement
  const nextValue = target.value ? Number(target.value) : null
  networkStore.setRequiredChainId(nextValue)
}
</script>

<template>
  <section class="wallet-grid">
    <div class="panel hero-panel stack">
      <p class="eyebrow">
        Route: /wallet-spike
      </p>
      <h2 class="section-title">
        Minimal wallet and network control surface
      </h2>
      <p class="lede">
        The page below intentionally stays plain: it focuses on whether Vue-native wagmi hooks can drive the core
        wallet state we need for the pilot.
      </p>

      <div class="pill-row">
        <span class="pill" :class="isConnected ? 'is-success' : 'is-danger'">
          <span class="status-dot" />
          {{ isConnected ? 'Connected' : 'Disconnected' }}
        </span>
        <span class="pill" :class="isWrongNetwork ? 'is-danger' : 'is-success'">
          <span class="status-dot" />
          {{ isWrongNetwork ? 'Wrong network' : 'Network OK' }}
        </span>
      </div>
    </div>

    <div class="panel hero-panel card-stack">
      <h3 class="card-title">
        Spike checklist
      </h3>
      <div class="detail-grid">
        <div>
          <p class="mini-copy">
            01
          </p>
          <p class="muted">
            Connect with an injected wallet and surface connector errors.
          </p>
        </div>
        <div>
          <p class="mini-copy">
            02
          </p>
          <p class="muted">
            Toggle a required chain in Pinia and verify wrong-network state.
          </p>
        </div>
        <div>
          <p class="mini-copy">
            03
          </p>
          <p class="muted">
            Attempt a switch to the selected required chain from the same page.
          </p>
        </div>
      </div>
    </div>

    <div class="panel hero-panel action-stack">
      <h3 class="card-title">
        Wallet actions
      </h3>

      <div class="connector-grid">
        <button
          v-for="connector in availableConnectors"
          :key="connector.id"
          class="button"
          :disabled="isConnecting"
          @click="connect(connector.id)"
        >
          {{ isConnecting ? 'Connecting...' : `Connect ${connector.name}` }}
        </button>

        <button
          class="button-danger"
          :disabled="!isConnected || isDisconnecting"
          @click="disconnect"
        >
          {{ isDisconnecting ? 'Disconnecting...' : 'Disconnect' }}
        </button>
      </div>

      <p v-if="availableConnectors.length === 0" class="connector-note">
        No injected connectors detected. Try opening this in a browser with MetaMask or another EIP-1193 wallet.
      </p>
      <p v-if="connectError" class="error-line">
        Connect error: {{ connectError }}
      </p>
      <p v-if="disconnectError" class="error-line">
        Disconnect error: {{ disconnectError }}
      </p>
    </div>

    <div class="panel hero-panel network-card">
      <h3 class="card-title">
        Required network control
      </h3>

      <label class="field-label">
        <span>Required chain</span>
        <select class="field-select" :value="requiredChainId ?? ''" @change="onRequiredChainInput">
          <option value="">
            No required chain
          </option>
          <option v-for="chain in supportedChains" :key="chain.id" :value="chain.id">
            {{ chain.name }} ({{ chain.id }})
          </option>
        </select>
      </label>

      <div class="button-row">
        <button
          class="button-ghost"
          :disabled="!requiredChainId || !isConnected || !isWrongNetwork || isSwitchingChain"
          @click="requiredChainId && switchChain(requiredChainId)"
        >
          {{ isSwitchingChain ? 'Switching...' : `Switch to ${requiredChainLabel}` }}
        </button>
        <button class="button-ghost" @click="networkStore.setRequiredChainId(null)">
          Clear required chain
        </button>
      </div>

      <p class="helper">
        Current chain: {{ currentChainLabel }} | Required chain: {{ requiredChainLabel }}
      </p>
      <p v-if="switchChainError" class="error-line">
        Switch error: {{ switchChainError }}
      </p>
    </div>

    <div class="panel hero-panel status-grid">
      <div class="status-card">
        <span class="status-label">isConnected</span>
        <p class="status-value">
          {{ String(isConnected) }}
        </p>
      </div>
      <div class="status-card">
        <span class="status-label">address</span>
        <p class="status-value mono">
          {{ address ?? 'Not connected' }}
        </p>
      </div>
      <div class="status-card">
        <span class="status-label">chainId</span>
        <p class="status-value mono">
          {{ chainId ?? 'Unknown' }}
        </p>
      </div>
      <div class="status-card">
        <span class="status-label">wrongNetwork</span>
        <p class="status-value">
          {{ String(isWrongNetwork) }}
        </p>
      </div>
    </div>
  </section>
</template>
