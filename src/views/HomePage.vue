<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Minha conta</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="page-content">
      <main class="account-card">
        <div v-if="!firebaseConfigured" class="configuration-message" role="alert">
          Configure as variáveis do Firebase usando o arquivo <code>.env.example</code> para acessar a autenticação, o
          perfil e o armazenamento de fotos.
        </div>

        <div v-else-if="authLoading" class="loading-state" aria-live="polite">
          <ion-spinner name="crescent" />
          <p>Carregando...</p>
        </div>

        <template v-else-if="!currentUser">
          <section v-if="screen === 'login'" aria-labelledby="page-title">
            <p class="eyebrow">Acesse sua conta</p>
            <h1 id="page-title">Bem-vindo de volta</h1>
            <p class="intro">Entre com seu e-mail e senha.</p>

            <form class="account-form" @submit.prevent="login">
              <label for="login-email">E-mail</label>
              <input id="login-email" v-model.trim="email" type="email" autocomplete="email" required />

              <label for="login-password">Senha</label>
              <input id="login-password" v-model="password" type="password" autocomplete="current-password" required />

              <p v-if="errorMessage" class="feedback error" role="alert">{{ errorMessage }}</p>

              <button class="primary-button" type="submit" :disabled="busy">
                {{ busy ? 'Aguarde...' : 'Entrar' }}
              </button>
              <button class="text-button" type="button" @click="openPasswordRecovery">Esqueci minha senha</button>
            </form>
          </section>

          <section v-else aria-labelledby="page-title">
            <p class="eyebrow">Recuperação de senha</p>
            <h1 id="page-title">Redefina sua senha</h1>
            <p class="intro">Informe seu e-mail para receber o link de recuperação.</p>

            <form class="account-form" @submit.prevent="recoverPassword">
              <label for="recovery-email">E-mail</label>
              <input id="recovery-email" v-model.trim="email" type="email" autocomplete="email" required />

              <p v-if="errorMessage" class="feedback error" role="alert">{{ errorMessage }}</p>
              <p v-if="successMessage" class="feedback success" role="status">
                {{ successMessage }}
              </p>

              <button class="primary-button" type="submit" :disabled="busy">
                {{ busy ? 'Aguarde...' : 'Enviar link de recuperação' }}
              </button>
              <button class="text-button" type="button" @click="screen = 'login'">Voltar ao login</button>
            </form>
          </section>
        </template>

        <section v-else-if="screen === 'profile'" aria-labelledby="page-title">
          <button class="text-button back-button" type="button" @click="screen = 'welcome'">Voltar</button>
          <p class="eyebrow">Seu perfil</p>
          <h1 id="page-title">Perfil</h1>

          <form class="account-form" @submit.prevent="saveProfile">
            <div class="photo-picker">
              <img
                v-if="photoPreview || photoURL"
                class="profile-photo"
                :src="photoPreview || photoURL"
                alt="Foto do perfil"
              />
              <div v-else class="profile-photo photo-placeholder" aria-hidden="true">
                {{ profileName ? profileName.charAt(0).toUpperCase() : '?' }}
              </div>
              <label for="profile-photo">Foto do perfil</label>
              <input id="profile-photo" type="file" accept="image/*" @change="selectPhoto" />
            </div>

            <label for="profile-name">Nome</label>
            <input id="profile-name" v-model.trim="profileName" autocomplete="name" required />

            <label for="profile-birth-date">Data de nascimento</label>
            <input id="profile-birth-date" v-model="dateOfBirth" type="date" autocomplete="bday" required />

            <label for="profile-nickname">Nickname</label>
            <input id="profile-nickname" v-model.trim="nickname" autocomplete="nickname" required />

            <p v-if="errorMessage" class="feedback error" role="alert">{{ errorMessage }}</p>
            <p v-if="successMessage" class="feedback success" role="status">
              {{ successMessage }}
            </p>

            <button class="primary-button" type="submit" :disabled="busy">
              {{ busy ? 'Salvando...' : 'Salvar perfil' }}
            </button>
          </form>
        </section>

        <section v-else aria-labelledby="page-title">
          <p class="eyebrow">Área do usuário</p>
          <h1 id="page-title">Bem-vindo, {{ profileName || currentUser.email }}</h1>
          <p class="intro">Você está conectado.</p>
          <p v-if="errorMessage" class="feedback error" role="alert">{{ errorMessage }}</p>
          <button class="primary-button" type="button" @click="openProfile">Meu perfil</button>
          <img v-if="photoURL" class="welcome-photo" :src="photoURL" alt="Foto do perfil" />
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { FirebaseError } from 'firebase/app';
import { onUnmounted, ref } from 'vue';
import { IonContent, IonHeader, IonPage, IonSpinner, IonTitle, IonToolbar } from '@ionic/vue';

