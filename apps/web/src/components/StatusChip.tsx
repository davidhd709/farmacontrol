import type { ReactElement } from 'react';
import { Chip } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';

export type StatusTone = 'success' | 'error' | 'warning' | 'info' | 'neutral';

const ICONS: Record<StatusTone, ReactElement> = {
  success: <CheckCircleOutlineIcon />,
  error: <HighlightOffIcon />,
  warning: <ErrorOutlineIcon />,
  info: <InfoOutlinedIcon />,
  neutral: <RadioButtonUncheckedIcon />,
};

/**
 * Estado de un documento o registro. Siempre lleva texto y un icono de forma distinta por tono:
 * el color acompaña, nunca es la única señal (AGENTS.md §9).
 */
export function StatusChip({
  label,
  tone,
  size = 'small',
  'data-testid': testId,
}: {
  label: string;
  tone: StatusTone;
  size?: 'small' | 'medium';
  'data-testid'?: string;
}) {
  return (
    <Chip
      label={label}
      icon={ICONS[tone]}
      size={size}
      variant="outlined"
      color={tone === 'neutral' ? 'default' : tone}
      data-testid={testId}
      sx={{ fontWeight: 700, '& .MuiChip-icon': { fontSize: '1rem' } }}
    />
  );
}
