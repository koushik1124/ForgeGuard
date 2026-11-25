import React from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';
import { tokens } from '../../theme/tokens';

export interface Column<T> {
  id: string;
  header?: string;
  label?: string;
  align?: 'left' | 'center' | 'right';
  width?: string | number;
  isMono?: boolean;
  render: (item: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data?: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  emptyAction?: React.ReactNode;
  onRowClick?: (item: T) => void;
  keyExtractor?: (item: T) => string;
  keyField?: keyof T;
}

export function DataTable<T>({
  columns,
  data = [],
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription,
  emptyMessage,
  emptyIcon,
  emptyAction,
  onRowClick,
  keyExtractor,
  keyField,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        <LoadingSkeleton variant="table" rows={4} />
      </Box>
    );
  }

  const effectiveEmptyDescription = emptyMessage || emptyDescription || 'There are currently no items to display.';

  if (!data || data.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={effectiveEmptyDescription}
        icon={emptyIcon}
        action={emptyAction}
      />
    );
  }

  const getKey = (item: T, idx: number): string => {
    if (keyExtractor) return keyExtractor(item);
    if (keyField && item[keyField] !== undefined) return String(item[keyField]);
    return String(idx);
  };

  return (
    <TableContainer sx={{ border: `1px solid ${tokens.colors.borderSubtle}`, borderRadius: `${tokens.borderRadius.sm}px` }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ backgroundColor: tokens.colors.surfaceElevated }}>
            {columns.map((column) => (
              <TableCell
                key={column.id}
                align={column.align || 'left'}
                sx={{
                  color: tokens.colors.text.muted,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  width: column.width,
                  borderBottom: `1px solid ${tokens.colors.border}`,
                  py: 1.25,
                }}
              >
                {column.header || column.label || column.id}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((item, index) => {
            const key = getKey(item, index);
            return (
              <TableRow
                key={key}
                hover
                onClick={() => onRowClick?.(item)}
                sx={{
                  cursor: onRowClick ? 'pointer' : 'default',
                  '&:last-child td, &:last-child th': { border: 0 },
                  '&:hover': {
                    backgroundColor: `${tokens.colors.surfaceElevated} !important`,
                  },
                }}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    align={column.align || 'left'}
                    sx={{
                      fontSize: '0.8125rem',
                      fontFamily: column.isMono ? tokens.typography.fontFamily.mono : 'inherit',
                      color: tokens.colors.text.primary,
                      borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
                      py: 1.5,
                    }}
                  >
                    {column.render(item)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