import { auth, db, firebaseConfigured, storage } from '../firebase';

type Screen = 'login' | 'recovery' | 'welcome' | 'profile';

const screen = ref<Screen>('login');
const currentUser = ref<NonNullable<typeof auth>['currentUser']>(null);
const authLoading = ref(firebaseConfigured);
const busy = ref(false);
const email = ref('');
const password = ref('');
const profileName = ref('');
const dateOfBirth = ref('');
const nickname = ref('');
const photoURL = ref('');
const selectedPhoto = ref<File | null>(null);
const photoPreview = ref('');
const errorMessage = ref('');
const successMessage = ref('');

const unsubscribe = auth
  ? onAuthStateChanged(
      auth,
      (user) => {
        currentUser.value = user;
        if (user) {
          void loadProfile(user.uid);
        } else {
          authLoading.value = false;
          screen.value = 'login';
        }
      },
      (error) => {
        authLoading.value = false;
        errorMessage.value = getErrorMessage(error);
      },
    )
  : undefined;

onUnmounted(() => {
  unsubscribe?.();
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value);
});

function getErrorMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) {
    return 'Não foi possível concluir a operação. Tente novamente.';
  }

  const messages: Record<string, string> = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'Informe um e-mail válido.',
    'auth/user-not-found': 'Não existe uma conta com este e-mail.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
    'auth/network-request-failed': 'Falha de conexão. Verifique sua internet e tente novamente.',
  };

  return messages[error.code] ?? 'Não foi possível concluir a operação. Tente novamente.';
}

async function loadProfile(uid: string): Promise<void> {
  if (!db) return;

  authLoading.value = true;
  errorMessage.value = '';
  try {
    const profileSnapshot = await getDoc(doc(db, 'users', uid));
    if (currentUser.value?.uid !== uid) return;

    if (profileSnapshot.exists()) {
      const profile = profileSnapshot.data();
      profileName.value = typeof profile.name === 'string' ? profile.name : '';
      dateOfBirth.value = typeof profile.dateOfBirth === 'string' ? profile.dateOfBirth : '';
      nickname.value = typeof profile.nickname === 'string' ? profile.nickname : '';
      photoURL.value = typeof profile.photoURL === 'string' ? profile.photoURL : '';
    } else {
      profileName.value = '';
      dateOfBirth.value = '';
      nickname.value = '';
      photoURL.value = '';
    }

    screen.value = 'welcome';
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
    screen.value = 'welcome';
  } finally {
    authLoading.value = false;
  }
}

function openPasswordRecovery(): void {
  errorMessage.value = '';
  successMessage.value = '';
  screen.value = 'recovery';
}

async function login(): Promise<void> {
  if (!auth) return;

  busy.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await signInWithEmailAndPassword(auth, email.value, password.value);
    password.value = '';
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
  } finally {
    busy.value = false;
  }
}

async function recoverPassword(): Promise<void> {
  if (!auth) return;

  busy.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await sendPasswordResetEmail(auth, email.value);
    successMessage.value = 'Se houver uma conta com este e-mail, você receberá o link de recuperação.';
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
  } finally {
    busy.value = false;
  }
}

function openProfile(): void {
  errorMessage.value = '';
  successMessage.value = '';
  screen.value = 'profile';
}

function selectPhoto(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  errorMessage.value = '';

  if (file && !file.type.startsWith('image/')) {
    input.value = '';
    errorMessage.value = 'Selecione um arquivo de imagem.';
    return;
  }

  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value);
  selectedPhoto.value = file;
  photoPreview.value = file ? URL.createObjectURL(file) : '';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Não foi possível ler o arquivo de imagem.'));
        return;
      }

      const separatorIndex = reader.result.indexOf(',');
      if (separatorIndex === -1) {
        reject(new Error('Não foi possível converter a imagem para Base64.'));
        return;
      }

      resolve(reader.result.slice(separatorIndex + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler o arquivo de imagem.'));
    reader.readAsDataURL(file);
  });
}

