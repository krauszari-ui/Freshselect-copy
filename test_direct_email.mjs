/**
 * Direct email test — mimics exactly what sendClientEmail does in routers.ts
 * Run from project root: node test_direct_email.mjs
 */
import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'FreshSelect Meals <admin@freshselectmeals.com>';
const inboundDomain = process.env.RESEND_INBOUND_DOMAIN ?? 'inbound.freshselectmeals.com';

console.log('=== Email Config ===');
console.log('API Key prefix:', apiKey ? apiKey.substring(0, 12) + '...' : 'NOT SET');
console.log('FROM:', fromEmail);
console.log('Inbound domain:', inboundDomain);
console.log('');

const resend = new Resend(apiKey);

// Test 3 times
for (let i = 1; i <= 3; i++) {
  const replyTo = `reply-1@${inboundDomain}`;
  console.log(`--- Attempt ${i} ---`);
  console.log('FROM:', fromEmail);
  console.log('REPLY-TO:', replyTo);
  
  const result = await resend.emails.send({
    from: fromEmail,
    to: 'delivered@resend.dev',
    subject: `FreshSelect Admin Email Test #${i}`,
    replyTo,
    html: `<p>Test email attempt ${i} from admin panel. This verifies the email sending is working correctly.</p>`,
  });
  
  if (result.error) {
    console.log('ERROR:', JSON.stringify(result.error));
  } else {
    console.log('SUCCESS - Email ID:', result.data?.id);
  }
  console.log('');
}
