import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from '../config.js';
const file = process.env.DONATIONS_FILE || path.join(root, 'server', 'donations.json');
export async function listDonations() {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return []; }
}
export async function recordDonation(payload = {}) {
  const amount = Number(payload.transferAmount ?? payload.amount ?? payload.transfer_amount);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const donations = await listDonations();
  const id = String(payload.id ?? payload.referenceCode ?? payload.reference_code ?? `${amount}-${payload.transactionDate ?? Date.now()}`);
  if (donations.some((item) => item.id === id)) return true;
  const name = payload.senderName ?? payload.sender_name ?? payload.fromAccountName ?? payload.from_account_name ?? payload.counterAccountName ?? payload.counter_account_name ?? payload.accountName;
  const message = payload.content ?? payload.description ?? payload.transferContent ?? payload.transfer_content ?? payload.transactionContent ?? payload.transaction_content ?? '';
  donations.unshift({ id, name: String(name || 'Một người bạn').slice(0, 80), amount, message: String(message).slice(0, 180), createdAt: new Date().toISOString() });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(donations.slice(0, 100), null, 2));
  return true;
}
