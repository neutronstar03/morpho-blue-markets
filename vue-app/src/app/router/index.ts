import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../../pages/HomePage.vue'
import WalletSpikePage from '../../pages/WalletSpikePage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomePage,
    },
    {
      path: '/wallet-spike',
      name: 'wallet-spike',
      component: WalletSpikePage,
    },
  ],
})

export default router
