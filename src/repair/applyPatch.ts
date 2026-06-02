import fs from 'node:fs/promises';
import { RepairProposal } from '../core/types.js';

export async function applyRepair(proposal: RepairProposal) {
  await fs.writeFile(proposal.originalPath, proposal.proposedContent, 'utf8');
}
