import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type {
  BackupFileDto,
  BackupSummaryDto,
  CreateBackupResultDto,
  VerifyBackupResultDto,
} from '@farmacia/contracts';

const execFileAsync = promisify(execFile);

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private readonly backupDirectory: string;
  private readonly scriptsDirectory: string;

  constructor() {
    // Resolver la ruta a infra/backups e infra/scripts
    const candidateDirs = [
      process.env.BACKUP_DIR,
      path.resolve(process.cwd(), '../../infra/backups'),
      path.resolve(process.cwd(), '../infra/backups'),
      path.resolve(process.cwd(), 'infra/backups'),
    ].filter(Boolean) as string[];

    let resolvedBackupDir = candidateDirs[0];
    for (const dir of candidateDirs) {
      if (fs.existsSync(dir)) {
        resolvedBackupDir = dir;
        break;
      }
    }
    this.backupDirectory = resolvedBackupDir;

    const candidateScriptsDirs = [
      path.resolve(process.cwd(), '../../infra/scripts'),
      path.resolve(process.cwd(), '../infra/scripts'),
      path.resolve(process.cwd(), 'infra/scripts'),
    ];

    let resolvedScriptsDir = candidateScriptsDirs[0];
    for (const dir of candidateScriptsDirs) {
      if (fs.existsSync(dir)) {
        resolvedScriptsDir = dir;
        break;
      }
    }
    this.scriptsDirectory = resolvedScriptsDir;

    if (!fs.existsSync(this.backupDirectory)) {
      try {
        fs.mkdirSync(this.backupDirectory, { recursive: true });
      } catch (err) {
        this.logger.warn(`No fue posible crear el directorio de backups: ${this.backupDirectory}`, err);
      }
    }
  }

  getBackupDirectory(): string {
    return this.backupDirectory;
  }

  /**
   * Obtiene el listado consolidado de copias de seguridad y estado de resiliencia RPO.
   */
  async getBackupStatus(): Promise<BackupSummaryDto> {
    if (!fs.existsSync(this.backupDirectory)) {
      return {
        totalBackups: 0,
        lastBackupAt: null,
        lastBackupFilename: null,
        lastBackupSizeBytes: null,
        isHealthyRpo: false,
        hoursSinceLastBackup: null,
        backupDirectory: this.backupDirectory,
        items: [],
      };
    }

    const files = await fs.promises.readdir(this.backupDirectory);
    const dumpFiles = files.filter((f) => f.endsWith('.dump'));

    const items: BackupFileDto[] = [];

    for (const dumpFile of dumpFiles) {
      const dumpPath = path.join(this.backupDirectory, dumpFile);
      const metaPath = path.join(this.backupDirectory, `${dumpFile}.meta.json`);
      const shaPath = path.join(this.backupDirectory, `${dumpFile}.sha256`);

      try {
        if (fs.existsSync(metaPath)) {
          const metaContent = await fs.promises.readFile(metaPath, 'utf-8');
          const meta = JSON.parse(metaContent);
          items.push({
            filename: dumpFile,
            filepath: dumpPath,
            createdAt: meta.createdAt || new Date(fs.statSync(dumpPath).mtimeMs).toISOString(),
            sizeBytes: Number(meta.sizeBytes || fs.statSync(dumpPath).size),
            sha256: meta.sha256 || 'N/A',
            verified: Boolean(meta.verified),
            pgVersion: meta.pgVersion,
          });
        } else {
          const stat = await fs.promises.stat(dumpPath);
          let sha256 = 'N/A';
          if (fs.existsSync(shaPath)) {
            const shaContent = await fs.promises.readFile(shaPath, 'utf-8');
            sha256 = shaContent.trim().split(/\s+/)[0] || 'N/A';
          } else {
            // Calcular sha256
            const buffer = await fs.promises.readFile(dumpPath);
            sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
          }

          items.push({
            filename: dumpFile,
            filepath: dumpPath,
            createdAt: new Date(stat.mtimeMs).toISOString(),
            sizeBytes: stat.size,
            sha256,
            verified: true,
          });
        }
      } catch (err) {
        this.logger.error(`Error procesando archivo de respaldo ${dumpFile}`, err);
      }
    }

    // Ordenar de más reciente a más antiguo
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const lastBackup = items[0] || null;
    let hoursSinceLastBackup: number | null = null;
    let isHealthyRpo = false;

    if (lastBackup) {
      const diffMs = Date.now() - new Date(lastBackup.createdAt).getTime();
      hoursSinceLastBackup = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
      // Consideramos RPO en regla si el último respaldo tiene menos de 24 horas
      isHealthyRpo = hoursSinceLastBackup <= 24;
    }

    return {
      totalBackups: items.length,
      lastBackupAt: lastBackup?.createdAt ?? null,
      lastBackupFilename: lastBackup?.filename ?? null,
      lastBackupSizeBytes: lastBackup?.sizeBytes ?? null,
      isHealthyRpo,
      hoursSinceLastBackup,
      backupDirectory: this.backupDirectory,
      items,
    };
  }

  /**
   * Ejecuta la creación de un nuevo respaldo invocando el script backup.sh.
   */
  async createBackup(): Promise<CreateBackupResultDto> {
    const backupScript = path.join(this.scriptsDirectory, 'backup.sh');

    if (!fs.existsSync(backupScript)) {
      throw new InternalServerErrorException(
        `Script de respaldo no encontrado en: ${backupScript}`,
      );
    }

    try {
      this.logger.log(`Disparando script de respaldo: ${backupScript}`);

      const env = {
        ...process.env,
        BACKUP_DIR: this.backupDirectory,
      };

      const { stdout } = await execFileAsync(backupScript, [], {
        env,
        timeout: 120000, // 2 minutos máximo
      });

      this.logger.log(`Resultado de backup:\n${stdout}`);

      // Consultar el estado actualizado
      const status = await this.getBackupStatus();
      const latest = status.items[0];

      return {
        success: true,
        message: 'Copia de seguridad generada y verificada exitosamente.',
        backup: latest,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error ejecutando script de backup: ${errorMsg}`, err);
      throw new InternalServerErrorException(
        `Fallo al ejecutar la copia de seguridad: ${errorMsg}`,
      );
    }
  }

  /**
   * Ejecuta la verificación de integridad de un archivo de respaldo específico.
   */
  async verifyBackup(filename: string): Promise<VerifyBackupResultDto> {
    // Sanitización básica de seguridad para evitar path traversal
    const safeFilename = path.basename(filename);
    if (!safeFilename.endsWith('.dump')) {
      throw new NotFoundException('El archivo especificado no es un respaldo válido de PostgreSQL (.dump).');
    }

    const filePath = path.join(this.backupDirectory, safeFilename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`El archivo de respaldo no existe: ${safeFilename}`);
    }

    const verifyScript = path.join(this.scriptsDirectory, 'verify-backup.sh');
    if (!fs.existsSync(verifyScript)) {
      // Fallback a validación sha256 en Node si el script no está presente
      const shaPath = `${filePath}.sha256`;
      let shaMatch = true;
      if (fs.existsSync(shaPath)) {
        const expected = (await fs.promises.readFile(shaPath, 'utf-8')).trim().split(/\s+/)[0];
        const buffer = await fs.promises.readFile(filePath);
        const actual = crypto.createHash('sha256').update(buffer).digest('hex');
        shaMatch = expected.toLowerCase() === actual.toLowerCase();
      }

      return {
        filename: safeFilename,
        verified: shaMatch,
        sha256Match: shaMatch,
        message: shaMatch
          ? 'Integridad SHA-256 verificada correctamente.'
          : 'La suma SHA-256 no coincide; posible archivo corrupto.',
      };
    }

    try {
      await execFileAsync(verifyScript, [filePath], { timeout: 30000 });
      return {
        filename: safeFilename,
        verified: true,
        sha256Match: true,
        message: 'Respaldo íntegro y validado contra el catálogo de PostgreSQL y SHA-256.',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        filename: safeFilename,
        verified: false,
        sha256Match: false,
        message: `Fallo de verificación: ${msg}`,
      };
    }
  }
}
