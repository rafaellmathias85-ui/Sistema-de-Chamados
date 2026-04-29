// O polling de emails é gerenciado por lib/email-poller.ts
// que é importado automaticamente via lib/auth.ts no primeiro request.
// Este arquivo é mantido vazio pois instrumentationHook não está habilitado.
export async function register() {
  // No-op: polling controlado por lib/email-poller.ts
}
