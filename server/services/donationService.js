import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from '../config.js';
const file = path.join(root, 'server', 'donations.json');
export async function listDonations() {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return []; }
}
export async function recordDonation(payload = {}) {
  const amount = Number(payload.transferAmount ?? payload.amount ?? payload.transfer_amount);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const donations = await listDonations();
  const id = String(payload.id ?? payload.referenceCode ?? payload.reference_code ?? `${amount}-${payload.transactionDate ?? Date.now()}`);
  if (donations.some((item) => item.id === id)) return true;
  donations.unshift({ id, name: String(payload.senderName ?? payload.sender_name ?? 'Một người bạn').slice(0, 80), amount, createdAt: new Date().toISOString() });
  await fs.writeFile(file, JSON.stringify(donations.slice(0, 100), null, 2));
  return true;
}
