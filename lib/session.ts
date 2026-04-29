import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { setCurrentTenant } from './tenant-context';

/**
 * Wrapper para getServerSession que automaticamente define o contexto do tenant.
 * Use este helper em todas as rotas de API em vez de chamar getServerSession(authOptions) diretamente.
 * Isso garante que todas as queries Prisma sejam automaticamente filtradas pelo tenantId.
 */
export async function getSession() {
  const session = await getServerSession(authOptions);
  if (session?.user?.tenantId) {
    setCurrentTenant(session.user.tenantId);
  }
  return session;
}
