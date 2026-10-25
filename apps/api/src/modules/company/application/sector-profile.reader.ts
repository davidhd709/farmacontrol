import { prisma, type Prisma, type PrismaClient } from '@farmacia/database';
import {
  SECTOR_PROFILE_RULES,
  type SectorProfile,
  type SectorProfileRules,
} from '@farmacia/contracts';

type Client = Prisma.TransactionClient | PrismaClient;

/** Lee el perfil de la empresa activa; en instalaciones aún no configuradas rige PHARMACY. */
export async function sectorProfileRules(client: Client = prisma): Promise<{
  sectorProfile: SectorProfile;
  rules: SectorProfileRules;
}> {
  const company = await client.company.findFirst({
    where: { status: 'ACTIVE' },
    select: { sectorProfile: true },
  });
  const sectorProfile = (company?.sectorProfile ?? 'PHARMACY') as SectorProfile;
  const rules = SECTOR_PROFILE_RULES[sectorProfile];
  if (!rules)
    throw new Error(`Perfil sectorial no soportado en la empresa activa: ${sectorProfile}`);
  return { sectorProfile, rules };
}
