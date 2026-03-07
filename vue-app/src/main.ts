import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { WagmiPlugin } from '@wagmi/vue'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './app/router'
import { wagmiConfig } from './lib/wagmi'
import './style.css'

const app = createApp(App)
const queryClient = new QueryClient()

app.use(createPinia())
app.use(router)
app.use(VueQueryPlugin, { queryClient })
app.use(WagmiPlugin, { config: wagmiConfig })

app.mount('#app')