async function saveProfile(): Promise<void> {
  if (!currentUser.value || !db || !storage) return;

  busy.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    let updatedPhotoURL = photoURL.value;
    let imageBase64: string | null = null;
    if (selectedPhoto.value) {
      imageBase64 = await fileToBase64(selectedPhoto.value);
      if (imageBase64.length > 1_000_000) {
        errorMessage.value = 'A imagem é muito grande para ser salva no Firestore. Selecione uma imagem menor.';
        return;
      }

      const imageRef = storageRef(storage, `users/${currentUser.value.uid}/profile`);
      await uploadBytes(imageRef, selectedPhoto.value);
      updatedPhotoURL = await getDownloadURL(imageRef);
    }

    const batch = writeBatch(db);
    batch.set(
      doc(db, 'users', currentUser.value.uid),
      {
        name: profileName.value,
        dateOfBirth: dateOfBirth.value,
        nickname: nickname.value,
        photoURL: updatedPhotoURL,
      },
      { merge: true },
    );
    if (imageBase64 !== null) {
      batch.set(doc(db, 'imagens', currentUser.value.uid), { imagem: imageBase64 });
    }
    await batch.commit();

    photoURL.value = updatedPhotoURL;
    selectedPhoto.value = null;
    if (photoPreview.value) URL.revokeObjectURL(photoPreview.value);
    photoPreview.value = '';
    successMessage.value = 'Perfil salvo.';
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.page-content {
  --background: #f4f6fb;
}

.account-card {
  width: min(100% - 32px, 460px);
  margin: 56px auto;
  padding: 36px;
  border: 1px solid #e5e9f2;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 16px 48px rgb(22 34 64 / 8%);
}

h1 {
  margin: 8px 0;
  color: #17233c;
  font-size: 30px;
  line-height: 1.2;
}

.eyebrow {
  margin: 0;
  color: #5267d8;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.intro {
  margin: 0 0 28px;
  color: #68738a;
  line-height: 1.5;
}

.account-form {
  display: grid;
  gap: 12px;
}

.account-form > label,
.photo-picker > label {
  color: #27344e;
  font-size: 14px;
  font-weight: 600;
}

.account-form input:not([type='file']) {
  width: 100%;
  min-height: 46px;
  margin-bottom: 8px;
  padding: 0 13px;
  border: 1px solid #d6dce8;
  border-radius: 9px;
  color: #17233c;
  font: inherit;
}

.account-form input:focus {
  border-color: #5267d8;
  outline: 2px solid rgb(82 103 216 / 16%);
}

.primary-button,
.text-button {
  min-height: 46px;
  border: 0;
  border-radius: 9px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.primary-button {
  width: 100%;
  margin-top: 8px;
  background: #5267d8;
  color: #fff;
}

.primary-button:disabled {
  cursor: wait;
  opacity: 0.7;
}

.text-button {
  padding: 4px 8px;
  background: transparent;
  color: #5267d8;
}

.back-button {
  margin: -12px 0 20px -8px;
}

.feedback {
  margin: 0 0 4px;
  font-size: 14px;
  line-height: 1.5;
}

.error {
  color: #b42318;
}

.success {
  color: #147d52;
}

.configuration-message {
  padding: 16px;
  border-radius: 10px;
  background: #fff4e5;
  color: #74460a;
  line-height: 1.5;
}

.configuration-message code {
  font-weight: 700;
}

.loading-state {
  display: grid;
  justify-items: center;
  gap: 12px;
  color: #68738a;
}

.photo-picker {
  display: grid;
  justify-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.photo-picker input[type='file'] {
  max-width: 100%;
  color: #68738a;
}

.profile-photo,
.welcome-photo {
  width: 104px;
  height: 104px;
  border-radius: 50%;
  object-fit: cover;
}

.photo-placeholder {
  display: grid;
  place-items: center;
  background: #e9edff;
  color: #5267d8;
  font-size: 36px;
  font-weight: 700;
}

.welcome-photo {
  display: block;
  margin: 24px auto 0;
}

@media (max-width: 520px) {
  .account-card {
    margin: 24px auto;
    padding: 26px 22px;
  }
}
</style>
