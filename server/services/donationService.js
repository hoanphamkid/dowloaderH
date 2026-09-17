import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from '../config.js';
const file = process.env.DONATIONS_FILE || path.join(root, 'server', 'donations.json');
export async function listDonations() {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return []; }
}
export async function recordDonation(payload = {}) {
  // SePay may send the transaction directly or wrapped in `data`.
  const tx = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const rawAmount = tx.transferAmount ?? tx.amount ?? tx.transfer_amount ?? tx.transferAmountVnd;
  const amount = Number(String(rawAmount ?? '').replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const donations = await listDonations();
  const id = String(tx.id ?? tx.referenceCode ?? tx.reference_code ?? tx.transactionId ?? `${amount}-${tx.transactionDate ?? Date.now()}`);
  if (donations.some((item) => item.id === id)) return true;
  const name = tx.senderName ?? tx.sender_name ?? tx.fromAccountName ?? tx.from_account_name ?? tx.counterAccountName ?? tx.counter_account_name ?? tx.accountName;
  const message = tx.content ?? tx.description ?? tx.transferContent ?? tx.transfer_content ?? tx.transactionContent ?? tx.transaction_content ?? '';
  donations.unshift({ id, name: String(name || 'Một người bạn').slice(0, 80), amount, message: String(message).slice(0, 180), createdAt: new Date().toISOString() });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(donations.slice(0, 100), null, 2));
  return true;
}
