import { describe, it, expect } from 'vitest';
import {
  calculateExpirationSeverity,
  InventoryAlert,
} from '../../src/modules/alerts/domain/alert.entity';

describe('InventoryAlert Entity & Expiration Severity (RN-001, RN-002, RF-008)', () => {
  const refDate = new Date('2026-06-01T00:00:00Z');

  describe('calculateExpirationSeverity', () => {
    it('debe clasificar como VENCIDO si la fecha de vencimiento ya pasó (días restantes < 0)', () => {
      const expDate = new Date('2026-05-25T00:00:00Z'); // 7 días en el pasado
      const result = calculateExpirationSeverity(expDate, refDate);
      expect(result.daysRemaining).toBe(-7);
      expect(result.severity).toBe('VENCIDO');
    });

    it('debe clasificar como VENCIDO si la fecha de vencimiento es exactamente hoy (días restantes = 0)', () => {
      const expDate = new Date('2026-06-01T00:00:00Z');
      const result = calculateExpirationSeverity(expDate, refDate);
      expect(result.daysRemaining).toBe(0);
      expect(result.severity).toBe('VENCIDO');
    });

    it('debe clasificar como CRITICO si vence entre 1 y 30 días', () => {
      const expDate1 = new Date('2026-06-02T00:00:00Z'); // 1 día
      const expDate30 = new Date('2026-07-01T00:00:00Z'); // 30 días

      const res1 = calculateExpirationSeverity(expDate1, refDate);
      expect(res1.daysRemaining).toBe(1);
      expect(res1.severity).toBe('CRITICO');

      const res30 = calculateExpirationSeverity(expDate30, refDate);
      expect(res30.daysRemaining).toBe(30);
      expect(res30.severity).toBe('CRITICO');
    });

    it('debe clasificar como ALERTA si vence entre 31 y 60 días', () => {
      const expDate31 = new Date('2026-07-02T00:00:00Z'); // 31 días
      const expDate60 = new Date('2026-07-31T00:00:00Z'); // 60 días

      const res31 = calculateExpirationSeverity(expDate31, refDate);
      expect(res31.daysRemaining).toBe(31);
      expect(res31.severity).toBe('ALERTA');

      const res60 = calculateExpirationSeverity(expDate60, refDate);
      expect(res60.daysRemaining).toBe(60);
      expect(res60.severity).toBe('ALERTA');
    });

    it('debe clasificar como PROXIMO si vence entre 61 y 90 días', () => {
      const expDate61 = new Date('2026-08-01T00:00:00Z'); // 61 días
      const expDate90 = new Date('2026-08-30T00:00:00Z'); // 90 días

      const res61 = calculateExpirationSeverity(expDate61, refDate);
      expect(res61.daysRemaining).toBe(61);
      expect(res61.severity).toBe('PROXIMO');

      const res90 = calculateExpirationSeverity(expDate90, refDate);
      expect(res90.daysRemaining).toBe(90);
      expect(res90.severity).toBe('PROXIMO');
    });

    it('debe clasificar como NORMAL si vence en más de 90 días', () => {
      const expDate = new Date('2026-10-01T00:00:00Z'); // >90 días
      const res = calculateExpirationSeverity(expDate, refDate);
      expect(res.daysRemaining).toBeGreaterThan(90);
      expect(res.severity).toBe('NORMAL');
    });
  });

  describe('InventoryAlert Entity Operations', () => {
    it('debe crear una entidad de alerta activa y permitir actualizar su evaluación', () => {
      const alert = new InventoryAlert(
        'alert-uuid-1',
        'lot-uuid-1',
        'product-uuid-1',
        'EXPIRATION',
        'CRITICO',
        15,
        100,
        false,
        null,
        new Date('2026-06-01T00:00:00Z'),
        new Date('2026-06-01T00:00:00Z'),
        new Date('2026-06-01T00:00:00Z'),
      );

      expect(alert.isResolved).toBe(false);
      expect(alert.severity).toBe('CRITICO');

      // Actualizar a VENCIDO
      alert.updateEvaluation(0, 'VENCIDO', 80, new Date('2026-06-16T00:00:00Z'));
      expect(alert.severity).toBe('VENCIDO');
      expect(alert.daysRemaining).toBe(0);
      expect(alert.currentQuantity).toBe(80);
      expect(alert.isResolved).toBe(false);
    });

    it('debe marcarse como resuelta automáticamente si el stock llega a 0', () => {
      const alert = new InventoryAlert(
        'alert-uuid-2',
        'lot-uuid-2',
        'product-uuid-2',
        'EXPIRATION',
        'CRITICO',
        10,
        50,
        false,
        null,
        new Date('2026-06-01T00:00:00Z'),
        new Date('2026-06-01T00:00:00Z'),
        new Date('2026-06-01T00:00:00Z'),
      );

      // El stock se agota (ej. por ventas)
      alert.updateEvaluation(10, 'CRITICO', 0, new Date('2026-06-02T00:00:00Z'));
      expect(alert.isResolved).toBe(true);
      expect(alert.resolvedAt).toBeInstanceOf(Date);
    });

    it('debe permitir resolución manual', () => {
      const alert = new InventoryAlert(
        'alert-uuid-3',
        'lot-uuid-3',
        'product-uuid-3',
        'EXPIRATION',
        'VENCIDO',
        -2,
        20,
        false,
        null,
        new Date('2026-06-01T00:00:00Z'),
        new Date('2026-06-01T00:00:00Z'),
        new Date('2026-06-01T00:00:00Z'),
      );

      alert.resolve(new Date('2026-06-03T10:00:00Z'));
      expect(alert.isResolved).toBe(true);
      expect(alert.resolvedAt?.toISOString()).toBe('2026-06-03T10:00:00.000Z');
    });
  });
});
