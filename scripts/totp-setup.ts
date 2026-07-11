/**
 * Enrolamiento del segundo factor (TOTP).
 *
 *   npm run totp:setup
 *
 * Genera un secreto TOTP, imprime el código QR para escanearlo con la app de
 * autenticación (Google Authenticator, Authy, 1Password…) y muestra el valor
 * que debes poner en la variable de entorno TOTP_SECRET (local en .env y en
 * Vercel para producción).
 *
 * El secreto NO se guarda en ningún fichero: cópialo tú a tu gestor de
 * secretos / .env. Ejecútalo una sola vez (o cuando quieras rotar el secreto).
 */
import { authenticator } from 'otplib';
import qrcode from 'qrcode';

const CUENTA = process.env.TOTP_CUENTA ?? 'admin';
const EMISOR = process.env.TOTP_EMISOR ?? 'quiniporra';

async function main() {
  const secret = authenticator.generateSecret(); // base32
  const otpauth = authenticator.keyuri(CUENTA, EMISOR, secret);

  console.log('\n🔐 Enrolamiento del doble factor (TOTP) para quiniporra\n');
  console.log('1) Escanea este QR con tu app de autenticación:\n');

  const qr = await qrcode.toString(otpauth, { type: 'terminal', small: true });
  console.log(qr);

  console.log('   ¿No puedes escanear? Introduce el secreto a mano en la app:');
  console.log(`   ${secret}\n`);

  console.log('2) Guarda este valor como variable de entorno (NO lo subas al repo):\n');
  console.log(`   TOTP_SECRET="${secret}"\n`);
  console.log('   · En local: añádelo a tu fichero .env');
  console.log('   · En producción (Vercel): Project Settings → Environment Variables\n');

  console.log('3) Comprueba que funciona: el código de 6 dígitos que muestra tu app');
  console.log('   ahora mismo debería ser:\n');
  console.log(`   ${authenticator.generate(secret)}   (cambia cada 30 s)\n`);
}

main().catch((e) => {
  console.error('Error generando el secreto TOTP:', e);
  process.exit(1);
});
