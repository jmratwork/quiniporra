import { FormularioApuesta } from '@/components/FormularioApuesta';

export const dynamic = 'force-dynamic';

/**
 * Pantalla del jugador. Next 15: `params` es asíncrono -> await params.
 * El resto de la lógica (cargar invitación, validar y enviar) vive en el
 * componente cliente FormularioApuesta.
 */
export default async function ApostarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <FormularioApuesta token={token} />;
}
