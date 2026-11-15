import { useSearchParams } from 'react-router-dom';

/**
 * Documento que otra pantalla pide abrir por la URL (rediseño: «Ir a …» desde un recibo o egreso
 * automático). Devuelve el valor del parámetro y una función que lo quita al cerrar el detalle,
 * para que volver atrás o recargar no lo reabra sin querer.
 */
export function useLinkedDocumentParam(name: string): [string | null, () => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(name);
  const clear = () =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(name);
        return next;
      },
      { replace: true },
    );
  return [value, clear];
}
