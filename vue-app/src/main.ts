import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './app/router'
import { wagmiConfig } from './lib/wagmi'
import { useWalletStore } from './stores/wallet'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
const queryClient = new QueryClient()

app.use(pinia)
app.use(router)
app.use(VueQueryPlugin, { queryClient })

const walletStore = useWalletStore(pinia)
void walletStore.initialize(wagmiConfig)

app.mount('#app')
