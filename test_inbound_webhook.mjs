import { Webhook } from "svix";

const secret = process.env.RESEND_WEBHOOK_SECRET;
if (!secret) {
  console.error("RESEND_WEBHOOK_SECRET not set");
  process.exit(1);
}

// Use a real submission ID from the DB
const submissionId = 360002;

// Simulate the exact payload Resend sends for email.received
const payloadObj = {
  type: "email.received",
  created_at: new Date().toISOString(),
  data: {
    email_id: "test-inbound-" + Date.now(),
    created_at: new Date().toISOString(),
    from: "test-client@gmail.com",
    to: [`reply-${submissionId}@inbound.freshselectmeals.com`],
    bcc: [],
    cc: [],
    message_id: "<test-msg-" + Date.now() + "@gmail.com>",
    subject: "Re: Your FreshSelect Meals Application",
  }
};

const payloadStr = JSON.stringify(payloadObj);
const wh = new Webhook(secret);
const msgId = `msg_test_${Date.now()}`;
const now = new Date();
const timestamp = Math.floor(now.getTime() / 1000).toString();
const signature = wh.sign(msgId, now, payloadStr);

console.log("Sending simulated inbound webhook for submission", submissionId);
console.log("Payload:", JSON.stringify(payloadObj, null, 2));

const response = await fetch("http://localhost:3000/api/inbound-email", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "svix-id": msgId,
    "svix-timestamp": timestamp,
    "svix-signature": signature,
  },
  body: payloadStr,
});

const result = await response.json();
console.log("\nResponse status:", response.status);
console.log("Response body:", JSON.stringify(result, null, 2));
