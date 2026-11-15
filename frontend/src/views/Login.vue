<template>
  <div class="login">
    <LangSwitch class="login-lang" />
    <form class="card login-card" @submit.prevent="submit">
      <div class="brand-logo big"><Activity :size="30" color="#fff" /></div>
      <h1>{{ t('LibreNMS') }} <span class="grad-text">XUI</span></h1>
      <p class="muted">{{ t('Interface de supervision nouvelle génération') }}</p>

      <template v-if="session.auth_mode === 'password' || session.auth_mode === 'librenms'">
        <div v-if="session.auth_mode === 'librenms'" class="small muted" style="margin-top:-6px">{{ t('Connectez-vous avec votre compte LibreNMS.') }}</div>
        <label class="field"><span>{{ t('Utilisateur') }}</span><input v-model="username" class="input" autocomplete="username" autofocus /></label>
        <label class="field"><span>{{ t('Mot de passe') }}</span><input v-model="password" class="input" type="password" autocomplete="current-password" /></label>
      </template>
      <template v-else>
        <label class="field"><span>{{ t('Nom affiché (optionnel)') }}</span><input v-model="username" class="input" /></label>
        <label class="field"><span>{{ t('Jeton API LibreNMS') }}</span><input v-model="token" class="input mono" type="password" autofocus :placeholder="t('Paramètres › API › Create API access token')" /></label>
      </template>

      <div v-if="error" class="err small">{{ error }}</div>
      <button class="btn primary" :disabled="busy" style="justify-content:center;padding:11px">
        <Loader2 v-if="busy" class="spin" /><LogIn v-else /> {{ t('Se connecter') }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Activity, LogIn, Loader2 } from 'lucide-vue-next'
import { session, auth } from '../api'
import { t } from '../i18n'
import LangSwitch from '../components/LangSwitch.vue'

const username = ref('')
const password = ref('')
const token = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  busy.value = true; error.value = ''
  try {
    await auth.login({ username: username.value, password: password.value, token: token.value })
  } catch (e) { error.value = e.message } finally { busy.value = false }
}
</script>

<style scoped>
.login-lang { position: fixed; top: 14px; right: 14px; }
.login { min-height: 100vh; display: grid; place-items: center; padding: 20px; }
.login-card { width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 16px; padding: 36px; animation: pop .5s cubic-bezier(.2, .9, .3, 1.2); }
.login-card h1 { margin: 0; font-size: 26px; letter-spacing: -.02em; }
.login-card p { margin: -10px 0 8px; }
.big { width: 60px; height: 60px; border-radius: 18px; animation: float 6s ease-in-out infinite; }
</style>
